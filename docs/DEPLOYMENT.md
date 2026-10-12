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

Set `OPENAI_API_KEY` as a server-only secret, `OPENAI_MODEL=gpt-6.1-sol`, `OPENAI_REASONING_EFFORT=medium`, `OPENAI_RESEARCH_MODEL=gpt-6-luna` and `OPENAI_RESEARCH_REASONING_EFFORT=none`. The Responses API uses strict schemas and uses standard processing for academic advice and Fast mode for the longer target-ranking step; the spending guard includes its 2x token premium. `OPENAI_WEB_RESEARCH=off` disables live research. Initial academic direction uses reviewed market evidence; `OPENAI_DIRECTION_RESEARCH=on` optionally enables a bounded market refresh. Keep provider credentials out of frontend configuration.

Run the fixture suite and build before publishing. `scripts/verify-openai-live.mjs` provides a small synthetic paid smoke check; the broader live-agent and intelligence scripts are explicit paid evaluations and may exceed a small test balance. OpenAI model access, token charges (including reasoning), search charges and rate limits apply. Consult the [model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol) and [web search documentation](https://developers.openai.com/api/docs/guides/tools-web-search). An account balance is a testing budget, not a forecast of cohort costs.

The server shares a 55-second deadline across every model call, source read and repair; the browser stops at 58 seconds. Advice output ceilings range from 1,400 to 6,000 tokens, including reasoning. Search uses at most two tool calls and checks at most four source pages within 24 seconds. Exact prompt-token preflight and conservative search/output reserves bound planned spending to $0.20 per request at the documented rates for the selected processing tier. Search content is reserved conservatively; this is an application guard, not an OpenAI billing cap or a guarantee against provider billing changes. Failed or canceled work may still be billed. There is no automatic transport retry, token-budget escalation or model downgrade. D1 leases prevent overlapping paid requests across Workers; duplicate requests in one browser share a promise and completed proposals are cached for ten minutes per server instance. The lease table is created automatically and stores only opaque hashes, random tokens and expiry, never answers. If the lock store fails, paid work does not start. Test synthetic scenarios before a pitch; measure actual cost and quality for each funded cohort.
