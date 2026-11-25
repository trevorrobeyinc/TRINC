import { isDesktopRuntime } from "@/utils/desktopRuntime";
import type { McpServerConfig } from "./types";

/**
 * Client side of the TRINC bridges' Unix-socket transport (bridges-uds, 2026-11-24).
 *
 * The same rules as assertSocketTrust/requestOverSocket in the bridges' uds-listener.ts and the
 * byte-identical "bridges-uds client v1" block in the stdio proxy, the stdio adapter, the engine's
 * base-mcp.js and mcp-health-check.js; this TypeScript copy shares their rules and tests, not their
 * bytes. A socket must be exactly <home>/.local/state/trinc/run/<expectedName> with
 * <home> = os.homedir(). Every level from home down is a real directory owned by this uid that group
 * and others cannot write, the run directory and the socket grant them nothing, and no level carries
 * an ACL allow entry. A missing directory or socket is refused with code ENOENT without connecting.
 * Requests are pinned to the checked path with createConnection and never use an agent: Node turns
 * an empty or undefined socketPath into TCP to localhost:80, and agent:false ignores a
 * createConnection pin. Nothing in this module can dial TCP.
 *
 * Node is reached only through a run-time `globalThis.require` (as McpEventClient always did), never
 * a static import: this module is on the mobile load path, esbuild leaves only some built-ins
 * external, and Obsidian mobile has no Node at all.
 */

type FsModule = typeof import("fs");
type PathModule = typeof import("path");
type OsModule = typeof import("os");
type HttpModule = typeof import("http");
type NetModule = typeof import("net");
type ChildProcessModule = typeof import("child_process");
type StatsT = import("fs").Stats;
export type ClientRequestT = import("http").ClientRequest;
export type IncomingMessageT = import("http").IncomingMessage;

/**
 * The Node built-ins this client uses. On desktop they come from `globalThis.require`; jest has no
 * such global, so suites pass real modules (or spies around them) to setUdsClientDepsForTests.
 */
export interface UdsClientDeps {
  fs: Pick<FsModule, "lstatSync">;
  path: Pick<PathModule, "join" | "dirname" | "basename" | "isAbsolute" | "resolve">;
  os: Pick<OsModule, "homedir" | "platform" | "userInfo">;
  http: Pick<HttpModule, "request">;
  net: Pick<NetModule, "connect">;
  childProcess: Pick<ChildProcessModule, "execFileSync">;
}

/**
 * A refusal or failure of the bridge-socket client. `code` is stable: ENOENT (a directory or the
 * socket is missing, so the bridge is not running and nothing was connected), SOCKET_UNTRUSTED,
 * SOCKET_PATH_TOO_LONG, BAD_SOCKET_PATH (a server config that may reach no socket),
 * UNSUPPORTED_PLATFORM (mobile, or no Node) and ETIMEDOUT. It only describes the refusal; callers
 * decide whether to retry.
 */
export class UdsClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "UdsClientError";
    this.code = code;
  }
}

/** The socket each bridge publishes (SOCKET_NAMES in the bridges' uds-listener.ts). */
export const BRIDGE_SOCKET_NAMES = Object.freeze({
  vaultBridge: "vault-bridge.sock",
  commandCenter: "command-center.sock",
  vizStudio: "viz-studio.sock",
});

/** Each known server id is bound to its own bridge's socket and may reach no other. */
const SOCKET_NAME_BY_SERVER_ID: ReadonlyMap<string, string> = new Map([
  ["local-obsidian-mcp", BRIDGE_SOCKET_NAMES.vaultBridge],
  ["command-center", BRIDGE_SOCKET_NAMES.commandCenter],
  ["viz-studio", BRIDGE_SOCKET_NAMES.vizStudio],
]);

/** The retired loopback TCP ports, read only to migrate and bind legacy endpoint records. */
const SOCKET_NAME_BY_LEGACY_PORT: ReadonlyMap<string, string> = new Map([
  ["8798", BRIDGE_SOCKET_NAMES.vaultBridge],
  ["8799", BRIDGE_SOCKET_NAMES.commandCenter],
  ["8800", BRIDGE_SOCKET_NAMES.vizStudio],
]);

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);
/** <home>/.local/state/trinc/run, never derived from "~" or XDG variables. */
const RUN_DIR_SEGMENTS: readonly string[] = [".local", "state", "trinc", "run"];
/** macOS sun_path holds 104 bytes including the NUL. */
const MAX_SOCKET_PATH_BYTES = 103;
/** The bridge first binds "<run>/.<name>.<pid>.<8 hex>.tmp", 22 bytes longer than the name. */
const HIDDEN_NAME_EXTRA_BYTES = 22;
const ACL_CHECKED = new Set<string>();

let depsForTests: UdsClientDeps | null = null;
let desktopDeps: UdsClientDeps | null = null;

/**
 * Test seam: hand in Node's built-ins (or spies wrapping them) because jest has no
 * `globalThis.require`. Also forgets the per-process ACL memo, so each suite sees its own checks.
 *
 * @param deps - The modules to use instead of the run-time lookup; null restores it.
 */
export function setUdsClientDepsForTests(deps: UdsClientDeps | null): void {
  depsForTests = deps;
  ACL_CHECKED.clear();
}

function nodeDeps(): UdsClientDeps {
  if (!isDesktopRuntime()) {
    throw new UdsClientError(
      "UNSUPPORTED_PLATFORM",
      "Unix-socket bridges are unavailable on mobile"
    );
  }
  if (depsForTests) return depsForTests;
  if (!desktopDeps) {
    const req = (globalThis as { require?: NodeRequire }).require;
    if (typeof req !== "function") {
      throw new UdsClientError(
        "UNSUPPORTED_PLATFORM",
        "Unix-socket bridges need Node's require, which this runtime does not expose"
      );
    }
    desktopDeps = {
      fs: req("fs") as FsModule,
      path: req("path") as PathModule,
      os: req("os") as OsModule,
      http: req("http") as HttpModule,
      net: req("net") as NetModule,
      childProcess: req("child_process") as ChildProcessModule,
    };
  }
  return desktopDeps;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** A bridge socket path and the socket name a client insists on finding there. */
export interface BridgeSocket {
  socketPath: string;
  expectedName: string;
}

/**
 * The socket a known server id is bound to, for the settings migration.
 *
 * @param serverId - A configured server's id.
 * @returns The bound socket name, or null for an id that is not one of the three bridges.
 */
export function boundSocketName(serverId: string): string | null {
  return SOCKET_NAME_BY_SERVER_ID.get(serverId) ?? null;
}

/**
 * The bridge a legacy TCP endpoint record names: host 127.0.0.1, localhost or ::1 (any case, any
 * scheme, any path) on port 8798, 8799 or 8800. Never used to dial.
 *
 * @param endpoint - The record, e.g. "https://127.0.0.1:8798".
 * @returns That bridge's socket name, or null when the record names no bridge.
 */
export function legacyEndpointSocketName(endpoint: unknown): string | null {
  if (typeof endpoint !== "string" || endpoint.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    return null;
  }
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) return null;
  return SOCKET_NAME_BY_LEGACY_PORT.get(url.port) ?? null;
}

/**
 * Resolve the one socket a configured server may reach. A known id is bound to its own bridge
 * (local-obsidian-mcp to vault-bridge.sock, command-center to command-center.sock, viz-studio to
 * viz-studio.sock); any other id is bound to the bridge its legacy endpoint record names by port. A
 * configured socketPath must agree with that binding, so an edited or synced data.json cannot hand
 * one bridge's token to another bridge's socket.
 *
 * @param server - The configured server; only its id, socketPath and httpEndpoint record are read.
 * @returns The absolute socket path and the name assertSocketTrust will require there.
 * @throws UdsClientError BAD_SOCKET_PATH for a config that may reach no socket, or
 *   UNSUPPORTED_PLATFORM on mobile.
 */
export function resolveBridgeSocket(
  server: Pick<McpServerConfig, "id" | "socketPath" | "httpEndpoint">
): BridgeSocket {
  const { path, os } = nodeDeps();
  const expectedName =
    SOCKET_NAME_BY_SERVER_ID.get(server.id) ?? legacyEndpointSocketName(server.httpEndpoint);
  if (expectedName === null) {
    throw new UdsClientError(
      "BAD_SOCKET_PATH",
      `MCP server '${server.id}' is bound to no bridge socket: only local-obsidian-mcp, command-center and viz-studio, or an entry whose legacy endpoint record names port 8798, 8799 or 8800, may reach one`
    );
  }
  const socketPath = path.join(os.homedir(), ...RUN_DIR_SEGMENTS, expectedName);
  const tildeForm = `~/${[...RUN_DIR_SEGMENTS, expectedName].join("/")}`;
  const configured: unknown = server.socketPath ?? "";
  if (configured === "" || configured === tildeForm || configured === socketPath) {
    return { socketPath, expectedName };
  }
  throw new UdsClientError(
    "BAD_SOCKET_PATH",
    `MCP server '${server.id}' may only reach ${socketPath}, but its socketPath is ${JSON.stringify(configured)} (use "" or "${tildeForm}")`
  );
}

function lstatOrRefuse(fs: UdsClientDeps["fs"], p: string): StatsT {
  try {
    return fs.lstatSync(p);
  } catch (err) {
    if ((err as { code?: unknown }).code === "ENOENT") {
      throw new UdsClientError("ENOENT", `${p} does not exist (bridge not running)`);
    }
    throw err;
  }
}

/**
 * fs.Stats cannot see macOS ACLs, so /bin/ls is asked once per directory and socket inode per
 * process. An ls that fails or times out is a refusal, never a pass.
 */
function assertNoAllowAcl(deps: UdsClientDeps, p: string, key: string): void {
  if (deps.os.platform() !== "darwin" || ACL_CHECKED.has(key)) return;
  let out: string;
  try {
    out = deps.childProcess.execFileSync("/bin/ls", ["-lde", p], {
      encoding: "utf8",
      timeout: 2000,
    });
  } catch (err) {
    const e = err as { code?: unknown; status?: unknown };
    const why = typeof e.code === "string" && e.code !== "" ? e.code : `ls exit ${String(e.status)}`;
    throw new UdsClientError("SOCKET_UNTRUSTED", `could not read the ACL of ${p} (${why}); refusing`);
  }
  if (
    out
      .split("\n")
      .slice(1)
      .some((line) => / allow /.test(line))
  ) {
    throw new UdsClientError("SOCKET_UNTRUSTED", `${p} carries an ACL entry that grants access`);
  }
  ACL_CHECKED.add(key);
}

/**
 * Check a socket before a bearer token is written to it. The path must be exactly
 * <home>/.local/state/trinc/run/<expectedName>; home and every level below it must be a real
 * directory owned by this uid that group and others cannot write; the run directory and the socket
 * must grant them nothing; no level may carry an ACL allow entry. Never connects.
 *
 * @param socketPath - The exact path the caller is about to connect to.
 * @param expectedName - The socket name the caller is bound to.
 * @throws UdsClientError ENOENT when a directory or the socket is missing (bridge not running),
 *   otherwise SOCKET_UNTRUSTED or SOCKET_PATH_TOO_LONG.
 */
export function assertSocketTrust(socketPath: unknown, expectedName: string): void {
  const deps = nodeDeps();
  const { fs, path, os } = deps;
  const uid = os.userInfo().uid;
  const home = os.homedir();
  const dir = path.join(home, ...RUN_DIR_SEGMENTS);
  if (
    typeof socketPath !== "string" ||
    socketPath === "" ||
    !path.isAbsolute(socketPath) ||
    path.resolve(socketPath) !== socketPath
  ) {
    throw new UdsClientError(
      "SOCKET_UNTRUSTED",
      `socket path must be absolute and normalized: ${String(socketPath)}`
    );
  }
  if (path.dirname(socketPath) !== dir || path.basename(socketPath) !== expectedName) {
    throw new UdsClientError(
      "SOCKET_UNTRUSTED",
      `socket must be ${path.join(dir, String(expectedName))}: ${socketPath}`
    );
  }
  const hiddenBytes = utf8Length(dir) + 1 + utf8Length(expectedName) + HIDDEN_NAME_EXTRA_BYTES;
  if (Math.max(utf8Length(socketPath), hiddenBytes) > MAX_SOCKET_PATH_BYTES) {
    throw new UdsClientError(
      "SOCKET_PATH_TOO_LONG",
      `socket path is too long for macOS: ${socketPath}`
    );
  }
  const levels = [home];
  for (const part of RUN_DIR_SEGMENTS) levels.push(path.join(levels[levels.length - 1], part));
  for (let i = 0; i < levels.length; i++) {
    const p = levels[i];
    const st = lstatOrRefuse(fs, p);
    if (st.isSymbolicLink() || !st.isDirectory() || st.uid !== uid) {
      throw new UdsClientError(
        "SOCKET_UNTRUSTED",
        `${p} is not a real directory owned by uid ${uid}`
      );
    }
    const forbidden = i === levels.length - 1 ? 0o077 : 0o022;
    if ((st.mode & forbidden) !== 0) {
      throw new UdsClientError(
        "SOCKET_UNTRUSTED",
        `${p} has mode ${(st.mode & 0o7777).toString(8)}`
      );
    }
    assertNoAllowAcl(deps, p, `${st.dev}:${st.ino}`);
  }
  const sock = lstatOrRefuse(fs, socketPath);
  if (!sock.isSocket() || sock.uid !== uid || (sock.mode & 0o077) !== 0) {
    throw new UdsClientError(
      "SOCKET_UNTRUSTED",
      `${socketPath} is not a private socket owned by uid ${uid}`
    );
  }
  assertNoAllowAcl(deps, socketPath, `${sock.dev}:${sock.ino}`);
}

/**
 * The only way this plugin creates a bridge request: checks the exact path it then sends, and pins
 * the connection to it. Options are built here, so no agent, host or port can reach http.request.
 */
function pinnedRequest(
  socket: BridgeSocket,
  method: string,
  requestPath: string,
  headers: Record<string, string>
): ClientRequestT {
  const socketPath = socket.socketPath;
  assertSocketTrust(socketPath, socket.expectedName);
  const { http, net } = nodeDeps();
  return http.request({
    method,
    path: requestPath,
    headers,
    socketPath,
    createConnection: () => net.connect({ path: socketPath }),
  });
}

/** A request to a bridge over its socket. */
export interface UdsRequest {
  method: "GET" | "POST";
  /** Path on the bridge, e.g. "/mcp/tool". */
  path: string;
  /** Sent as given; a caller with a body sets Content-Type and a Content-Length matching it. */
  headers?: Record<string, string>;
  /** The exact body bytes. */
  body?: Uint8Array;
  /** Whole-request deadline; when it passes the request is destroyed with ETIMEDOUT. */
  timeoutMs: number;
}

/** A bridge's answer: any status (non-2xx is not an error here) and the UTF-8 body. */
export interface UdsResponse {
  status: number;
  text: string;
}

/**
 * Make one request to a bridge over its socket.
 *
 * @param socket - The socket from resolveBridgeSocket; its path is re-checked by assertSocketTrust.
 * @param request - Method, path, headers, body bytes and deadline.
 * @returns The status and body text; rejects with UdsClientError (refusal, ETIMEDOUT) or the
 *   socket's own error.
 */
export function udsRequest(socket: BridgeSocket, request: UdsRequest): Promise<UdsResponse> {
  return new Promise<UdsResponse>((resolve, reject) => {
    const req = pinnedRequest(socket, request.method, request.path, request.headers ?? {});
    const timer = setTimeout(() => {
      req.destroy(
        new UdsClientError(
          "ETIMEDOUT",
          `${request.method} ${request.path} over unix:${socket.socketPath} timed out after ${request.timeoutMs}ms`
        )
      );
    }, request.timeoutMs);
    const fail = (err: Error): void => {
      clearTimeout(timer);
      reject(err);
    };
    req.on("error", fail);
    req.on("response", (res: IncomingMessageT) => {
      const chunks: string[] = [];
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => chunks.push(chunk));
      res.on("error", fail);
      res.on("end", () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode ?? 0, text: chunks.join("") });
      });
    });
    if (request.body) req.end(request.body);
    else req.end();
  });
}

/** A long-lived GET (an SSE stream) over a bridge socket. */
export interface UdsStreamRequest {
  /** Path on the bridge, e.g. "/mcp/events?stream=research". */
  path: string;
  headers?: Record<string, string>;
  /** The request is destroyed with ETIMEDOUT once the socket has been idle this long. */
  idleTimeoutMs: number;
}

/**
 * Open a stream over a bridge socket. The request is already ended when it is returned; attach an
 * "error" listener before yielding (errors are emitted asynchronously).
 *
 * @param socket - The socket from resolveBridgeSocket; its path is re-checked by assertSocketTrust.
 * @param request - Path, headers and idle timeout.
 * @param onResponse - Receives the response once its headers arrive.
 * @returns The request, for "error" handling and destroy().
 * @throws UdsClientError when the socket is refused (nothing is connected then).
 */
export function udsOpenStream(
  socket: BridgeSocket,
  request: UdsStreamRequest,
  onResponse: (res: IncomingMessageT) => void
): ClientRequestT {
  const req = pinnedRequest(socket, "GET", request.path, request.headers ?? {});
  req.on("response", onResponse);
  req.setTimeout(request.idleTimeoutMs, () => {
    req.destroy(
      new UdsClientError(
        "ETIMEDOUT",
        `no data over unix:${socket.socketPath} for ${request.idleTimeoutMs}ms`
      )
    );
  });
  req.end();
  return req;
}
