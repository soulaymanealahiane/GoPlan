# Automatic Supabase authentication recovery

The independent GitHub Actions workflow checks the configured Supabase project
approximately every five minutes and can also be run manually. It reads the
Management API project state, resumes `INACTIVE` projects, and waits up to four
minutes for both `ACTIVE_HEALTHY` and the real Auth health endpoint to recover.
It never restarts an active project or retries an uncertain restore request
within the same run. Concurrent runs are serialized. Healthy runs stay quiet;
failed runs appear in Actions and follow the owner's GitHub notification settings.

## One-time setup

In Supabase, create a personal access token restricted to the GoPlan project
with **Project Settings: Read-write** (`project_admin_write`). This is the
Management API permission required to restore that project. Do not grant
account-wide or unrelated-project access, database access, or billing permissions.
The website's publishable key cannot perform this administrative operation.

In the GoPlan GitHub repository, add:

- Secret `SUPABASE_ACCESS_TOKEN`: the scoped personal access token.
- Variable `SUPABASE_PROJECT_REF`: the exact existing project reference.
- Variable `SUPABASE_PUBLISHABLE_KEY`: its public sign-in key, used only to check
  the Auth health endpoint; it is not sent to the Management API.
- Variable `SUPABASE_AUTO_RESUME`: `true`. Set this to `false` before intentionally
  pausing the project for maintenance, or disable the workflow.

Run **Supabase authentication recovery** once and confirm success. Test only
against an already running production project; do not deliberately pause live
authentication to demonstrate recovery. Automated regression tests simulate the
paused and restoring states without production mutations.
The job skips until its project-reference and health-key variables are configured;
a skipped run does not mean that automatic recovery has been activated.

## Operational limits

This reduces manual recovery work; it does not make the Free plan always on.
Detection and restoration take time. GitHub schedules can be delayed, and public
repository schedules are disabled after 60 days without repository activity.
Expired or revoked tokens and provider restrictions require owner action.
The Management API's `INACTIVE` state does not distinguish an intentional pause
from an inactivity pause, so use the maintenance switch for intentional pauses.
A paid Supabase plan removes inactivity pausing itself.

References:

- https://supabase.com/docs/reference/api/v1-restore-a-project
- https://supabase.com/docs/guides/platform/personal-access-tokens
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- https://supabase.com/docs/guides/platform/free-project-pausing
