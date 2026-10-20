.PHONY: db-current db-upgrade db-downgrade db-revision db-history db-sql test

db-current:
	alembic -c alembic.ini current

db-upgrade:
	alembic -c alembic.ini upgrade head

db-downgrade:
	alembic -c alembic.ini downgrade -1

db-revision:
	@test -n "$(message)" || (echo "Use: make db-revision message='describe change'" && exit 1)
	alembic -c alembic.ini revision --autogenerate -m "$(message)"

db-history:
	alembic -c alembic.ini history --verbose

db-sql:
	alembic -c alembic.ini upgrade head --sql

test:
	pytest -q
