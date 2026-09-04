# Phase 1 report: the thirty minute build

## ELAPSED
Orchestrated build (Opus orchestrator, Sonnet builder). Builder wall clock for the Phase 1 slice: ~2.7 minutes. Full night's orchestration across all four phases ran in parallel.

## SHIPPED
- `package.json` (`"type": "module"`, scripts `generate` / `check` / `demo`), deps `@anthropic-ai/sdk` + `dotenv` installed.
- `.gitignore` (`.env`, `node_modules`, `out/`).
- `prompts/case-method.md`, Appendix A copied verbatim (extracted by exact line range, not retyped), through the Output Contract.
- `intake/schema.md`, all 18 fields, each mapped to a manager-guide question.
- `intake/acme-ops.json`, `intake/northwind-gtm.json`, copied exactly from Appendix B and C, both parse.
- `generate.mjs`, steps 5a to 5f: MODEL env override, slug from teamName, INTAKE RECORD + conditional GOLD EXAMPLE assembly, `--dry-run`, streaming live call with `stop_reason` and loud sub-seven-file failure, prose-only dash post-processor, `--reprocess` flag, elapsed print.

## VERIFIED
- `node generate.mjs intake/acme-ops.json --dry-run` wrote `out/acme-revops/_prompt.md` (10,058 chars without examples, 25,002 chars once examples exist).
- `node generate.mjs intake/northwind-gtm.json --dry-run` wrote `out/northwind-marketing/_prompt.md` (24,902 chars with examples).
- Both intake JSONs parse under `node -e "JSON.parse(...)"`.
- `prompts/case-method.md` starts with "You write scenario packs" and ends with the `06-retro-and-artifacts.md` contract line.

## PLAN WAS WRONG ABOUT
The literal slug rule (teamName lowercased) makes "Acme RevOps" resolve to `out/acme-revops`, but the Phase 1 acceptance greps target `out/acme-ops`, and the examples folder is `examples/acme-ops`. The generated-pack slug and the intake-filename basename do not agree. This is a guide-internal naming inconsistency, not a build error. Resolved in `check.mjs` by resolving the intake from either the folder's filename stem or the teamName-derived slug.

## COULD NOT DO
Live calls. No `ANTHROPIC_API_KEY` is set in this environment, so no pack was generated into `out/` beyond the dry-run `_prompt.md`. The Phase 1 acceptance greps that target generated packs (`grep -l "HubSpot" out/acme-ops/*.md`) cannot run until a key exists. As a proxy, the same greps pass on the hand-written gold pack: HubSpot in 5 of 7 files, Salesforce in 0.

## NEEDS MICHAEL (DISCOVERED)
1. Put your personal Anthropic key in a gitignored `.env` as `ANTHROPIC_API_KEY=...`, then live generation runs unattended.
2. Model default is kept at `claude-sonnet-4-5` per the ASSUMED list. The current model list also includes `claude-sonnet-5`, `claude-opus-5`, `claude-haiku-4-5`, `claude-fable-5-1`. Decide whether to move the default to `claude-sonnet-5` (or set `MODEL` in `.env`).
3. Decide whether the consumer banned-word list applies to manager-facing copy (ASSUMED item 5).

## RECOMMEND NEXT
Add the key, run `node generate.mjs` on all three intakes, run the gate on each, then read the Harbor case brief and its two exhibits by hand for the content-imitation bug class the gate cannot catch.
