# Student access and service allowances

Each contracted university currently needs its own deployment, database, configured university ID and applicable academic data. The public AUI pitching demo stays in `demo` mode; it requires sign-in but does not restrict signup to a university email list.

For a contracted intake, configure `GOPLAN_UNIVERSITY_ID`, optionally `GOPLAN_EMAIL_DOMAINS`, import the university's approved emails, and enable `GOPLAN_ACCESS_MODE=roster`. Without a configured university/list, roster mode refuses student access. Administrators use the server email allowlist.

In **Admin → Pilots & partnerships**, upload a plain-text/one-column CSV with one email per line (optional `email` header), at most 5,000 emails per upload:

- **Add a new cohort** is the default. Earlier students keep access. Duplicate emails do not create a second allowance.
- **Replace the full list** removes access for omitted students; it requires the confirmation checkbox. It does not erase plans or reset service allowances.

Never commit intake lists to GitHub. The approved list stores university-scoped email hashes. Import only a university-supplied, authorized cohort after confirming its payment outside the application; the import is not proof of payment and does not contact a bank or fund an AI account.

Each verified account has one roadmap, five guided stages with two AI changes per stage (ten total), and five global AI changes after saving. Unused stage changes do not roll over. Prompts are counted on submission, not signup or every login. Follow-up answers use a stage change; retrying the same request does not use a second change. Reloads, another device, roster uploads and GoPlan-profile deletion cannot restore the same account's used allowance. Manual editing and Excel export remain available. No payment integration or automatic API-balance top-up is implemented.

## Dependency capacity

Provider quota warnings are not an uptime guarantee. Before each cohort, review the actual subscriptions and usage dashboards for Resend (daily and monthly emails), Supabase (authentication, database and egress), managed hosting (Worker/D1 capacity), and OpenAI (balance, spend and rate limits). Zoho mailbox capacity concerns the team's inboxes, not student accounts. Do not infer the managed host's plan from Cloudflare's published direct pricing.

As an operating policy, investigate at 70% of a measured quota, plan an upgrade at 85%, and treat 95% as urgent. For signup events, compare the expected one-day email demand, including resends/recovery, against the daily allowance before inviting the cohort. These thresholds are recommendations, not configured alerts. GoPlan does not currently poll provider billing APIs or send cross-provider quota emails. Its activity totals cannot substitute for account-wide provider usage.

Current provider documentation:

- [Supabase quota notices and restrictions](https://supabase.com/docs/guides/platform/billing-faq)
- [Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits) and [account usage API](https://resend.com/changelog/account-usage-api)
- [Cloudflare D1 pricing and limits](https://developers.cloudflare.com/d1/platform/pricing/)
- [Zoho mailbox storage](https://www.zoho.com/mail/help/mailbox-quota.html)
- [OpenAI spend alerts and limits](https://developers.openai.com/api/docs/guides/spend-limits)
