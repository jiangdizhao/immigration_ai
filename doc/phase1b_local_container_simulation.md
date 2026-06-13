# Phase 1B Local Container Production Simulation

Goal: run the local system in containers before AWS.

## Services

- `phase1b-postgres`: PostgreSQL 16 with pgvector, exposed on host port `5433`.
- `phase1b-valkey`: Valkey/Redis-compatible cache, exposed on host port `6380`.
- `phase1b-legal-service`: FastAPI backend, exposed on host port `8000`.
- `phase1b-chatbot`: Next.js frontend, exposed on host port `3000`.

## First run

```bash
./scripts/phase1b-up.sh
```

The script creates local env files from examples if missing:

- `.env.phase1b.legal-service.local`
- `.env.phase1b.chatbot.local`

Edit `.env.phase1b.legal-service.local` and set `OPENAI_API_KEY` before testing real chatbot answers.

## Smoke test

```bash
./scripts/phase1b-smoke-test.sh
```

Optional real LLM query:

```bash
RUN_LLM_SMOKE=1 ./scripts/phase1b-smoke-test.sh
```

## Stop

```bash
./scripts/phase1b-down.sh
```

## Logs

```bash
./scripts/phase1b-logs.sh
./scripts/phase1b-logs.sh phase1b-legal-service
```

## Reset volumes

```bash
./scripts/phase1b-reset-volumes.sh
```

This deletes local container database/cache volumes. It does not affect your non-container local PostgreSQL databases.
## Startup note

The legal-service container runs `scripts.phase1b_init_legal_schema` before `scripts.apply_phase0_schema`. This creates the base SQLAlchemy tables in the fresh container database while keeping `AUTO_CREATE_SCHEMA=false` during FastAPI runtime.

