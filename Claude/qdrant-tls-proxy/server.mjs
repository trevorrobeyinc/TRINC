import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

const LISTEN_HOST = process.env.QDRANT_TLS_HOST ?? "127.0.0.1";
const LISTEN_PORT = Number(process.env.QDRANT_TLS_PORT ?? 6433);
const UPSTREAM_HOST = process.env.QDRANT_UPSTREAM_HOST ?? "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.QDRANT_UPSTREAM_PORT ?? 6333);
const TLS_CERT = process.env.QDRANT_TLS_CERT ?? `${process.env.HOME}/.local/share/mkcert/localhost.pem`;
const TLS_KEY = process.env.QDRANT_TLS_KEY ?? `${process.env.HOME}/.local/share/mkcert/localhost-key.pem`;

const cert = readFileSync(TLS_CERT);
const key = readFileSync(TLS_KEY);

const server = https.createServer({ cert, key }, (req, res) => {
  const upstream = http.request(
    {
      host: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `${UPSTREAM_HOST}:${UPSTREAM_PORT}` },
      timeout: 30_000,
    },
    (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, upRes.headers);
      upRes.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    process.stderr.write(`[qdrant-tls-proxy] upstream error: ${err.message}\n`);
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end(`upstream error: ${err.message}`);
  });
  upstream.on("timeout", () => upstream.destroy(new Error("upstream timeout")));
  req.pipe(upstream);
});

if (!(server instanceof https.Server)) {
  throw new Error("server is not an https.Server — refusing to listen");
}

server.on("clientError", (err, socket) => {
  process.stderr.write(`[qdrant-tls-proxy] client error: ${err.message}\n`);
  socket.destroy();
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  process.stderr.write(
    `[qdrant-tls-proxy] listening https://${LISTEN_HOST}:${LISTEN_PORT} -> http://${UPSTREAM_HOST}:${UPSTREAM_PORT}\n`,
  );
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    process.stderr.write(`[qdrant-tls-proxy] received ${sig}, closing\n`);
    server.close(() => process.exit(0));
  });
}
