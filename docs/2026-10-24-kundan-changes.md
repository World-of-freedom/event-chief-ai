# Session changes — 2026-10-24 — Kundan Prasad

Summary of one working session. The base is commit `02ebaf7`; nothing from the session is committed yet.
Out of scope on purpose: email sending (Resend), calls (Bolna), and any other outreach or business decision.

## 1. Environment

- `backend/.venv`: Python 3.12, created with `uv`. LangChain 1.x needs Python ≥ 3.10, and the system Python is 3.9.
- Run the backend with `uvicorn app.main:app --reload` and the frontend with `npm run dev`. Run tests with `pytest` from `backend/`.

## 2. Decisions

| Topic              | Decision                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Data access        | SQLAlchemy everywhere; supabase-py only verifies tokens (replaces the plan's supabase-py choice).                  |
| Sponsor finding    | Keep the AI research engine and drop the plan's manual seed catalog.                                               |
| Leads → pipeline   | "Add to pipeline" creates a prospect (or reuses one with the same domain or name) plus an opportunity.             |
| Discovery ↔ events | A research run can optionally be linked to a saved event (`event_id` is checked for ownership).                    |
| AI/Hunter contacts | Imported prospects start `unverified` until the organizer reviews them.                                            |
| Opt-out            | Allowed from any active status; it closes all of the prospect's opportunities and can't be undone through the API. |
| UI kit             | shadcn/ui (Radix base, "nova" preset). Components are added only with the shadcn CLI.                              |
| Run URLs           | `/discovery/<name-slug>-<public_id>`, using a 10-character Nano ID–style ID.                                       |

## 3. Database

- Migration `20261024_03`: adds `research_jobs.public_id`, unique, and gives existing rows an ID. **Applied** to Supabase.
- No other schema changes; the core tables already existed from `20261020_01`.
- `lead_outreach` is unused and still in the database. Dropping it needs approval.

## 4. Backend

- **New endpoints** (all owner-scoped; another user's IDs return 404):
    - Events: CRUD, plus `GET /events/{id}/dashboard`.
    - Needs: CRUD under `/events/{id}/needs` and `/events/needs/{id}`.
    - Prospects: list, create, get and patch.
    - Opportunities:
        - `GET /opportunities` (filter by event, status or search) and `GET` / `PATCH /opportunities/{id}`.
        - Create from an existing prospect, `/with-prospect` (manual entry) or `/from-lead`.
    - Offers: list, create and patch.
    - Tasks: `GET /tasks` (filter by event, status or overdue), create and patch.
    - Research: `GET /research-jobs/by-public-id/{id}`.
- **Rules** (pure functions, unit-tested):
    - `services/pipeline.py`:
        - Opportunity statuses follow the plan's map, and every change is logged to `opportunity_status_history`.
        - Offers: `proposed → under_review → accepted|rejected → fulfilled`. Accepting needs an evidence note, a URL or explicit verification. Settled offers' terms are locked.
        - Tasks can be completed, canceled and reopened.
    - `services/dashboard.py`: only accepted and fulfilled offers count as secured. Cash and in-kind are reported separately. Unknown or non-INR amounts are counted, not summed.
- **Validation:** event dates in order, attendees 1–1,000,000, URLs and emails checked. Cash needs require an amount above 0. Phone numbers are normalized to E.164.
- **Removed:** the stub repository and discovery service, `dependencies.py`, `schemas/domain.py`, and the stub `prospect-recommendations` route.
- **Tests:** 12 → 33.
    - `test_pipeline_rules.py`: unit tests for the rules above.
    - `test_sponsorship_api.py`: the full flow, two-user ownership checks and lead import, against the real database with cleanup.
    - Database tests are marked `integration` and are skipped when no database URL is set (CI).
- **CI and Docker:** `pytest.ini` sets `pythonpath`, so plain `pytest` works. The Dockerfile now copies `alembic/` instead of the missing `migrations/` folder.

## 5. Frontend

- **shadcn migration:**
    - All pages are rebuilt with shadcn components.
    - The roughly 1,150 lines of hand-written CSS are replaced by shadcn tokens with the original green and dark palettes, plus success, warning and info colors.
    - Geist font.
- **New pages:**
    - Events: table, create, edit and delete.
    - Resource needs: cash and in-kind tables.
    - Dashboard: picks an event; shows cash gap, in-kind support, pipeline counts, follow-ups and recent calls.
    - Pipeline: filters, and manual "Add prospect".
    - Opportunity detail:
        - Status moves with history.
        - Prospect editing and opt-out.
        - Offers, including an evidence-gated accept step.
        - Follow-ups.
        - Next step and notes.
    - Follow-ups: open, overdue, completed and canceled views; complete, reschedule, cancel or reopen.
- **Discovery:** "Add to pipeline" on lead cards and the lead page; an optional saved-event link (with pre-fill) on the new-run form; venue name, sponsorship tiers and notes inputs; nano ID run URLs; a flicker fix.
- **App-wide:**
    - TanStack Query, plus React Hook Form + Zod forms (`@hookform/resolvers` 5.2.2).
    - Sonner toasts and an error boundary.
    - The query cache is cleared on sign-out.
    - The selected event is remembered and can be linked with `?event=`.
    - API validation errors are shown as readable text.
- **Small fixes:**
    - CSV export no longer gets cut short at a `#`.
    - Filter labels now match what the filters do.
    - "Back" returns to the research run.
    - Clipboard errors are handled.
    - Distances that are null or missing no longer show as "undefined km".
    - Accessible labels, a favicon, and sentence-case copy.
- **Removed:** `lib/api.ts`, `discovery-fixtures.ts`, `StatusBadge.tsx`, and unused types.

## 6. Docs

- `IMPLEMENTATION_PLAN.md` moved to `docs/`, with the decisions above folded in.
- The README "Current state", "Layout" and "Remaining work" sections were rewritten.

## 7. Still open

1. Email draft → approve → send (Resend): needs a sender domain, email copy and organizer identity.
2. Bolna calls and webhook: need an agent script, consent and recording rules, and staging access.
3. Hosting (Render or Railway) and production URLs.
4. Lead counts on the research run cards still show 0.
5. Decide whether to drop the unused `lead_outreach` table.
