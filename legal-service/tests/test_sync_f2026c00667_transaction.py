"""Offline tests for the bounded F2026C00667 maintenance transaction."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.db.models import LegalSource, SourceChunk
from scripts import sync_f2026c00667_transaction as sync


def _db() -> tuple[Session, dict[str, int]]:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    commits = {"count": 0}

    @event.listens_for(engine, "commit")
    def count_commit(_connection):
        commits["count"] += 1

    session = sessionmaker(bind=engine, expire_on_commit=False)()
    return session, commits


def _configure_small_payloads(monkeypatch, tmp_path: Path) -> tuple[str, ...]:
    files = tuple(f"F2026C00667VOL0{index}.json" for index in range(1, 5))
    urls = {
        filename: f"local://test/{filename.removesuffix('.json')}.pdf"
        for filename in files
    }
    titles = {
        filename: f"Migration Regulations 1994 - F2026C00667 Volume {index}"
        for index, filename in enumerate(files, start=1)
    }
    monkeypatch.setattr(sync, "EXPECTED_FILES", files)
    monkeypatch.setattr(sync, "EXPECTED_CHUNK_COUNTS", {filename: 1 for filename in files})
    monkeypatch.setattr(sync, "EXPECTED_URLS", urls)
    monkeypatch.setattr(sync, "EXPECTED_TITLES", titles)

    for filename in files:
        (tmp_path / filename).write_text(
            json.dumps({
                "title": titles[filename],
                "source_type": "legislation",
                "authority": "tracked test corpus",
                "jurisdiction": "Cth",
                "url": urls[filename],
                "document_version": sync.EXPECTED_VERSION,
                "status": "active",
                "effective_date": "2026-07-01",
                "repeal_date": None,
                "sections": [{"section_ref": filename, "text": f"Exact text {filename}."}],
            }),
            encoding="utf-8",
        )
    return files


def _source(
    db: Session,
    *,
    title: str,
    version: str | None,
    status: str = "active",
    source_type: str = "legislation",
    url: str | None = None,
    chunks: int = 1,
) -> LegalSource:
    source = LegalSource(
        title=title,
        source_type=source_type,
        authority="test",
        jurisdiction="Cth",
        url=url,
        document_version=version,
        status=status,
    )
    db.add(source)
    db.flush()
    db.add_all([
        SourceChunk(
            source_id=source.id,
            chunk_index=index,
            section_ref=str(index),
            text=f"chunk {index}",
            metadata_json={},
        )
        for index in range(chunks)
    ])
    db.flush()
    return source


def test_tracked_payloads_are_exactly_four_with_expected_chunk_counts():
    volumes = sync._json_payloads()
    assert [volume.filename for volume in volumes] == list(sync.EXPECTED_FILES)
    assert [volume.expected_chunks for volume in volumes] == [2007, 1389, 1082, 1318]


def test_dry_run_rolls_back_read_transaction_and_performs_no_commit(monkeypatch, tmp_path):
    _configure_small_payloads(monkeypatch, tmp_path)
    db, commits = _db()
    old = _source(db, title="F2026C00266VOL01", version=sync.PREVIOUS_VERSION)
    db.commit()
    commits["count"] = 0

    plan = sync.dry_run(db, data_dir=tmp_path)

    assert plan["insert_files"] == list(sync.EXPECTED_FILES)
    assert plan["retire_sources"][0]["id"] == str(old.id)
    assert commits["count"] == 0
    assert db.scalar(select(func.count()).select_from(LegalSource)) == 1
    assert db.get(LegalSource, old.id).status == "active"


@pytest.mark.parametrize(
    "mutation",
    [
        lambda payload: payload.update(document_version="F2026C00000"),
        lambda payload: payload.update(effective_date="2026-08-01"),
    ],
)
def test_invalid_compilation_or_effective_date_aborts_before_db_write(
    monkeypatch, tmp_path, mutation
):
    files = _configure_small_payloads(monkeypatch, tmp_path)
    first = tmp_path / files[0]
    payload = json.loads(first.read_text())
    mutation(payload)
    first.write_text(json.dumps(payload))
    db, commits = _db()

    with pytest.raises(sync.SynchronizationError):
        sync.apply_sync(db, data_dir=tmp_path, probe_runner=lambda _db: [])

    assert commits["count"] == 0
    assert db.scalar(select(func.count()).select_from(LegalSource)) == 0


def test_missing_volume_aborts(monkeypatch, tmp_path):
    files = _configure_small_payloads(monkeypatch, tmp_path)
    (tmp_path / files[-1]).unlink()
    db, commits = _db()

    with pytest.raises(sync.SynchronizationError, match="exactly four"):
        sync.apply_sync(db, data_dir=tmp_path, probe_runner=lambda _db: [])

    assert commits["count"] == 0
    assert db.scalar(select(func.count()).select_from(LegalSource)) == 0


def test_chunk_count_mismatch_aborts(monkeypatch, tmp_path):
    files = _configure_small_payloads(monkeypatch, tmp_path)
    first = tmp_path / files[0]
    payload = json.loads(first.read_text())
    payload["sections"].append({"section_ref": "extra", "text": "extra chunk"})
    first.write_text(json.dumps(payload))
    db, commits = _db()

    with pytest.raises(sync.SynchronizationError, match="generated 2 chunks"):
        sync.apply_sync(db, data_dir=tmp_path, probe_runner=lambda _db: [])

    assert commits["count"] == 0
    assert db.scalar(select(func.count()).select_from(LegalSource)) == 0


def test_partial_existing_installation_aborts_safely(monkeypatch, tmp_path):
    files = _configure_small_payloads(monkeypatch, tmp_path)
    db, commits = _db()
    _source(
        db,
        title="Migration Regulations 1994 - F2026C00667 Volume 1",
        version=sync.EXPECTED_VERSION,
        url=f"local://test/{files[0].removesuffix('.json')}.pdf",
        chunks=1,
    )
    db.commit()
    commits["count"] = 0

    with pytest.raises(sync.SynchronizationError, match="partial"):
        sync.apply_sync(db, data_dir=tmp_path, probe_runner=lambda _db: [])

    assert commits["count"] == 0
    assert db.scalar(select(func.count()).select_from(LegalSource)) == 1


def test_apply_is_one_commit_and_retires_only_bounded_regulation_sources(monkeypatch, tmp_path):
    _configure_small_payloads(monkeypatch, tmp_path)
    db, commits = _db()
    old = _source(db, title="F2026C00266VOL01", version=sync.PREVIOUS_VERSION)
    legacy = _source(
        db,
        title="Migration Regulations 1994 - SCHEDULE 3 legacy",
        version=None,
    )
    unrelated_guidance = _source(
        db,
        title="Migration Regulations guidance note",
        version=None,
        source_type="guidance",
    )
    unrelated_act = _source(
        db,
        title="Migration Act 1958",
        version="C2026C00090",
    )
    db.commit()
    commits["count"] = 0

    result = sync.apply_sync(db, data_dir=tmp_path, probe_runner=lambda _db: [])

    assert result["transaction"] == "committed"
    assert commits["count"] == 1
    assert db.get(LegalSource, old.id).status == "superseded"
    assert db.get(LegalSource, legacy.id).status == "superseded"
    assert db.get(LegalSource, unrelated_guidance.id).status == "active"
    assert db.get(LegalSource, unrelated_act.id).status == "active"
    active_new = list(db.scalars(select(LegalSource).where(
        LegalSource.document_version == sync.EXPECTED_VERSION,
        LegalSource.status == "active",
    )))
    assert len(active_new) == 4


def test_probe_failure_rolls_back_inserts_and_retirement(monkeypatch, tmp_path):
    _configure_small_payloads(monkeypatch, tmp_path)
    db, commits = _db()
    old = _source(db, title="F2026C00266VOL01", version=sync.PREVIOUS_VERSION)
    db.commit()
    commits["count"] = 0

    def failed_probe(_db):
        raise sync.SynchronizationError("simulated exact verification failure")

    with pytest.raises(sync.SynchronizationError, match="verification"):
        sync.apply_sync(db, data_dir=tmp_path, probe_runner=failed_probe)

    assert commits["count"] == 0
    assert db.scalar(select(func.count()).select_from(LegalSource)) == 1
    assert db.get(LegalSource, old.id).status == "active"
