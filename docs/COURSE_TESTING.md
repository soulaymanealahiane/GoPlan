# GoPlan implementation and testing

CSC 3324 course milestone, prepared 13 November 2026.

## Application

GoPlan is an independent academic-planning aid. The hosted application is [planwithgoplan.com](https://planwithgoplan.com/), and the personal planner is [/demo](https://planwithgoplan.com/demo). It does not register students for courses or certify academic approval.

The personal planner requires a verified account. Use your own email to create an account and follow the email-verification steps; account creation and any university-access restrictions are enforced by the hosted application. No shared password or administrator credentials are published here.

## Run locally

Use Node.js 22.13 or newer and pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm start
```

Open http://127.0.0.1:4317. Populate the documented environment variables for live AI and email authentication. Offline tests do not require these credentials. Keep local environment files outside Git. Full configuration details are in the root README and deployment documentation.

## Automated unit test

```sh
node verify-university-offer.mjs
```

Equivalent package command: `npm run test:unit`. This directly imports and tests the pure function `calculateOffer(values)` from `dist/university-offer.js` using Node's strict assertions. An all-one quantity configuration returns an estimated price of 0.44 and 15 backend requests per roadmap; two roadmaps return 0.89 after final cent rounding. Zero roadmaps returns 0, and negative, fractional and non-numeric quantities are rejected. Fixed buffer and markup cannot be overridden through extra input fields. The script also checks the summary formatter. These expected results come from the supplied calculation model, not current price research or measured AI costs.

A passing run prints a summary and exits with status 0; a failed assertion exits nonzero. It needs only Node.js and makes no model, email or production-data calls.

## Broader automated checks

```sh
npm test
```

The current command runs 69 existing verification scripts in order, stopping on the first failure. Coverage includes deterministic curriculum rules, mocked AI responses, authentication and account isolation, persistence, course editing, request budgets, exports and error recovery. Synthetic provider outputs test integration and guardrails; they do not establish live-model accuracy, latency or availability. AI decision quality needs separate repeated evaluations using the SRD evaluation criteria.

## Suggested hosted walkthrough

1. Open the planner and create or sign into a verified account. Existing users resume their saved plan. New users complete onboarding and save their roadmap. A sample scenario is an incoming AUI student interested in business analytics, data and programming, considering BBA with Analytics and AI for Business and a Computer Science minor; all academic approval warnings still apply.
2. On Your space, open Direction and review the selected degree, concentration and minor. Open a saved explanation through Why this match.
3. Open Courses and inspect course groups, codes and semester placement. Open Opportunities and inspect a company or exchange explanation and its source. Targets are possibilities, not guaranteed offers.
4. Open Degree roadmap. In an unprotected future semester add the note “Ask my adviser about this semester.” Save it, reload the page, return to that semester and confirm the text remains. Clear the sample note afterward if it is no longer needed. Manual notes do not consume AI allowance.
5. Search for a course by code, for example FYE1101, and inspect its location. Exact placements depend on the account's plan. Do not change a real student's completed study for a demonstration.

AI generation needs an available provider and remaining allowance. Do not send repeated live requests solely to run the offline test suite. The Figma prototype accompanying the Canvas submission demonstrates selected visual interactions; real account creation, inference and persistence belong to the hosted app.

## Repository structure

The README's repository map identifies the interface, server, database, data, scripts, documentation and verification files. Top-level `dist/` contains authored frontend source; only `dist/server/` is generated. Environment examples contain configuration names rather than usable provider secrets.
