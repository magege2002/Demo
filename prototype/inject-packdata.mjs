// Injects real pack content into the artifact template, replacing the
// __PACKDATA_JSON__ placeholder with valid JSON built from the repo.
// Usage: node inject-packdata.mjs <template.html> <output.html>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "/home/user/Demo";
const [templatePath, outPath] = process.argv.slice(2);
if (!templatePath || !outPath) {
  console.error("Usage: node inject-packdata.mjs <template.html> <output.html>");
  process.exit(1);
}

const FILES = [
  "00-case-brief.md",
  "01-partner-a-unlocks.md",
  "02-partner-b-unlocks.md",
  "03-pair-bonus.md",
  "04-main-event.md",
  "05-facilitator.md",
  "06-retro-and-artifacts.md",
];

function loadPack(exampleDir, intakeFile, label) {
  const files = {};
  for (const f of FILES) {
    files[f] = readFileSync(join(REPO, "examples", exampleDir, f), "utf8");
  }
  const intake = JSON.parse(readFileSync(join(REPO, "intake", intakeFile), "utf8"));
  return { label, intake, files };
}

const data = {
  packs: {
    "acme-ops": loadPack("acme-ops", "acme-ops.json", "Acme RevOps"),
    "northwind-gtm": loadPack("northwind-gtm", "northwind-gtm.json", "Northwind Marketing"),
  },
  caseMethodPrompt: readFileSync(join(REPO, "prompts", "case-method.md"), "utf8"),
  examplesForFunction: { ops: "acme-ops", gtm: "northwind-gtm" },
};

// JSON, with < and > and & escaped so the blob is safe inside a <script> tag
// and can never contain a literal </script>.
const json = JSON.stringify(data)
  .replace(/</g, "\\u003c")
  .replace(/>/g, "\\u003e")
  .replace(/&/g, "\\u0026");

const template = readFileSync(templatePath, "utf8");
if (!template.includes("__PACKDATA_JSON__")) {
  console.error("ERROR: template does not contain the __PACKDATA_JSON__ placeholder");
  process.exit(1);
}
const out = template.replace("__PACKDATA_JSON__", json);
writeFileSync(outPath, out, "utf8");

const kb = (Buffer.byteLength(out, "utf8") / 1024).toFixed(0);
console.log(`Wrote ${outPath} (${kb} KB). Injected packs: ${Object.keys(data.packs).join(", ")}.`);
console.log(`Placeholder replaced: ${!out.includes("__PACKDATA_JSON__")}`);
