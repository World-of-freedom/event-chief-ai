| --- | --- |
| `GET /api/v1/voice-preferences` | Return saved preferences or effective defaults. |
| `PUT /api/v1/voice-preferences` | Validate IANA timezone, day set, and non-overnight window; update future queue eligibility. |
| `POST /api/v1/opportunities/{id}/voice-call-queue` | Validate ownership, prospect opt-out, phone and schedule; persist approval/context snapshot/queue item transactionally; return it immediately. |
| `GET /api/v1/voice-call-queue` | Owner-scoped, filterable queue list for settings/activity UI. |
| `GET /api/v1/voice-call-queue/{id}` | Owner-scoped detail with status events and attempts. |
| `POST /api/v1/voice-call-queue/{id}/cancel` | Cancel only unsent/retry-scheduled work; never imply a provider call can be cancelled after it is in progress without a verified provider stop operation. |
| `POST /api/v1/voice-call-queue/{id}/requeue` | Create the next permissible attempt only after the organizer corrects a blocked contact or chooses a retry. |
| `GET /api/v1/calls/{id}/transcript` and `GET /api/v1/calls/{id}/recording` | Enforce ownership and return the transcript or an expiring artifact link. |
| `POST /api/v1/webhooks/bolna` | Verify secret header in constant time, restrict body size, persist/deduplicate event, normalize status, update atomically, and return quickly. Heavy artifact work is delegated to a worker. |

`BolnaClient` will be the concrete implementation of the existing adapter. It owns API URLs, Bearer authentication, timeouts, typed provider DTOs, safe error classification, and the v2 request/response mapping. Routes, models, and UI never use raw Bolna payloads.

### Dispatch and idempotency rules

1. Approval creates the queue item, context snapshot, and initial timeline event in one database transaction.
2. Each scheduler tick selects eligible items with `FOR UPDATE SKIP LOCKED`, evaluates the current organizer-local time, calculates the next permitted window when needed, and writes a short dispatch lease plus a new `Call` attempt before handing its ID to Celery.
3. The worker rechecks ownership-independent safety conditions from its snapshot/current opportunity: active queue state, opt-out, valid phone, within schedule, no another active lease. It then calls Bolna with the saved agent ID, E.164 recipient, configured caller number if required, and the immutable `user_data` context.
4. On a confirmed provider response, persist the provider execution ID and set the item/attempt to provider-queued or initiated. On a known validation failure, block or fail without retry. On a transient failure, schedule a policy-compliant retry with exponential backoff plus jitter.
5. A network timeout is **submission unknown**, not permission to immediately send another call. A reconciliation task searches the provider execution history using the stored `queue_item_id`/request token in `user_data`, then either attaches the discovered call or safely schedules a retry after an explicit absence check.
6. The webhook is idempotent and monotonic: duplicate or older state events are recorded/deduplicated but cannot regress a completed or terminal item. A periodic reconciliation job fetches recent active/stale executions to recover missed webhooks.
7. Terminal provider results write final status, summary, normalized outcomes, artifacts, and event history. An opt-out immediately suppresses current unsent queue items for the same prospect and marks the prospect opted out through the existing business rule.

## 9. Scheduler and retry behavior

Celery Beat runs a small `schedule_eligible_voice_calls` task once per minute. The task does not make network calls itself. It claims only due database rows and enqueues bounded worker tasks. Multiple scheduler/worker replicas are safe because of database leases and `SKIP LOCKED`.

```text
queued / retry_scheduled
  → check organizer preference in ZoneInfo(user_timezone)
  → outside permitted day/window: waiting_for_window + calculated next_eligible_at
  → inside window: dispatching + short lease
  → worker validates and submits
  → provider_queued → in_progress → completed
                    ↘ no answer/busy/transient failure → retry_scheduled
                    ↘ invalid/missing number → blocked_phone
                    ↘ permanent provider failure → failed
```

Only failures classified as temporary or unreachable (busy/no answer) are retry candidates. Invalid numbers, opt-outs, explicit refusal, authorization failures, and permanently rejected provider requests are terminal. Every retry recalculates the next time from the organizer preference, including changed timezone/days/hours. The default retry proposal in Section 3 must be approved before implementation.

Celery task retries are reserved for internal work such as database/storage/network recovery. The visible retry policy is stored on the queue item so deployment/restarts do not alter already-approved call behavior.

## 10. Frontend implementation plan

1. Add typed API clients and React Query hooks for preferences, queue list/detail, approval, cancel/requeue, transcript, and recording.
2. Add the Voice AI preferences form under the account menu and show the effective default state before the user saves anything.
3. Add phone-state badges and an approval dialog to opportunity/pipeline/detail surfaces. Use a clear disabled state for opted-out or impossible contacts; never hide the reason.
4. Add a Voice calls activity page and an opportunity-level compact call card. Status badges map to plain-language labels such as “Waiting for your calling window,” “Calling,” “Needs contact correction,” and “Completed.”
5. Add call detail timeline, reviewed/unreviewed extraction area, transcript viewer, recording player, graceful missing/expired-artifact state, and retry/cancel controls where permitted.
6. Poll only active items; invalidate the relevant opportunity/dashboard data on a visible state change. Ensure all error states distinguish no phone, invalid phone, schedule wait, provider failure, and permission denial.

## 11. Security, privacy, and operational controls

- API keys, Redis URLs, webhook secrets, and provider recording URLs remain server-only. Do not add `VITE_BOLNA_*` values.
- Verify the custom webhook header with `hmac.compare_digest`; log only redacted headers/body metadata. Add request-size limits, JSON validation, rate limiting, and an optional provider-IP WAF rule.
- Enforce opt-outs server-side at approval, scheduling, dispatch, and retry. A frontend state alone is not sufficient.
- Persist consent/authority confirmation and the exact context snapshot used for every approval. Do not assume a public business phone number proves permission to record or use automated outreach.
- Make recordings/transcripts owner-authorized, private at rest, encrypted in transit, and subject to the agreed retention/deletion policy. Give staff access only through a separately approved support/audit process.
- Use structured logs and metrics: queue depth/age, eligible/blocked counts, dispatch success/latency, webhook lag/deduplication, provider failure class, retries, completion rate, and artifact-sync failures. Redact phone numbers and transcript content.
- Install concurrency and rate caps in the dispatcher so one organizer cannot monopolize account-wide Bolna capacity. Start with a conservative global cap and per-organizer cap, then tune from metrics and the Bolna plan limit.

## 12. Test and release plan

### Automated tests

- Phone parsing: E.164 input, missing `+91`, invalid/missing values, and snapshot immutability.
- Preference validation and scheduler: all default days, weekends, non-IST zones, start/end boundaries, changed schedules, DST transitions, and next-window calculation.
- Queue lifecycle: authorization, opt-out suppression, duplicate approval idempotency, cancellation, retry eligibility, terminal errors, old events, and race conditions.
- Worker/adapter: serialized Bolna request shape, timeout/submission-unknown handling, transient/permanent failure mapping, provider ID persistence, and no duplicate external call after redelivery.
- Webhook fixtures: valid custom secret, invalid secret, duplicate events, out-of-order statuses, malformed bodies, transcript/recording metadata, and idempotent update of call/queue state.
- API/RLS tests: one organizer cannot see another's queue, context, transcript, recording, or temporary URL.
- Frontend tests: settings defaults, approval disclosure/instructions, disabled reasons, active polling, accessible status/timeline, and artifact error state.

### Staged rollout

1. **Local/mock:** mocked Bolna client and recorded redacted webhook fixtures; no dialling.
2. **Staging:** real agent, test webhook, authorized test phone numbers, a public HTTPS deployment, and real artifact access checks.
3. **Pilot:** a small organizer allowlist, strict global/per-user concurrency cap, no provider auto-retry, daily operations review, and opt-out audit.
4. **Production:** enable broadly only after pilot success criteria, legal/telephony sign-off, alerting, backup/recovery, and incident runbook approval.

## 13. Implementation sequence

1. Resolve the open configuration and policy inputs below; set up the Bolna staging agent and test webhook.
2. Add settings/Redis/Celery deployment configuration, typed Bolna adapter contract tests, and health/readiness checks — still no calls enabled.
3. Add migrations and RLS for preferences, queue items, call attempts/events, and artifact references.
4. Implement preference/queue APIs, approval context snapshot, and owner authorization.
5. Implement scheduler, worker leases, dispatch/reconciliation, and provider status normalizer behind a feature flag.
6. Implement secure webhook processing and artifact synchronization.
7. Implement settings, approval dialog, activity/detail UI, and polling.
8. Complete automated/staging tests, pilot review, and production enablement.

## 14. Decisions and information needed from the organizer

Please provide or approve the following before implementation starts:

1. A **staging** Bolna API key/agent access path (or confirmation that the existing non-empty values are valid for staging), the agent's published status, and whether a `from_phone_number` must be supplied per call.
2. The public staging/production API hostname for the Bolna webhook and permission to provision managed Redis plus a separate worker/Beat deployment.
3. The chosen Indian/international call regions, caller/recording disclosure, consent and opt-out policy, retention period, and whether the proposed “initial + two retries” policy is acceptable.
4. Approval to store recordings in private object storage with the database retaining protected metadata and references, rather than storing raw audio BLOBs in Postgres.
5. Approval of the recommended system prompt and graph-agent approach, or the wording/brand voice to adjust before configuring the agent.

Once these are confirmed, the plan can be converted into implementation tasks without changing the product decisions above silently.