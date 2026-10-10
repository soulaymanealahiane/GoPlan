# GoPlan university pilots

Agreed direction, 9 October 2026.

## Who we serve

Universities pay to offer GoPlan to an approved cohort. The primary student is admitted and matriculated, planning during the summer before their first fall semester. Continuing students use the same planning journey, record passed and current study at the final review, and keep or revisit their academic direction and opportunity shortlists.

One workflow: starting point → goals → academic direction → course choices → opportunities → pace, prior study and roadmap review → save.

## What a pilot provides

- Current degree and course requirements, prerequisite rules, placement information and relevant policies, reviewed before onboarding.
- An approved list of institutional student emails, refreshed annually and when cohort eligibility changes.
- A paid pilot agreement covering cohort, delivery scope, service costs and evaluation.

No student information system connection or university password is required. A listed student proves email ownership with a one-time code and creates a separate GoPlan password. List eligibility and mailbox ownership are different checks; both are necessary.

## Deployment and access

One isolated deployment and database per university, with its reviewed academic dataset. The current public AUI prototype is the only prepared academic edition. A new deployment must replace the AUI data, evidence, UI names, privacy details and allowed production origins with reviewed university-specific information before launch. Do not imply that changing an email roster creates a university knowledge base.

Configuration:

```
GOPLAN_ACCESS_MODE=roster
GOPLAN_UNIVERSITY_ID=<agreed stable university identifier>
GOPLAN_EMAIL_DOMAINS=<approved student email domains, comma-separated>
```

Keep the public pitching prototype in `demo` mode. Roster mode rejects unapproved users before email-provider calls, at verification, at password creation/recovery, and at password login. Every authenticated request rechecks eligibility, so existing sessions stop working after an email is removed. Owner emails configured in `ADMIN_EMAILS` retain administration access. Demo access codes cannot bypass a roster restriction.

In `/admin`, open **Pilots & partnerships**. Import a `.txt` or single-column `.csv`, one institutional email per line, optionally headed `email` or `institutional_email`. The list replaces the configured university's cohort atomically; invalid imports leave the old list untouched. Up to 5,000 addresses per upload. Stored roster values are hashes scoped to the university. Account emails remain in the authentication/profile systems for sign-in and cloud saving. Hashing a roster does not anonymize those separate account records.

Before enabling a contracted pilot, import the correct list, test real code delivery and login with a listed student, reject an unlisted address, verify owner access, and review the knowledge base with the university. Apply ordered D1 migrations through the normal deployment. The new migration is additive.

## Public presence

- `/`: institutional website, newcomer-first positioning, direct AUI demo links and paid pilot call to action.
- `/demo`, `/demo/aui`, `/demo.html`: the existing AUI academic planner, with the same storage keys and account ownership rules.
- `/signin.html`: verified-email/password auth; student sign-in returns to the demo, owner sign-in retains the admin destination.
- `/admin`: private operations, approved email import and saved university inquiries.

The website contains no invented customer counts, testimonials, impact statistics or institutional endorsements. There is no video walkthrough. Visitors inspect the real roadmap through the AUI demo. The website uses conceptual illustrations rather than presenting a sample schedule as an approved degree plan.

Professional inbox: **partnerships@planwithgoplan.com**, hosted as a separate Zoho Mail mailbox with its own sign-in. Cloudflare Email Routing is disabled; the domain uses Zoho MX, SPF and DKIM records, all verified in Zoho. A message sent to the same mailbox was received successfully. Sign in at https://mail.zoho.com/ with the partnership address and the Zoho password chosen during signup. Gmail is the administrator verification/recovery identity, not an email-forwarding destination. The website contact form works independently: submissions save to the owner dashboard for up to 180 days. The form does not claim that an email was sent. The public website includes a direct mail link to the verified partnership inbox. Contact-form submissions continue to save in the owner dashboard; they do not automatically notify the mailbox.

## Pitch and next milestone

GoPlan gives incoming students a degree direction and an editable semester roadmap before they begin university. We seek paid pilot universities to provide reviewed program information and an approved student cohort. Pilot funding pays for delivery and more capable reasoning/research where evaluation justifies it. We will test demand, repeat usage, planning completion and adviser-reviewed quality before publishing traction claims.

The current engine already uses Groq with bounded external research. Paid-provider upgrades remain a funded and evaluated next step; they are not a prerequisite for explaining the current product. Model changes must preserve validated academic requirements, progress, privacy and student acceptance of plan changes.

## Source strategy

The deployed source is maintained in the private Sites source repository. On 10 October 2026 the completed source was explicitly synchronized to the existing GitHub mirror at the owner’s request. Future synchronization remains explicit. Future decisions about changing repository visibility or removing public source require an explicit repository operation; the new website does not itself change visibility. Credentials, student lists and runtime records must remain outside public exports.

## Evaluation to agree with each pilot

Track cohort invitation/activation, questionnaire-to-roadmap completion, saved plans reopened, actionable student feedback and adviser-reviewed errors. Existing operation counters are events, not unique student or retention statistics. Add consent-aware measurement only when the evaluation needs it; do not market event counts as student impact.
