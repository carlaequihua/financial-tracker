# Database Instructions (PostgreSQL)

Use these commands on macOS to create and verify the database used by the app.

## Option A: Homebrew PostgreSQL local setup

1. Install PostgreSQL (if needed):

```bash
brew install postgresql@16
brew services start postgresql@16
```

2. Create app role and database:

```bash
createuser -s postgres || true
psql -U postgres -d postgres -c "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fin_carla_user') THEN CREATE ROLE fin_carla_user LOGIN PASSWORD 'fin_carla_pass'; END IF; END $$;"
psql -U postgres -d postgres -c "SELECT 'CREATE DATABASE fin_carla OWNER fin_carla_user' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fin_carla')\\gexec"
```

3. Verify access:

```bash
psql "postgres://fin_carla_user:fin_carla_pass@localhost:5432/fin_carla" -c "SELECT current_database(), current_user;"
```

## Option B: Default local superuser workflow

If your local postgres user already has permissions, use:

```bash
createdb fin_carla
psql -d fin_carla -c "SELECT current_database();"
```

## Backend environment setup

From the backend folder:

```bash
cp .env.example .env
```

Set DATABASE_URL in .env to one of:

```bash
DATABASE_URL=postgres://fin_carla_user:fin_carla_pass@localhost:5432/fin_carla
```

or

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/fin_carla
```

## Run schema and seed

```bash
npm install
npm run migrate
npm run seed
```

## Reset database (optional)

```bash
psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS fin_carla;"
psql -U postgres -d postgres -c "DROP ROLE IF EXISTS fin_carla_user;"
```
