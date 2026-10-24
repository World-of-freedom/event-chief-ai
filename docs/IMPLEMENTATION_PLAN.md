# Event Chief AI — MVP Implementation Plan

## Outcome

Deliver a responsive, authenticated sponsorship-workflow app for one organizer:

`Event → resource need → vetted prospect → opportunity → approved email/call → reviewed offer → follow-up → accepted/fulfilled support`

This is a greenfield repository. The MVP deliberately excludes automated prospect crawling, inbound mailbox sync, negotiation, contracts, and every non-sponsorship module.

## Implementation decisions

| Area | Decision |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, TanStack Query, React Hook Form + Zod. |
| Backend | FastAPI, Pydantic v2, `httpx`, and a layered route → service → repository design. |
| Data/auth | Hosted Supabase Postgres and Supabase Auth. The browser uses only the anon key; the API verifies the bearer token and uses the service role only on the server. |
| Database access | SQLAlchemy sessions on the Supabase Postgres database, consistently (decided 2026-10-24; supersedes `supabase-py`). supabase-py is used only for token verification. The API performs explicit ownership checks even though RLS is also enabled. |
| Matching | AI research engine (live search + LLM extraction + explainable 100-point score), decided 2026-10-24; supersedes the manual seed catalog. Leads become pipeline prospects via "Add to pipeline" and start `unverified`. |
| Email | Resend is called only by the backend after an organizer has approved the persisted draft. |
| Calls | A single configured Bolna agent. A dedicated adapter owns request/response and webhook normalization. |
| Deployment | Vercel frontend, Render or Railway backend, Supabase for auth/Postgres. |

## Proposed repository layout

```text
frontend/
  src/
    api/ components/ components/ui/ features/ hooks/ layouts/ lib/ pages/ types/
backend/
  app/
    api/routes/ core/ repositories/ schemas/ services/ tests/
  migrations/
  .env.example
README.md
```

Organize frontend screens by feature (`events`, `needs`, `prospects`, `opportunities`, `outreach`, `calls`, `tasks`) while keeping shared primitives in `components/` and `components/ui/`.

## Delivery sequence

### 0. Bootstrap and guardrails

1. Create the Vite and FastAPI applications, formatting/linting/type-check scripts, `.env.example` files, and a root README.
2. Establish API conventions: `/api/v1`, JSON errors shaped as `{"detail": "…"}`, request IDs, CORS restricted to `FRONTEND_ORIGIN`, and health endpoint.
3. Add local Supabase setup instructions, migration application commands, test configuration, and a no-secret committed configuration policy.
4. Add the application shell, protected routes, sign-in/sign-out flow, global loading/error UI, toasts, and disabled `Coming Soon` navigation entries. Disabled entries must have no functional route.

**Exit check:** a signed-out visitor can only access auth pages; a signed-in user sees an empty, responsive sponsorship workspace.

### 1. Database contract and authorization foundation

Create versioned SQL migrations before feature routes. Use UUIDs, `timestamptz`, foreign-key indexes, status/due-date indexes, validation constraints, and an `updated_at` trigger where applicable.

Implement the PRD tables exactly: `events`, `resource_needs`, `prospects`, `opportunities`, `outreach_messages`, `calls`, `offers`, and `follow_up_tasks`.

Add the following required supporting structures:

- `opportunity_status_history`: `opportunity_id`, prior/new status, actor, reason, timestamp. This satisfies the status-history requirement without reconstructing it from unrelated records.
- `webhook_events`: provider, stable event key/fingerprint, call, received time, redacted/safe diagnostic payload, processing state, and error. A uniqueness constraint on `(provider, event_key)` makes retries harmless.
- a persisted call-consent audit field (for example `consent_confirmed_at` and `consent_confirmed_by` on `calls`) so a call initiation is accountable, not merely implied by a button click.
- check constraints for all closed enum sets, non-negative amounts/quantities, sensible event date ranges, the one-prospect-per-event opportunity uniqueness rule, and an offer state transition guard in the service layer.

Enable RLS for every application table. Policies must derive access from either `owner_id` or the parent event/opportunity owner; test RLS directly with two test users. The backend's authentication dependency must verify the supplied Supabase JWT and resolve its user. Every repository entry point then scopes queries to that user or verifies ownership of the parent first. Never accept `owner_id`, `approved_by`, or verification fields from the client.

**Exit check:** two accounts cannot read or mutate each other's event, prospect, opportunity, message, call, offer, or task data through either API or direct Supabase access.

### 2. Event setup, needs, and dashboard

1. Implement event CRUD with date, email, attendee-count, and URL validation.
2. Implement resource-need CRUD with category-specific cash/in-kind presentation. Cash needs require a target amount; in-kind needs can use quantity and/or a stated target value.
3. Implement the dashboard aggregate endpoint and UI:
   - cash target, reviewed accepted cash, and remaining cash gap;
   - open in-kind needs and accepted/fulfilled in-kind support, shown separately;
   - opportunities by status, overdue/open tasks, and recent calls.
4. Do not count `proposed` or `under_review` offers as secured. Count reviewed `accepted` offers only as accepted support and `fulfilled` separately.

**Exit check:** after refresh, a user can create an event and needs and see an accurate zero-to-one dashboard summary.

### 3. Curated discovery and event pipeline

1. Add a small, clearly labeled manually reviewed seed catalog plus manual prospect entry/editing. Every seeded prospect needs a real source URL, verification status, and transparent source notes; never invent sponsor interest or personal contact data.
2. Implement `ProspectMatchingService`. Score and explain industry/category match, audience fit, location relevance, and need keywords. Return a numeric score and a short evidence-based fit reason rather than opaque AI rankings.
3. Build discovery search/filter/table views and prospect detail. Include source link, verification badge, opt-out state, contact details, linked needs, historical activity, offers, and tasks.
4. Create an opportunity from a selected prospect. Enforce the event/prospect uniqueness constraint and initialize it as `prospect_found`.
5. Implement an explicit transition map for pipeline statuses and append each valid change to `opportunity_status_history`:

```text
prospect_found → outreach_approved → contact_attempted → interested
                                             ↘ not_interested / opted_out
interested → proposal_requested → proposal_sent → offer_received → accepted → fulfilled
                                                    ↘ not_interested / opted_out
```

`opted_out` is terminal for outreach and is reachable from every non-terminal status (an opt-out is always honoured). A status change to it also sets the prospect opt-out record; the UI and services then suppress future email/call actions.

Offer disposition is tracked independently: `proposed → under_review → accepted | rejected`, and `accepted → fulfilled` when the promised support has actually been delivered.

**Exit check:** a reviewer can add a sourced prospect, see why it matches an event, add it once to the pipeline, and inspect its complete activity timeline.

### 4. Approval-gated email outreach

1. Generate an editable sponsorship email from verified event and prospect fields only. Use a conservative server-side template first; any AI text generation must be optional and remain an editable draft, never an autonomous send.
2. Persist the draft as `outreach_messages.status = draft` before returning it to the browser.
3. Require a distinct **Approve** action that writes `approved_by` and `approved_at`. Approval changes the opportunity to `outreach_approved` when applicable.
4. The send endpoint locks/claims the approved draft, checks the current opt-out state and valid recipient, calls `ResendEmailService`, and stores the provider message ID, timestamp, final status, and safe error detail. A retry must reuse the persisted message/attempt identifier and never issue an untracked duplicate send.
5. Allow manual inbound responses to be recorded as activity and optionally create a follow-up task; do not imply inbox synchronization.

**Exit check:** an unapproved draft is rejected by the API, not just hidden by the UI; an approved send displays its success/failure state and remains visible in the opportunity history.

### 5. Bolna call initiation and webhook workflow

1. Create a `BolnaAdapter` with narrow methods such as `start_call()` and `normalize_webhook()`. Routes and UI use application DTOs, not provider payload fields.
2. The start-call dialog requires an explicit confirmation that the organizer is authorized to place the call and has the participant's consent. The API validates owner, opt-out state, normalized phone number, configured agent/API key, and the current opportunity status.
3. Persist a local call record plus consent audit before invoking Bolna. Record the provider call ID on success and preserve a useful failure state if the provider request fails.
4. Configure the agent script to identify itself as an AI assistant, state the event purpose, and collect only support type/value, conditions, eligibility, decision process, timing, and next step. It must not promise sponsorship or negotiate binding terms.
5. Configure Bolna's public webhook URL in the agent and secure it with the provider's currently supported mechanism. The current documentation permits configured custom headers; use a secret header for the MVP if a signed-webhook scheme is not offered, and verify the real provider configuration in staging before production. Do not rely on a fixed IP allowlist.
6. The webhook route authenticates before processing, stores a safe event record, has the adapter normalize provider statuses into the application status model, and deduplicates by provider event ID or deterministic payload fingerprint. Processing the same event twice must not create another offer or task.
7. Persist raw-provider references only as needed, with transcript/recording access restricted. Extracted values go in `calls.extracted_fields` and always remain `needs_review`.
8. Build Call Review. The organizer may correct extracted values, confirm the review, create one proposed offer, and create/reschedule one follow-up. The review operation is idempotent so a double-submit cannot duplicate child records.

**Exit check:** using Bolna's test webhook and a consented role-play call, the call status updates once, the review screen shows a flagged potential offer, and the organizer's confirmation produces exactly one persistent offer/task.

### 6. Offers, tasks, and pipeline views

1. Implement offer CRUD with a link to the relevant resource need where known. Preserve unknown amounts as `null`; do not turn uncertainty into a numeric zero.
2. Restrict `accepted` and `fulfilled` transitions to organizer-approved server-side updates. Require an evidence note/URL or explicit verification confirmation before accepting.
3. Implement task CRUD, due dates, filtering, complete/reschedule/cancel actions, overdue state, and a link back to the opportunity.
4. Build a pipeline table first (kanban is optional after the table works) with event/support-type/status filters, accessible status badges, offers, next action, and latest activity.
5. Finish empty, loading, validation, error, and destructive-action confirmation states for every main workflow.

**Exit check:** an accepted cloud-credit offer is visible separately from the remaining cash gap, and an overdue follow-up is clearly actionable.

### 7. Test, security, and release hardening

Automate the following before deployment:

- unit tests for matching explanations, money/date/phone validation, status transitions, opt-out suppression, and dashboard calculations;
- API tests for every ownership boundary, invalid IDs, draft/approval/send gating, and accepted/fulfilled offer authorization;
- adapter tests with recorded, redacted Bolna webhook fixtures, including duplicate and out-of-order updates;
- an integration test with a mocked Resend response that asserts provider IDs and failures are persisted;
- frontend tests for protected routes, form errors, disabled Coming Soon navigation, and consequential-action confirmations;
- a manual end-to-end demo run using a consented participant, labelled as role-play/demo data.

Add structured server logs with request/correlation IDs but redact authorization headers, API keys, full phone numbers, and transcript content. Apply dependency/security checks in CI and verify the deployed CORS policy and environment configuration.

## API implementation order

1. `GET /health`; auth dependency.
2. Events and needs, including `GET /events/{event_id}/dashboard`.
3. Prospects, recommendations, opportunities, and opportunity detail/history.
4. Draft/approve/send email and manual response.
5. Offers and tasks.
6. Call creation, call retrieval/review, then the public Bolna webhook.

This order creates a useful manual workflow before either external integration is connected.

## External integration readiness

Before enabling production outreach, configure these server-only values: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `BOLNA_API_KEY`, `BOLNA_AGENT_ID`, `BOLNA_WEBHOOK_SECRET`, and `FRONTEND_ORIGIN`. The browser receives only `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.

Resend requires a verified sender domain, so its configuration must be completed before live sends. Bolna uses bearer API-key authentication and posts call-status updates to the configured public webhook; its webhooks should be tested from the agent configuration before the demo. See the current [Bolna API authentication documentation](https://www.bolna.ai/docs/api-reference/introduction), [Bolna webhook guide](https://www.bolna.ai/docs/poll-call-data), and [Resend setup documentation](https://resend.com/docs).

## Demo acceptance flow

1. Sign in as the organizer and create a college hackathon with a ₹50,000 cash need.
2. Add a reviewed cloud-provider prospect with a real source URL and create its event opportunity.
3. Draft, edit, approve, and send one sponsorship email.
4. Explicitly confirm a consenting role-play call; initiate it through Bolna.
5. Have the participant offer cloud credits with conditions but no cash.
6. Confirm a single webhook-driven update in Call Review, correct/approve the extraction, create the offer and follow-up.
7. Verify that the dashboard still shows the full cash gap while displaying the reviewed credit offer separately.

## Decisions required before live outreach

1. Select the initial seed prospects and establish who verifies their source/contact records.
2. Approve the standard email copy, sender domain, and organizer identity shown to recipients.
3. Confirm the applicable consent, recording, privacy, and calling rules for the target locations.
4. Select Render or Railway and the production hostname used in the Bolna agent's webhook configuration.
