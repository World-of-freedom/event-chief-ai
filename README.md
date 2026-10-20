# Event Chief AI

This repository is a modular, production-oriented boilerplate for the Event Chief AI sponsorship MVP. It provides typed contracts, route scaffolding, a responsive React shell, and an explicit Alembic-managed PostgreSQL schema. It deliberately does **not** implement sponsorship business logic, live discovery, messaging, or calling workflows.

## Current state

- `GET /health` is available and reports `mode: boilerplate`.
- Supabase email/password authentication is implemented in the React shell. Every workspace route redirects to `/auth` until a session is present.
- `/api/v1` declares feature routes as safe `501 Not Implemented` extension points.
- The React UI includes every planned sponsorship screen as a template route.
- Sponsor Discovery is intentionally local-fixture-only. It performs no web crawling, enrichment, contact generation, ranking, outreach, or persistence.
- `backend/alembic/versions/20261020_01_initial_sponsorship_schema.py` is the first reviewed schema revision. API startup never runs it.
- The initial schema defines event, sponsorship, outreach, call, offer, task, and webhook-audit tables; foreign keys to `auth.users`; indexes; timestamp triggers; and row-level security policies.

## Layout

```text
frontend/                  # Vite + React + TypeScript UI shell
  src/lib/discovery-fixtures.ts  # discovery template data; replace with reviewed API client
  src/pages/               # route-level templates
  src/components/          # reusable presentational components
backend/
  app/api/routes/          # HTTP route shapes; all feature handlers are stubs
  app/models/              # SQLAlchemy schema contract for Alembic autogeneration
  app/schemas/             # modular Pydantic DTOs
  app/repositories/        # persistence protocols and fail-closed stub
  app/services/            # workflow/provider contracts and TODOs
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

Run tests with `pytest` from `backend/`. The API is available at `http://localhost:8000`, and `/docs` shows every extension route.

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

## Implementation handoff order

1. Implement `SponsorshipRepository` with the session dependency in `app.core.database`; keep ownership checks server-side even when RLS is enabled.
2. Run the first Alembic revision in a disposable Supabase project and add two-user authorization/RLS tests.
3. Replace `discovery-fixtures.ts` with an authenticated, reviewed prospect query. Document source provenance and use explainable matching only.
4. Implement event/need services and dashboard aggregates.
5. Add approval-gated email drafts and a Resend adapter, including a persisted idempotency strategy.
6. Implement the Bolna adapter after validating the active provider contract in staging. Keep webhook verification, payload normalization, and de-duplication inside that adapter boundary.
7. Implement offer/task workflows with tested status transitions, evidence policy, and audit history.

## Safety boundaries to preserve

- Never put Supabase service-role, Bolna, Resend, or database credentials in the frontend.
- Require authenticated ownership checks for all non-public API routes.
- Require explicit organizer approval before every email and call.
- Treat provider payloads, transcripts, and AI extractions as untrusted until an organizer reviews them.
- Keep opt-outs and consent as server-enforced rules, not client-only UI state.
