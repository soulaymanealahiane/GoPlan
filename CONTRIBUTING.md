# Contributing

Use Node.js 22.13+ and pnpm 11.19.0. Install with `pnpm install --frozen-lockfile`, copy `.env.example` to `.env`, and run `pnpm start`.

## Before a change

- Keep credentials and real student data out of code, fixtures, issues and screenshots.
- Work on a feature branch. Do not rewrite shared history or force-push collaborators' branches.
- `dist/` contains authored frontend source. Only `dist/server/` and `dist/.openai/` are build outputs.
- Preserve saved-plan compatibility and account ownership checks.

## Validation

Run `pnpm test` and `pnpm build`. Add focused regressions for changed scheduling, authorization or persistence behavior. Live provider scripts incur usage and are separate from the offline suite; use only synthetic data.

For schema changes, edit `db/schema.ts`, run `pnpm db:generate`, inspect the generated SQL, and keep previous migrations unchanged. Test on an empty local database and verify existing records remain readable.

## Pull requests

Explain the student-facing problem, resulting behavior, validation and any migration or configuration required. Distinguish reviewed academic rules from assumptions about actual course availability.

## Public release

Run `node scripts/audit-public.mjs` and `node scripts/export-public.mjs <new-empty-directory>`. The exporter excludes private source documents, deployment identifiers, binaries and local state. Publish that clean snapshot as a new repository; do not make the older collaboration repository public merely because its latest tree looks clean. Inspect the exported files and use GitHub secret scanning as an additional check.
