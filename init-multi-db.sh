#!/bin/bash
# Creates multiple databases inside the shared Postgres container.
# Called automatically by the postgres entrypoint on first run.
set -e

for db in automind goalcert; do
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-SQL
        SELECT 'CREATE DATABASE $db'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
        GRANT ALL PRIVILEGES ON DATABASE $db TO $POSTGRES_USER;
SQL
done
