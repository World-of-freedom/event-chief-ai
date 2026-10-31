# MVP plan: Bolna Voice AI background worker

**Status:** implemented MVP plan. The code, migration, worker, API/webhook changes, and small UI described here are in this repository; no real Bolna calls were made.  
**Scope:** organizer-approved sponsorship-call queue and its standalone worker using the current FastAPI/Supabase codebase.

## 1. MVP architecture

```text
React app → existing FastAPI API → Supabase PostgreSQL
                                      ↑          ↓
                            existing webhook   standalone Python worker
                                                    ↓
                                                 Bolna API
```

- Supabase PostgreSQL is the durable queue and source of truth.
- A long-running Python process in this repository polls and claims due work.
- The existing FastAPI service creates/returns queue records and handles Bolna webhooks.
- Bolna starts and runs calls; its execution ID and outcomes are persisted locally.
- Supabase Storage is used only if the Bolna integration fetches/copies recordings; otherwise the initial MVP can persist recording metadata/URL already supplied by Bolna.

No Redis, Celery, RabbitMQ, Kafka, task framework, or separate queue service will be added.

## 2. What the existing project already provides

| Existing code | Reuse / change |
| --- | --- |
| `backend/app/core/settings.py` | Reuse `DATABASE_URL`, `BOLNA_API_KEY`, `BOLNA_AGENT_ID`, and `BOLNA_WEBHOOK_SECRET`; add only the three worker settings requested below. |
| `backend/app/core/database.py` and SQLAlchemy/Alembic setup | Reuse sessions, model conventions, and migration workflow for queue claiming and new fields/tables. |
| `backend/app/models/outreach.py` | Reuse `Call` as the durable approved-call queue item and `WebhookEvent` for webhook de-duplication. Add queue/lease/retry/context fields to `Call`, plus one small table for individual attempts. |
| `backend/app/models/enums.py` | Extend the existing `CallStatus` values instead of creating a parallel status system. |
| `backend/app/schemas/sponsorship.py` | Extend the current call DTOs with approval/queue/preference models. |
| `backend/app/services/bolna.py` | Reuse the existing `BolnaAdapter` boundary; add one concrete `BolnaClient` and webhook normalization there. |
| `backend/app/api/routes/outreach.py` | Replace the existing call stubs with approval, call lookup, cancellation, and review routes. Keep email code untouched. |
| `backend/app/api/routes/webhooks.py` | Replace the Bolna webhook stub; it stores/deduplicates updates and changes local state. It does not run the worker. |
| Existing phone helper | Reuse `normalize_phone()` in `schemas/sponsorship.py`. It already defaults phone parsing to India when no country code is supplied, producing E.164 `+91…` values. |
| FastAPI `BackgroundTasks` used by research | Do not reuse for calls. It is tied to an API process and is not a durable/restart-safe queue. |

There is currently no organizer voice-preference data, no durable claim/lease fields, no call-attempt model, no worker module, and no implemented Bolna client/webhook. Those are the only new pieces needed for this MVP.

## 3. Data model changes

Keep the queue simple by treating the existing `calls` table as the queue-item table: one `Call` is one organizer-approved sponsor outreach request. A new `CallAttempt` records each actual provider submission. This avoids creating a duplicate “job” model alongside the existing call model.

### 3.1 Extend `Call`

Add the minimum fields needed to queue and recover work:

- `instructions`: optional organizer instructions shown in the approval dialog.
- `context_snapshot`: JSON event/sponsor/organizer context saved when approved and sent to Bolna later.
- `next_attempt_at`: UTC time at which the worker may consider the item.
- `lease_expires_at`: short worker lease; `NULL` when unclaimed.
- `attempt_count`: number of provider submissions already started.
- `max_attempts`: snapshot of `WORKER_MAX_ATTEMPTS` at approval.
- `last_error`: short actionable error text.
- `cancelled_at`: records cancellation before a call is submitted.

Extend `CallStatus` only as needed: `queued`, `processing`, `initiated`, `in_progress`, `retry_scheduled`, `completed`, `failed`, `no_answer`, `blocked`, `submission_unknown`, and `cancelled`.

Existing fields remain useful: `opportunity_id`, `bolna_call_id` (latest/primary provider execution ID), approval and consent audit fields, timestamps, summary, transcript, recording URL, extracted fields, and review status.

### 3.2 Add `call_attempts`

This small table preserves the history needed for retries without overloading a single `Call` row:

| Field | Purpose |
| --- | --- |
| `id`, `call_id`, `attempt_number` | Identify the local attempt; unique `(call_id, attempt_number)`. |
| `status` | `claimed`, `submitting`, `submitted`, `in_progress`, `completed`, `failed`, or `submission_unknown`. |
| `bolna_call_id` | Provider execution/call ID once known; unique when present. |
| `request_token` | Stable internal token passed in `user_data` so ambiguous submissions can be reconciled. |
| `lease_expires_at`, `submitted_at`, `started_at`, `ended_at` | Claim, timing, and recovery information. |
| `error_message` | Safe provider/network failure detail. |

### 3.3 Add `voice_call_preferences`

One row per organizer (`user_id`), containing:

- `calling_window_start`, `calling_window_end` (`time`)
- `allowed_weekdays` (small JSON/array of ISO weekday numbers)
- `timezone` (IANA identifier)
- timestamps

When no row exists, worker/API use the requested defaults: 09:00–22:00, every day, `Asia/Kolkata`. The first version accepts only same-day windows (`end > start`).

### 3.4 Webhook records and migration

Reuse `WebhookEvent`. Add/derive a stable event key from Bolna's execution ID, status, provider timestamp, and payload digest when a provider event ID is absent. Its existing uniqueness constraint makes duplicate webhook delivery harmless.

Create one forward-only Alembic migration to add the two tables/columns, indexes for `calls(status, next_attempt_at)`, `calls(lease_expires_at)`, and attempt lookups, plus the normal project ownership/RLS treatment. No unrelated tables or migrations change.

## 4. Approval and queue API flow

Use the existing `POST /api/v1/opportunities/{opportunity_id}/calls` stub as the approval endpoint rather than inventing a separate workflow.

1. The frontend shows “Approve voice call” only for a non-opted-out sponsor. It explains that event context is shared with the agent and accepts optional instructions.
2. The endpoint verifies organizer ownership, current opt-out state, phone availability/validity, and explicit authorization/consent confirmation.
3. It normalizes/snapshots the phone number. A number without a country code is parsed with India as the default region. Missing/invalid numbers create no provider call; the request gets an understandable blocked state.
4. It builds a small immutable `context_snapshot`: event name/dates/location/audience/needs, organizer name/contact, sponsor/contact name, and optional instructions. It excludes unrelated private notes.
5. It inserts the `Call` row as `queued`, with `next_attempt_at = now`, zero attempts, configured max attempts, approval/consent audit values, and the snapshot; then returns immediately.
6. The worker performs all later provider communication asynchronously.

Add only the companion endpoints needed by the UI:

- `GET /api/v1/calls/{call_id}` — existing stub becomes owner-scoped status/detail lookup, including attempts.
- `POST /api/v1/calls/{call_id}/cancel` — cancel only before a provider submission; active/in-progress calls show their real state instead of pretending they were cancelled.
- `GET`/`PUT /api/v1/voice-preferences` — return/save the calling time, days, and timezone.
- Retain `POST /api/v1/calls/{call_id}/review` for the existing post-call review flow; extend it only after core queue/status behavior works.

## 5. Standalone worker design

Create `backend/app/workers/bolna_worker.py`. It imports the existing settings, database session factory, models, and new Bolna client. It is run as a separate process from the same codebase:

```bash
cd /home/sumit-ghosh/Development/hackathon/bolna_ai/backend
python -m app.workers.bolna_worker
```

The worker handles `SIGINT` and `SIGTERM`: stop claiming new work, finish the current short operation if possible, release only work that was not submitted, and exit cleanly. A simple worker status log at startup and periodic alive log is sufficient for this MVP.

### 5.1 Polling cycle

Each loop follows this sequence:

1. Recover expired leases.
2. Claim a small batch of eligible `Call` rows.
3. Process each claimed row outside the claim transaction.
4. Sleep for `WORKER_POLL_INTERVAL` seconds, unless shutdown was requested.

### 5.2 Expired lease recovery

For rows with `status = processing` and `lease_expires_at < now`:

- If no provider submission began, clear the lease and return the row to `queued`.
- If provider submission was in progress, leave it in `submission_unknown` for manual review. Never retry it blindly.

This makes worker restart/crash recovery safe without another service.

### 5.3 Atomic claim

In a short database transaction, select only `queued` or `retry_scheduled` calls with `next_attempt_at <= now`:

```sql
SELECT ...
FROM calls
WHERE status IN ('queued', 'retry_scheduled')
  AND next_attempt_at <= now()
ORDER BY next_attempt_at
FOR UPDATE SKIP LOCKED
LIMIT :batch_size;
```

For every selected row, the worker:

- loads the opportunity/event owner and that owner's effective voice preferences;
- converts `now` to the organizer's configured timezone;
- if outside the selected weekday/window, calculates the next permitted UTC timestamp and commits it without claiming;
- otherwise confirms approval, consent, opt-out, cancellation, phone validity, and retry limit;
- sets `status = processing` and `lease_expires_at = now + WORKER_LEASE_SECONDS`;
- creates the next `CallAttempt` with a stable request token;
- commits before any HTTP request.

`FOR UPDATE SKIP LOCKED` means multiple worker instances can run without claiming the same call. No PostgreSQL lock remains open during an HTTP request.

### 5.4 Processing a claimed attempt

The worker re-reads the claimed row and confirms its own unexpired lease before submitting. It calls the concrete Bolna client with:

```json
{
  "agent_id": "configured BOLNA_AGENT_ID",
  "recipient_phone_number": "+91...",
  "user_data": {
    "request_token": "stable attempt token",
    "call_id": "local queue item id",
    "event_name": "...",
    "event_details": "...",
    "organizer_name": "...",
    "sponsor_name": "...",
    "organizer_instructions": "..."
  }
}
```

The precise current Bolna request/response fields are kept inside `BolnaClient`, not route or worker code. Bolna's current documentation supports Bearer API authentication, a call endpoint, per-call `user_data`, and call lifecycle webhooks. [Bolna API documentation](https://www.bolna.ai/docs/api-reference/introduction) and [webhook documentation](https://www.bolna.ai/docs/post-call/polling-call-status-webhooks)

After an unambiguous success, a short transaction stores the Bolna execution ID on the attempt and `Call`, changes the attempt to `submitted`, clears the lease, and changes the call to `initiated`. Bolna webhooks then own the normal `in_progress`/terminal transitions.

## 6. Failure, retry, cancellation, and reconciliation behavior

| Situation | Worker/local behavior |
| --- | --- |
| Invalid/missing phone, missing approval/consent, opted-out sponsor | Set call to `blocked` or `cancelled`; do not call Bolna. |
| Known permanent Bolna validation error | Mark attempt/call `failed`; save the error; no retry. |
| Timeout, connection failure, or response lost after submission may have reached Bolna | Mark attempt/call `submission_unknown`; do not retry. Reconcile using the saved request token/call ID in `user_data` or flag for manual review if Bolna cannot confirm. |
| Rate limit or clearly transient pre-submission error | Mark the attempt failed, schedule the call as `retry_scheduled` if attempts remain, and clear the lease. |
| Busy/no answer from webhook | Schedule another attempt only if attempts remain; otherwise leave terminal `no_answer`. |
| Call completed | Webhook sets `completed` and saves summary/transcript/recording metadata; no worker retry. |
| User cancels before submission | Set `cancelled`; claimed workers re-check status and do nothing. |
| Worker crashes | Lease expiry returns not-submitted work to the queue; known/ambiguous submission is reconciled rather than redialled. |

Use bounded exponential backoff for retryable errors: start at 5 minutes, then 15 minutes, then 60 minutes, but always move the calculated time to the next allowed organizer calling window. The call's `max_attempts` is saved when approved so later config changes do not alter work already queued.

## 7. Bolna client and webhook changes

### 7.1 `BolnaClient`

Implement the existing `BolnaAdapter` protocol in `backend/app/services/bolna.py` with only these methods:

- `start_call(...)` — POST a single outbound call, use the server-only key, a finite timeout, and return the provider execution ID.
- `get_call_details(...)` — an optional provider-detail lookup for a future manual reconciliation screen. The MVP marks ambiguous submission outcomes for review rather than guessing.
- `normalize_webhook(...)` — maps provider payloads to local call status, summary, transcript, recording reference, and extracted fields.

The client classifies provider errors into permanent, retryable, and ambiguous. It must not expose raw HTTP details outside service/worker logs.

### 7.2 Webhook route

Implement the existing `POST /api/v1/webhooks/bolna` stub, keeping it small:

1. Verify `BOLNA_WEBHOOK_SECRET` in the configured custom header.
2. Persist a `WebhookEvent` using the stable event key; return success for a duplicate.
3. Locate `CallAttempt` by provider execution ID, then its parent `Call`.
4. Normalize and persist provider state, summary, transcript, recording metadata, and extraction fields.
5. Update the parent call only if the incoming event is not older than its current known terminal state.
6. Return promptly. It does not poll, start calls, or redo worker retry logic.

This preserves a clean split: worker submits/reconciles jobs; webhook processes provider events.

## 8. Configuration

Add these fields to the existing `Settings` class and `backend/.env.example`:

```dotenv
# Existing values are reused
DATABASE_URL=postgresql+psycopg://...
BOLNA_API_KEY=server-only-bolna-key
BOLNA_AGENT_ID=agent-id
# Optional explicit caller ID when the Bolna agent does not select one itself
BOLNA_FROM_PHONE_NUMBER=+919876543210
BOLNA_WEBHOOK_SECRET=long-random-secret

# New worker values
WORKER_POLL_INTERVAL=10
WORKER_LEASE_SECONDS=120
WORKER_MAX_ATTEMPTS=3
```

All values are read from environment/configuration. Nothing is hardcoded. `DATABASE_URL` already has an equivalent `SUPABASE_CONNECTION_STRING` alias in the current settings; the worker will reuse the same database configuration as the API.

## 9. Minimal UI changes

Only add the UI needed to use and observe this worker:

1. On an opportunity, add an **Approve voice call** dialog with consent confirmation and optional instructions.
2. Display a concise voice-call status card: queued/waiting, initiating, in progress, completed, retry scheduled, blocked, failed, no answer, or cancelled.
3. Add Voice AI preferences to the account/settings menu with default hours, days, and timezone.
4. On a completed call, show existing stored transcript/recording fields when available.

No separate dashboards, real-time infrastructure, campaigns, or broad UI refactor are needed for this task.

## 10. Logging and basic status

Use the project's normal Python logging. Every worker message includes `call_id` and, when created, `attempt_id`.

- Startup, loaded configuration (without secrets), and graceful shutdown.
- Number of due calls, claimed calls, waiting-for-window calls, and expired leases recovered.
- Bolna submission start, success with provider ID, failure classification, retry time, and reconciliation result.
- Webhook completion/failure updates and unexpected errors.

Add a lightweight `worker_heartbeat_at` log/metric or a `GET /health/worker` database-backed status only if it fits the current health route style. The worker remains observable without a monitoring platform.

## 11. Tests

Tests remain focused on worker behavior and use a mocked `BolnaAdapter`; they never dial a real number.

| Test area | Coverage |
| --- | --- |
| Claiming | Two workers using `SKIP LOCKED` process a call once; no long transaction spans the mocked HTTP request. |
| Calling window | Default IST and saved timezone/days/hours defer a job until its next permitted UTC time. |
| Successful call | Worker creates one attempt, sends expected context, saves Bolna ID, and marks call initiated. |
| Provider failures | Permanent errors stop; rate limit/network pre-submission errors back off within the attempt limit. |
| Ambiguous submission | Timeout after possible submission becomes `submission_unknown`; it is reconciled or remains reviewable, never redialled blindly. |
| Lease recovery | An expired not-submitted claim returns to queue; a known/unknown submission is reconciled safely. |
| Webhooks | Duplicate/out-of-order webhook data is idempotent and does not duplicate attempts or regress final state. |
| Cancellation and consent | Cancelled, unapproved, non-consented, opted-out, and invalid-contact calls do not reach the Bolna client. |

## 12. Incremental implementation order

1. Add models/enums, one Alembic migration, preference defaults, and schema DTOs.
2. Implement `BolnaClient` with unit tests and keep the current adapter boundary.
3. Implement the small FastAPI approval/preference/call-status endpoints.
4. Implement webhook de-duplication and local status update.
5. Implement the standalone polling worker, claims, leases, retries, and reconciliation.
6. Add the minimal approval/status/preferences UI.
7. Add the worker tests and local instructions below.

## 13. Running locally and as a separate process

After the API database migration has been applied and environment values are configured:

```bash
cd /home/sumit-ghosh/Development/hackathon/bolna_ai/backend
python -m app.workers.bolna_worker
```

Run this alongside the existing FastAPI server, not inside it. For deployment, build the existing backend image/code once and run a second process with the same environment and the worker command above. The API process remains the web/webhook service; the worker process is the only component that starts queued Bolna calls.

## 14. Explicit non-goals for this MVP

- No Celery, Redis, or external queue/broker.
- No unrelated refactoring of discovery, email, pipeline, or authentication code.
- No campaign/batch feature, dashboard, analytics system, or real-time push layer.
- No real sponsor calls, deployment, or Bolna account modifications without separate authorization.
