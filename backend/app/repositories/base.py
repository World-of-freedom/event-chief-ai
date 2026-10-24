"""Shared repository conventions.

Data access uses SQLAlchemy sessions (`app.core.database.get_db_session`) everywhere,
the same strategy as the research pipeline and Alembic. Do not mix in supabase-py
table queries; supabase-py is only used for verifying auth tokens.

Every lookup is scoped to the signed-in owner. Rows owned by someone else are treated
exactly like missing rows (404), so IDs from other accounts reveal nothing.
"""
