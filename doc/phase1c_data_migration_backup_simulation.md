# Phase 1C — Data Migration, Backup, and Export Simulation

Phase 1C verifies that the local production-like container environment can safely receive legal seed data, back up/restore databases, and export review data for offline analysis.

## Scripts

### Export legal seed from the normal local legal DB

```bash
./scripts/phase1c-export-legal-seed.sh
```

Default source DB:

```text
postgresql://rico_local@localhost:5432/immigration_legal
```

Exported tables:

```text
legal_sources
source_chunks
cases
```

The export is data-only and intentionally excludes customer/matter/review data.

### Import legal seed into the Phase 1B container DB

```bash
./scripts/phase1c-import-legal-seed-to-container.sh artifacts/phase1c/legal_seed/<dump-file>.dump
```

Default target DB:

```text
postgresql://immigration_local:local_phase1b_password@127.0.0.1:5433/immigration_legal
```

### Back up container DBs

```bash
./scripts/phase1c-backup-container-dbs.sh
```

This writes:

```text
legal_service.dump
chatbot.dump
manifest.txt
```

### Restore container DBs

```bash
./scripts/phase1c-restore-container-dbs.sh artifacts/phase1c/backups/<timestamp>
```

Use only for local simulation. It performs a clean restore into the Phase 1B container databases.

### Export review data for analysis

```bash
./scripts/phase1c-export-review-data.sh
```

This exports JSONL records from `answer_traces` and linked `answer_reviews`. It uses previews rather than full unrestricted DB dumps.

### Data smoke test

```bash
./scripts/phase1c-data-smoke-test.sh
```

Checks:

- pgvector extension exists
- legal seed tables have rows
- chatbot `ImmigrationConversation` table exists
- Schedule index can rebuild inside the legal-service container
- optional Schedule smoke scripts run if present

## Typical Phase 1C flow

```bash
./scripts/phase1b-up.sh
./scripts/phase1c-export-legal-seed.sh
./scripts/phase1c-import-legal-seed-to-container.sh artifacts/phase1c/legal_seed/<dump-file>.dump
./scripts/phase1c-data-smoke-test.sh
./scripts/phase1c-backup-container-dbs.sh
./scripts/phase1c-export-review-data.sh
```

## Git safety

Do not commit generated dumps or exports under `artifacts/phase1c/`.
