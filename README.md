# GoPlan

**An AI-assisted academic roadmap planner with a deterministic scheduling engine.**

GoPlan helps students turn their interests into an editable degree plan: academic direction, minor and elective choices, internship and exchange targets, and semester-by-semester progress. It is an independent student project, not an official AUI registration or advising system.

[Public website](https://planwithgoplan.com) · [AUI demo](https://planwithgoplan.com/demo) · [Architecture](docs/ARCHITECTURE.md) · [Development](CONTRIBUTING.md) · [Security](SECURITY.md)

## Application features

- Separate website (`/`) and AUI planner (`/demo`) routes with shared styles and SVG branding.
- Newcomer onboarding with three quick-choice cards, optional elaboration and five guided stages: Direction, Courses, Companies, Exchanges and Semesters.
- One saved plan per account with manual editing and Excel export. Course groups identify general education, common and major core, specialization, minor and electives, with links to actual semester placement.
- Applicable curriculum program sheets take priority over conflicting catalog facts; concise course details use the same resolved rules as scheduling.
- Saved-plan controls for manual degree changes, any catalogue course addition/removal/replacement, language requirement completion, semester moves, retakes and semester notes. Returning users resume their dashboard without repeating onboarding.
- A cross-panel adviser command executes requested changes as a reviewable plan preview; completed study and scheduling constraints remain protected.
- University-scoped email roster imports, hashed roster entries, access checks during authentication and eligibility rechecks on authenticated requests.
- Private roster and inquiry administration. Contact submissions are stored for up to 180 days with validation, origin checks and rate limits.

Explanations open on demand. The saved dashboard names both selected specializations and the minor. Manual editing and Excel export remain available after AI changes are exhausted.

See [university access configuration](docs/UNIVERSITY_ACCESS.md) for roster modes, imports and deployment checks.

## Engineering highlights

- **Ranked student preferences:** eight expanded question sets cover technical, business, financial, social, international and creative interests. Students reorder selections; validated priorities persist across devices and influence academic advice, course suggestions, company size preferences and opportunity matching. Free-text answers and older workspaces remain supported.

- **Constrained AI recommendations:** server-side OpenAI Responses API calls produce structured proposals that are validated against reviewed program data before they can change a plan.
- **Deterministic academic scheduling:** prerequisite and corequisite checks, credit limits, independent regular/summer loads, minor requirements and preserved completed courses.
- **Saved manual degree plan:** add or remove courses from the available AUI catalogue, move them between semesters, record progress and keep semester notes without AI calls. Prerequisite checks protect course additions, replacements and moves; a compact degree check lists missing and extra courses. Adding an existing course moves it without duplicating it. Global AI prompts create a preview; graduation delays are shown before saving.
- **Evidence-aware research:** profile-based ranking across 92 reviewed Moroccan internship targets and 38 institutions from the supplied AUI exchange list, plus bounded web discovery. Company revisions explore unseen targets; exchange cards show their recorded program type; current openings and exchange access still require confirmation.
- **Bounded one-time service:** five guided stages, two structural AI prompts per stage and five global prompts after saving. Atomic server-side counters and persistent response receipts enforce the allowance across devices and avoid duplicate paid work.
- **Private cloud workspaces:** per-account ownership checks, optimistic revision control, recovery of interrupted saves and deliberate resolution of conflicting edits.
- **Independent email authentication:** Supabase verifies email during account creation and recovery, and authenticates email/password sign-ins; GoPlan issues revocable, hashed sessions in HttpOnly cookies. Admin access uses a server-configured email allowlist.
- **Human-reviewed feedback:** optional mistake reports, receipt-based withdrawal, expiry, and consent-gated corrections. Feedback does not automatically retrain the underlying model.
- **Operational visibility:** private usage aggregates, adviser reliability, registered profiles and feedback review. Student answers and grades are excluded from aggregate analytics.
- **Excel output:** a generated workbook retains the semester-block layout of the planning template.

The proposed university offer is one payment of US$12 per student for one roadmap and its included AI prompts. The financial basis is a US$10 API allowance budget plus 20% markup, excluding hosting, support and other business costs. The public demo does not collect payments.

## Stack

Vanilla JavaScript ES modules and responsive HTML/CSS; Node.js for development; a Cloudflare Workers-compatible production bundle; SQLite/D1 with Drizzle migrations; Supabase Auth for verified email and password authentication; OpenAI GPT-6.1 Sol for advice and GPT-6 Luna for focused live web research. Production email delivery requires a configured SMTP service.

OpenAI is the inference provider. GPT-6.1 Sol handles academic advice and feedback, using medium reasoning for academic choices and low reasoning for short answers, routing and target selection. GPT-6 Luna performs focused search and strict evidence extraction. One request-wide 180-second deadline and a $0.25 conservative spending guard cover discovery, advice and repairs; browser requests stop at 195 seconds. Actual input tokens are counted before generation; target ranking uses the standard tier to leave room for research and response validation. Completed search receipts and primary pages support extracted findings. Academic validators remain authoritative. The UI shows concise recommendations and clickable sources; search transcripts and page bodies stay on the server.

## Run locally

Requirements: Node.js 22.13+ (24 LTS recommended) and pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm start
```

Open `http://127.0.0.1:4317`. Academic planning data and offline tests do not need provider credentials. Live AI and email sign-in require the corresponding environment settings; provider failures never produce fabricated model output. Initial course and pace requests can recover using deterministic degree rules, and initial opportunities can recover from the reviewed eligible pool. Never commit `.env`.

```sh
pnpm test
pnpm build
```

Tests cover degree/minor combinations, prerequisite ordering, independent course loads, AI schema validation, progress preservation, feedback consent, account isolation, CSRF checks, session revocation and sync conflicts. The 44-script suite includes 28 integrated roadmap resilience groups, 96 opportunity-selection checks and 22 post-AI workspace groups (765 catalogue/requirement selections and 40 validated HTTP saves). Provider calls are fixtures, not live model evaluations. See [verification](docs/MVP-VALIDATION.md). No unmeasured accuracy or performance claim is implied.

## Repository map

| Path | Responsibility |
| --- | --- |
| `dist/*.js`, `dist/*.html`, `dist/*.css` | Authored frontend source; **do not delete `dist/`** |
| `server/` | API, AI orchestration, authentication, feedback and analytics |
| `admin/` | Private operations interface |
| `data/guidance/` | Curated opportunity and program records |
| `db/`, `drizzle/` | Schema and versioned migrations |
| `scripts/` | Build, data preparation and operator tooling |
| `verify-*.mjs`, `tests/` | Offline regression suites and fixtures |
| `docs/` | Architecture, deployment, data provenance, access configuration and validation |

`dist/server/` is generated output. The name `dist` for authored UI files is a legacy convention, documented here to prevent accidental cleanup.

## Scope and limitations

GoPlan models a reviewed snapshot of AUI requirements. It does not connect to live registration, guarantee a course will be offered, certify transfer credit, predict admissions or guarantee internships. Students retain control of accepted changes and should confirm individual approvals with their academic adviser.

Names, sign-in email, exact GPA, grades and private progress notes are excluded from automatic AI payloads; free text is sent as entered. The AI may receive a yes/no accelerated-load eligibility indicator. See the website privacy notice for storage and controls.

Full catalogue extracts, original third-party university documents, credentials, deployment-specific settings, user records and the retired Android installer are excluded from the public export. See [data provenance](docs/DATA_SOURCES.md). This repository does not grant rights to third-party source documents.

## Release status

This GitHub snapshot was synchronized from the completed production source on 17 October 2026. Future live releases can diverge until explicitly synchronized. Email authentication requires a Supabase project, verified sending domain and production SMTP configuration; setting only a public project URL does not enable working sign-in. Follow [deployment](docs/DEPLOYMENT.md) for the required checks.

University cohort intake and provider-capacity checks are documented in [Operations](docs/OPERATIONS.md).

Semester-stage changes now accept combined elective replacements, exact future course moves, per-term course-count targets and independent regular/summer loads. The shared scheduler checks prerequisite chains, course/credit caps, reported offerings, internship-only summers and protected study before applying an edit. Actual before/after changes and unmet constraints appear in a brief update. Excel uses a two-column semester/course layout; unplaced requirements remain in Course details. Run `node verify-semester-agent.mjs` for the structural-edit regression cases (synthetic provider only).

All roadmap agents support structural feedback. Direction patches academic combinations while preserving compatible choices; Courses can atomically replace, redistribute or leave editable assignments open; Opportunities supports partial replacements, exclusions and reranking. Global requests coordinate all requested sections, including a complete degree-roadmap rebuild, as one transaction with no partial save on failure. Protected study, source-backed requirements, the two-per-stage/five-global allowance and five-call global ceiling remain enforced. Run `node verify-structural-agents.mjs` for real HTTP/controller, cloud-persistence and rollback coverage with synthetic providers.

Global routing enforces explicit edit intent instead of accepting a chat-only response. Recognized academic names resolve against the reviewed curriculum, and prerequisite-sensitive minor requests compare the existing degree slots. A supported minor can be selected as a draft while its source-required approval slots remain open; selecting it never claims university approval or completed credit. Routing omits old personal narratives, and change receipts describe actual academic deltas. Run `node verify-global-edits.mjs` for refused/clarified Mathematics edits, prerequisite-aware alternatives, compound changes, protected study and cloud roundtrips with synthetic providers.

Recommendation-and-implementation requests preserve the original constraint across router paraphrases. A verified minor recommendation carries its concrete elective assignments into the draft instead of asking another model to reconstruct them. The shared validator checks every minor requirement, prerequisite chain, credit total, source approval condition and generated sequence before application. Existing unprotected free slots can be reassigned to cover prerequisites; no supplementary degree slot is appended. Run `node verify-minor-recommendation.mjs` for a lossy-router/refusing-model regression, exact course-recipe application, protected study, cloud persistence and representative source-validated alternatives across all eight undergraduate degrees.
