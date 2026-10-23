# Retired mistake reporting

Student mistake reporting was removed in version 0.12.1. The app contains no submission, report list, withdrawal or review entry points; `/api/feedback`, its subroutes and `/api/review/*` return `410 FEATURE_REMOVED`. The owner inbox, review dialog and old review CLI are removed. Authenticated `/api/admin/reports` and `/api/admin/review` also return 410; historical inbox counts are no longer included in analytics.

Earlier private records and immutable database migrations are retained. They are not published, reset or deleted by this feature removal. Their original 90-day expiry and consent boundaries still apply. Expired corrections are excluded immediately; physical cleanup occurs when the retained internal storage helper runs. Historical report receipts are not included in roadmap exports. Operators handle historical data requests through the existing private support process.

`server/feedback.mjs` retains storage, hashing and consent-aware retrieval helpers required by existing records and authentication. Only already verified, opted-in, unexpired corrections enter advice context. Those corrections cannot override deterministic academic validators. New academic rule corrections require a reviewed application/data update and regression coverage. This is reference retrieval, not model training.

Run `node verify-feedback.mjs` to check retired public routes and the privacy, consent, withdrawal, expiry and retrieval behavior of historical storage. `node verify-roadmap-cleanup.mjs` checks the removed student UI and all reporting routes. Both use isolated fixtures.
