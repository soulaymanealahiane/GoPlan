# University estimates and inquiry notifications

The homepage calculator accepts roadmaps per student, five independent guided
edit quantities per roadmap and global changes per completed roadmap. Each
roadmap includes five initial stage requests. Each global change budgets up to
five backend requests. The estimate includes a fixed 25% usage buffer, followed
by a fixed 20% markup, with the final per-student total rounded to cents.

`dist/university-offer.js` owns the calculation for both the browser and server.
Provider call counts are rounded up **per roadmap** before multiplying by the
number of roadmaps. The estimate retains the financial model's token and usage
assumptions; it is not measured average cost. Academic data preparation, hosting,
support and other operating costs are excluded from the displayed estimate.
Adjusting the calculator does not change account entitlements or create a paid
service. A final university package requires separate agreement and configuration.

## Inquiries

The contact form saves the inquiry and optional selected package to the private
admin list. The server validates quantities and recomputes estimates; a browser
cannot supply a trusted price. The form reuses its submission UUID on a transport
retry. A replay with the same content returns the existing reference and cannot
duplicate the inquiry or an already accepted email. A changed body cannot reuse
the same reference.

Set `RESEND_API_KEY` as a server-side hosted secret, using a sending-access key
scoped to `planwithgoplan.com`. The fixed sender is
`GoPlan inquiries <notifications@planwithgoplan.com>` and the fixed recipient is
`partnerships@planwithgoplan.com`. The validated contact email is Reply-To.
Messages are plain text. Contact content, credentials and provider error bodies
are never logged. Existing same-origin, size, honeypot and per-address abuse
limits remain in place. No automatic reply is sent to the visitor.

Email is attempted only after database persistence. A provider failure does not
discard the inquiry or report a failed save. Two bounded transport attempts use
the same Resend idempotency key. A database lease serializes competing sends.
Admin lists the email status and offers an authenticated, same-origin retry.
Failed attempts have a one-minute cooldown. Five retry runs, or an ambiguous
first attempt older than 23 hours, require checking the provider before further
action: Resend retains idempotency keys for 24 hours. Historical inquiries remain
`not_requested` and are not emailed retroactively.

`accepted` means Resend accepted the API request, not confirmed inbox delivery.
Check Resend's event status for delivery or bounce information. Retention of
mailbox copies is separate from the website's 180-day inquiry retention. This
implementation has no unattended retry scheduler; unresolved notifications stay
visible in admin for retry or investigation.

Offline verification: `node verify-university-offer.mjs` and
`node verify-partnership-mail.mjs`, also included in `npm test`.

Provider contract: [Send email](https://resend.com/docs/api-reference/emails/send-email)
and [Idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
