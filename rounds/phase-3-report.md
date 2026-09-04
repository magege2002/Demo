# Phase 3 report: the gold packs

## ELAPSED
Sonnet builder slice ~2.5 minutes.

## SHIPPED
- `examples/acme-ops/`, seven files transcribed verbatim from Appendix B (extracted by exact line ranges off the `## File:` markers, not retyped).
- `examples/northwind-gtm/`, seven files transcribed verbatim from Appendix C.
- `intake/harbor-ops.json`, the third, unseen intake (Harbor Support Ops, 5-person support ops, Zendesk/Slack/Google Sheets/Gemini, Sam Okafor), key set mirrored from the acme intake, parses.

## VERIFIED
- `node check.mjs examples/acme-ops` -> `PASS`. `node check.mjs examples/northwind-gtm` -> `PASS`.
- All 14 files non-empty; the six non-brief files each over 600 chars; both briefs land at 540 / 530 as expected for an under-120-word brief.
- No em dashes anywhere; titles confirmed ("# The Monday Number", "# The Sequence Nobody Owns").
- Assembled dry-run prompt with the matching gold example included: 25,002 chars (acme), 24,902 chars (northwind), both under the 40,000-char ceiling, so no need to trim to files 00/01/03/04.
- `Zendesk` present in `intake/harbor-ops.json`.

## PLAN WAS WRONG ABOUT
The only surprise is the 600-char-versus-under-120-words tension on `00-case-brief.md`, surfaced here and fixed in `check.mjs` (see Phase 2 report). The examples themselves needed no changes; they are ground truth.

## COULD NOT DO
Generate the Harbor pack live, run the gate on it first-try, and read its brief and two exhibits by hand for the content-imitation bug class (the model copying the acme numbers into an unrelated pack). All of this needs a key. The encoding of the examples and the third intake, which is the whole point of few-shot, is complete and verified.

## NEEDS MICHAEL (DISCOVERED)
None for the encoding. The live Harbor generation and the required manual read of its brief and exhibits are deferred to the first run with a key.

## RECOMMEND NEXT
With a key: `node generate.mjs intake/harbor-ops.json`, confirm the gate passes first try, then read `out/harbor-support-ops/00-case-brief.md` and `04-main-event.md` next to the acme gold files and list any sentence that could be true of any company. If the Harbor pack borrows acme's numbers (four hours, the mismatch step), add a rule to `prompts/case-method.md` forcing the model to use the Harbor `sopSummary`, `pain`, and `closedLevers` by name.
