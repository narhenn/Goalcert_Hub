# Database migrations

The hub's schema lives here, not in `create_all()`. Every change is a file in
`versions/`, applied in order, recorded in the `alembic_version` table.

Run everything from `hub/backend` (activate the venv first, or call
`.venv/Scripts/python.exe` on Windows / `.venv/bin/python` elsewhere).

## Commands

| Command | What it does |
| --- | --- |
| `python manage.py migrate` | Apply every pending migration (`upgrade head`) |
| `python manage.py makemigrations -m "add teams"` | Diff `models.py` against the DB and write a new migration |
| `python manage.py current` | Which revision this database is on |
| `python manage.py history` | Every migration, newest last, current one marked |
| `python manage.py downgrade` | Undo the last migration (`downgrade -1`) |
| `python manage.py downgrade base` | Undo everything |
| `python manage.py stamp head` | Mark as migrated **without** running SQL |
| `python manage.py migrate --sql` | Print the SQL instead of executing it |
| `python manage.py seed` | Super admin + demo organisations |

`manage.py` is a wrapper — plain Alembic works too (`alembic upgrade head`,
`alembic revision --autogenerate -m "..."`) as long as your cwd is
`hub/backend`.

## Adding a table or column

1. Edit `models.py`.
2. `python manage.py makemigrations -m "what changed"`.
3. **Read the generated file** in `versions/`. Autogenerate is a good first
   draft, not a finished migration — it does not see renames (it emits a drop +
   add, which loses data), and it cannot guess a backfill.
4. `python manage.py migrate`, then commit the migration with the model change.

A new non-nullable column on a populated table needs three steps in one
migration: add it nullable, backfill with `op.execute(...)`, then
`op.alter_column(..., nullable=False)`.

## Which database?

Whatever `DATABASE_URL` points at — the migrations import it from `db.py`
(which loads `.env`), so they can never target a different database than the
running app. Unset, that is the local SQLite file `goalcert_hub.db`.

```
sqlite:///./goalcert_hub.db                                    # no server needed
mysql+pymysql://root@127.0.0.1:3306/goalcert_hub?charset=utf8mb4   # local MySQL
postgresql+psycopg://user:pass@host:5432/db                    # Render / RDS
```

Local dev runs on the MySQL `goalcert_hub` database (Laragon, phpMyAdmin). One
MySQL caveat: it has no transactional DDL, so a migration that fails halfway
stays half-applied — fix forward, and check `manage.py current` after any error.
SQLite and Postgres roll the whole migration back.

For a dedicated Postgres schema (the deployed hub uses `hub`, since automind
owns `public`), put it in the DSN and both the app and the migrations follow it:

```
DATABASE_URL=postgresql+psycopg://user:pass@host:5432/db?options=-csearch_path%3Dhub
```

SQLite gets `render_as_batch` automatically, so `ALTER`-heavy migrations work
locally as well as they do on Postgres.

## On startup / on deploy

The server calls `ensure_schema()` at startup:

- `AUTO_MIGRATE=1` (default, and what you want locally) — upgrades to head.
- `AUTO_MIGRATE=0` (what `render.yaml` sets) — the deploy's `startCommand` runs
  `alembic upgrade head` first, and the app only refuses to boot if the schema
  is behind. A broken migration then fails the deploy instead of quietly
  half-starting the service.

## Baseline (`0001`)

`0001_initial_schema.py` is the schema as it stood when migrations were
introduced. It creates each object only if missing, so a database that predates
migrations — the SQLite file, the deployed Postgres — adopts it safely: run
`python manage.py migrate` once and it is simply recorded as up to date. Its
`downgrade()` drops all three tables, so do not run it against anything you
care about.
