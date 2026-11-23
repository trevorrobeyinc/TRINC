// The Downie hand-off: src/video/downie.ts. Run: npm test
//
// Nothing here starts a program or touches the operator's Downie folder: the program runner is a fake that
// records its arguments, the folder is a temp folder, and the clock is virtual. A test scripts what the
// folder holds after a given number of seconds, so a 30-minute wait takes no time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { Clock } from "../src/video/copilot-summary.ts";
import {
  defaultDownieFolder,
  detailsNameLink,
  DOWNIE_APP,
  DOWNIE_AUTOMATIC_WAIT_MS,
  DOWNIE_GUIDED_STEPS,
  DOWNIE_GUIDED_WAIT_MS,
  DOWNIE_UNMATCHED_GRACE_MS,
  downieAddress,
  downloadThroughDownie,
  DownieTimeoutError,
  lessonTitleFromSlug,
  listDownieVideos,
  OPEN_BINARY,
  openInDownie,
  pathForNaming,
} from "../src/video/downie.ts";
import { approveDownieLink, type ApprovedLink } from "../src/video/downie-sites.ts";
import type { ExecFn } from "../src/video/transcribe.ts";

const FILM = "https://video-alexanderstreet-com.libdatab.strayer.edu/watch/criminal-law";
const LESSON = "https://www.linkedin.com/learning/networking-foundations/what-is-a-network?u=12345678";
const KALTURA =
  "https://www.kaltura.com/index.php/extwidget/preview/partner_id/956951/uiconf_id/51117643/entry_id/1_a1b2c3d4/embed/dynamic";

function link(url: string): ApprovedLink {
  const approval = approveDownieLink(url);
  assert.equal(approval.ok, true, url);
  return (approval as Extract<typeof approval, { ok: true }>).link;
}

interface Bench {
  folder: string;
  clock: Clock;
  /** Seconds since the bench was made. */
  seconds(): number;
  /** Do `what` once the virtual clock reaches `atSeconds`. */
  at(atSeconds: number, what: () => Promise<unknown>): void;
  opened: string[];
  exec: ExecFn;
  lines: string[];
  notices: string[];
  run(url: string, extra?: Partial<Parameters<typeof downloadThroughDownie>[0]>): ReturnType<typeof downloadThroughDownie>;
  put(name: string, text?: string): Promise<string>;
}

async function onBench(fn: (bench: Bench) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "cc-downie-"));
  const folder = join(root, "Movies", "Downie");
  await mkdir(folder, { recursive: true });
  let now = 1_000_000;
  const started = now;
  const events: Array<{ at: number; what: () => Promise<unknown> }> = [];
  const bench: Bench = {
    folder,
    seconds: () => (now - started) / 1000,
    at: (atSeconds, what) => void events.push({ at: started + atSeconds * 1000, what }),
    clock: {
      now: () => now,
      sleep: async (ms) => {
        now += ms;
        for (const event of events.filter((e) => e.at <= now)) {
          events.splice(events.indexOf(event), 1);
          await event.what();
        }
      },
    },
    opened: [],
    exec: async (file, args) => {
      bench.opened.push([file, ...args].join(" "));
      return { stdout: "", stderr: "" };
    },
    lines: [],
    notices: [],
    put: async (name, text = "video bytes") => {
      const file = join(folder, name);
      await writeFile(file, text);
      return file;
    },
    run: (url, extra = {}) =>
      downloadThroughDownie({
        link: link(url),
        folder,
        log: async (line) => void bench.lines.push(line),
        clock: bench.clock,
        checkpoint: async () => undefined,
        notify: (message) => void bench.notices.push(message),
        exec: bench.exec,
        appExists: () => true,
        ...extra,
      }),
  };
  try {
    await fn(bench);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const automatic = (url: string) => `${OPEN_BINARY} downie://XUOpenURL?url=${encodeURIComponent(url)}`;
const guided = (url: string) => `${automatic(url)}&action=open_in_uge`;
/** Downie's details file for a download of `page`. */
const details = (page: string) =>
  JSON.stringify({ __type: "x", title: "A film", url: "https://media.vendor.example/a.m3u8", referer: page }).replace(/\//g, "\\/");

test("a library film opens the guided window at once, and its video is claimed by its details", () =>
  onBench(async (bench) => {
    bench.at(120, async () => {
      await bench.put("Criminal law.mp4");
      await bench.put("Criminal law.json", details(`${FILM}?x=1`));
    });
    const download = await bench.run(FILM);
    assert.deepEqual(download, { file: join(bench.folder, "Criminal law.mp4"), matched: true });
    assert.deepEqual(bench.opened, [guided(FILM)]);
    assert.equal(bench.seconds(), 128, "two equal looks after the first one, 4 s apart");
    assert.deepEqual(bench.lines, [
      "downie hand-off (guided): video-alexanderstreet-com.libdatab.strayer.edu",
      "WAITING FOR USER: Downie's window is open on video-alexanderstreet-com.libdatab.strayer.edu; press play on the video, then + in the right-hand column",
      `downie file detected: ${join(bench.folder, "Criminal law.mp4")}`,
    ]);
    assert.equal(bench.notices.length, 2);
    assert.match(bench.notices[0], /Press play on the video, then \+/);
    // Downie's own files are left exactly where they were.
    assert.deepEqual((await readdir(bench.folder)).sort(), ["Criminal law.json", "Criminal law.mp4"]);
  }));

test("a LinkedIn lesson is fetched automatically, with no window and nothing for the operator to do", () =>
  onBench(async (bench) => {
    bench.at(20, async () => {
      await bench.put("CeJxToken.mp4");
      await bench.put("CeJxToken.json", details(LESSON));
    });
    const download = await bench.run(LESSON);
    assert.equal(download.matched, true);
    assert.deepEqual(bench.opened, [automatic(LESSON)]);
    assert.equal(bench.lines.some((line) => line.startsWith("WAITING FOR USER:")), false);
  }));

test("when the automatic way gives nothing in three minutes, the guided window opens and the run goes on", () =>
  onBench(async (bench) => {
    bench.at(400, async () => {
      await bench.put("Lecture.mp4");
      await bench.put("Lecture.json", details(KALTURA));
    });
    const download = await bench.run(KALTURA);
    assert.equal(download.file, join(bench.folder, "Lecture.mp4"));
    assert.deepEqual(bench.opened, [automatic(KALTURA), guided(KALTURA)]);
    assert.deepEqual(bench.lines.slice(0, 2), [
      "downie hand-off (automatic): www.kaltura.com",
      `downie automatic try: Downie saved no video in ${bench.folder} within 3 min; opening the guided window`,
    ]);
    assert.equal(bench.lines.some((line) => line.startsWith("WAITING FOR USER:")), true);
  }));

test("a video still settling at the three-minute mark is waited for instead of opening the window", () =>
  onBench(async (bench) => {
    bench.at(DOWNIE_AUTOMATIC_WAIT_MS / 1000 - 2, async () => {
      await bench.put("Lecture.mp4");
      await bench.put("Lecture.json", details(KALTURA));
    });
    await bench.run(KALTURA);
    assert.deepEqual(bench.opened, [automatic(KALTURA)]);
  }));

test("an automatic download that lands late is still claimed while the window is open", () =>
  onBench(async (bench) => {
    bench.at(DOWNIE_AUTOMATIC_WAIT_MS / 1000 + 30, async () => {
      await bench.put("Lecture.mp4");
      await bench.put("Lecture.json", details(KALTURA));
    });
    assert.equal((await bench.run(KALTURA)).matched, true);
  }));

test("a film that was in the folder before is never claimed, even when its time changes or its details match", () =>
  onBench(async (bench) => {
    const old = await bench.put("Old film.mp4", "old film bytes");
    await bench.put("Old film.json", details(FILM));
    bench.at(30, () => utimes(old, new Date(), new Date()));
    await assert.rejects(bench.run(FILM), DownieTimeoutError);
    assert.ok((await readdir(bench.folder)).includes(basename(old)));
  }));

test("the same film saved again is claimed, whether the old file was replaced or written over", () =>
  onBench(async (bench) => {
    const old = await bench.put("Film.mp4", "same size");
    await bench.put("Film.json", details(FILM));
    bench.at(40, async () => {
      await writeFile(join(bench.folder, "..", "new.mp4"), "SAME SIZE");
      await rename(join(bench.folder, "..", "new.mp4"), old);
    });
    assert.deepEqual(await bench.run(FILM), { file: old, matched: true });
    bench.at(bench.seconds() + 40, () => bench.put("Film.mp4", "written over, longer"));
    assert.deepEqual(await bench.run(FILM), { file: old, matched: true });
  }));

test("a file that is still growing is not claimed until its size has stopped changing", () =>
  onBench(async (bench) => {
    await Promise.resolve();
    for (let i = 1; i <= 10; i += 1) {
      bench.at(i * 4, async () => {
        await bench.put("Film.mp4", "x".repeat(i));
        await bench.put("Film.json", details(FILM));
      });
    }
    await bench.run(FILM);
    assert.equal(bench.seconds(), 48, "last growth at 40 s, then two equal looks");
  }));

test("a matching file wins over an unrelated one that finished first", () =>
  onBench(async (bench) => {
    bench.at(8, () => bench.put("A other.mp4"));
    bench.at(16, async () => {
      await bench.put("Z film.mp4");
      await bench.put("Z film.json", details(FILM));
    });
    assert.deepEqual(await bench.run(FILM), { file: join(bench.folder, "Z film.mp4"), matched: true });
  }));

test("with no match, the one finished video is taken after the grace period, and the log says so", () =>
  onBench(async (bench) => {
    bench.at(4, async () => {
      await bench.put("Film.mp4");
      await bench.put("Film.json", details("https://video-alexanderstreet-com.libdatab.strayer.edu/watch/criminal-law-2"));
    });
    const download = await bench.run(FILM);
    assert.deepEqual(download, { file: join(bench.folder, "Film.mp4"), matched: false });
    assert.equal(bench.seconds(), 12 + DOWNIE_UNMATCHED_GRACE_MS / 1000);
    assert.ok(bench.lines.some((line) => line.startsWith("downie file not matched to the link:")));
  }));

test("a finished file that starts growing again is not claimed until it has settled again", () =>
  onBench(async (bench) => {
    bench.at(4, () => bench.put("Film.mp4", "x"));
    for (let i = 5; i <= 15; i += 1) bench.at(i * 4, () => bench.put("Film.mp4", "x".repeat(i)));
    assert.equal((await bench.run(FILM)).matched, false);
    assert.equal(bench.seconds(), 60 + 8 + DOWNIE_UNMATCHED_GRACE_MS / 1000);
  }));

test("a finished file that disappears during the grace period is never claimed", () =>
  onBench(async (bench) => {
    bench.at(4, () => bench.put("Other.mp4"));
    bench.at(20, () => rm(join(bench.folder, "Other.mp4")));
    await assert.rejects(bench.run(FILM), DownieTimeoutError);
  }));

test("links, folders, hidden files, empty files and other types in the folder are never a video", () =>
  onBench(async (bench) => {
    const elsewhere = join(bench.folder, "..", "elsewhere.mp4");
    await writeFile(elsewhere, "bytes");
    bench.at(4, async () => {
      await symlink(elsewhere, join(bench.folder, "link.mp4"));
      await mkdir(join(bench.folder, "folder.mp4"));
      await bench.put(".hidden.mp4");
      await bench.put("empty.mp4", "");
      await bench.put("notes.txt");
      await bench.put("part.mp4.download");
    });
    await assert.rejects(bench.run(FILM), DownieTimeoutError);
    assert.deepEqual([...(await listDownieVideos(bench.folder)).keys()], ["empty.mp4"]);
  }));

test("a file that vanishes before it has settled is dropped, and its replacement is claimed", () =>
  onBench(async (bench) => {
    bench.at(4, () => bench.put("Film.part.mp4"));
    bench.at(12, async () => {
      await rename(join(bench.folder, "Film.part.mp4"), join(bench.folder, "Film.mp4"));
      await bench.put("Film.json", details(FILM));
    });
    assert.deepEqual(await bench.run(FILM), { file: join(bench.folder, "Film.mp4"), matched: true });
  }));

test("thirty minutes with nothing ends the wait, saying what + does and how to go on", () =>
  onBench(async (bench) => {
    await assert.rejects(bench.run(FILM), (error: Error) => {
      assert.ok(error instanceof DownieTimeoutError);
      assert.match(error.message, /within 30 min/);
      assert.match(error.message, /Nothing is saved until \+ is pressed/);
      return true;
    });
    assert.equal(bench.seconds(), DOWNIE_GUIDED_WAIT_MS / 1000);
  }));

test("a stopped run lets go at once and opens nothing more", () =>
  onBench(async (bench) => {
    const abort = new AbortController();
    const stopped = new Error("stopped");
    const never: Clock = { now: () => 0, sleep: () => new Promise(() => undefined) };
    const outcome = bench.run(KALTURA, {
      clock: never,
      signal: abort.signal,
      checkpoint: async () => {
        if (abort.signal.aborted) throw stopped;
      },
    });
    setTimeout(() => abort.abort("stopped"), 5);
    await assert.rejects(outcome, stopped);
    assert.deepEqual(bench.opened, [automatic(KALTURA)]);
  }));

test("a run stopped during the automatic wait never opens the guided window", () =>
  onBench(async (bench) => {
    let stop = false;
    bench.at(60, async () => void (stop = true));
    await assert.rejects(
      bench.run(KALTURA, {
        checkpoint: async () => {
          if (stop) throw new Error("superseded");
        },
      }),
      /superseded/
    );
    assert.deepEqual(bench.opened, [automatic(KALTURA)]);
    assert.equal(bench.lines.some((line) => line.includes("opening the guided window")), false);
  }));

test("a run that was already stopped opens nothing, whichever way its site goes first", () =>
  onBench(async (bench) => {
    for (const url of [FILM, KALTURA]) {
      const outcome = bench.run(url, {
        checkpoint: async () => {
          throw new Error("superseded");
        },
      });
      await assert.rejects(outcome, /superseded/);
    }
    assert.deepEqual(bench.opened, []);
  }));

test("without Downie installed nothing is opened", () =>
  onBench(async (bench) => {
    await assert.rejects(bench.run(FILM, { appExists: (candidate) => candidate !== DOWNIE_APP }), /not installed/);
    assert.deepEqual(bench.opened, []);
  }));

test("when Downie cannot be opened the run fails with the reason instead of waiting", () =>
  onBench(async (bench) => {
    const exec: ExecFn = async () => {
      throw new Error("kLSApplicationNotFoundErr");
    };
    await assert.rejects(bench.run(FILM, { exec }), /Downie could not be opened: kLSApplicationNotFoundErr/);
    assert.equal(bench.seconds(), 0);
  }));

test("the folder is made when it is missing", () =>
  onBench(async (bench) => {
    await rm(bench.folder, { recursive: true });
    bench.at(4, async () => {
      await bench.put("Film.mp4");
      await bench.put("Film.json", details(FILM));
    });
    assert.equal((await bench.run(FILM)).matched, true);
  }));

// The last gate before a program runs: it checks the link itself, so no caller can get past the list.
test("openInDownie runs one fixed program with one argument, and only for an approved link", async () => {
  const calls: Array<[string, readonly string[]]> = [];
  const exec: ExecFn = async (file, args) => {
    calls.push([file, args]);
    return { stdout: "", stderr: "" };
  };
  for (const bad of [
    "https://attacker.example/?notes=secret",
    "https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fattacker.example",
    "-a/Applications/Terminal.app",
    "file:///etc/passwd",
    "",
  ]) {
    await assert.rejects(openInDownie(bad, "automatic", exec), /not on the approved list/);
    await assert.rejects(openInDownie(bad, "guided", exec), /not on the approved list/);
  }
  assert.deepEqual(calls, []);

  await openInDownie(`${LESSON}&resume=false&x=https://attacker.example`, "guided", exec);
  assert.deepEqual(calls, [
    [
      "/usr/bin/open",
      [`downie://XUOpenURL?url=https%3A%2F%2Fwww.linkedin.com%2Flearning%2Fnetworking-foundations%2Fwhat-is-a-network%3Fu%3D12345678&action=open_in_uge`],
    ],
  ]);
});

test("the address carries the link encoded, so nothing in it can become another parameter", () => {
  const withQuery = link("https://fod-infobase-com.libdatab.strayer.edu/p_ViewVideo.aspx?xtid=12345&loid=6");
  const address = downieAddress(withQuery, "guided");
  assert.equal(address.split("&").length, 2, address);
  const parsed = new URL(address);
  assert.equal(parsed.searchParams.get("url"), withQuery.url);
  assert.equal(parsed.searchParams.get("action"), "open_in_uge");
  assert.equal(new URL(downieAddress(withQuery, "automatic")).searchParams.get("action"), null);
});

test("a details file names the link only when the page's own name ends where the link's does", () => {
  const tokens = ["/watch/criminal-law"];
  assert.equal(detailsNameLink(details(FILM), tokens), true);
  assert.equal(detailsNameLink(details(`${FILM}?x=1`), tokens), true);
  assert.equal(detailsNameLink(details(`${FILM}/`), tokens), true);
  assert.equal(detailsNameLink(details(`${FILM}-intro`), tokens), false);
  assert.equal(detailsNameLink(JSON.stringify({ a: [{ b: `${FILM}-intro ${FILM}` }] }), tokens), true);
  assert.equal(detailsNameLink(`not json ${FILM.replace(/\//g, "\\/")}`, tokens), true);
  assert.equal(detailsNameLink("", tokens), false);
  assert.equal(detailsNameLink("{}", tokens), false);
  assert.equal(detailsNameLink(details(FILM), [""]), false);
  assert.equal(detailsNameLink(details(KALTURA), ["1_a1b2c3d4"]), true);
  assert.equal(detailsNameLink(details(KALTURA.replace("1_a1b2c3d4", "1_a1b2c3d5")), ["1_a1b2c3d4"]), false);
});

test("notes are named for people: lesson titles, no site suffix, no pipe, and the file keeps its own name", () => {
  const lesson = link(LESSON);
  const token = `CeJx${"a".repeat(60)}`;
  const named = (name: string, which: ApprovedLink) => basename(pathForNaming(`/m/${name}`, which));
  assert.equal(named(`${token}.mp4`, lesson), "What is a network.mp4");
  assert.equal(named("What is a network | LinkedIn Learning.mp4", lesson), "What is a network.mp4");
  assert.equal(named("What is a network | LinkedIn Learning -  - 2026-11-22 10-11-12_0.mp4", lesson), "What is a network.mp4");
  assert.equal(named("Criminal law | Alexander Street.mp4", link(FILM)), "Criminal law - Alexander Street.mp4");
  assert.equal(named(`${token}.mp4`, link(FILM)), `${token}.mp4`);
  assert.equal(named("|.mp4", link(FILM)), "-.mp4");
  assert.equal(pathForNaming("/m/a b.mkv", lesson), "/m/a b.mkv");
});

test("lesson titles come back from their slugs in sentence case, acronyms restored", () => {
  assert.equal(lessonTitleFromSlug("weighing-the-connections"), "Weighing the connections");
  assert.equal(lessonTitleFromSlug("keep-networking-25201753"), "Keep networking");
  assert.equal(lessonTitleFromSlug("strong-vs-weak-ai"), "Strong vs weak AI");
  assert.equal(lessonTitleFromSlug("ai-mix-2"), "AI mix 2");
  assert.equal(lessonTitleFromSlug(""), "");
});

test("the folder and the steps are the operator's own", () => {
  assert.equal(defaultDownieFolder("/Users/someone"), "/Users/someone/Movies/Downie");
  assert.equal(DOWNIE_GUIDED_STEPS.length, 5);
  assert.ok(DOWNIE_GUIDED_STEPS.some((step) => step.includes("press its +")));
  assert.equal(DOWNIE_GUIDED_STEPS.some((step) => /raycast|arrow/i.test(step)), false);
});
