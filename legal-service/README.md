# Immigration legal service

This is a separate Python backend for the immigration website. It is designed to sit beside the existing Next.js repo and provide:

- structured intake endpoints
- legal source metadata storage
- source chunk storage with pgvector embeddings
- retrieval and reasoning API boundaries
- escalation and citation-ready response objects

## Week 1 scope

This implementation focuses on the **FastAPI service layer** and the initial database schema. Retrieval and reasoning are deliberately thin so you can connect the service now and deepen those modules in Week 2 and Week 3.

Implemented tables:

- `legal_sources`
- `source_chunks`
- `cases`
- `citations`
- `matters`
- `intake_answers`

Implemented endpoints:

- `GET /health`
- `POST /api/v1/intake`
- `POST /api/v1/query`
- `POST /api/v1/escalate`
- `GET /api/v1/sources/{source_id}`
- `GET /api/v1/matters/{matter_id}`

## Run locally

```bash
cd legal-service
python -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
uvicorn app.main:app --reload --port 8001
```

## PostgreSQL setup notes

1. Create a PostgreSQL database.
2. Install the `pgvector` extension in that database.
3. Update `DATABASE_URL` in `.env`.

Example connection string:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/immigration_ai
```

If `AUTO_CREATE_SCHEMA=true`, the app will try to run:

- `CREATE EXTENSION IF NOT EXISTS vector`
- `Base.metadata.create_all(...)`

on startup.

## How Next.js should call this service later

Your current widget route can call this backend with server-side fetch:

- `POST /api/v1/query` for normal legal Q&A
- `POST /api/v1/intake` for structured intake persistence
- `POST /api/v1/escalate` when the session should be handed to a lawyer

If `LEGAL_SERVICE_API_KEY` is set, send it in `X-API-Key`.

## Design intent

- Keep the current Next.js repo as UI shell and widget.
- Keep legal ingestion, retrieval, and reasoning here.
- Avoid mixing Node and Python dependency stacks.
