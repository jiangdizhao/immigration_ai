from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_SKELETON_PATH = ROOT_DIR / "data" / "generated" / "schedule2_subclass_skeletons.json"


class Schedule2SkeletonIndexService:
    """Loads the generated Schedule 2 subclass skeleton JSON.

    The skeleton file is structured screening data. It is not treated as vector
    retrieval authority and does not decide eligibility by itself.
    """

    def __init__(self, *, path: Path | str | None = None) -> None:
        explicit = path or os.getenv("SCHEDULE2_SKELETON_INDEX_PATH")
        self.path = Path(explicit).expanduser() if explicit else DEFAULT_SKELETON_PATH

    def all_skeletons(self) -> list[dict[str, Any]]:
        return list(_load_skeletons(str(self.path)))

    def skeleton_by_subclass(self, subclass: str) -> dict[str, Any] | None:
        code = self._normalize_subclass(subclass)
        for item in _load_skeletons(str(self.path)):
            if self._normalize_subclass(item.get("subclass")) == code:
                return dict(item)
        return None

    def profile_text(self, subclass: str) -> str:
        item = self.skeleton_by_subclass(subclass)
        if not item:
            return ""
        parts: list[str] = [
            str(item.get("subclass") or ""),
            str(item.get("title") or ""),
            str(item.get("family") or ""),
        ]
        for key in (
            "purpose_tags",
            "actor_tags",
            "activity_tags",
            "duration_tags",
            "positive_fact_triggers",
            "negative_fact_triggers",
            "decisive_fact_types",
            "keyword_hints",
        ):
            value = item.get(key)
            if isinstance(value, list):
                parts.extend(str(x) for x in value if str(x).strip())
        return " ".join(part for part in parts if part).strip()

    def _normalize_subclass(self, value: Any) -> str:
        text = str(value or "").strip().upper()
        return "".join(ch for ch in text if ch.isalnum())


@lru_cache(maxsize=4)
def _load_skeletons(path_text: str) -> tuple[dict[str, Any], ...]:
    path = Path(path_text)
    data = json.loads(path.read_text(encoding="utf-8"))
    raw_items = data.get("subclasses") if isinstance(data, dict) else data
    if not isinstance(raw_items, list):
        raise ValueError("Schedule 2 skeleton index must be a list or {'subclasses': list}")

    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        subclass = str(raw.get("subclass") or "").strip().upper()
        if not subclass or subclass in seen:
            continue
        seen.add(subclass)
        item = dict(raw)
        item["subclass"] = subclass
        for key in (
            "purpose_tags",
            "actor_tags",
            "activity_tags",
            "duration_tags",
            "positive_fact_triggers",
            "negative_fact_triggers",
            "decisive_fact_types",
            "source_clause_refs",
            "keyword_hints",
        ):
            if not isinstance(item.get(key), list):
                item[key] = []
        items.append(item)

    if not items:
        raise ValueError(f"No Schedule 2 subclass skeletons found in {path}")
    return tuple(items)
