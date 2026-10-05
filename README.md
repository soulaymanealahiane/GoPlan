# GoPlan

**An AI-assisted academic roadmap planner with a deterministic scheduling engine.**

GoPlan helps students turn their interests into an editable degree plan: academic direction, minor and elective choices, internship and exchange targets, and semester-by-semester progress. It is an independent student project, not an official AUI registration or advising system.

[Live website](https://planwithgoplan.com) · [Architecture](docs/ARCHITECTURE.md) · [Development](CONTRIBUTING.md) · [Security](SECURITY.md)

## Engineering highlights

- **Constrained AI recommendations:** server-side Groq Chat Completions API calls produce structured proposals that are validated against reviewed program data before they can change a plan.
- **Deterministic academic scheduling:** prerequisite and corequisite checks, credit limits, independent regular/summer loads, minor requirements and preserved completed courses.
- **Progress-aware replanning:** unavailable courses and changed goals produce a preview; delayed graduation is surfaced before acceptance.
- **Evidence-aware research:** bounded web research for opportunities, with source attribution and explicit uncertainty about current availability.
- **Private cloud workspaces:** per-account ownership checks, optimistic revision control, recovery of interrupted saves and deliberate resolution of conflicting edits.
- **Independent email authentication:** Supabase verifies email during account creation and recovery, and authenticates email/password sign-ins; GoPlan issues revocable, hashed sessions in HttpOnly cookies. Admin access uses a server-configured email allowlist.
- **Human-reviewed feedback:** optional mistake reports, receipt-based withdrawal, expiry, and consent-gated corrections. Feedback does not automatically retrain the underlying model.
- **Operational visibility:** private usage aggregates, adviser reliability, registered profiles and feedback review. Student answers and grades are excluded from aggregate analytics.
- **Excel output:** a generated workbook retains the semester-block layout of the planning template.

## Stack

Vanilla JavaScript ES modules and responsive HTML/CSS; Node.js for development; a Cloudflare Workers-compatible production bundle; SQLite/D1 with Drizzle migrations; Supabase Auth for verified email and password authentication; Groq-hosted GPT-OSS 120B for advice and browser research. Production email delivery requires a configured SMTP service.

Groq is the sole inference provider. Recommendations use strict JSON schemas; browser research runs separately and only retrieved primary-source URLs can support its extracted findings. Academic validators remain authoritative. There is no automatic OpenAI fallback.

## Run locally

Requirements: Node.js 22.13+ (24 LTS recommended) and pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm start
```

Open `http://127.0.0.1:4317`. Academic planning data and offline tests do not need provider credentials. Live AI and email sign-in require the corresponding environment settings; there is no pretend AI fallback. Never commit `.env`.

```sh
pnpm test
pnpm build
```

Tests cover degree/minor combinations, prerequisite ordering, independent course loads, AI schema validation, progress preservation, feedback consent, account isolation, CSRF checks, session revocation and sync conflicts. Provider calls in the automated suite are fixtures, not live model evaluations. No unmeasured accuracy or performance claim is implied.

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

`dist/server/` is generated output. The name `dist` for authored UI files is a legacy convention, documented here to prevent accidental cleanup.

## Scope and limitations

GoPlan models a reviewed snapshot of AUI requirements. It does not connect to live registration, guarantee a course will be offered, certify transfer credit, predict admissions or guarantee internships. Students retain control of accepted changes and should confirm individual approvals with their academic adviser.

Names, sign-in email, exact GPA, grades and private progress notes are excluded from automatic AI payloads; free text is sent as entered. The AI may receive a yes/no accelerated-load eligibility indicator. See the website privacy notice for storage and controls.

Full catalogue extracts, original documents, credentials, deployment-specific settings, user records and the retired Android installer are excluded from the public export. See [data provenance](docs/DATA_SOURCES.md). This repository does not grant rights to third-party source documents.

## Release status

The production site and this source snapshot can differ while a release is being validated. Email authentication requires a Supabase project, verified sending domain and production SMTP configuration; setting only a public project URL does not enable working sign-in. Follow [deployment](docs/DEPLOYMENT.md) for the required checks.
