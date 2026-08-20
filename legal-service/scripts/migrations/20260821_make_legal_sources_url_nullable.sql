-- v2.1.3 local-evidence correction. Write-only migration; do not apply automatically.
-- Local corpus identity is source/chunk/text provenance. Supplied URLs remain
-- optional publication metadata, and PostgreSQL UNIQUE permits multiple NULLs.
ALTER TABLE legal_sources
    ALTER COLUMN url DROP NOT NULL;
