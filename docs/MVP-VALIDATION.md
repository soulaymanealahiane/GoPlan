# Roadmap and saved-plan verification

GoPlan guides a newcomer through Direction, Courses, Companies, Exchanges and Semesters, then saves one editable plan. There are two AI change prompts per stage and five global prompts after saving. Manual editing and Excel export remain available at zero allowance. The separate course-unavailable AI feature is retired.

## Automated checks

Run `pnpm test` and `pnpm build`. Provider responses are synthetic, so the suite does not spend API credit or modify customer records.

- `verify-roadmap-resilience.mjs`: 19 integrated groups through the real controller, HTTP handlers, authenticated storage, strict provider validation and cloud save/reload. Covers three academic combinations, all allowances, failed/malformed initial requests, lost responses and reservations, reload recovery, duplicate clicks, failed global previews, second-specialization rebuilds and manual editing/export at zero AI allowance.
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
