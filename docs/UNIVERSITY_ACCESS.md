# University access configuration

## Deployment modes

The public AUI planner uses `GOPLAN_ACCESS_MODE=demo`. Each roster-restricted deployment needs its own database, reviewed academic dataset, student email domains and university identifier.

```dotenv
GOPLAN_ACCESS_MODE=roster
GOPLAN_UNIVERSITY_ID=<stable-university-identifier>
GOPLAN_EMAIL_DOMAINS=<comma-separated-approved-domains>
ADMIN_EMAILS=<verified-owner-emails>
```

Roster mode fails closed when configuration or the approved list is absent. Domain matching alone does not grant access. `ADMIN_EMAILS` controls owner administration access. Demo access codes cannot bypass roster restrictions.

## Roster imports

In `/admin`, the Pilots & partnerships panel imports a `.txt` or single-column `.csv`, one institutional email per line. Optional header: `email` or `institutional_email`. The maximum is 5,000 addresses. An import atomically replaces the configured university’s cohort; an invalid import leaves the previous list intact.

Roster entries are hashes scoped to the university. Authentication/profile records separately retain account email addresses; hashing the roster does not anonymize those account records. Never commit real roster exports or account records.

Eligibility is checked before email-provider calls, during code verification, password setup/recovery and login. Authenticated requests recheck eligibility so removing an address invalidates access through an existing session. The implementation is in `server/university-access.mjs`, `server/auth.mjs` and `admin/pilots.js`.

## Student planning flow

Both starting routes use the same six-step journey. The final review accepts recognized completed courses, current registrations and remaining Language Center study. Unrecognized codes are rejected without modifying the previous state. Recorded completed and in-progress courses are preserved when constructing the roadmap. See `dist/study-review.js` and `verify-university-pilots.mjs`.

## Contact inquiries

`POST /api/partnerships` validates submitted fields, checks request origin and enforces request limits. Inquiries are stored for up to 180 days and read through owner-authorized admin endpoints. The contact form reports successful storage, not email delivery. No notification email is sent automatically. See `server/partnerships.mjs`.

## Deployment checks

Apply ordered migrations, including `drizzle/0005_university_pilots.sql`. Import the correct list, verify a listed student can receive a code and log in, reject an unlisted address, verify owner access and test session denial after removing an address. Review academic data, evidence, UI names, privacy details and allowed origins before deploying a different university edition.

The offline regression suite covers scoped hashes, isolation, authentication-stage restrictions, owner permissions, protected inquiry storage, abuse limits and preservation of prior study. It uses synthetic identities and makes no live provider calls.
