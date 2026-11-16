"use strict";

// The attribution check (2026-11-04): does the author / year a report writes beside a cited DOI or
// PMID match the registry record? Fixtures are modelled on run #7's reference table
// (workflow-e5947dccdce0e06fde1884b5, report.md:143-150), where "Chio et al." and "Paganoni et al."
// were credited with papers by Feldman et al. and Brown & Al-Chalabi, and on every false-alarm probe
// from the adversarial review of the same day (each pinned below so it cannot come back).

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const A = require("../../openclaw-bridge/core/citation-attribution.js");

const FELDMAN_DOI = "10.1016/s0140-6736(22)01272-7";
const BROWN_DOI = "10.1056/nejmra1603471";
const HARDIMAN_DOI = "10.1038/nrdp.2017.71";
const FELDMAN = { authors: ["Feldman", "Goutman", "Petri", "Mazzini", "Savelieff", "Shaw", "Sobue"], years: [2022] };
const BROWN = { authors: ["Brown", "Al-Chalabi"], years: [2017] };
const HARDIMAN = { authors: ["Hardiman", "Al-Chalabi", "Chio"], years: [2017] };

const TABLE = [
  "| Author / Source | Year | Identifier | Key Finding |",
  "|---|---|---|---|",
  `| Hardiman et al. / Nat Rev Dis Primers | 2017 | doi: ${HARDIMAN_DOI} | ALSFRS-R and survival as primary endpoints |`,
  `| Chio et al. / Lancet | 2022 | doi: ${FELDMAN_DOI} | ALSFRS-R slope + survival |`,
  `| Paganoni et al. / NEJM | 2017 | doi: ${BROWN_DOI} | ALSFRS-R-based endpoints standard |`,
  "| Rissanen et al. / Ann Neurol | 2026 | PMID: 42937037; doi: 10.1002/ana.78394 | GMM models |",
  "| Continuum / PMID | 2026 | PMID: 42825562 | management |"
].join("\n");

const cites = (...pairs) => pairs.map(([type, id]) => ({ type, id }));
const key = (type, id) => `${type}:${String(id).toUpperCase()}`;
function only(text, type, id) {
  return A.findWrittenAttributions(text, cites([type, id])).get(key(type, id));
}

describe("citation-attribution — finding the attribution written beside an identifier", () => {
  it("reads one author per table row, with the year from the year-only cell, never from inside the DOI", () => {
    const found = A.findWrittenAttributions(TABLE, cites(["DOI", HARDIMAN_DOI], ["DOI", FELDMAN_DOI], ["DOI", BROWN_DOI]));
    const h = found.get(key("DOI", HARDIMAN_DOI)).checkable[0];
    assert.equal(h.name, "Hardiman");
    assert.equal(h.year, 2017);
    assert.equal(found.get(key("DOI", FELDMAN_DOI)).checkable[0].name, "Chio");
    assert.equal(found.get(key("DOI", BROWN_DOI)).checkable[0].name, "Paganoni");
  });

  it("checks a PMID + DOI pair for one paper, but skips a line naming no author", () => {
    const found = A.findWrittenAttributions(TABLE, cites(["PMID", "42937037"], ["DOI", "10.1002/ana.78394"], ["PMID", "42825562"]));
    assert.equal(found.get("PMID:42937037").checkable[0].name, "Rissanen");
    assert.equal(found.get("DOI:10.1002/ANA.78394").checkable[0].name, "Rissanen");
    assert.equal(found.get("PMID:42825562").checkable.length, 0);
    assert.equal(found.get("PMID:42825562").skipped[0].reason, "no_author_named");
  });

  it("skips lines citing two works or naming two authors", () => {
    const text = [
      `Smith et al. (doi: ${FELDMAN_DOI}) and later work (doi: ${BROWN_DOI}).`,
      "As Jones et al. argued against Smith et al., the pooled data (PMID: 12345678) …"
    ].join("\n");
    const found = A.findWrittenAttributions(text, cites(["DOI", FELDMAN_DOI], ["DOI", BROWN_DOI], ["PMID", "12345678"]));
    assert.equal(found.get(key("DOI", FELDMAN_DOI)).skipped[0].reason, "several_works_on_line");
    assert.equal(found.get("PMID:12345678").skipped[0].reason, "several_authors_named");
  });

  it("counts every work on the line, verified or not, and pairs a DOI with a PMID only when they sit together", () => {
    // The second work is not in the citation list being checked (e.g. its PMID came back UNCHECKED).
    const unverified = `Smith et al. (doi: ${FELDMAN_DOI}) and a cohort study (PMID: 33333333).`;
    assert.equal(only(unverified, "DOI", FELDMAN_DOI).skipped[0].reason, "several_works_on_line");
    const apart = `Smith et al. (PMID: 33333333) describe the cohort design in detail, the eligibility criteria, the follow-up schedule, and the statistical plan; a separate paper (doi: ${FELDMAN_DOI}) reports the long-term outcomes.`;
    assert.equal(only(apart, "DOI", FELDMAN_DOI).skipped[0].reason, "several_works_on_line");
  });

  it("does not bind a name to an identifier several sentences away", () => {
    const para = `Smith et al. first described the decline in function over time. ${"The pattern held across every subgroup that was examined in the trial. ".repeat(4)}A later review (doi: ${FELDMAN_DOI}) summarised it.`;
    assert.equal(only(para, "DOI", FELDMAN_DOI).skipped[0].reason, "author_not_near_identifier");
  });

  it("reads Vancouver initials and year-anchored pairs", () => {
    const text = [
      `Feldman EL et al. Amyotrophic lateral sclerosis. Lancet. 2022. doi: ${FELDMAN_DOI}`,
      `Brown RH & Al-Chalabi A (2017). doi: ${BROWN_DOI}`,
      "As Brown and Al-Chalabi (2017) review (PMID: 28700839).",
      "| Brown & Al-Chalabi / NEJM | 2017 | PMID: 28700840 |"
    ].join("\n");
    const found = A.findWrittenAttributions(text, cites(["DOI", FELDMAN_DOI], ["DOI", BROWN_DOI], ["PMID", "28700839"], ["PMID", "28700840"]));
    assert.equal(found.get(key("DOI", FELDMAN_DOI)).checkable[0].name, "Feldman", "'EL' is initials, not the surname");
    assert.equal(found.get(key("DOI", BROWN_DOI)).checkable[0].name, "Brown", "'RH' is initials, not the surname");
    assert.equal(found.get(key("DOI", BROWN_DOI)).checkable[0].year, 2017);
    assert.equal(found.get("PMID:28700839").checkable[0].name, "Brown");
    assert.equal(found.get("PMID:28700840").checkable[0].name, "Brown", "the table's 'Author / Journal' slash anchors an ampersand pair");
  });

  it("never reads companies, journals, regimens, body sites, regulators or regions as author pairs", () => {
    const probes = [
      `| Merck Sharp & Dohme (large pharma) | Phase 3 | doi: ${FELDMAN_DOI} |`,
      `Durvalumab with Pemetrexed & Carboplatin (PC) improved PFS (doi: ${FELDMAN_DOI}).`,
      `Gemcitabine & Cisplatin, the standard doublet (doi: ${FELDMAN_DOI}).`,
      `Safety & Efficacy (doi: ${FELDMAN_DOI}).`,
      `Head & Neck, Lung (doi: ${FELDMAN_DOI}).`,
      `Published in Muscle & Nerve, 2026 (doi: ${FELDMAN_DOI}).`,
      `See Alzheimer's & Dementia (2018) (doi: ${FELDMAN_DOI}).`,
      `Journal of Neurology, Neurosurgery & Psychiatry (2019) (doi: ${FELDMAN_DOI}).`,
      `Pfizer & BioNTech (2020) (doi: ${FELDMAN_DOI}).`,
      `EULAR & ACR (2010) criteria (doi: ${FELDMAN_DOI}).`,
      `NCCN & ESMO, 2023 (doi: ${FELDMAN_DOI}).`,
      `Approved in Japan and Korea (2015) (doi: ${FELDMAN_DOI}).`,
      `Health Canada and EMA, 2019 (doi: ${FELDMAN_DOI}).`,
      `A 2026 review in *Tissue & Cell* (doi: ${FELDMAN_DOI}) identifies ferroptosis.`,
      `Johnson & Johnson sponsored it (doi: ${FELDMAN_DOI}).`,
      `Allocation and Masking were reported (doi: ${FELDMAN_DOI}).`
    ];
    for (const line of probes) {
      const r = only(line, "DOI", FELDMAN_DOI);
      assert.equal(r.checkable.length, 0, `read an author out of: ${line} -> ${JSON.stringify(r.checkable)}`);
    }
  });

  it("takes the year written next to the name, not any year on the line", () => {
    const r = only(`Pascual Figal et al. comment on the 2021 ESC heart-failure guideline (doi: ${FELDMAN_DOI}).`, "DOI", FELDMAN_DOI);
    assert.equal(r.checkable[0].year, null, "2021 belongs to the guideline, not the citation");
    assert.equal(only(`Mazzini et al. (2026; doi: ${FELDMAN_DOI}) applied the 2015 criteria.`, "DOI", FELDMAN_DOI).checkable[0].year, 2026);
    assert.equal(only(`Smith et al., 2017a (doi: ${FELDMAN_DOI}).`, "DOI", FELDMAN_DOI).checkable[0].year, 2017);
  });

  it("ignores the year inside a wiki-linked DOI target", () => {
    const line = "Pascual Figal et al. comment on the guideline (doi: [[DOI-10.1016_j.rec.2021.11.023|doi: 10.1016/j.rec.2021.11.023]]).";
    const r = only(line, "DOI", "10.1016/j.rec.2021.11.023");
    assert.equal(r.checkable[0].name, "Figal");
    assert.equal(r.checkable[0].year, null);
  });

  it("reads the Vancouver list the Authors line shows the model, taking its FIRST surname", () => {
    const pmidLine = "| Calvo A, Moglia C, Canosa A, Manera U, Zucchi E et al. / Ann Neurol | 2026 | PMID: 42937037 | x |";
    const r = only(pmidLine, "PMID", "42937037").checkable[0];
    assert.equal(r.name, "Calvo", "the lead author, not the last name before 'et al.'");
    assert.equal(r.year, 2026);
    assert.equal(only("| Benatar M, Wuu J, Turner MR, Macklin EA / Brain | 2026 | PMID: 42736600 |", "PMID", "42736600").checkable[0].name, "Benatar");
    const prose = only("As Calvo A, Moglia C, et al. (2026; PMID: 42937037) showed, decline is non-linear.", "PMID", "42937037").checkable[0];
    assert.equal(prose.name, "Calvo");
    assert.equal(prose.year, 2026, "the year after ', et al.' is the citation's");
    assert.equal(only("Calvo A *et al.* (2026; PMID: 42937037).", "PMID", "42937037").checkable[0].name, "Calvo", "italic et al.");
  });

  it("never reads Roman-numeral or lettered labels, or lists without initials, as a Vancouver author list", () => {
    for (const line of [
      "Type II, Type III and Grade IV events (PMID: 42937037).",
      "Stage IV, Stage III disease (PMID: 42937037).",
      "Approved in Japan, Korea, China (PMID: 42937037)."
    ]) {
      assert.equal(only(line, "PMID", "42937037").checkable.length, 0, line);
    }
  });

  it("matches identifiers exactly: no DOI prefix of a longer DOI, no PMID inside a PMCID or a longer number", () => {
    assert.equal(only("Smith et al. (doi: 10.1002/14651858.CD000001.pub2).", "DOI", "10.1002/14651858.CD000001").checkable.length, 0);
    assert.equal(only("Smith et al. (PMCID: PMC28700839).", "PMID", "28700839").checkable.length, 0);
    assert.equal(only("Smith et al. (PMID: 128700839)", "PMID", "28700839").checkable.length, 0);
    assert.equal(only(`Smith et al. (doi: ${FELDMAN_DOI}).`, "DOI", FELDMAN_DOI).checkable.length, 1, "a sentence-final full stop is not part of the DOI");
  });
});

describe("citation-attribution — comparing with the registry record", () => {
  it("flags a name that is not on the paper at all (run #7's defects)", () => {
    assert.equal(A.compareAttribution({ name: "Chio", year: 2022 }, FELDMAN).status, "author_mismatch");
    assert.equal(A.compareAttribution({ name: "Paganoni", year: 2017 }, BROWN).status, "author_mismatch");
  });

  it("accepts any author on the record, diacritics, transliterations, hyphens, particles and compound surnames", () => {
    assert.equal(A.compareAttribution({ name: "Mazzini", year: 2022 }, FELDMAN).status, "match", "not the first author, but on the paper");
    assert.equal(A.compareAttribution({ name: "Chiò", year: 2017 }, HARDIMAN).status, "match");
    assert.equal(A.compareAttribution({ name: "Al-Chalabi", year: 2017 }, BROWN).status, "match");
    assert.equal(A.compareAttribution({ name: "Berg", year: null }, { authors: ["van den Berg"], years: [2019] }).status, "match");
    assert.equal(A.compareAttribution({ name: "Van Es", year: 2017 }, { authors: ["van Es"], years: [2017] }).status, "match");
    assert.equal(A.compareAttribution({ name: "Es", year: 2017 }, { authors: ["van Es"], years: [2017] }).status, "match");
    assert.equal(A.compareAttribution({ name: "Pascual", year: null }, { authors: ["Pascual Figal"], years: [2022] }).status, "match");
    assert.equal(A.compareAttribution({ name: "Figal", year: null }, { authors: ["Pascual Figal"], years: [2022] }).status, "match");
    assert.equal(A.compareAttribution({ name: "Sorensen", year: null }, { authors: ["Sørensen"], years: [2020] }).status, "match");
  });

  it("flags a wrong year only when one is written, against any of the record's years", () => {
    assert.equal(A.compareAttribution({ name: "Feldman", year: 2019 }, FELDMAN).status, "year_mismatch");
    assert.equal(A.compareAttribution({ name: "Feldman", year: null }, FELDMAN).status, "match");
    assert.equal(A.compareAttribution({ name: "Feldman", year: 2021 }, { authors: ["Feldman"], years: [2022, 2021] }).status, "match", "online-first year counts");
  });

  it("never flags a record with no personal or no Latin-script author", () => {
    assert.equal(A.compareAttribution({ name: "Anyone", year: 2020 }, { authors: [], years: [2020] }).reason, "registry_has_no_authors");
    assert.equal(A.compareAttribution({ name: "Wang", year: 2020 }, { authors: ["王"], years: [2020] }).reason, "registry_names_not_latin");
  });

  it("labels the registry attribution the way a reader writes it, with third-party text sanitised", () => {
    assert.equal(A.registryLabel(FELDMAN), "Feldman et al., 2022");
    assert.equal(A.registryLabel(BROWN), "Brown & Al-Chalabi, 2017");
    assert.equal(A.registryLabel({ authors: ["Solo"], years: [2020, 2019] }), "Solo, 2019");
    assert.equal(A.registryLabel({ authors: ["Evil] |<x>\nName"], years: [2020] }), "Evil x Name, 2020");
    assert.equal(A.registryLabel({ authors: [], years: [] }), "unknown author");
  });

  it("parses Crossref and NCBI records, dropping suffixes and collective-only author lists", () => {
    assert.deepEqual(A.bibFromCrossref({
      author: [{ family: "Feldman", given: "Eva L." }, { name: "ALS Study Group" }],
      issued: { "date-parts": [[2022, 8, 6]] },
      "published-online": { "date-parts": [[2022, 6, 29]] }
    }), { authors: ["Feldman", "ALS Study Group"], years: [2022] });
    assert.deepEqual(A.bibFromNcbiDocsum({
      authors: [{ name: "Brown RH", authtype: "Author" }, { name: "Al-Chalabi A", authtype: "Author" }, { name: "van den Berg LH" }],
      pubdate: "2017 Jul 13",
      epubdate: ""
    }), { authors: ["Brown", "Al-Chalabi", "van den Berg"], years: [2017] });
    assert.equal(A.surnameFromNcbi("Jack CR Jr"), "Jack");
    assert.equal(A.surnameFromNcbi("ALS Study Group"), "ALS Study Group", "a collective name has no initials to drop");
    assert.deepEqual(A.bibFromNcbiDocsum({
      authors: [{ name: "Writing Group", authtype: "CollectiveName" }, { name: "Edaravone (MCI-186) ALS 19 Study Group", authtype: "CollectiveName" }],
      pubdate: "2017 Jul"
    }).authors, [], "a record listing only collective names has no personal author to compare");
    assert.deepEqual(A.bibFromNcbiDocsum({ authors: [{ name: "Smith J" }], pubdate: "2016 Dec-2017 Jan" }).years, [2016, 2017]);
  });
});

describe("citation-attribution — withholding prior-run bylines", () => {
  it("replaces every byline form and leaves other prose alone", () => {
    const s = A.redactBylines("Chio et al. found X; Brown & Al-Chalabi (2017) agreed; Calvo A, Moglia C reported Y. Phase 3 trials continue.");
    assert.doesNotMatch(s, /Chio|Brown|Al-Chalabi|Calvo|Moglia/);
    assert.equal(s.split("<prior-run author withheld>").length - 1, 3);
    assert.match(s, /Phase 3 trials continue\./);
  });
});

describe("citation-attribution — marking the shipped text", () => {
  const MISMATCH = {
    id: FELDMAN_DOI,
    type: "DOI",
    status: "author_mismatch",
    written: { name: "Chio", year: 2022 },
    registry_label: "Feldman et al., 2022",
    registry_full: FELDMAN
  };

  it("puts the mark right after the identifier on the mismatched line only, and only once", () => {
    const marked = A.annotateAttributionText(TABLE, [MISMATCH]);
    assert.ok(marked.includes(`doi: ${FELDMAN_DOI} [ATTRIBUTION MISMATCH: registry lists Feldman et al., 2022] |`));
    assert.equal(marked.split("[ATTRIBUTION MISMATCH").length - 1, 1, "only the Chio row is marked");
    assert.equal(A.annotateAttributionText(marked, [MISMATCH]), marked, "idempotent");
  });

  it("re-checks every line: a correct attribution of the same identifier is never marked", () => {
    const text = [
      `Feldman et al. (doi: ${FELDMAN_DOI}) reviewed the field.`,
      `Mazzini et al. (2022; doi: ${FELDMAN_DOI}) — also on the paper.`,
      `Smith et al. and later work (doi: ${FELDMAN_DOI}; doi: ${BROWN_DOI}) — two works, not checkable.`
    ].join("\n");
    assert.equal(A.annotateAttributionText(text, [MISMATCH]), text);
  });

  it("never breaks a wiki-link, a markdown link or a URL: the mark goes after the whole construct", () => {
    const pmidMismatch = { id: "42937037", type: "PMID", registry_label: "Calvo et al., 2026", registry_full: { authors: ["Calvo", "Moglia"], years: [2026] } };
    const wiki = A.annotateAttributionText("Rissanen et al. (2026; [[PMID-42937037|PMID: 42937037]]) modelled decline.", [pmidMismatch]);
    assert.ok(wiki.includes("[[PMID-42937037|PMID: 42937037]] [ATTRIBUTION MISMATCH: registry lists Calvo et al., 2026]"), wiki);
    const md = A.annotateAttributionText("Rissanen et al. (2026; [PMID 42937037](https://pubmed.ncbi.nlm.nih.gov/42937037/)) modelled decline.", [pmidMismatch]);
    assert.ok(md.includes("(https://pubmed.ncbi.nlm.nih.gov/42937037/) [ATTRIBUTION MISMATCH"), md);
    const url = A.annotateAttributionText("Rissanen et al. (2026) https://pubmed.ncbi.nlm.nih.gov/42937037/ modelled decline.", [pmidMismatch]);
    assert.ok(url.includes("https://pubmed.ncbi.nlm.nih.gov/42937037/ [ATTRIBUTION MISMATCH"), url);
  });

  // T2-19 (2026-11-16), review marks:5: an [UNVERIFIED] mark between the author and the identifier
  // used to push the author past the 200-character window on the marked line, so the manifest flagged
  // the work while its line carried no inline mark.
  it("measures the author's distance without the engine's marks, so the detector and the marker agree", () => {
    const filler = "and the cohort was then followed for several years while the outcomes were recorded ".repeat(3).slice(0, 195);
    const untraced = `In the extension, PMID: 31234567${filler}Smith et al. (2019) reported the primary outcome.`;
    const marked = untraced.replace("PMID: 31234567", "PMID: 31234567 [UNVERIFIED]");
    assert.ok(marked.indexOf("Smith") - (marked.indexOf("31234567") + 8) > 200, "the mark pushes the raw distance past the window");
    const cite = [{ type: "PMID", id: "31234567" }];
    const before = A.findWrittenAttributions(untraced, cite).get("PMID:31234567");
    const after = A.findWrittenAttributions(marked, cite).get("PMID:31234567");
    assert.deepEqual(before.checkable.map((c) => c.name), ["Smith"], "the detector, on the report text");
    assert.deepEqual(after.checkable.map((c) => c.name), ["Smith"], "the same verdict on the marked section line");
    const jones = { id: "31234567", type: "PMID", registry_label: "Jones et al., 2019", registry_full: { authors: ["Jones", "Patel"], years: [2019] } };
    assert.equal(A.compareAttribution(before.checkable[0], jones.registry_full).status, "author_mismatch", "flagged");
    const out = A.annotateAttributionText(marked, [jones]);
    // The attribution mark goes right after the identifier, ahead of the gate's mark: the order the
    // gate's own re-read accepts (citation-gate.js ALREADY_MARKED), so the mention still counts as marked.
    assert.ok(out.includes("PMID: 31234567 [ATTRIBUTION MISMATCH: registry lists Jones et al., 2019] [UNVERIFIED]"), out);
    assert.equal(A.annotateAttributionText(out, [jones]), out, "a second pass changes nothing");
    const { countUnmarkedUntraced } = require("../../openclaw-bridge/core/citation-gate.js");
    assert.equal(countUnmarkedUntraced(untraced, new Set(["PMID:31234567"])), 1, "control: the unmarked line counts as unmarked");
    assert.equal(countUnmarkedUntraced(out, new Set(["PMID:31234567"])), 0, "the [UNVERIFIED] mark still reads as placed");
  });

  it("never reads a name inside the engine's own marks", () => {
    const line = "PMID: 31234567 [ATTRIBUTION MISMATCH: registry lists Feldman et al., 2022] was cited.";
    const r = A.findWrittenAttributions(line, [{ type: "PMID", id: "31234567" }]).get("PMID:31234567");
    assert.deepEqual(r.checkable, []);
    assert.equal(r.skipped[0].reason, "no_author_named");
  });

  it("rewrites section files in place, counts marked lines, and survives an unreadable one", () => {
    const files = { "/a.md": TABLE, "/b.md": "nothing cited here" };
    const marked = A.annotateSubtaskAttributions(
      [{ output_path: "/a.md" }, { output_path: "/b.md" }, { output_path: "/missing.md" }, {}],
      [MISMATCH],
      {
        readFile: (p) => { if (!(p in files)) throw new Error("ENOENT"); return files[p]; },
        writeFile: (p, t) => { files[p] = t; }
      }
    );
    assert.equal(marked, 1);
    assert.ok(files["/a.md"].includes("[ATTRIBUTION MISMATCH: registry lists Feldman et al., 2022]"));
    assert.equal(files["/b.md"], "nothing cited here");
  });
});
