# Event Chief AI

This repository is a modular Event Chief AI sponsorship MVP with a typed FastAPI API, React workspace, and explicit Alembic-managed PostgreSQL schema.

## Current state

- Supabase email/password authentication; every workspace route redirects to `/auth` until signed in.
- **Working end to end** (owner-scoped API + UI): events with in-context resource requirements, optional sub-events,
  parent dashboards, sponsor pipeline (prospects, scoped opportunities, status history), offers, and event or opportunity tasks.
- **Sponsor discovery** runs the AI research engine (Tavily, Google Places, Hunter, LLM). A run can be linked to a
  saved event, and any lead can be added to an event's pipeline ("Add to pipeline").
- **Email workflow:** organizers create a persisted draft, explicitly approve it (with an audit record), then send it through
  Resend only when server-side configuration is present. Manual interactions and optional follow-up tasks are recorded.
- **Voice workflow:** organizers explicitly approve a sponsor call, then a separate Postgres-backed worker submits it to
  Bolna only during the organizer's permitted calling window. Attempts, retries, provider outcomes, and webhook events
  are recorded in the existing sponsorship workflow.

### Rules the code enforces

- **Data access:** SQLAlchemy sessions everywhere (`app.core.database`); supabase-py is only used to verify tokens.
- **Ownership:** every endpoint is scoped to the signed-in user; another user's IDs return `404`.
- **Pipeline statuses:** `backend/app/services/pipeline.py` implements the plan's transition map exactly, plus one
  addition: `opted_out` is reachable from every active status. Every change is written to `opportunity_status_history`.
- **Opt-out:** marking a prospect opted out closes all its opportunities as `opted_out` and cannot be undone via the API.
- **Offers:** always created as `proposed`; `proposed → under_review → accepted | rejected`, `accepted → fulfilled`.
  Accepting requires an evidence note, an evidence URL or explicit verification. Settled offers' terms are locked.
- **Dashboard:** only `accepted`/`fulfilled` offers count as secured; cash and in-kind are separate; unknown amounts
  and non-INR amounts are counted, never summed.
- **AI leads:** imported prospects start `unverified`, including Hunter-found emails, until the organizer reviews them.
- **Scopes:** requirements, discovery jobs, opportunities and tasks can be event-level or tied to a sub-event. A prospect is
  reused across scopes; event-level and child-level opportunities remain independently staged and auditable.
- **Administration:** `/admin` is server-enforced. Bootstrap the first administrator with the server-only
  `PLATFORM_ADMIN_EMAILS` allowlist, then grant or revoke other administrator roles in the app.

## Layout

```text
docs/
  IMPLEMENTATION_PLAN.md   # MVP plan (with the 2026-10-24 decisions folded in)
  2026-10-24-kundan-prasad-session-changes.md  # changes from the 2026-10-24 session
frontend/                  # Vite + React + TypeScript, shadcn/ui (added via the shadcn CLI)
  src/components/ui/       # shadcn components (CLI-generated)
  src/features/            # feature dialogs/forms (events, needs, pipeline, tasks)
  src/pages/               # route-level pages
  src/lib/api/             # typed API clients
backend/
  app/api/routes/          # owner-scoped HTTP routes and Bolna webhook handler
  app/models/              # SQLAlchemy models (Alembic source of truth)
  app/schemas/             # Pydantic request/response models with validation
  app/repositories/        # owner-scoped loaders
  app/services/            # pipeline rules, dashboard maths, lead import, research engine
  alembic/                 # committed, ordered schema revisions
  alembic.ini              # Alembic configuration
  Makefile                 # explicit database migration commands
```

## Local development

### Frontend

```bash
cd frontend
# Copy .env.example only if frontend/.env does not exist yet.
npm install
npm run dev
```

#### Configure Supabase Auth

1. Create a Supabase project and enable the Email provider in **Authentication → Providers**.
2. Copy the project URL and **publishable** key from the Supabase Connect dialog into `frontend/.env`:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   `VITE_SUPABASE_KEY` and the legacy `VITE_SUPABASE_ANON_KEY` are supported as fallbacks. Never use a service-role key or database connection string in the browser.
3. In **Authentication → URL Configuration**, set the local Site URL to `http://localhost:5173` and add these redirect URLs:

   ```text
   http://localhost:5173/auth
   http://localhost:5173/auth/update-password
   ```

   Add the equivalent deployed URLs before production.
4. Restart `npm run dev`. You can now create an account, confirm email when enabled, sign in, sign out, and reset/update a password. Theme selection persists in local storage.

### Backend

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
# Copy .env.example only if backend/.env does not exist yet.
uvicorn app.main:app --reload
```

Run tests with `pytest` from `backend/`. Tests marked `integration` use the configured database (and clean up after themselves); they are skipped automatically when no database URL is set, e.g. in CI. The API is available at `http://localhost:8000`, and `/docs` shows every extension route.

### Bolna voice worker

After configuring `DATABASE_URL`, `BOLNA_API_KEY`, `BOLNA_AGENT_ID`, `BOLNA_WEBHOOK_SECRET`, and (when needed) `BOLNA_FROM_PHONE_NUMBER` in `backend/.env`, apply the migration and start the worker in a second terminal:

```bash
cd /home/sumit-ghosh/Development/hackathon/bolna_ai/backend
make db-upgrade
make worker
```

The API remains the webhook/API process; `make worker` is the separate persistent process that submits queued calls. In a hosted setup, run the same backend image with `python -m app.workers.bolna_worker` as a second process and the same environment variables. Do not start it until the Bolna agent and webhook URL are configured.

When a queue item is processed, the worker terminal prints lifecycle logs such as `voice_call_queue_picked`, `voice_call_initiating`, and `voice_call_initiated`, including the organizer, event, sponsor, and call/attempt IDs. It deliberately never prints phone numbers, recordings, or transcripts. Later in-progress and completion updates arrive through the FastAPI webhook process, so those appear in the API server logs and in the call detail screen.

## Database schema and migrations

Database changes are deliberate, reviewed migrations. Starting `uvicorn`, running tests, or importing the API **does not** create, alter, or delete Supabase tables.

The backend needs a separate, server-only database connection string in addition to the Supabase URL and service-role key already used for authentication. In Supabase Dashboard, select **Connect** and copy the **Direct connection** string for migrations. Supabase identifies direct connections as the appropriate option for migrations and other native database operations. If your environment only supports IPv4, use the Session pooler connection string instead. [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)

Add the connection string only to `backend/.env` (never `frontend/.env`). The project supports your Supabase-provided `SUPABASE_CONNECTION_STRING` name directly; `DATABASE_URL` is an equivalent generic name. Set one, not both:

```dotenv
# This must be the HTTPS project URL, never a postgresql:// URL.
SUPABASE_URL=https://your-project.supabase.co
# Keep this server-only. Do not commit backend/.env.
# Alembic accepts either postgresql://... or postgresql+psycopg://...
SUPABASE_CONNECTION_STRING=postgresql+psycopg://postgres:your-password@db.project-ref.supabase.co:5432/postgres?sslmode=require
# DATABASE_URL=postgresql+psycopg://postgres:your-password@db.project-ref.supabase.co:5432/postgres?sslmode=require
```

If the database password contains `@`, `:`, `/`, `?`, `#`, or a space, percent-encode those characters in the URL. `SUPABASE_DB_PASSWORD` is deliberately not read separately; the complete encoded password must be in the connection string. Do not use a Supabase publishable/anon key or the service-role key as a database URL.

### Create the first tables

From a developer machine with `SUPABASE_CONNECTION_STRING` or `DATABASE_URL` configured:

```bash
cd /home/sumit-ghosh/Development/hackathon/bolna_ai/backend
python3 -m venv .venv              # only the first time
. .venv/bin/activate
pip install -r requirements.txt

# Safe inspection: does not change the database.
make db-history
make db-sql

# The one explicit command that creates or updates the schema.
make db-upgrade

# Confirm that Supabase is now at the first revision.
make db-current
```

`make db-upgrade` applies `20261020_01` and creates the initial tables. It is safe to run on a database already at that revision because Alembic records applied revisions in `alembic_version`. Do not run this command automatically from application startup or CI test setup.

The migration enables RLS for public application tables. Browser access is limited to the signed-in owner's rows, while `webhook_events` has no browser policy and is reserved for the server-side integration. Supabase recommends enabling RLS on exposed tables and explicitly scoping policies to roles and operations. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)

### Team workflow for future schema changes

1. Change the SQLAlchemy model contract in `backend/app/models/`.
2. Create a candidate migration: `make db-revision message='add sponsor fields'`.
3. Review the generated file in `backend/alembic/versions/`; test it against a disposable/staging Supabase database; add or update RLS tests before merge.
4. Commit both the model and migration. Apply the same reviewed revision through `make db-upgrade` in each environment.

Never edit a migration that has been applied to a shared environment. Add a new revision to correct it. `make db-downgrade` is intended for a disposable development database only; do not use it as a production rollback plan without a reviewed data-restoration strategy.

## Remaining work

1. Verify the exact Bolna agent payload/webhook contract in staging before enabling real calls.
2. Hosting choice (Render or Railway) and production URLs.

## Safety boundaries to preserve

- Never put Supabase service-role, Bolna, Resend, or database credentials in the frontend.
- Require authenticated ownership checks for all non-public API routes.
- Require explicit organizer approval before every email and call.
- Treat provider payloads, transcripts, and AI extractions as untrusted until an organizer reviews them.
- Keep opt-outs and consent as server-enforced rules, not client-only UI state.
