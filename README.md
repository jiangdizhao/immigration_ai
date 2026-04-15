# immigration_ai
AI agent for immigration lawyer

Activation command: 

Backend: python -m uvicorn app.main:app --reload --port 8000

Restart Backend: uvicorn app.main:app --reload

Frontend: pnpm dev

################################################################

Rebuild corpus:

0. cd legal-service
1. python -m scripts.build_corpus_json
2. python -m scripts.ingest_sources
3. python -m scripts.embed_chunks