# Roadmap and saved-plan verification

GoPlan guides a newcomer through Direction, Courses, Companies, Exchanges and Semesters, then saves one editable plan. There are two AI change prompts per stage and five global prompts after saving. Manual editing and Excel export remain available at zero allowance. The separate course-unavailable AI feature is retired.

## Automated checks

Run `pnpm test` and `pnpm build`. Provider responses are synthetic, so the suite does not spend API credit or modify customer records.

- `verify-roadmap-resilience.mjs`: 28 integrated groups through the real controller, HTTP handlers, authenticated storage, strict provider validation and cloud save/reload. Covers three academic combinations, all allowances, failed/malformed initial requests, non-JSON gateway errors, abandoned Worker receipts, deadlines that abort-unaware transports cannot exceed, late-response races, lost responses and reservations, reload recovery, duplicate clicks, failed global previews, second-specialization rebuilds and manual editing/export at zero AI allowance.
- `verify-target-resilience.mjs`: initial Exchanges accepting an unchanged valid list, bounded repair, provider/budget/output failures and reviewed recovery without fabricated sources. Explicit revisions still fail honestly.
- `verify-opportunity-coverage.mjs`: all eight undergraduate degrees, three distinct shortlists, source-route preservation, profile matching, near-exhausted history and 96 strict synthetic selections. Unaffected lists stay unchanged.
- `verify-dashboard-clarity.mjs`: complete degree names, clear quick questions, explanations on demand, accessible loading, unavailable-feature removal and manual access.
- `verify-manual-workspace.mjs`: 22 post-AI groups across all eight undergraduate degrees, 765 catalogue/requirement selections and 40 validated HTTP saves. Covers all progress statuses including uncoded languages, arbitrary course add/replace/move/remove, retakes, duplicate additions, undo from both panels, semester notes and privacy, empty-plan export/recovery, save/reload, concurrent revision conflicts, preview cancellation and settings changes. No provider calls occur.
- `verify-admin-simplicity.mjs`: all six admin sections, scoped filters/refresh, truthful counts, optional detail, university imports and feedback evidence checks.

The remaining suite checks academic combinations and prerequisites, protected study, credit budgets, authentication, owner permissions, account isolation, concurrent allowances, sync conflicts, feedback consent and Excel generation.

## Browser walkthrough

Use a disposable account and synthetic provider responses. Walk through all five stages, including failed initial Companies/Exchanges responses. Save and reload the plan; check both specializations and the minor are named. Add a Language Center buffer and semester, search the complete AUI course list, add/move/remove a course and undo removal, complete an uncoded French requirement, save a semester note, reload and export Excel at zero AI allowance. Review Overview, Adviser health, Students, Feedback, University access and Data & exports with a synthetic owner session.

## Limits

These checks verify workflow and error handling, not live model quality or provider uptime. Reviewed fallback targets are supported options to explore; current internships, exchange access and credit transfer require confirmation. Source restrictions stay attached to each institution. No test establishes superior advice quality or guarantees that future network/provider failures are impossible.

## Companies/Exchanges interruption recovery

Initial opportunity work has a 45-second server deadline covering discovery, token counting, generation and response bodies. Healthy requests still use live research. If that window or a provider fails, initial stages use profile-ranked reviewed targets with their real sources and restrictions. An unreadable gateway response, disconnected browser request or lost successful result uses the authenticated reviewed-recovery endpoint. The same initial action is settled durably; no guided/global change or second paid generation is used. A late response cannot replace the settled result. Old abandoned initial actions recover on retry, including across deployment hashes. Expired non-opportunity paid receipts become terminal rather than staying busy forever; they do not regain spending credit.

The interruption walkthrough injects a non-JSON 502 and an abandoned running receipt at both Companies and Exchanges, then saves/reloads and finishes the roadmap. It uses an isolated synthetic account and no real provider requests. See `docs/COMPANIES-RECOVERY.md` for the incident analysis and failure matrix.

Recovery retires only the matching owner/action server lease. A legacy orphan lock or a still-running old Worker cannot halt the remaining initial stages: reviewed course choices and local semester construction remain available without spending a guided change. Lease ownership and late cleanup are tested separately.

## Opportunity explanation checks

Each detail contains its website and one short paragraph connecting a real questionnaire phrase, the chosen degree/focus/minor and a concrete fact about the target. Research diagnostics and duplicate explanations are absent. Existing plans render the clearer description without AI calls or rewriting their saved choices. A new AI paragraph is used only with matching academic/questionnaire context and a genuine answer quotation; old or stale paragraphs use reviewed facts and current answers. Critical course exclusions remain concise when relevant.

`verify-opportunity-copy.mjs` covers 353 compatible target/profile combinations across eight degrees, the reported ReKrute/Richmond regressions, fresh/stale model descriptions, changed degree choices, undecided and negative answers, escaped text, safe website selection, route restrictions, saved reload, guided details and zero-allowance controller behavior. Browser QA opens both reported examples from an old synthetic saved plan at zero remaining AI changes and after reload. No paid generation or customer data is used.
