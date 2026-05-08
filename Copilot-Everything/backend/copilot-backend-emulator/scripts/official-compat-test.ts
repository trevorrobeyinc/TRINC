import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const baseUrl = process.env.EMULATOR_BASE_URL || "http://127.0.0.1:8789";
const authToken =
  process.env.MIYO_COMPAT_AUTH_TOKEN || process.env.COPILOT_PLUS_LICENSE_KEY || process.env.SELF_HOST_API_KEY || "";
const devVaultPath =
  process.env.MIYO_TEST_VAULT || path.resolve(process.cwd(), "..", "..", "dev-vault");
const relatedNotePath = process.env.MIYO_TEST_NOTE_PATH || "README.md";

const headers: Record<string, string> = {
  "Content-Type": "application/json",
};
if (authToken) {
  headers.Authorization = `Bearer ${authToken}`;
}

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-miyo-compat-"));
const pdfPath = path.join(tempDir, "compat-sample.pdf");
await fs.writeFile(pdfPath, buildSimplePdf("Copilot official plugin Miyo compatibility test."), "binary");

function buildSimplePdf(text: string): string {
  const escapedText = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${escapedText.length + 33} >>\nstream\nBT\n/F1 18 Tf\n36 96 Td\n(${escapedText}) Tj\nET\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

async function callJson(routePath: string, init?: RequestInit): Promise<{
  status: number;
  body: unknown;
}> {
  const response = await fetch(`${baseUrl}${routePath}`, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return {
    status: response.status,
    body,
  };
}

const health = await callJson("/v0/health", {
  headers,
});

const search = await callJson("/v0/search", {
  method: "POST",
  headers,
  body: JSON.stringify({
    query: "official plugin compatibility smoke test",
    vault: devVaultPath,
    limit: 3,
  }),
});

const related = await callJson("/v0/search/related", {
  method: "POST",
  headers,
  body: JSON.stringify({
    file_path: relatedNotePath,
    vault: devVaultPath,
    limit: 3,
  }),
});

const parseDoc = await callJson("/v0/parse-doc", {
  method: "POST",
  headers,
  body: JSON.stringify({
    path: pdfPath,
  }),
});

console.log(
  JSON.stringify(
    {
      baseUrl,
      devVaultPath,
      relatedNotePath,
      tempPdfPath: pdfPath,
      health,
      search,
      related,
      parseDoc,
    },
    null,
    2
  )
);
