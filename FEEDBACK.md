# Reporting mistakes and improving the adviser

Students can use **Change my plan → Report a mistake** after saving a roadmap. This is distinct from reporting an unavailable course or changing personal goals. Reporting never edits a saved roadmap. After submission, **Review this with my adviser** fills a change request for the student to review; the existing six-step workflow proposes a new draft and preserves completed study.

## What the feedback loop does

1. The student describes the error, expected correction and optional source. The form previews the degree/focus/minor context sent with it.
2. Required, explicit consent authorizes backend storage and team review. A separate unchecked option authorizes use of a verified correction in shared guidance.
3. The server stores a report with a private receipt. Retries with the same receipt and payload do not create duplicate reports.
4. An authorized human reviewer checks an AUI source. Pending or dismissed reports never enter shared guidance. Confirming a report requires a source citation, evidence-check acknowledgement, reviewer attribution and a review note.
5. Opted-in, verified corrections become reference context for future adviser calls. The model is told to flag source conflicts and cannot override the deterministic academic validators. Actual scheduler/data fixes still require code, source review and regression tests.
6. The student can check the review outcome or withdraw via **Workspace options → My mistake reports**. Withdrawal removes the report and its review history. Future requests no longer retrieve the correction. Already delivered answers and in-flight requests cannot be recalled.

This is **reviewed retrieval and correction, not fine-tuning or automatic model retraining**. No provider training job is created, and raw student complaints do not become global rules. Fine-tuning would require a separately consented, curated training dataset, held-out evaluation and an explicit deployment decision; this release does not claim to do that.

## Data boundaries

- Submission is allowlisted to category, stage, issue, proposed correction, source text, four academic identifiers and the two consent flags. Name, grades, goals and progress notes are not attached. Free-text fields can still contain personal information entered by a student; the form asks them not to include it.
- Reports live in the private Sites D1 `DB` binding. Local development uses `.sites-runtime/feedback.sqlite`, which is ignored by Git. There is no public report listing or reviewer UI.
- Submitting a report does not call OpenAI. Reconsidering it uses the existing adviser API and explicitly includes the student's report text. Shared future calls receive only the reviewed correction, source and academic scope, not the raw report or reviewer identity.
- Receipt tokens are generated with browser cryptographic randomness and stored separately per workspace. The backend keeps a SHA-256 hash, not the token. Access to a report needs both the demo code and its receipt. Receipts are not included in degree-plan backups.
- Reports and associated review history expire after 90 days. Expired corrections are immediately excluded from advice queries. Physical deletion occurs on the next report-service operation. Withdrawal deletes them sooner. This is demo retention behavior, not an exact-time background erasure service.
- No grades, legal eligibility, admissions or other high-impact decisions are made from feedback. A GoPlan team review is not an AUI authorization.

## Reviewer workflow

The student demo code cannot approve corrections. `FEEDBACK_REVIEW_KEY` is a separate server secret and must never be placed in `dist/`, a public frontend variable, Git, a screenshot or a student message. It is configured in the ignored local `.env` and in Sites runtime secrets. Give reviewer access only through an appropriate private team process.

Read the newest 100 reports locally:

```sh
node scripts/review-feedback.mjs list
```

Add `--live` to use the deployed backend. The script only accepts the fixed local or GoPlan production destination. Its output contains private reports: do not paste it into public issues or commit it.

Create a decision JSON in `.sites-runtime/`, review the exact source, then submit:

```json
{
  "id": "COPY_THE_REPORT_ID",
  "status": "confirmed",
  "reviewer": "Reviewer name or team identifier",
  "note": "Explain what you verified and how this responds to the report.",
  "evidenceChecked": true,
  "correction": "A concise, source-grounded correction without personal information.",
  "source": { "file": "EXACT_SUPPLIED_DOCUMENT_FILENAME", "page": 1 }
}
```

Alternatively, `source` can be `{ "url": "https://aui.ma/..." }` or another official AUI subdomain URL. A URL being accepted by validation does **not** verify its content: the reviewer must read the source and ensure the citation supports the correction. Do not approve policy changes based only on a user's assertion. The correction's program scope and stage come from the report.

```sh
node scripts/review-feedback.mjs review .sites-runtime/decision.json --live
```

Other review outcomes are `dismissed` and `needs-information`; these require `reviewer` and `note` but no correction or source. A later review can revoke a previously confirmed correction. Review actions are logged until report expiry/withdrawal. Students must open My reports to see the outcome; this demo sends no email or push notifications. There is no automatic reviewer assignment or guaranteed response time.

## Database and verification

`db/schema.ts` owns the schema. Generate migrations with `node node_modules/drizzle-kit/bin.cjs generate`; inspect and commit `drizzle/` including its journal and snapshots. Applied migrations are immutable. The local adapter applies pending generated migrations at server startup. The Worker build packages them into `dist/.openai/drizzle` for Sites deployment.

Run `node verify-feedback.mjs` for consent, minimization, receipt isolation, reviewer access, unverified-report exclusion, opted-in verified guidance, withdrawal/cache invalidation, expiry and error handling. The test uses a real SQLite database with fixture model responses and no paid AI calls. Existing academic and progress-preservation tests remain required before deployment.

Implementation references: [Cloudflare D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/), [Drizzle migration generation](https://orm.drizzle.team/docs/drizzle-kit-generate).
# Deployment packaging

After `node scripts/build.mjs`, run `python scripts/package-deploy.py . <archive.tar.gz>` to prepare the deployment archive. It preserves `dist/.openai/drizzle` and its migration journal; moving migrations to the archive root prevents the hosting platform from applying them. Verify that the live database contains `feedback_reports` and `feedback_reviews` after publication.

