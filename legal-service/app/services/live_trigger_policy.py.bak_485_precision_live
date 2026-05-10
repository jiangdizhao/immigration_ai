from __future__ import annotations

import re
from typing import Any

from app.schemas.state import LiveTriggerDecision
from app.services.operation_profiles import canonical_operation_type


class LiveTriggerPolicy:
    FRESHNESS_TERMS = ("current", "latest", "today", "now", "recent")
    CONDITION_RE = re.compile(r"(?:visa\s+)?condition\s*(\d{4})\b", re.I)

    def decide(
        self,
        *,
        question: str,
        issue_type: str | None,
        operation_type: str | None,
        known_facts: dict[str, Any] | None,
        source_classes_present: set[str],
        retrieval_rows: list[dict[str, Any]] | None = None,
    ) -> LiveTriggerDecision:
        q = (question or "").lower()
        op = canonical_operation_type(operation_type)
        known_facts = known_facts or {}

        matched_condition = self._extract_condition_number(question)
        reasons: list[str] = []
        preferred_domains: list[str] = []
        preferred_source_types: list[str] = []
        required_classes_missing: list[str] = []

        def add(reason: str, domains: list[str], source_types: list[str], missing: list[str] | None = None) -> None:
            if reason not in reasons:
                reasons.append(reason)
            for domain in domains:
                if domain not in preferred_domains:
                    preferred_domains.append(domain)
            for source_type in source_types:
                if source_type not in preferred_source_types:
                    preferred_source_types.append(source_type)
            for missing_class in (missing or []):
                if missing_class not in required_classes_missing:
                    required_classes_missing.append(missing_class)

        if any(term in q for term in self.FRESHNESS_TERMS):
            add(
                "freshness_request",
                ["immi.homeaffairs.gov.au", "legislation.gov.au"],
                ["guidance", "legislation"],
            )

        if op in {"review_rights", "review_deadline"} or any(x in q for x in ["review", "appeal", "tribunal", "deadline", "time limit"]):
            needed = {"review_rights", "review_deadline", "art_procedure", "official_next_steps"}
            if not (source_classes_present & needed):
                add(
                    "review_or_deadline_workflow",
                    ["art.gov.au", "immi.homeaffairs.gov.au", "legislation.gov.au"],
                    ["procedure", "guidance", "legislation"],
                    sorted(needed),
                )

        if op == "student_refusal_next_steps" or ("refus" in q and any(x in q for x in ["next", "what should i do", "what now"])):
            needed = {"official_next_steps", "review_rights", "review_deadline", "lawful_status_after_refusal"}
            if not (source_classes_present & needed):
                add(
                    "refusal_next_steps",
                    ["art.gov.au", "immi.homeaffairs.gov.au", "legislation.gov.au"],
                    ["guidance", "procedure", "legislation"],
                    sorted(needed),
                )

        if op == "visa_condition_explainer" or matched_condition or issue_type == "visa_conditions":
            needed = {"conditions_guidance", "visa_condition_definition"}
            has_explicit_definition = self._has_explicit_condition_definition(retrieval_rows or [], matched_condition)
            if not has_explicit_definition:
                add(
                    "visa_condition_definition_missing",
                    ["immi.homeaffairs.gov.au", "legislation.gov.au"],
                    ["guidance", "legislation"],
                    ["explicit_condition_definition"],
                )
            elif not (source_classes_present & needed):
                add(
                    "visa_condition_explainer",
                    ["immi.homeaffairs.gov.au", "legislation.gov.au"],
                    ["guidance", "legislation"],
                    sorted(needed),
                )

        if source_classes_present and source_classes_present <= {"legislation_primary", "visa_conditions_schedule", "visa_condition_definition"}:
            if any(x in q for x in ["what does", "what is", "mean", "can i", "what should i do", "condition"]):
                add(
                    "local_legislation_only",
                    ["immi.homeaffairs.gov.au"],
                    ["guidance"],
                )

        return LiveTriggerDecision(
            should_live_fetch=bool(reasons),
            reasons=reasons,
            matched_condition_number=matched_condition,
            source_classes_present=sorted(source_classes_present),
            required_source_classes_missing=required_classes_missing,
            preferred_domains=preferred_domains,
            preferred_source_types=preferred_source_types,
        )

    def _extract_condition_number(self, question: str) -> str | None:
        match = self.CONDITION_RE.search(question or "")
        return match.group(1) if match else None

    def _normalize_condition_text(self, text: str) -> str:
        normalized = text or ""
        return re.sub(
            r"((?:visa\s+)?condition\s*)(\d{4})1(?=\s+in\s+schedule\s+8\b)",
            r"\1\2",
            normalized,
            flags=re.I,
        )

    def _has_explicit_condition_definition(self, rows: list[dict[str, Any]], condition_no: str | None) -> bool:
        if not rows:
            return False
        patterns = [
            r"states? that the visa holder must",
            r"requires? the visa holder to",
            r"condition\s*\d{4}\s+means",
            r"must maintain[^\n]{0,120}health insurance",
            r"adequate arrangements for health insurance",
            r"while the holder is in australia",
            r"must not",
        ]
        for row in rows:
            preview = self._normalize_condition_text(str(row.get("text_preview") or ""))
            classes = {str(item) for item in (row.get("source_classes") or []) if isinstance(item, str)}
            if condition_no and not re.search(rf"(?:visa\s+)?condition\s*{re.escape(condition_no)}\b", preview, flags=re.I):
                continue
            if not (classes & {"conditions_guidance", "visa_condition_definition", "visa_conditions_schedule"}):
                continue
            if any(re.search(pattern, preview, flags=re.I) for pattern in patterns):
                return True
        return False
