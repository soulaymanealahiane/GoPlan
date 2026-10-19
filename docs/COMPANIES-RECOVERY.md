# Companies interruption: cause and verification

The reported message was the browser's unreadable-response branch, not evidence of exhausted credit. Production request logs showed canceled advice requests after approximately 77 and 195 seconds, followed by fast busy responses. A Companies initial action still had an unfinished running call long after its Worker stopped. No user answers, identities or plan contents are included here.

Three defects combined:

1. Browser recovery only accepted errors explicitly marked final. Non-JSON gateway responses, connection failures and timeouts bypassed recovery.
2. Durable call receipts had no abandoned-work expiry. A canceled Worker could miss cleanup; retrying that receipt stayed busy indefinitely.
3. The three-minute deadline relied on AbortSignal alone. It did not independently bound token counting, response-body parsing or a transport that failed to honor cancellation.

This evidence establishes the interrupted-request and broken-recovery path. It does not establish which upstream network/provider condition caused every canceled production request.

## Resulting behavior

- Healthy initial Companies/Exchanges requests still research and generate live recommendations.
- Initial opportunity work has a hard 45-second overall deadline. The original $0.25 request ceiling remains.
- Provider/deadline failure returns profile-ranked reviewed targets. Gateway/connection failure invokes authenticated reviewed recovery immediately. Suggestions retain their sources, route restrictions and unconfirmed-availability status.
- Recovery settles the existing initial action. It cannot create a new model call, refund credit or consume a guided/global change. Old running receipts and changed deployment hashes are covered.
- First settled result wins: late work cannot overwrite the recovered shortlist. A lost successful result replays the original successful recommendation.
- Existing academic choices and the other opportunity list stay in place. Explicit user revisions still fail honestly if they could not be applied; they are never replaced with a false success.
- Expired abandoned paid receipts stop returning busy forever. Authentication, action ownership, stage boundaries and service caps remain enforced.

## Verification

`verify-roadmap-resilience.mjs` exercises 28 groups through the real controller, browser clients, authenticated HTTP handlers, SQLite/D1-compatible storage, structured provider fixtures and cloud save/reload. New cases cover non-JSON 502, empty 200, disconnected and timed-out requests at both opportunity stages, abandoned legacy receipts, recovery while a response is still in flight, late completion, hard deadlines, expired sign-in, unchanged counters and completion through saving. Other cases cover all five stages, three degree combinations, exhausted allowances and manual editing/export.

`verify-request-policy.mjs` stalls token counting, transport, response bodies and the entire operation independently, including implementations that ignore AbortSignal. `verify-service-allowance.mjs` checks expiry without credit restoration and denies recovery using another account, a non-opportunity initial action or a global action. Existing provider, output, budget, opportunity variety, academic, authentication and manual-workspace suites remain required.

An isolated browser walkthrough injects a gateway failure plus an abandoned running receipt, verifies five Companies cards with both changes remaining, reloads, repeats at Exchanges and completes/saves the plan. No customer data or paid inference is used for verification.

Recovery still needs an available network, authenticated session and working storage. No test can guarantee provider/network uptime; these cases ensure a failed AI request alone does not strand the initial opportunity stages.

Recovery retires only the matching owner/action server lease. A legacy orphan lock or a still-running old Worker cannot halt the remaining initial stages: reviewed course choices and local semester construction remain available without spending a guided change. Lease ownership and late cleanup are tested separately.
