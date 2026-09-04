#!/usr/bin/env node
// generate.mjs — Sociaily Case Engine, Phase 1
//
// Model note (recorded per dispatch step 5a): the current Anthropic model list,
// checked at build time, also includes claude-sonnet-5, claude-opus-5,
// claude-haiku-4-5, and claude-fable-5-1 in addition to claude-sonnet-4-5.
// The default below is kept at "claude-sonnet-4-5" per the ASSUMED list (item 3)
// and the dispatch block; override it with the MODEL env var (e.g. to run this
// against claude-sonnet-5 instead) rather than editing this default.
//
// Usage:
//   node generate.mjs intake/<file>.json [--dry-run]
//   node generate.mjs --reprocess out/<slug>

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.MODEL || "claude-sonnet-4-5";

const SEVEN_FILES = [
  "00-case-brief.md",
  "01-partner-a-unlocks.md",
  "02-partner-b-unlocks.md",
  "03-pair-bonus.md",
  "04-main-event.md",
  "05-facilitator.md",
  "06-retro-and-artifacts.md",
];

const EXAMPLE_FOLDER_BY_FUNCTION = {
  ops: "acme-ops",
  gtm: "northwind-gtm",
};

function slugify(teamName) {
  return teamName.toLowerCase().replace(/\s+/g, "-");
}

// --- Step 7: post-process a single file's prose lines --------------------
// Replace U+2014 (em dash) with ", " and an en dash (U+2013) used as a dash
// (i.e. surrounded by whitespace, not a bare numeric range like "10-15")
// with ",". Only touches prose lines: skips lines starting with |, -, #, a
// digit followed by a period, and any line containing "http".
function postProcessContent(content) {
  const lines = content.split("\n");
  let replacements = 0;
  const out = lines.map((line) => {
    const trimmed = line.trimStart();
    const isListOrTable = /^[|#-]/.test(trimmed);
    const isOrderedListItem = /^\d+\./.test(trimmed);
    const hasUrl = /http/.test(line);
    if (isListOrTable || isOrderedListItem || hasUrl) return line;

    let newLine = line;

    const emMatches = newLine.match(/—/g);
    if (emMatches) {
      replacements += emMatches.length;
      newLine = newLine.replace(/—/g, ", ");
    }

    const enDashMatches = newLine.match(/\s–\s/g);
    if (enDashMatches) {
      replacements += enDashMatches.length;
      newLine = newLine.replace(/\s–\s/g, ",");
    }

    return newLine;
  });
  return { content: out.join("\n"), replacements };
}

function postProcessDir(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "_prompt.md");
  let total = 0;
  for (const f of files) {
    const p = join(dir, f);
    const original = readFileSync(p, "utf8");
    const { content, replacements } = postProcessContent(original);
    if (replacements > 0) {
      writeFileSync(p, content, "utf8");
    }
    total += replacements;
  }
  console.log(`Post-process: ${total} dash replacement(s) across ${files.length} file(s) in ${dir}`);
  if (total > 0) {
    console.log(
      "NOTE: the prompt's no-em-dash rule (Appendix A, Rules that decide whether the pack is any good, #10) was violated by the model output and has been corrected in place."
    );
  }
  return total;
}

// --- main ------------------------------------------------------------------

async function main() {
  const start = Date.now();
  const args = process.argv.slice(2);

  if (args[0] === "--reprocess") {
    const dir = args[1];
    if (!dir) {
      console.error("Usage: node generate.mjs --reprocess out/<slug>");
      process.exit(1);
    }
    if (!existsSync(dir)) {
      console.error(`No such directory: ${dir}`);
      process.exit(1);
    }
    postProcessDir(dir);
    console.log(`Elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s`);
    return;
  }

  const intakePath = args[0];
  const dryRun = args.includes("--dry-run");

  if (!intakePath) {
    console.error("Usage: node generate.mjs intake/<file>.json [--dry-run]");
    process.exit(1);
  }

  const intakeRaw = readFileSync(intakePath, "utf8");
  const intake = JSON.parse(intakeRaw);
  const slug = slugify(intake.teamName);
  const outDir = join("out", slug);
  mkdirSync(outDir, { recursive: true });

  const system = readFileSync("prompts/case-method.md", "utf8");

  let userMessage = "INTAKE RECORD\n" + JSON.stringify(intake, null, 2);

  const exampleFolderName = EXAMPLE_FOLDER_BY_FUNCTION[intake.function];
  const examplesDir = exampleFolderName ? join("examples", exampleFolderName) : null;

  if (examplesDir && existsSync(examplesDir)) {
    const exampleFiles = readdirSync(examplesDir).sort();
    const exampleContents = exampleFiles
      .map((f) => `## File: ${f}\n\n${readFileSync(join(examplesDir, f), "utf8")}`)
      .join("\n\n");
    userMessage += "\n\nGOLD EXAMPLE\n" + exampleContents;
  } else {
    const note = `\n\n[No gold example: ${examplesDir || "(no example folder mapped for function '" + intake.function + "')"} does not exist yet. Phase 3 adds it.]`;
    userMessage += note;
    console.log(
      `Note: examples/${exampleFolderName || "?"}/ does not exist yet (Phase 3 adds it). Skipping GOLD EXAMPLE section.`
    );
  }

  userMessage +=
    "\n\nProduce the seven files. Separate each with a line that is exactly `=== FILE: <filename> ===`.";

  if (dryRun) {
    const promptPath = join(outDir, "_prompt.md");
    const assembled =
      `# SYSTEM\n\n${system}\n\n---\n\n# USER\n\n${userMessage}\n`;
    writeFileSync(promptPath, assembled, "utf8");
    console.log(`Dry run: wrote assembled prompt to ${promptPath} (${assembled.length} chars). No API call made.`);
    console.log(`Elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s`);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("COULD NOT DO: live calls (ANTHROPIC_API_KEY is not set in .env)");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  console.log(`Calling ${MODEL} for slug "${slug}"...`);

  let fullText = "";
  let stopReason = null;

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    temperature: 0.7,
    system,
    messages: [{ role: "user", content: userMessage }],
  });

  stream.on("text", (chunk) => {
    process.stdout.write(chunk);
    fullText += chunk;
  });

  const finalMessage = await stream.finalMessage();
  stopReason = finalMessage.stop_reason;
  process.stdout.write("\n");
  console.log(`stop_reason: ${stopReason}`);

  // Split on the "=== FILE: <filename> ===" separators.
  const parts = fullText.split(/^=== FILE: (.+?) ===$/m);
  // parts[0] is any preamble before the first separator; then alternating
  // filename, content, filename, content, ...
  const written = [];
  for (let i = 1; i < parts.length; i += 2) {
    const filename = parts[i].trim();
    const content = (parts[i + 1] || "").trim() + "\n";
    const outPath = join(outDir, basename(filename));
    writeFileSync(outPath, content, "utf8");
    written.push(basename(filename));
  }

  if (written.length < 7) {
    console.error(
      `FAILED: expected 7 files, got ${written.length} (${written.join(", ") || "none"}). stop_reason was "${stopReason}". ` +
        `Check whether max_tokens was hit, whether the model changed the separator format, or whether the prompt (with the gold example) is too long.`
    );
    process.exit(1);
  }

  console.log(`Wrote ${written.length} files to ${outDir}: ${written.join(", ")}`);

  // Step 7: post-process every written file.
  postProcessDir(outDir);

  console.log(`Elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("ERROR:", err.message || err);
  process.exit(1);
});
