// Which links may be handed to Downie: src/video/downie-sites.ts. Run: npm test
//
// The refusals matter more than the approvals. Downie opens a page with the operator's sign-ins, and an
// agent that reads untrusted text calls the tool, so a link that could carry note text to another site,
// or bounce off a redirect page, must never be approved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { approveDownieLink, APPROVED_LINK_MAX_LENGTH } from "../src/video/downie-sites.ts";

const KALTURA = "/index.php/extwidget/preview/partner_id/956951/uiconf_id/51117643/entry_id/1_a1b2c3d4/embed/dynamic";
const FILM = "https://video-alexanderstreet-com.libdatab.strayer.edu/watch/online-advertising";

function approved(raw: unknown) {
  const result = approveDownieLink(raw);
  assert.equal(result.ok, true, `expected an approval for ${String(raw)}: ${JSON.stringify(result)}`);
  return (result as Extract<typeof result, { ok: true }>).link;
}

function refusedAs(kind: "other-site" | "refused", raw: unknown): string {
  const result = approveDownieLink(raw);
  assert.equal(result.ok, false, `expected a refusal for ${String(raw)}`);
  const no = result as Extract<typeof result, { ok: false }>;
  assert.equal(no.kind, kind, `${String(raw)}: ${no.reason}`);
  return no.reason;
}

test("a LinkedIn lesson is rebuilt with nothing but its page and the account number", () => {
  const link = approved(
    "  https://www.linkedin.com/learning/networking-foundations/keep-networking-25201753/?u=12345678&resume=false&autoAdvance=true#x "
  );
  assert.equal(link.url, "https://www.linkedin.com/learning/networking-foundations/keep-networking-25201753?u=12345678");
  assert.equal(link.site, "linkedin");
  assert.equal(link.firstTry, "automatic");
  assert.deepEqual(link.pageTokens, ["/learning/networking-foundations/keep-networking-25201753"]);
  assert.equal(approved("https://linkedin.com/learning/c/l").url, "https://www.linkedin.com/learning/c/l");
  assert.equal(approved("https://www.linkedin.com/learning/c/l?u=abc").url, "https://www.linkedin.com/learning/c/l");
  assert.equal(approved(`https://www.linkedin.com/learning/c/l?u=${"1".repeat(13)}`).url, "https://www.linkedin.com/learning/c/l");
});

test("LinkedIn: every other page is refused, redirectors first", () => {
  for (const path of [
    "/redir/redirect?url=https%3A%2F%2Fattacker.example",
    "/safety/go?url=https://attacker.example",
    "/learning-login/share?redirect=https%3A%2F%2Fattacker.example",
    "/feed/",
    "/company/some-course/some-lesson",
    "/learning",
    "/learning/paths/become-x",
    "/learning/search/notes",
    "/learning/me/saved",
    "/learning/a/b/c",
    "/learning/a/b%2Fc",
    "/learning/a/b:c",
    "/learning//b",
    "/learning/a/%6cesson",
    `/learning/a/${"b".repeat(121)}`,
  ]) {
    refusedAs("refused", `https://www.linkedin.com${path}`);
  }
  assert.match(refusedAs("refused", "https://www.linkedin.com/learning/some-course?u=1"), /whole course/);
});

test("a Kaltura preview of the school's own partner is approved, on either host", () => {
  for (const host of ["www.kaltura.com", "cdnapisec.kaltura.com"]) {
    const link = approved(`https://${host}${KALTURA}?utm=x`);
    assert.equal(link.url, `https://${host}${KALTURA}`);
    assert.equal(link.site, "kaltura");
    assert.equal(link.firstTry, "automatic");
    assert.deepEqual(link.pageTokens, ["1_a1b2c3d4"]);
  }
});

test("Kaltura: another partner, a short link and every other page are refused", () => {
  for (const path of [
    KALTURA.replace("956951", "956952"),
    KALTURA.replace("956951", "9569510"),
    KALTURA.replace("1_a1b2c3d4", "1_a1b2c3d4e"),
    KALTURA.replace("1_a1b2c3d4", "note-text-here"),
    KALTURA.replace("51117643", "5111764312345"),
    `${KALTURA}/extra`,
    `/x${KALTURA}`,
    "/tiny/h26gu",
    "/",
  ]) {
    refusedAs("refused", `https://www.kaltura.com${path}`);
  }
  refusedAs("other-site", `https://evil.kaltura.com${KALTURA}`);
  refusedAs("other-site", `https://kaltura.com${KALTURA}`);
});

test("a library film page is approved and goes to the guided window at once", () => {
  const link = approved(`${FILM}/?`);
  assert.equal(link.url, FILM);
  assert.equal(link.site, "library");
  assert.equal(link.firstTry, "guided");
  assert.deepEqual(link.pageTokens, ["/watch/online-advertising"]);
  assert.equal(approved(`${FILM}#t=3`).url, FILM);
  assert.equal(approved(`${FILM}/transcript`).url, FILM);
  assert.deepEqual(approved(`${FILM}/Transcript/`).pageTokens, ["/watch/online-advertising"]);
  assert.equal(approved(FILM.replace("online-advertising", "transcript")).url, FILM.replace("online-advertising", "transcript"));
  assert.equal(
    approved("https://sk-sagepub-com.libdatab.strayer.edu/video/some-film?sid=ab_c-1").url,
    "https://sk-sagepub-com.libdatab.strayer.edu/video/some-film?sid=ab_c-1"
  );
  assert.equal(
    approved("https://fod-infobase-com.libdatab.strayer.edu/p_ViewVideo.aspx?xtid=12345").url,
    "https://fod-infobase-com.libdatab.strayer.edu/p_ViewVideo.aspx?xtid=12345"
  );
});

test("the library's sign-in link becomes the film's own proxied page; the sign-in page is never opened", () => {
  for (const raw of [
    "https://login.libdatab.strayer.edu/login?url=https://video.alexanderstreet.com/watch/online-advertising",
    "https://login.libdatab.strayer.edu/login?qurl=https%3A%2F%2Fvideo.alexanderstreet.com%2Fwatch%2Fonline-advertising",
    "https://libdatab.strayer.edu/login?url=https://video.alexanderstreet.com/watch/online-advertising",
    `https://login.libdatab.strayer.edu/login?url=${encodeURIComponent(FILM)}`,
  ]) {
    assert.equal(approved(raw).url, FILM, raw);
  }
});

test("library: forwarding hosts, other pages, nested addresses and odd characters are refused", () => {
  for (const raw of [
    "https://login.libdatab.strayer.edu/login",
    "https://login.libdatab.strayer.edu/login?url=http://video.alexanderstreet.com/watch/x",
    "https://login.libdatab.strayer.edu/login?url=https://video.alexanderstreet.com:8443/watch/x",
    "https://login.libdatab.strayer.edu/login?url=https://u:p@video.alexanderstreet.com/watch/x",
    "https://login.libdatab.strayer.edu/login?url=https://some-vendor.com/watch/x",
    "https://login.libdatab.strayer.edu/login?url=https://video.alexanderstreet.com/browse/x",
    "https://login.libdatab.strayer.edu/login?url=https://a.com/watch/x&qurl=https://b.com/watch/x",
    "https://login.libdatab.strayer.edu/login?url=https://login.libdatab.strayer.edu/login?url=https://a.com/watch/x",
    "https://login.libdatab.strayer.edu/watch/x",
    "https://login.libdatab.strayer.edu/other?url=https://video.alexanderstreet.com/watch/x",
    "https://login.libdatab.strayer.edu/login?url=https://login.libdatab.strayer.edu/watch/x",
    "https://www.libdatab.strayer.edu/watch/x",
    "https://dx-doi-org.libdatab.strayer.edu/watch/x",
    "https://doi-org.libdatab.strayer.edu/10.1177/watch/x",
    "https://doi-org.libdatab.strayer.edu/watch/10.1177",
    "https://libdatab.strayer.edu/watch/x",
    "https://a.b.libdatab.strayer.edu/watch/x",
    "https://video-alexanderstreet-com.libdatab.strayer.edu/",
    "https://video-alexanderstreet-com.libdatab.strayer.edu/watch",
    "https://video-alexanderstreet-com.libdatab.strayer.edu/search/notes",
    "https://video-alexanderstreet-com.libdatab.strayer.edu/a/b/c/watch/x",
    "https://video-alexanderstreet-com.libdatab.strayer.edu/watch/a/b/c/d/e/f/g/h",
    `${FILM}?next=https://attacker.example`,
    `${FILM}?next=https%3A%2F%2Fattacker.example`,
    `${FILM}?d=${"a".repeat(41)}`,
    `${FILM}?a=1&b=2&c=3&d=4&e=5`,
    `${FILM}?d=`,
    `${FILM}?a:b=1`,
    `${FILM}?1=1`,
    `${FILM}?https%3A%2F%2Fattacker.example=1`,
    "https://video-alexanderstreet-com.libdatab.strayer.edu/watch/a%2Fb",
    "https://video-alexanderstreet-com.libdatab.strayer.edu/watch//x",
    "https://video-alexanderstreet-com.libdatab.strayer.edu/watch/x;y",
  ]) {
    refusedAs("refused", raw);
  }
});

test("other sites, look-alikes and anything that is not a plain https link are not on the list", () => {
  for (const raw of [
    "https://www.youtube.com/watch?v=x",
    "https://attacker.example/?notes=secret",
    "https://www.linkedin.com.attacker.example/learning/c/l",
    "https://evil-linkedin.com/learning/c/l",
    "https://xn--linkedn-4va.com/learning/c/l",
    "https://libdatab.strayer.edu.attacker.example/watch/x",
    "https://xlibdatab.strayer.edu/watch/x",
    "https://www.strayer.edu/watch/x",
    "http://www.linkedin.com/learning/c/l",
    "https://user:pass@www.linkedin.com/learning/c/l",
    "https://www.linkedin.com@attacker.example/learning/c/l",
    "downie://XUOpenURL?url=https://www.linkedin.com/learning/c/l",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "https://www.linkedin.com/learning/c/l\nhttps://attacker.example",
    "https://www.linkedin.com/learning/c/l x",
    "",
    "   ",
    null,
    undefined,
    42,
    {},
  ]) {
    refusedAs("other-site", raw);
  }
});

test("a port is refused on a listed site, and the default port is not a port", () => {
  assert.match(refusedAs("refused", "https://www.linkedin.com:8443/learning/c/l"), /port/);
  assert.equal(approved("https://www.linkedin.com:443/learning/c/l").url, "https://www.linkedin.com/learning/c/l");
});

test("a backslash or dot-segment trick ends at the listed site or nowhere", () => {
  refusedAs("refused", "https://www.linkedin.com\\@attacker.example/learning/c/l");
  assert.equal(approved("https://www.linkedin.com/x/../learning/c/l").url, "https://www.linkedin.com/learning/c/l");
  refusedAs("refused", "https://www.linkedin.com/learning/c/../../redir/redirect");
});

test("an approved link holds only plain characters and is never long", () => {
  const long = `https://video-alexanderstreet-com.libdatab.strayer.edu/watch/${"a".repeat(APPROVED_LINK_MAX_LENGTH)}`;
  assert.match(refusedAs("refused", long), /longer than/);
  const widest = `${FILM}/${"a".repeat(APPROVED_LINK_MAX_LENGTH - FILM.length - 1)}`;
  assert.equal(approved(widest).url.length, APPROVED_LINK_MAX_LENGTH);
  for (const raw of [FILM, `https://www.kaltura.com${KALTURA}`, "https://www.linkedin.com/learning/c/l?u=1"]) {
    assert.match(approved(raw).url, /^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9._~/?=&-]+$/);
  }
});

test("approving an approved link gives the same link back", () => {
  for (const raw of [FILM, `https://cdnapisec.kaltura.com${KALTURA}`, "https://www.linkedin.com/learning/c/l?u=1"]) {
    const once = approved(raw);
    assert.deepEqual(approved(once.url), once);
  }
});
