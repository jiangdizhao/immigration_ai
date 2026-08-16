# immigration_ai

AI assistant for an Australian immigration-law website.

The project contains two main parts:

```text
chatbot/        # Next.js frontend and website chat widget
legal-service/  # FastAPI legal backend, PostgreSQL/pgvector retrieval, reasoning pipeline
```

The backend is the legal-reasoning authority. The frontend should mainly render the answer, collect structured intake facts, and forward user turns to the backend.

## v2.1.1 migration status

Phase 1 adds strict future-agent, tool, evidence, and fact-check contracts plus passive raw-execution observability. The customer answer path remains the existing legacy engine (`ANSWER_ENGINE=v1`): no Luna/Sol agent, new research tool, checker, compact state, or political gate is serving yet. All new rollout and tool flags default off, and the legacy default/premium paths remain the rollback baseline.

The backend absolute-deadline contract starts at FastAPI query acceptance and is available to future agent operations. During Phase 1 it observes the legacy path without imposing a new timeout, so serving behavior is unchanged.

Backend validation must use `/home/rico/anaconda3/envs/torch/bin/python`. Local secret-bearing settings remain in ignored `legal-service/.env`; committed examples document the safe Phase 1 defaults.

## Core backend idea

The backend uses:

- PostgreSQL + pgvector for local legal-source retrieval
- manually ingested legal/guidance documents
- Schedule 1 / Schedule 2 migration-regulation material stored in the database
- a manually built Schedule index generated from the database
- retrieval and reasoning services to produce cautious public guidance
- escalation / lawyer handoff for deadline-sensitive, high-risk, or unsupported matters

Schedule 2 is treated as the main inference reference for visa grant criteria. Schedule 1 is treated as the application-validity gateway. Special schedules/PIC/conditions can be handled as deferred dependencies or escalated for lawyer review.

## Run backend

From the backend folder:

```bash
cd legal-service
python -m uvicorn app.main:app --reload --port 8000
```

Alternative restart command:

```bash
cd legal-service
uvicorn app.main:app --reload
```

Backend Swagger UI:

```text
http://127.0.0.1:8000/docs
```

## Run frontend

From the frontend folder:

```bash
cd chatbot
pnpm dev
```

Frontend local site:

```text
http://localhost:3000
```

## Rebuild legal corpus

Run this when source files under `legal-service/data/acquired/` have changed, or when the database has been reset.

```bash
cd legal-service
python -m scripts.build_corpus_json
python -m scripts.ingest_sources
python -m scripts.embed_chunks
```

This pipeline:

1. converts acquired PDF/HTML sources into raw JSON corpus files;
2. ingests those sources into `legal_sources` and `source_chunks`;
3. embeds `source_chunks.text` into pgvector.

## Build Schedule 1 / Schedule 2 index from database

Important: the Schedule index is **not built automatically** by the normal corpus ingestion pipeline.

After Schedule 1 / Schedule 2 content has been ingested and embedded in PostgreSQL, manually build the structured Schedule index from the database:

```bash
cd legal-service
python -m scripts.build_schedule_index_from_db
```

This reads the already-ingested `legal_sources` and `source_chunks` tables, finds Migration Regulations Schedule 1 / Schedule 2 content, parses clause blocks, and writes processed index files under:

```text
legal-service/data/processed/schedule_index/
```

Expected files include:

```text
schedule1_clauses.jsonl
schedule2_clauses.jsonl
schedule2_subclass_index.json
schedule2_alias_index.json
```

Run this step after:

- rebuilding or resetting the database;
- re-ingesting Schedule 1 or Schedule 2;
- updating the Schedule PDFs/JSON corpus;
- changing the Schedule-index parser.

## Smoke-test Schedule index

After building the DB-backed Schedule index, run:

```bash
cd legal-service
python -m scripts.smoke_schedule_index_from_db
python -m scripts.smoke_schedule2_candidates
```

Useful expected checks:

- Schedule 1 index exists and has clauses;
- Schedule 2 index exists and has clauses;
- subclasses such as `010`, `020`, `485`, `500`, and `820` are found;
- candidate search maps common queries to relevant Schedule 2 subclasses.

Example successful signals:

```text
schedule1_index_exists=True
schedule2_index_exists=True
subclass_010_schedule2_clause_count=...
subclass_020_schedule2_clause_count=...
subclass_485_schedule2_clause_count=...
subclass_500_schedule2_clause_count=...
subclass_820_schedule2_clause_count=...
```

## Run targeted backend tests

```bash
cd legal-service
pytest -q tests/test_schedule2_candidate_service.py tests/test_schedule2_pack_resolver.py
```

## Recommended backend validation after patches

Before running the app after backend changes, syntax-check the touched files:

```bash
cd legal-service
python -m py_compile app/schedule/*.py app/services/schedule_aware_reasoning_service.py
```

If shell globbing causes issues, compile files one by one.

## Important development rule

Avoid case-by-case patching. The intended control flow is:

```text
user turn
→ semantic parsing / fact extraction
→ Schedule 2 candidate search
→ Schedule-aware criterion pack or generic Schedule 2 pack
→ answerability decision
→ answer first with bounded warning
→ ask at most one decisive follow-up question
```

Do not let the final response writer, task-offer layer, or frontend overwrite the legal pipeline's next required fact. Task outputs such as lawyer briefs or document checklists should only be generated when the user explicitly asks for them.
