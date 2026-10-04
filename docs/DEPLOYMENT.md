# Deployment

1. Provision a SQLite/D1-compatible database and apply the ordered `drizzle/` migrations.
2. Configure the server variables in `.env.example`. Never put credentials in frontend files.
3. For email sign-in, create a Supabase project, enable email authentication, configure production SMTP and use an OTP email template containing `{{ .Token }}`. Set `SUPABASE_URL` and its publishable key. Do not use a service-role key for this flow.
4. Set `ADMIN_EMAILS` to the verified owner email(s). An empty allowlist grants no browser admin access.
5. Run the offline test suite and build. Deploy the generated Worker bundle using your chosen Workers-compatible host. GoPlan's original Sites hosting manifest is private deployment configuration and is not part of the public export.
6. Verify real email delivery, code rejection, password setup, password sign-in, recovery, cloud save/restore, sign-out and non-owner dashboard denial before announcing availability.

Do not switch a live site to email sign-in before SMTP and auth configuration work. Existing profile IDs and roadmaps are retained; a confirmed matching email reconnects an unambiguous legacy profile. Back up the production database using the hosting provider's supported workflow before migration.

The Node development server listens only on loopback. It is not a hardened internet-facing production server. The public repository is source for review and development, not an unattended one-command production deployment.
