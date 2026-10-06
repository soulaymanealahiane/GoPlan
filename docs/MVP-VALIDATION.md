# MVP planning and opportunity research

GoPlan is a student planning utility. The student supplies semester course offerings, reviews proposed changes and saves a revised plan. The Excel plan carries offering reports and uncertainties for discussion with a human adviser.

## Course-offering workflow

- Open **Course offerings & replanning** in the saved roadmap. Enter offered and unavailable course codes for a semester, using commas or new lines.
- A partial report only blocks courses explicitly reported unavailable. A complete report blocks every unlisted catalogue course for that semester. It must contain the full relevant list, rather than just preferred electives.
- Save reports without changing semesters, or ask the agent for a revised plan. Updating a term replaces its old report; an empty partial report clears stale cancellations.
- The agent receives a deterministic analysis of affected requirements, eligible alternatives, prerequisite dependencies and potential gap fillers. It cannot create academic equivalencies or university offering reports.
- Fixed requirements are postponed. Selectable requirements can use approved alternatives in the same slot. The resulting combination is validated for prerequisites, course and credit limits, overlap, protected completed/current work, capstones and supplied offerings.
- Review replacements, postponed requirements, courses brought forward, graduation impact and remaining uncertainty before applying. Cloud workspaces, backups, snapshots and Excel retain the reports.

The scheduler checks feasible placements and fills available capacity; it does not promise a globally optimal timetable. Student offering reports are not registration confirmations. Future terms without reports remain unknown. Topic, placement and approval requirements stay subject to human review.

## Opportunity research

Live discovery searches complementary topics and opens primary sources, then extracts a larger candidate pool with source receipts. The extraction checks supporting fragments for Moroccan presence and startup classifications, deduplicates names and domains, and distinguishes a publication date from the date a page was checked.

Exchange research enriches existing degree-compatible AUI partner IDs from official institution domains. It cannot create partnerships, waive eligibility or prove current nomination or credit transfer. Incoming-exchange, language, term and subject evidence is exposed with gaps.

Canonical identity checks prevent aliases from filling multiple shortlist positions. Refining one list preserves the other list's order and original reasons, including saved companies found in prior research. Requests for alternatives favor new supported candidates; genuine fit or evidence limits must be explained instead of forcing unrelated choices.

The MVP intentionally uses larger research and reasoning budgets. Successful results may be cached briefly; failed research remains visibly marked and retryable. Model output remains advisory and passes deterministic checks before academic changes can be applied.

## Verification

Run `pnpm test` and `pnpm build`. Focused regressions cover complete/partial offerings, reporting corrections, prerequisite cascades, fixed-course postponement, elective substitution, capstone relocation, protected work, persistence/export, primary-source extraction, canonical deduplication and unaffected-list preservation.

Run `pnpm test:mvp` for the reproducible 168-case BSCSC/BBA cancellation and complete-list omission matrix, plus the final-capstone regression. It uses synthetic catalogue scenarios and makes no model calls.

`pnpm test:mvp:live` is an explicit paid Groq evaluation using synthetic inputs. It requires a server-side `GROQ_API_KEY` and records token counts, latency and public source diversity in ignored `.sites-runtime/mvp-live-report.json`. Add `--courses-only` or `--targets-only` when invoking the script directly to limit the run. No credential, student identity or private notes belong in that report.
