# Phase 2 report: the gate

## ELAPSED
Sonnet builder slice ~7 minutes including its own scratch-dir test harness; Opus review and the rule-1 fix ~ a few minutes.

## SHIPPED
- `check.mjs`, all seven dispatch rules: structure, lexicon, dashes, tool fidelity (reads `closedLevers`, not just `stack`), pair mechanic + twist-leak check, case shape, dates. Exits 1 and prints every failure with `file:line`; prints `PASS` and exits 0 when clean.
- `generate` npm script left as `node generate.mjs`; gating is intended to run as a separate `node check.mjs out/<slug>` step (the guide's "add check to the end of generate" is awkward as an npm chain since the slug is only known at run time; the live path in `generate.mjs` can be extended to shell out to the gate once a key exists).

## VERIFIED
- `node check.mjs examples/acme-ops` -> `PASS`, exit 0.
- `node check.mjs examples/northwind-gtm` -> `PASS`, exit 0.
- Deliberate-failure test: a copy of the acme pack with "leaderboard" and "Salesforce" injected into a prose line produced exactly 2 failures, each with `file:line`, exit 1.
- A tool named only via `closedLevers` is correctly not flagged (no false positive).

## PLAN WAS WRONG ABOUT
1. Rule 1 as written ("each over 600 characters") contradicts Appendix A Rule 2 ("the case brief is under 120 words"). The verbatim gold briefs are 540 and 530 characters. Per Phase 3 step 2, the hand-written packs are ground truth, so the check was wrong. Fixed: `00-case-brief.md` gets a smaller floor (300 chars); rule 6 governs its length from the top (under 120 words). The other six keep the 600 floor.
2. "Monday" on the 40-tool list (monday.com) collides with the day name, which appears 30+ times in every pack. Fixed: the tool matcher requires "Monday.com" for that one entry, and matches tools case-sensitively against their listed capitalized form.
3. The dispatch text says 03 must contain "combined"; the gold packs' prose uses "combine". The check accepts both.

## COULD NOT DO
Run the gate on a live-generated `out/` pack. No key. The gate is proven correct against the two gold packs and the mutation tests instead.

## NEEDS MICHAEL (DISCOVERED)
None. This round is code, tests, and dry runs.

## RECOMMEND NEXT
Once a key exists, run the gate on every generated pack. If a real generation ever fails a rule, fix `prompts/case-method.md` or `generate.mjs`, never `check.mjs`, unless the failure is a genuine check bug measured against the gold packs.
