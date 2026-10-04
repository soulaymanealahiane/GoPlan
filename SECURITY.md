# Security

Do not submit credentials, authentication cookies, student records or raw production logs in public issues. Report suspected vulnerabilities privately to the project maintainer (use GitHub private vulnerability reporting when enabled).

Runtime secrets belong in local ignored `.env` files or the hosting provider's environment settings. `ADMIN_EMAILS` is server-side configuration. A student's full name or claimed email alone is never proof of identity.

The automated security checks exercise account isolation, same-origin mutation checks, opaque session validation, revocation and conflict handling. The repository scanner is a heuristic aid, not a penetration test or guarantee that no secrets exist.

If a secret was committed, revoke or rotate it before publication. Removing it in a later commit does not remove it from history. Prefer the clean public export over rewriting the team's active repository.
