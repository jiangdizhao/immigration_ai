from __future__ import annotations

import json
import os
import re
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.state import FactExtractionResult, IssueAndOperation


class FactExtractionService:
    """
    Bounded extraction/classification service for the state-machine workflow.

    This service does two things only:
    1) classify issue_type / operation_type / visa_type
    2) extract explicit fact updates from the latest turn

    It uses deterministic fallbacks first, then an LLM JSON pass for refinement.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.model = os.getenv("REASONING_MODEL", "gpt-5.4-mini")
        self.general_model = os.getenv("GENERAL_QA_MODEL", self.model)
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(api_key=self.settings.openai_api_key)
        return self._client

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def classify_issue_and_operation(
        self,
        *,
        question: str,
        intake_facts: dict[str, Any] | None = None,
        current_issue_type: str | None = None,
        current_operation_type: str | None = None,
        current_visa_type: str | None = None,
        preferred_jurisdiction: str | None = None,
    ) -> IssueAndOperation:
        heuristic = self._heuristic_issue_and_operation(
            question=question,
            current_issue_type=current_issue_type,
            current_operation_type=current_operation_type,
            current_visa_type=current_visa_type,
            preferred_jurisdiction=preferred_jurisdiction,
        )

        system_prompt = (
            "You classify an immigration-law user query into a narrow JSON structure.\n"
            "Return ONLY valid JSON with this exact shape:\n"
            "{\n"
            '  "issue_type": string | null,\n'
            '  "operation_type": string | null,\n'
            '  "visa_type": string | null,\n'
            '  "jurisdiction": string | null\n'
            "}\n"
            "Rules:\n"
            "- Keep labels short and implementation-friendly.\n"
            "- Prefer conservative labels over speculative ones.\n"
            "- operation_type should describe the legal/user operation, e.g. review_rights, review_deadline, student_refusal_next_steps, bridging_travel, document_checklist, 485_eligibility_overview, pic4020_risk.\n"
            "- If uncertain, keep existing labels if they still fit.\n"
        )

        user_prompt = (
            f"Question:\n{question}\n\n"
            f"Known intake facts JSON:\n{json.dumps(intake_facts or {}, ensure_ascii=False)}\n\n"
            f"Current labels JSON:\n{json.dumps(heuristic.model_dump(), ensure_ascii=False)}\n"
        )

        try:
            response = self.client.responses.create(
                model=self.general_model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            parsed = self._extract_json_object((response.output_text or "").strip())
            if not parsed:
                return heuristic
            return IssueAndOperation(
                issue_type=self._clean_label(parsed.get("issue_type")) or heuristic.issue_type,
                operation_type=self._clean_label(parsed.get("operation_type")) or heuristic.operation_type,
                visa_type=self._clean_label(parsed.get("visa_type")) or heuristic.visa_type,
                jurisdiction=self._clean_label(parsed.get("jurisdiction")) or heuristic.jurisdiction,
            )
        except Exception:
            return heuristic

    def extract_fact_updates(
        self,
        *,
        question: str,
        effective_question: str,
        issue_type: str | None,
        operation_type: str | None,
        visa_type: str | None,
        prior_facts: dict[str, Any] | None = None,
    ) -> FactExtractionResult:
        heuristic = self._heuristic_fact_updates(
            question=question,
            effective_question=effective_question,
            issue_type=issue_type,
            operation_type=operation_type,
            visa_type=visa_type,
        )

        system_prompt = (
            "You extract explicit factual updates from the user's latest turn only.\n"
            "Return ONLY valid JSON with this exact shape:\n"
            "{\n"
            '  "new_facts": object,\n'
            '  "fact_confidence": object\n'
            "}\n"
            "Rules:\n"
            "- Extract only facts explicitly stated by the user or unambiguously implied in the rewritten standalone question.\n"
            "- Do not infer missing legal conclusions.\n"
            "- Use short snake_case keys where possible.\n"
            "- Confidence values must be low, medium, or high.\n"
            "- Good keys include refusal_date, notification_date, in_australia, outside_australia, detention_status, refusal_reason, visa_subclass, visa_type, issue_type.\n"
        )

        user_prompt = (
            f"Latest user turn:\n{question}\n\n"
            f"Standalone question:\n{effective_question}\n\n"
            f"Issue type: {issue_type or 'unknown'}\n"
            f"Operation type: {operation_type or 'unknown'}\n"
            f"Visa type: {visa_type or 'unknown'}\n\n"
            f"Existing facts JSON:\n{json.dumps(prior_facts or {}, ensure_ascii=False)}\n\n"
            f"Heuristic extraction JSON:\n{json.dumps(heuristic.model_dump(), ensure_ascii=False)}\n"
        )

        try:
            response = self.client.responses.create(
                model=self.general_model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            parsed = self._extract_json_object((response.output_text or "").strip())
            if not parsed:
                return heuristic

            new_facts = self._normalize_fact_dict(parsed.get("new_facts"))
            fact_confidence = self._normalize_confidence_dict(parsed.get("fact_confidence"))

            # merge heuristic defaults if LLM omitted them
            merged_facts = dict(heuristic.new_facts)
            merged_facts.update(new_facts)
            merged_conf = dict(heuristic.fact_confidence)
            merged_conf.update(fact_confidence)

            return FactExtractionResult(new_facts=merged_facts, fact_confidence=merged_conf)
        except Exception:
            return heuristic

    # ------------------------------------------------------------------
    # Heuristic defaults
    # ------------------------------------------------------------------
    def _heuristic_issue_and_operation(
        self,
        *,
        question: str,
        current_issue_type: str | None,
        current_operation_type: str | None,
        current_visa_type: str | None,
        preferred_jurisdiction: str | None,
    ) -> IssueAndOperation:
        q = question.lower()
        issue_type = current_issue_type
        operation_type = current_operation_type
        visa_type = current_visa_type
        jurisdiction = preferred_jurisdiction or "Cth"

        # visa / issue
        if "student visa" in q or "subclass 500" in q:
            issue_type = issue_type or "student_visa"
            visa_type = visa_type or "student"
        elif "485" in q or "temporary graduate" in q:
            issue_type = issue_type or "temporary_graduate_visa"
            visa_type = visa_type or "temporary_graduate"
        elif "bridging visa" in q or any(x in q for x in ["bva", "bvb", "bvc", "bve"]):
            issue_type = issue_type or "bridging_visa"
            visa_type = visa_type or "bridging"
        elif "partner visa" in q:
            issue_type = issue_type or "partner_visa"
            visa_type = visa_type or "partner"
        elif "skilled" in q:
            issue_type = issue_type or "skilled_migration"
            visa_type = visa_type or "skilled"

        if "refus" in q:
            issue_type = issue_type or "visa_refusal"
        if "cancel" in q:
            issue_type = issue_type or "visa_cancellation"
        if "4020" in q or "incorrect information" in q or "misleading" in q:
            issue_type = issue_type or "pic4020_issue"

        # operation
        if ("review" in q or "appeal" in q) and any(x in q for x in ["still", "time", "deadline", "late"]):
            operation_type = operation_type or "review_deadline"
        elif "review" in q or "appeal" in q:
            operation_type = operation_type or "review_rights"
        elif ("refus" in q or "refused" in q) and visa_type == "student":
            operation_type = operation_type or "student_refusal_next_steps"
        elif ("travel" in q or "leave" in q or "come back" in q) and ("bridging" in q or visa_type == "bridging"):
            operation_type = operation_type or "bridging_travel"
        elif ("document" in q or "prepare" in q or "upload" in q or "checklist" in q):
            operation_type = operation_type or "document_checklist"
        elif visa_type == "temporary_graduate" and ("eligible" in q or "what is" in q or "can i apply" in q):
            operation_type = operation_type or "485_eligibility_overview"
        elif issue_type == "pic4020_issue":
            operation_type = operation_type or "pic4020_risk"

        return IssueAndOperation(
            issue_type=issue_type,
            operation_type=operation_type,
            visa_type=visa_type,
            jurisdiction=jurisdiction,
        )

    def _heuristic_fact_updates(
        self,
        *,
        question: str,
        effective_question: str,
        issue_type: str | None,
        operation_type: str | None,
        visa_type: str | None,
    ) -> FactExtractionResult:
        q = question.lower()
        eq = effective_question.lower()
        new_facts: dict[str, Any] = {}
        conf: dict[str, str] = {}

        # carry labels when explicit
        if issue_type:
            new_facts["issue_type"] = issue_type
            conf["issue_type"] = "high"
        if visa_type:
            new_facts["visa_type"] = visa_type
            conf["visa_type"] = "high"
        if operation_type:
            new_facts["operation_type"] = operation_type
            conf["operation_type"] = "medium"

        # dates
        date_match = self._extract_date(question) or self._extract_date(effective_question)
        if date_match:
            if "refus" in q or "refus" in eq:
                new_facts["refusal_date"] = date_match
                conf["refusal_date"] = "high"
            elif "notif" in q or "notif" in eq:
                new_facts["notification_date"] = date_match
                conf["notification_date"] = "high"
            elif "decision" in q or "decision" in eq:
                new_facts["decision_date"] = date_match
                conf["decision_date"] = "medium"

        # location / detention flags
        if "in australia" in q or "onshore" in q:
            new_facts["in_australia"] = True
            new_facts["onshore_offshore"] = "in_australia"
            conf["in_australia"] = "high"
            conf["onshore_offshore"] = "high"
        if "outside australia" in q or "offshore" in q:
            new_facts["in_australia"] = False
            new_facts["onshore_offshore"] = "outside_australia"
            conf["in_australia"] = "high"
            conf["onshore_offshore"] = "high"
        if "immigration detention" in q or "detention" in q:
            new_facts["detention_status"] = True
            conf["detention_status"] = "medium"
        if "not in detention" in q:
            new_facts["detention_status"] = False
            conf["detention_status"] = "medium"

        # refusal / cancellation / review mentions
        if "refus" in q:
            new_facts["has_refusal"] = True
            conf["has_refusal"] = "high"
        if "cancel" in q:
            new_facts["has_cancellation"] = True
            conf["has_cancellation"] = "high"
        if "review" in q or "appeal" in q:
            new_facts["seeking_review"] = True
            conf["seeking_review"] = "high"

        # subclass hints
        subclass_match = re.search(r"\b(500|485|010|020|030|050|051|820|801|189|190|491|600)\b", q)
        if subclass_match:
            new_facts["visa_subclass"] = subclass_match.group(1)
            conf["visa_subclass"] = "high"

        # rough refusal reason cues
        reason_map = {
            "genuine student": "genuine_student",
            "gs": "genuine_student",
            "financial": "financial",
            "english": "english",
            "identity": "identity",
            "incorrect information": "incorrect_information",
            "misleading": "incorrect_information",
            "4020": "pic4020",
        }
        for needle, value in reason_map.items():
            if needle in q:
                new_facts["refusal_reason_hint"] = value
                conf["refusal_reason_hint"] = "medium"
                break

        return FactExtractionResult(new_facts=new_facts, fact_confidence=conf)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _extract_json_object(self, text: str) -> dict[str, Any] | None:
        if not text:
            return None
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        candidate = text[start : end + 1]
        try:
            parsed = json.loads(candidate)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None

    def _normalize_fact_dict(self, value: Any) -> dict[str, Any]:
        if not isinstance(value, dict):
            return {}
        normalized: dict[str, Any] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                continue
            key = key.strip()
            if not key:
                continue
            normalized[key] = item
        return normalized

    def _normalize_confidence_dict(self, value: Any) -> dict[str, str]:
        if not isinstance(value, dict):
            return {}
        allowed = {"low", "medium", "high"}
        normalized: dict[str, str] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                continue
            if isinstance(item, str) and item in allowed:
                normalized[key.strip()] = item
        return normalized

    def _clean_label(self, value: Any) -> str | None:
        if not isinstance(value, str):
            return None
        value = value.strip()
        return value or None

    def _extract_date(self, text: str) -> str | None:
        if not text:
            return None

        patterns = [
            r"\b(\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})\b",
            r"\b(\d{4}-\d{2}-\d{2})\b",
            r"\b(\d{1,2}/\d{1,2}/\d{4})\b",
        ]
        lower = text.lower()
        for pattern in patterns:
            m = re.search(pattern, lower, flags=re.I)
            if m:
                return m.group(1)
        return None
