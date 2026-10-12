# Deployment

1. Provision a SQLite/D1-compatible database and apply the ordered `drizzle/` migrations.
2. Configure the server variables in `.env.example`. Never put credentials in frontend files.
3. For email sign-in, create a Supabase project, enable email authentication, configure production SMTP and use an OTP email template containing `{{ .Token }}`. Set `SUPABASE_URL` and its publishable key. Do not use a service-role key for this flow.
4. Set `ADMIN_EMAILS` to the verified owner email(s). An empty allowlist grants no browser admin access.
5. Run the offline test suite and build. Deploy the generated Worker bundle using your chosen Workers-compatible host. GoPlan's original Sites hosting manifest is private deployment configuration and is not part of the public export.
6. Verify real email delivery, code rejection, password setup, password sign-in, recovery, cloud save/restore, sign-out and non-owner dashboard denial before announcing availability.

Do not switch a live site to email sign-in before SMTP and auth configuration work. Existing profile IDs and roadmaps are retained; a confirmed matching email reconnects an unambiguous legacy profile. Back up the production database using the hosting provider's supported workflow before migration.

The Node development server listens only on loopback. It is not a hardened internet-facing production server. The public repository is source for review and development, not an unattended one-command production deployment.

## OpenAI inference

Set `OPENAI_API_KEY` as a server-only secret and `OPENAI_MODEL=gpt-6-astra`. Set `OPENAI_REASONING_EFFORT=high`, `OPENAI_RESEARCH_MODEL=gpt-6-astra` and `OPENAI_RESEARCH_REASONING_EFFORT=xhigh` for the pitching configuration. All stages use the Responses API, with strict JSON schemas for proposals and extraction. `OPENAI_WEB_RESEARCH=off` disables live research; advice still uses reviewed academic and opportunity data. Remove obsolete `GROQ_*` runtime variables after migration. Do not expose provider credentials in frontend configuration.

Run the fixture suite and build before publishing. `scripts/verify-openai-live.mjs` provides a small synthetic paid smoke check; the broader live-agent and intelligence scripts are explicit paid evaluations and may exceed a small test balance. OpenAI model access, token charges (including reasoning), search charges and rate limits apply. Consult the [model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra) and [web search documentation](https://developers.openai.com/api/docs/guides/tools-web-search). An account balance is a testing budget, not a forecast of cohort costs.

The demo prioritizes quality over inference price. Advice reserves 25,000 output tokens (including reasoning), with one bounded 32,000-token retry for truncation. Research has a 16-tool-call limit and directly checks up to 24 source pages. These are ceilings, not expected usage. No automatic downgrade is configured. With a tiny account balance, run the smoke check first and inspect actual usage before a full pitch rehearsal. Keep demo access controlled; funded university deployments need their own budgets and measured usage. The financial plan's recurring-cost assumption is not automatically recalculated by this migration.
