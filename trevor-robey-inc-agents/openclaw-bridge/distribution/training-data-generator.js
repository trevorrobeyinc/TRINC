"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { extractCitations, deduplicateCitations } = require("../core/citation-extractor.js");
const timeProvider = require("../core/time-provider.js");

/**
 * Training data generator for Outlier.ai and Mindrift.ai.
 *
 * Transforms verified research reports into:
 * - Q&A pairs (Outlier: Biomedical Q&A creation, $25-65/hr)
 * - Evaluation rubrics (Outlier: AI response evaluation, $15-40/hr)
 * - Factuality assessments (Mindrift: factuality assessment, $20-50/hr)
 */

function splitSections(markdown) {
  if (!markdown) return [];
  const parts = markdown.split(/^##\s+/m);
  const sections = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const lines = trimmed.split("\n");
    const title = lines[0].replace(/^#+\s*/, "").trim();
    const body = lines.slice(1).join("\n").trim();
    if (body.length > 30) {
      sections.push({ title, body });
    }
  }
  return sections;
}

function extractFactualClaims(text) {
  const sentences = text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 20);

  const claims = [];
  for (const sentence of sentences) {
    const citations = extractCitations(sentence);
    if (citations.length > 0) {
      claims.push({
        text: sentence.trim(),
        citations: deduplicateCitations(citations)
      });
    }
  }
  return claims;
}

function inferDomain(text) {
  const lower = text.toLowerCase();
  if (/pharmacovigilance|adverse event|safety signal|faers/i.test(lower)) return "pharmacovigilance";
  if (/drug discovery|compound|admet|bioactivity/i.test(lower)) return "drug-discovery";
  if (/target validation|target identification|ppi network/i.test(lower)) return "target-validation";
  if (/clinical trial|nct\d|endpoint/i.test(lower)) return "clinical-trial";
  if (/genomic|variant|pathogenicity|gnomad/i.test(lower)) return "genomics";
  if (/rare disease|orphan drug/i.test(lower)) return "rare-disease";
  return "biomedical";
}

function formatCitationList(citations) {
  return citations.map((c) => `${c.type}:${c.id}`);
}

function generateQuestionFromClaim(claim, sectionTitle) {
  const citTypes = [...new Set(claim.citations.map((c) => c.type))];
  const domain = inferDomain(claim.text);

  if (citTypes.length >= 2) {
    return `Based on current biomedical evidence in the area of ${sectionTitle}, what are the key findings that link the identifiers ${formatCitationList(claim.citations).slice(0, 3).join(", ")}? Provide specific database references in your answer.`;
  }

  if (citTypes.includes("PMID")) {
    return `What does the published literature (specifically referencing ${formatCitationList(claim.citations)[0]}) report regarding ${sectionTitle.toLowerCase()}? Include verifiable identifiers.`;
  }

  if (citTypes.includes("NCT")) {
    return `Describe the clinical trial evidence relevant to ${sectionTitle.toLowerCase()}, including the specific trial registry identifiers. What are the key findings?`;
  }

  return `In the context of ${domain} research on ${sectionTitle.toLowerCase()}, what are the evidence-backed findings? Cite specific database identifiers (PMID, NCT, CID, DrugBank, etc.) in your response.`;
}

function generateQAPairs(reportMarkdown, citationsCsv) {
  const sections = splitSections(reportMarkdown);
  const pairs = [];

  for (const section of sections) {
    const claims = extractFactualClaims(section.body);

    for (let i = 0; i < claims.length; i += 2) {
      const claim = claims[i];
      const nextClaim = claims[i + 1];

      const combinedCitations = deduplicateCitations([
        ...claim.citations,
        ...(nextClaim ? nextClaim.citations : [])
      ]);

      const question = generateQuestionFromClaim(claim, section.title);
      let answer = claim.text;
      if (nextClaim) {
        answer += " " + nextClaim.text;
      }

      const difficulty = combinedCitations.length >= 3 ? "expert" : "graduate";
      const domain = inferDomain(answer);

      pairs.push({
        question,
        answer,
        citations: formatCitationList(combinedCitations),
        difficulty,
        domain
      });
    }
  }

  return pairs;
}

function generateEvaluationRubrics(reportMarkdown, citationsCsv) {
  const sections = splitSections(reportMarkdown);
  const rubrics = [];

  for (const section of sections) {
    const claims = extractFactualClaims(section.body);
    if (claims.length === 0) continue;

    const allCitations = deduplicateCitations(
      claims.flatMap((c) => c.citations)
    );

    if (allCitations.length === 0) continue;

    const keyFacts = claims.slice(0, 3).map((c) => c.text.slice(0, 200));

    const hallucinations = [
      "If response mentions non-existent PMIDs or fabricated identifiers",
      "If response attributes findings to incorrect databases",
      "If response inverts the direction of a reported effect"
    ];

    const commonErrors = [
      `Confusing identifiers from different databases (e.g., using a PMID where a CID is needed)`,
      `Overgeneralizing findings beyond what the cited evidence supports`,
      `Missing key identifiers: ${formatCitationList(allCitations.slice(0, 3)).join(", ")}`
    ];

    rubrics.push({
      prompt: `Provide a comprehensive, evidence-based analysis of ${section.title.toLowerCase()}. Your response must include specific database identifiers for every factual claim.`,
      ideal_response: claims.map((c) => c.text).join(" ").slice(0, 3000),
      rubric: {
        required_identifiers: formatCitationList(allCitations),
        key_facts: keyFacts,
        hallucination_markers: hallucinations
      },
      common_errors: commonErrors
    });
  }

  return rubrics;
}

function degradeClaim(claim) {
  const text = claim.text;
  const citations = claim.citations;

  if (citations.length === 0) return null;

  const degradations = [];

  // Swap a digit in the first identifier
  const firstCit = citations[0];
  const origId = firstCit.id;
  if (/^\d+$/.test(origId) && origId.length >= 4) {
    const pos = Math.floor(origId.length / 2);
    const digit = origId[pos];
    const newDigit = digit === "9" ? "0" : String(Number(digit) + 1);
    const wrongId = origId.slice(0, pos) + newDigit + origId.slice(pos + 1);
    const degradedText = text.replace(origId, wrongId);
    if (degradedText !== text) {
      degradations.push({
        text: degradedText,
        is_factual: false,
        errors: [`Wrong ${firstCit.type}: ${wrongId} should be ${origId}`],
        corrections: [`Correct ${firstCit.type} is ${origId}`]
      });
    }
  }

  // If we couldn't degrade by ID, try swapping compound names
  if (degradations.length === 0) {
    const compounds = ["aspirin", "ibuprofen", "temozolomide", "nivolumab", "pembrolizumab"];
    for (const compound of compounds) {
      if (text.toLowerCase().includes(compound)) {
        const replacement = compound === "nivolumab" ? "pembrolizumab" : "nivolumab";
        const degradedText = text.replace(new RegExp(compound, "gi"), replacement);
        degradations.push({
          text: degradedText,
          is_factual: false,
          errors: [`Incorrect compound: ${replacement} should be ${compound}`],
          corrections: [`Correct compound is ${compound}`]
        });
        break;
      }
    }
  }

  // Fallback: add "not" to alter meaning
  if (degradations.length === 0) {
    const degradedText = text.replace(/\bis\b/, "is not");
    if (degradedText !== text) {
      degradations.push({
        text: degradedText,
        is_factual: false,
        errors: ["Negation of original finding"],
        corrections: ["Remove negation to restore original meaning"]
      });
    }
  }

  return degradations.length > 0 ? degradations[0] : null;
}

function generateFactualityAssessments(reportMarkdown, citationsCsv) {
  const sections = splitSections(reportMarkdown);
  const assessments = [];

  for (const section of sections) {
    const claims = extractFactualClaims(section.body);

    for (const claim of claims) {
      // Correct version
      assessments.push({
        text: claim.text,
        is_factual: true,
        errors: [],
        corrections: []
      });

      // Degraded version
      const degraded = degradeClaim(claim);
      if (degraded) {
        assessments.push(degraded);
      }
    }
  }

  return assessments;
}

function exportAsJsonl(records, outputPath) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const metadataLine = JSON.stringify({
    generator: "openclaw-training-data",
    version: "1.0",
    generated_at: timeProvider.nowIso(),
    record_count: records.length
  });

  const lines = [metadataLine, ...records.map((r) => JSON.stringify(r))];
  fs.writeFileSync(outputPath, lines.join("\n") + "\n", "utf8");
}

module.exports = {
  generateQAPairs,
  generateEvaluationRubrics,
  generateFactualityAssessments,
  exportAsJsonl,
  splitSections,
  extractFactualClaims
};
