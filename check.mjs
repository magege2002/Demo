#!/usr/bin/env node
// check.mjs
// Structural and lexical gate over a generated (or hand written) scenario pack.
//
// Usage:
//   node check.mjs out/<slug>
//   node check.mjs examples/acme-ops
//   node check.mjs examples/northwind-gtm
//
// Run it as `node check.mjs examples/acme-ops` and `node check.mjs examples/northwind-gtm`
// once the examples/ gold packs exist (Phase 3). It is self-contained and does not require
// out/ to exist yet.
//
// Exits 1 and prints every failure (file + line) if any check fails.
// Prints PASS and exits 0 if every check passes.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const REQUIRED_FILES = [
  "00-case-brief.md",
  "01-partner-a-unlocks.md",
  "02-partner-b-unlocks.md",
  "03-pair-bonus.md",
  "04-main-event.md",
  "05-facilitator.md",
  "06-retro-and-artifacts.md",
];

const MIN_CHARS = 600;
// Per-file override. 00-case-brief.md is required by Appendix A Rule 2 to be
// under 120 words ("no exhibit, no constraint, no number beyond what the
// manager would say in the first breath"), so a legitimate gold-standard brief
// lands well under 600 characters (the Appendix B/C briefs are 540 and 530).
// Per Phase 3 step 2, the hand-written packs are ground truth: when the check
// disagrees with them the check is wrong. Rule 6 already governs the brief's
// length from the top (under 120 words), so here we only guard against a
// truncated or empty brief with a smaller floor.
const MIN_CHARS_BY_FILE = {
  "00-case-brief.md": 300,
};

const BANNED_WORDS = [
  "hackathon",
  "buildathon",
  "leaderboard",
  "level",
  "grade",
  "fluency score",
  "LLM",
  "token",
  "hallucination",
];

// 40 common workplace tools the tool-fidelity check looks for.
const KNOWN_TOOLS = [
  "HubSpot", "Salesforce", "Slack", "Teams", "Notion", "Asana", "Jira",
  "Copilot", "ChatGPT", "Claude", "Gemini", "Zapier", "Airtable",
  "Google Sheets", "Excel", "Looker", "Tableau", "Zendesk", "Intercom",
  "Gong", "Outreach", "Apollo", "Clay", "Figma", "Canva", "Trello",
  "Monday", "ClickUp", "Linear", "GitHub", "Confluence", "SharePoint",
  "Power BI", "Snowflake", "dbt", "Segment", "Marketo", "Pardot",
  "Mailchimp", "Calendly",
];

const PROCESS_CRITERIA = [
  "questions raised",
  "assumptions stated",
  "priorities",
  "creativity",
  "logic",
  "poise",
];

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function usageAndExit(msg) {
  console.error(msg);
  console.error("Usage: node check.mjs out/<slug>  (or examples/<slug>)");
  process.exit(1);
}

const packArg = process.argv[2];
if (!packArg) usageAndExit("Missing pack path argument.");

const packDir = packArg.replace(/\/+$/, "");
if (!existsSync(packDir)) {
  usageAndExit(`Pack directory not found: ${packDir}`);
}

const slugFromArg = basename(packDir);

// ---------------------------------------------------------------------------
// Locate the matching intake by slug.
// Slug rule: intake teamName lowercased, spaces -> hyphens. We also accept a
// direct match on the intake JSON's file basename against the pack folder's
// basename, since generate.mjs's slug and the intake filename usually agree
// but are not guaranteed to (e.g. examples/acme-ops vs intake teamName
// "Acme RevOps" -> slug "acme-revops"). We scan intake/*.json and match on
// either the derived teamName slug or the filename stem.
// ---------------------------------------------------------------------------

const failures = [];

function slugify(teamName) {
  return String(teamName).toLowerCase().trim().replace(/\s+/g, "-");
}

const intakeDir = "intake";
let intake = null;
let intakePath = null;

if (existsSync(intakeDir)) {
  const intakeFiles = readdirSync(intakeDir).filter((f) => f.endsWith(".json"));
  for (const f of intakeFiles) {
    const stem = basename(f, ".json");
    if (stem === slugFromArg) {
      intakePath = join(intakeDir, f);
      break;
    }
  }
  if (!intakePath) {
    for (const f of intakeFiles) {
      const full = join(intakeDir, f);
      try {
        const parsed = JSON.parse(readFileSync(full, "utf8"));
        if (parsed.teamName && slugify(parsed.teamName) === slugFromArg) {
          intakePath = full;
          intake = parsed;
          break;
        }
      } catch {
        // ignore unparseable intake files here; reported below if it was the match
      }
    }
  }
  if (intakePath && !intake) {
    try {
      intake = JSON.parse(readFileSync(intakePath, "utf8"));
    } catch (e) {
      failures.push(`${intakePath}: could not parse intake JSON: ${e.message}`);
    }
  }
}

if (!intakePath) {
  failures.push(
    `intake/: no intake JSON found matching slug "${slugFromArg}" (checked filename stems and teamName-derived slugs)`
  );
}

// ---------------------------------------------------------------------------
// 1. Structure: exactly the seven filenames exist, each over 600 characters.
// ---------------------------------------------------------------------------

const present = existsSync(packDir) ? readdirSync(packDir) : [];
const fileContents = {}; // filename -> content string (only for required files that exist)

for (const fname of REQUIRED_FILES) {
  const fpath = join(packDir, fname);
  if (!present.includes(fname)) {
    failures.push(`${fpath}: missing required file`);
    continue;
  }
  const content = readFileSync(fpath, "utf8");
  fileContents[fname] = content;
  const minChars = MIN_CHARS_BY_FILE[fname] ?? MIN_CHARS;
  if (content.length <= minChars) {
    failures.push(
      `${fpath}: only ${content.length} characters, must be over ${minChars}`
    );
  }
}

// Helper: iterate lines of a file with 1-based line numbers.
function lines(fname) {
  const content = fileContents[fname];
  if (content === undefined) return [];
  return content.split("\n");
}

function isListOrTableOrHeadingLine(line) {
  const trimmed = line.replace(/^\s+/, "");
  return (
    trimmed.startsWith("-") ||
    trimmed.startsWith("|") ||
    trimmed.startsWith("#")
  );
}

// ---------------------------------------------------------------------------
// 2. Lexicon: no banned word, case-insensitive, anywhere. Print file + line.
// ---------------------------------------------------------------------------

// Word-boundary match, case-insensitive, for each banned term. Boundaries
// avoid false positives like "upgrade"/"downgrade" tripping on "grade", or
// "tokenize" tripping on "token", while still catching the banned word in
// any inflection-free occurrence (plural "hackathons" still matches since
// the boundary is only at the start/end of the banned term itself... actually
// we anchor both ends so "hackathons" would NOT match "hackathon" with a
// trailing boundary if the boundary requires a non-word char; \b handles
// this correctly since \b matches between "n" and "s" only if one is a word
// char and the other isn't, which is false here, so "hackathons" DOES match
// via \b since \b is a zero-width assertion, not a right-anchor. See test.
const bannedPatterns = BANNED_WORDS.map((word) => ({
  word,
  re: new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
}));

for (const fname of Object.keys(fileContents)) {
  const ls = lines(fname);
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i];
    for (const { word, re } of bannedPatterns) {
      if (re.test(line)) {
        failures.push(
          `${join(packDir, fname)}:${i + 1}: banned word "${word}" found: "${line.trim()}"`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Dashes: no U+2014 anywhere. No " - " used as a dash in PROSE lines only.
//    Skip lines starting with "-", "|", or "#" (list/table/heading lines).
// ---------------------------------------------------------------------------

for (const fname of Object.keys(fileContents)) {
  const ls = lines(fname);
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i];
    if (line.includes("—")) {
      failures.push(
        `${join(packDir, fname)}:${i + 1}: contains em dash (U+2014): "${line.trim()}"`
      );
    }
    if (isListOrTableOrHeadingLine(line)) continue;
    // space-hyphen-space, not part of a hyphenated word (hyphenated words
    // have no surrounding spaces around the hyphen, e.g. "closed-off").
    if (/ - /.test(line)) {
      failures.push(
        `${join(packDir, fname)}:${i + 1}: " - " used as a dash in prose: "${line.trim()}"`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Tool fidelity: any of the 40 tools mentioned in the pack that is not in
//    the intake's stack array AND not named in a closedLevers string is a
//    failure, printed with file and line.
// ---------------------------------------------------------------------------

if (intake) {
  const stackSet = new Set((intake.stack || []).map((s) => s.toLowerCase()));
  const closedLeversText = (intake.closedLevers || []).join(" \n ").toLowerCase();

  // Tool matching is case-sensitive against each tool's listed capitalized
  // form (the dispatch text calls it "every capitalized product name"),
  // which avoids common-English-word collisions: "segment"/"Segment",
  // "confluence"/"Confluence", "excel"/"Excel", "notion"/"Notion" all read
  // very differently lowercase versus capitalized in ordinary case-method
  // prose. "Monday" is a special case: it is on the tool list for
  // monday.com, but "Monday" capitalized is also the ordinary day name and
  // appears constantly in this content ("Monday 14 September", "next
  // Monday"), always capitalized, so case-sensitivity alone does not
  // disambiguate it. For "Monday" only, require the ".com" suffix so a
  // real mention of the tool ("Monday.com") is still caught while the day
  // name is not flagged.
  function toolRegexFor(tool) {
    const escaped = tool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (tool === "Monday") {
      return new RegExp(`\\bMonday\\.com\\b`, "i");
    }
    return new RegExp(`\\b${escaped}\\b`); // case-sensitive on purpose
  }

  for (const fname of Object.keys(fileContents)) {
    const ls = lines(fname);
    for (let i = 0; i < ls.length; i++) {
      const line = ls[i];
      for (const tool of KNOWN_TOOLS) {
        const re = toolRegexFor(tool);
        if (re.test(line)) {
          const toolLower = tool.toLowerCase();
          const inStack = stackSet.has(toolLower);
          const inClosedLevers = closedLeversText.includes(toolLower);
          if (!inStack && !inClosedLevers) {
            failures.push(
              `${join(packDir, fname)}:${i + 1}: tool "${tool}" not in intake stack or closedLevers: "${line.trim()}"`
            );
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Pair mechanic.
//    01 and 02 each contain "Exhibit 1, your half" (or the heading form).
//    03 contains "combined" OR "combine".
//    Fail if "combined"/"combine"/"together" appears in 01 or 02 within 200
//    characters of "Exhibit".
// ---------------------------------------------------------------------------

function containsExhibitHalfPhrase(content) {
  // Accept "Exhibit 1, your half" verbatim, or the heading form
  // "## ... Exhibit 1, your half" / "Exhibit 1 your half" (no comma).
  return /Exhibit\s*1,?\s*your half/i.test(content);
}

for (const fname of ["01-partner-a-unlocks.md", "02-partner-b-unlocks.md"]) {
  const content = fileContents[fname];
  if (content === undefined) continue;
  if (!containsExhibitHalfPhrase(content)) {
    failures.push(
      `${join(packDir, fname)}: missing required phrase "Exhibit 1, your half" (or heading form)`
    );
  }
}

const bonusContent = fileContents["03-pair-bonus.md"];
if (bonusContent !== undefined) {
  // Gold packs (Appendix B/C) use "combine"; accept both "combine" and
  // "combined" here since the guide's own dispatch text says "combined"
  // but the appendices' prose uses "combine" ("choose to combine what you
  // each hold"). Both are accepted to avoid a false positive against the
  // gold packs themselves.
  if (!/\bcombine[d]?\b/i.test(bonusContent)) {
    failures.push(
      `${join(packDir, "03-pair-bonus.md")}: missing required word "combined" or "combine"`
    );
  }
}

// Leak check: "combined"/"combine"/"together" within 200 chars of "Exhibit"
// in 01 or 02.
for (const fname of ["01-partner-a-unlocks.md", "02-partner-b-unlocks.md"]) {
  const content = fileContents[fname];
  if (content === undefined) continue;
  const leakWords = /\b(combined|combine|together)\b/gi;
  let m;
  while ((m = leakWords.exec(content)) !== null) {
    const windowStart = Math.max(0, m.index - 200);
    const windowEnd = Math.min(content.length, m.index + m[0].length + 200);
    const window = content.slice(windowStart, windowEnd);
    if (/Exhibit/i.test(window)) {
      const upTo = content.slice(0, m.index);
      const lineNo = upTo.split("\n").length;
      failures.push(
        `${join(packDir, fname)}:${lineNo}: "${m[0]}" appears within 200 characters of "Exhibit" (twist may have leaked into one half)`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Case shape.
//    00 is under 120 words and names the intake's managerName.
//    04 contains headings/lines for "Injection 1", "Injection 2", and
//    "What would you do".
//    05 contains all six process criteria by name and the phrase
//    "hint budget".
// ---------------------------------------------------------------------------

const briefContent = fileContents["00-case-brief.md"];
if (briefContent !== undefined) {
  const wordCount = briefContent.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount >= 120) {
    failures.push(
      `${join(packDir, "00-case-brief.md")}: ${wordCount} words, must be under 120`
    );
  }
  if (intake && intake.managerName) {
    if (!briefContent.includes(intake.managerName)) {
      failures.push(
        `${join(packDir, "00-case-brief.md")}: does not name managerName "${intake.managerName}"`
      );
    }
  }
}

const mainEventContent = fileContents["04-main-event.md"];
if (mainEventContent !== undefined) {
  for (const needle of ["Injection 1", "Injection 2"]) {
    if (!mainEventContent.includes(needle)) {
      failures.push(
        `${join(packDir, "04-main-event.md")}: missing required heading/line "${needle}"`
      );
    }
  }
  if (!/What would you do/i.test(mainEventContent)) {
    failures.push(
      `${join(packDir, "04-main-event.md")}: missing required heading/line "What would you do"`
    );
  }
}

const facilitatorContent = fileContents["05-facilitator.md"];
if (facilitatorContent !== undefined) {
  const lowerFacilitator = facilitatorContent.toLowerCase();
  for (const criterion of PROCESS_CRITERIA) {
    if (!lowerFacilitator.includes(criterion)) {
      failures.push(
        `${join(packDir, "05-facilitator.md")}: missing process criterion "${criterion}"`
      );
    }
  }
  if (!lowerFacilitator.includes("hint budget")) {
    failures.push(
      `${join(packDir, "05-facilitator.md")}: missing required phrase "hint budget"`
    );
  }
}

// ---------------------------------------------------------------------------
// 7. Dates: every unlock date in 01 and 02 falls between leadUpStart and
//    eventDate (inclusive), and 02's first date is strictly after 01's
//    first date.
// ---------------------------------------------------------------------------

// Parses dates of the form "Weekday D Month" or "D Month" (e.g.
// "Monday 14 September" or "14 September"), tolerant of both, against the
// intake's year (taken from leadUpStart / eventDate, which share a year in
// both sample intakes; if they differ, each date is checked against both
// year-ranges is not attempted, we use leadUpStart's year as the reference
// since the whole lead-up week sits in one calendar year in every intake
// this generator produces).
function parseGoldDate(text, year) {
  const monthPattern = MONTHS.join("|");
  const re = new RegExp(
    `\\b(?:[A-Za-z]+\\s+)?(\\d{1,2})\\s+(${monthPattern})\\b`,
    "i"
  );
  const m = re.exec(text);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthIndex = MONTHS.indexOf(m[2].toLowerCase());
  if (monthIndex === -1) return null;
  return new Date(Date.UTC(year, monthIndex, day));
}

// Extract all "Weekday D Month" / "D Month" headings/lines from a file's
// heading lines (## ...) plus any line, in document order, returning
// {date, lineNo, raw} for each distinct date-bearing line.
function extractDates(content, year) {
  const found = [];
  const ls = content.split("\n");
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i];
    const d = parseGoldDate(line, year);
    if (d) {
      found.push({ date: d, lineNo: i + 1, raw: line.trim() });
    }
  }
  return found;
}

if (intake && intake.leadUpStart && intake.eventDate) {
  const leadUpStart = new Date(intake.leadUpStart + "T00:00:00Z");
  const eventDate = new Date(intake.eventDate + "T00:00:00Z");
  const year = leadUpStart.getUTCFullYear();

  const aContent = fileContents["01-partner-a-unlocks.md"];
  const bContent = fileContents["02-partner-b-unlocks.md"];

  let aDates = [];
  let bDates = [];

  if (aContent !== undefined) {
    aDates = extractDates(aContent, year);
    if (aDates.length === 0) {
      failures.push(
        `${join(packDir, "01-partner-a-unlocks.md")}: no dates found in "Weekday D Month" or "D Month" format`
      );
    }
    for (const { date, lineNo, raw } of aDates) {
      if (date < leadUpStart || date > eventDate) {
        failures.push(
          `${join(packDir, "01-partner-a-unlocks.md")}:${lineNo}: date "${raw}" falls outside leadUpStart (${intake.leadUpStart}) to eventDate (${intake.eventDate})`
        );
      }
    }
  }

  if (bContent !== undefined) {
    bDates = extractDates(bContent, year);
    if (bDates.length === 0) {
      failures.push(
        `${join(packDir, "02-partner-b-unlocks.md")}: no dates found in "Weekday D Month" or "D Month" format`
      );
    }
    for (const { date, lineNo, raw } of bDates) {
      if (date < leadUpStart || date > eventDate) {
        failures.push(
          `${join(packDir, "02-partner-b-unlocks.md")}:${lineNo}: date "${raw}" falls outside leadUpStart (${intake.leadUpStart}) to eventDate (${intake.eventDate})`
        );
      }
    }
  }

  if (aDates.length > 0 && bDates.length > 0) {
    const aFirst = aDates[0].date;
    const bFirst = bDates[0].date;
    if (!(bFirst > aFirst)) {
      failures.push(
        `${join(packDir, "02-partner-b-unlocks.md")}:${bDates[0].lineNo}: first date "${bDates[0].raw}" is not strictly after ${join(
          packDir,
          "01-partner-a-unlocks.md"
        )}'s first date "${aDates[0].raw}"`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

if (failures.length > 0) {
  for (const f of failures) console.log(f);
  console.log(`\n${failures.length} failure(s).`);
  process.exit(1);
} else {
  console.log("PASS");
  process.exit(0);
}
