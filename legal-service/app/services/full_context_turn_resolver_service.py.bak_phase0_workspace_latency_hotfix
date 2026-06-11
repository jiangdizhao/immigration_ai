from __future__ import annotations

import copy
import json
import os
from typing import Any

from openai import OpenAI
from pydantic import ValidationError

from app.core.config import get_settings
from app.schemas.legal_focus import FullContextTurnResolution, normalize_subclass
from app.schemas.semantic_contracts import SemanticTurnAnalysis
from app.schemas.state import MatterState
from app.schedule.schedule2_candidate_service import Schedule2CandidateSearchService


class FullContextTurnResolverService:
    """LLM-only full-context legal-focus resolver.

    The resolver has no deterministic semantic fallback and no runtime switch.
    It always asks the full-context LLM to resolve the current focus, then applies
    schema/serialization/execution-safety normalization only.
    """

    def __init__(
        self,
        *,
        candidate_service: Schedule2CandidateSearchService | None = None,
        client: Any | None = None,
    ) -> None:
        self.settings = get_settings()
        self.candidate_service = candidate_service or Schedule2CandidateSearchService()
        self.model = os.getenv(
            "FULL_CONTEXT_RESOLVER_MODEL",
            os.getenv("SEMANTIC_TURN_MODEL", os.getenv("GENERAL_QA_MODEL", "gpt-5.4-mini")),
        )
        self._client: Any | None = client

    @property
    def client(self) -> Any:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(api_key=self.settings.openai_api_key)
        return self._client

    def resolve(
        self,
        *,
        raw_user_message: str,
        internal_question_en: str,
        current_state: MatterState,
        semantic_turn: SemanticTurnAnalysis,
        pending_offer: dict[str, Any] | None = None,
        conversation_history: list[dict[str, Any]] | None = None,
        response_language: str | None = None,
    ) -> FullContextTurnResolution:
        known_facts = dict(current_state.carried_intake_facts or {})
        semantic_facts = self._semantic_fact_dict(semantic_turn)
        combined_facts = {**known_facts, **semantic_facts}
        schedule_candidates = self._schedule_candidates(raw_user_message, combined_facts)
        payload = self._build_payload(
            raw_user_message=raw_user_message,
            internal_question_en=internal_question_en,
            current_state=current_state,
            semantic_turn=semantic_turn,
            pending_offer=pending_offer,
            conversation_history=conversation_history or [],
            response_language=response_language,
            schedule_candidates=schedule_candidates,
        )

        try:
            raw_text = self._call_llm(payload=payload, repair_instruction=None)
            parsed = self._extract_json_object(raw_text)
            if not isinstance(parsed, dict):
                raw_text = self._call_llm(
                    payload={**payload, "invalid_model_output": raw_text[:6000]},
                    repair_instruction="Your previous output was not parseable JSON. Return only one valid JSON object using the required schema.",
                )
                parsed = self._extract_json_object(raw_text)
            if not isinstance(parsed, dict):
                return self._failure_resolution(
                    response_language=response_language,
                    schedule_candidates=schedule_candidates,
                    reason="llm_returned_no_parseable_json_after_repair",
                    raw_text=raw_text,
                )

            resolution = self._coerce_or_repair(
                parsed=parsed,
                payload=payload,
                raw_text=raw_text,
                response_language=response_language,
                schedule_candidates=schedule_candidates,
            )
            return self._postprocess_resolution(
                resolution,
                response_language=response_language,
                schedule_candidates=schedule_candidates,
            )
        except Exception as exc:
            return self._failure_resolution(
                response_language=response_language,
                schedule_candidates=schedule_candidates,
                reason=f"llm_resolution_failed:{type(exc).__name__}",
                raw_text=str(exc)[:2000],
            )

    def _build_payload(
        self,
        *,
        raw_user_message: str,
        internal_question_en: str,
        current_state: MatterState,
        semantic_turn: SemanticTurnAnalysis,
        pending_offer: dict[str, Any] | None,
        conversation_history: list[dict[str, Any]],
        response_language: str | None,
        schedule_candidates: list[Any],
    ) -> dict[str, Any]:
        return {
            "latest_user_message_raw": raw_user_message,
            "latest_user_message_internal_en": internal_question_en,
            "response_language_hint": response_language,
            "pending_offer": pending_offer,
            "current_state": {
                "conversation_state": current_state.conversation_state,
                "issue_type": current_state.issue_type,
                "operation_type": current_state.operation_type,
                "visa_type": current_state.visa_type,
                "carried_intake_facts": current_state.carried_intake_facts,
                "case_hypothesis": current_state.case_hypothesis.model_dump(),
                "interaction_plan": current_state.interaction_plan.model_dump(),
            },
            "recent_conversation_history": conversation_history,
            "semantic_turn_analysis": semantic_turn.model_dump(),
            "schedule2_candidates": [candidate.model_dump() for candidate in schedule_candidates],
            "instructions": {
                "core_rule": "Use full context to resolve the current legal focus. Do not answer the user.",
                "visa_model": "Visas are persistent entities; roles are contextual and turn-specific.",
                "artifact_rule": "A pending offer is only a CTA. Artifact generation requires explicit request language in the latest user message.",
                "fact_update_rule": "If the latest message adds factual details, classify it as fact_update unless it explicitly asks for an artifact.",
                "target_rule": "For refusal/review questions, refused/applied visa is primary; previous visa is supporting history.",
                "schedule_rule": "Use Schedule 2 candidates as grounding. primary_subclass must be a real subclass code like 500, 485, 820, 010, 020, or null; never use generic labels such as visa_general/student/temporary_graduate.",
            },
        }

    def _call_llm(self, *, payload: dict[str, Any], repair_instruction: str | None) -> str:
        system = self._system_prompt()
        if repair_instruction:
            system = "\n".join([system, "", "REPAIR INSTRUCTION:", repair_instruction])
        result = self.client.responses.create(
            model=self.model,
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False, default=str)},
            ],
        )
        return (getattr(result, "output_text", "") or "").strip()

    def _system_prompt(self) -> str:
        return "\n".join(
            [
                "You are a full-context turn resolver for an Australian immigration-law assistant.",
                "You do not answer the user. You output JSON only.",
                "Use the full conversation, latest message, existing facts, semantic turn, and Schedule 2 candidates.",
                "Visas are persistent entities; roles are contextual to the current focus.",
                "Do not classify a visa as permanently active/background. Choose a turn-specific LegalFocusFrame.",
                "If the user mentions a previous visa and a refused/applied visa, the refused/applied visa is the primary focus for refusal/review questions.",
                "A pending offer is only a CTA. Do not treat new factual information as accepting the offer unless the latest user explicitly asks for the artifact.",
                "If the latest message adds facts such as location, family location, reasons, dates, officer comments, visa status, or documents, classify it as fact_update unless it explicitly asks for an artifact.",
                "Artifact generation requires explicit request language such as 'help me prepare', 'generate lawyer summary', '整理给律师看的案情摘要', 'make checklist', or similar.",
                "primary_subclass must be a real visa subclass code such as 500, 485, 820, 010, 020, 600, or null. Never output visa_general, student, temporary_graduate, partner, visitor, or other category labels in primary_subclass.",
                "If several visas are mentioned, create/update visa entities and assign each one a role in the current focus.",
                "If the user asks multiple possible pathways, use candidate_focuses rather than forcing one subclass.",
                "Return exactly this JSON shape:",
                "{\"response_language\": \"en|zh\", \"turn_purpose\": \"new_legal_question|fact_update|answer_to_previous_question|explicit_artifact_request|explicit_booking_request|topic_switch|smalltalk|unclear\", \"contains_substantive_new_facts\": false, \"substantive_fact_keys\": [], \"visa_entities_update\": [{\"subclass\": null, \"merge_with_existing_entity\": null, \"label\": null, \"add_roles\": [], \"add_facts\": {}, \"confidence\": \"medium\", \"reason\": null}], \"current_focus\": {\"focus_id\": null, \"user_request_summary\": null, \"primary_visa_entity_id\": null, \"primary_subclass\": null, \"primary_role\": null, \"supporting_entities\": [], \"candidate_focuses\": [], \"issue_family\": null, \"operation\": null, \"suggested_case_frame_id\": null, \"schedule2_candidate_subclasses\": [], \"schedule1_relevance\": \"none\", \"deferred_dependencies\": [], \"next_best_question\": null, \"answer_strategy\": \"answer_first_then_ask\", \"confidence\": \"medium\", \"reason\": null}, \"artifact_request\": {\"requested\": false, \"artifact_type\": \"none\", \"explicit_acceptance\": false, \"uses_pending_offer\": false, \"reason\": null}, \"pending_offer_accepted\": false, \"pending_offer_rejected_or_ignored\": false, \"execution_path\": \"legal_reasoning_pipeline\", \"force_schedule2_search\": true, \"force_fact_merge_before_artifact\": true, \"schedule2_candidates\": [], \"new_fact_updates\": {}, \"reasons\": [], \"raw_model_output\": {}}",
            ]
        )

    def _coerce_or_repair(
        self,
        *,
        parsed: dict[str, Any],
        payload: dict[str, Any],
        raw_text: str,
        response_language: str | None,
        schedule_candidates: list[Any],
    ) -> FullContextTurnResolution:
        candidate = self._without_raw_model_output(parsed)
        try:
            resolution = FullContextTurnResolution(**candidate)
        except ValidationError as exc:
            repaired_text = self._call_llm(
                payload={
                    **payload,
                    "invalid_json_object": self._json_safe(candidate),
                    "validation_error": str(exc)[:4000],
                },
                repair_instruction="The JSON object failed schema validation. Repair enum values and missing fields. Return only the corrected JSON object.",
            )
            repaired = self._extract_json_object(repaired_text)
            if not isinstance(repaired, dict):
                return self._failure_resolution(
                    response_language=response_language,
                    schedule_candidates=schedule_candidates,
                    reason="llm_schema_repair_returned_no_json",
                    raw_text=repaired_text,
                )
            candidate = self._without_raw_model_output(repaired)
            resolution = FullContextTurnResolution(**candidate)
            raw_text = repaired_text

        if self._needs_focus_repair(resolution, schedule_candidates):
            repaired_text = self._call_llm(
                payload={
                    **payload,
                    "invalid_resolution": resolution.model_dump(mode="json"),
                    "validation_error": (
                        "Resolution had missing/invalid focus. primary_subclass must be a real subclass code or null, "
                        "and the current focus should reflect the latest user request. For refusal/review, applied/refused visa beats previous visa."
                    ),
                },
                repair_instruction="Repair the legal focus using the latest message, history, and Schedule 2 candidates. Return only valid JSON.",
            )
            repaired = self._extract_json_object(repaired_text)
            if isinstance(repaired, dict):
                try:
                    resolution = FullContextTurnResolution(**self._without_raw_model_output(repaired))
                    raw_text = repaired_text
                except ValidationError:
                    pass

        resolution.raw_model_output = {
            "raw_output_preview": raw_text[:4000],
            "schedule2_candidates_supplied": [candidate.model_dump() for candidate in schedule_candidates],
        }
        return resolution

    def _postprocess_resolution(
        self,
        resolution: FullContextTurnResolution,
        *,
        response_language: str | None,
        schedule_candidates: list[Any],
    ) -> FullContextTurnResolution:
        """Schema-level and execution-safety normalization only."""
        if response_language in {"en", "zh"}:
            resolution.response_language = response_language  # type: ignore[assignment]

        # Remove generic category labels from primary_subclass; keep uncertainty as None.
        normalized_primary = normalize_subclass(resolution.current_focus.primary_subclass)
        if resolution.current_focus.primary_subclass and not normalized_primary:
            resolution.reasons.append("normalized_invalid_primary_subclass_to_null")
        resolution.current_focus.primary_subclass = normalized_primary

        cleaned_candidates: list[str] = []
        for item in resolution.current_focus.schedule2_candidate_subclasses:
            sub = normalize_subclass(item)
            if sub and sub not in cleaned_candidates:
                cleaned_candidates.append(sub)
        if not cleaned_candidates:
            cleaned_candidates = [
                str(getattr(candidate, "subclass", ""))
                for candidate in schedule_candidates
                if normalize_subclass(getattr(candidate, "subclass", None))
            ]
        resolution.current_focus.schedule2_candidate_subclasses = cleaned_candidates

        if not resolution.schedule2_candidates:
            resolution.schedule2_candidates = [candidate.model_dump() for candidate in schedule_candidates]

        if not resolution.artifact_request.requested:
            resolution.artifact_request.artifact_type = "none"
            resolution.artifact_request.explicit_acceptance = False
            resolution.artifact_request.uses_pending_offer = False
            resolution.pending_offer_accepted = False
            if resolution.execution_path in {"artifact_only", "legal_reasoning_then_artifact"}:
                resolution.execution_path = "legal_reasoning_pipeline"
                resolution.reasons.append("normalized_no_artifact_request_to_legal_pipeline")

        if resolution.artifact_request.requested and not resolution.artifact_request.explicit_acceptance:
            # The LLM may say an artifact is useful. Execution requires explicit user request.
            resolution.artifact_request.requested = False
            resolution.artifact_request.artifact_type = "none"
            resolution.artifact_request.uses_pending_offer = False
            resolution.pending_offer_accepted = False
            resolution.execution_path = "legal_reasoning_pipeline"
            resolution.reasons.append("normalized_artifact_without_explicit_acceptance_to_legal_pipeline")

        if resolution.artifact_request.requested and resolution.contains_substantive_new_facts and resolution.execution_path == "artifact_only":
            resolution.execution_path = "legal_reasoning_then_artifact"
            resolution.reasons.append("normalized_factful_artifact_to_legal_then_artifact")

        if resolution.artifact_request.requested and resolution.artifact_request.artifact_type == "none":
            resolution.artifact_request.requested = False
            resolution.artifact_request.explicit_acceptance = False
            resolution.artifact_request.uses_pending_offer = False
            resolution.pending_offer_accepted = False
            resolution.execution_path = "legal_reasoning_pipeline"
            resolution.reasons.append("normalized_invalid_artifact_type_to_legal_pipeline")

        resolution.force_schedule2_search = True
        resolution.force_fact_merge_before_artifact = True
        return resolution

    def _needs_focus_repair(self, resolution: FullContextTurnResolution, schedule_candidates: list[Any]) -> bool:
        primary = normalize_subclass(resolution.current_focus.primary_subclass)
        if resolution.current_focus.primary_subclass and not primary:
            return True
        # If the LLM says there are substantive facts but produces neither focus nor candidate focus,
        # ask the LLM to repair rather than using deterministic fallback.
        if resolution.contains_substantive_new_facts and not primary and not resolution.current_focus.candidate_focuses:
            return True
        if schedule_candidates and resolution.turn_purpose in {"new_legal_question", "fact_update", "answer_to_previous_question"}:
            if not primary and not resolution.current_focus.candidate_focuses:
                return True
        return False

    def _failure_resolution(
        self,
        *,
        response_language: str | None,
        schedule_candidates: list[Any],
        reason: str,
        raw_text: str,
    ) -> FullContextTurnResolution:
        """Fail safely without deterministic semantic fallback.

        This does not infer visa roles, artifact intent, or legal target. It only
        prevents the old early task branch from executing when full-context LLM
        resolution is unavailable.
        """
        return FullContextTurnResolution(
            response_language="zh" if response_language == "zh" else "en",
            turn_purpose="unclear",
            contains_substantive_new_facts=False,
            substantive_fact_keys=[],
            execution_path="legal_reasoning_pipeline",
            force_schedule2_search=True,
            force_fact_merge_before_artifact=True,
            schedule2_candidates=[candidate.model_dump() for candidate in schedule_candidates],
            new_fact_updates={},
            reasons=[reason, "llm_only_fail_safe_no_semantic_fallback"],
            raw_model_output={"error_or_raw_text": raw_text[:2000]},
        )

    def _semantic_fact_dict(self, semantic_turn: SemanticTurnAnalysis) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for fact in semantic_turn.extracted_facts or []:
            if fact.status == "filled" and fact.value not in (None, ""):
                out[fact.fact_key] = fact.value
            elif fact.status == "user_unsure":
                out[fact.fact_key] = "not_sure"
            elif fact.status == "not_applicable":
                out[fact.fact_key] = "not_applicable"
        return out

    def _schedule_candidates(self, question: str, facts: dict[str, Any]) -> list[Any]:
        try:
            return self.candidate_service.search(question=question, known_facts=facts)
        except Exception:
            return []

    def _extract_json_object(self, text: str) -> dict[str, Any] | None:
        text = (text or "").strip()
        if not text:
            return None
        if text.startswith("```"):
            text = text.strip("`").strip()
            if text.lower().startswith("json"):
                text = text[4:].strip()
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            pass

        decoder = json.JSONDecoder()
        for idx, char in enumerate(text):
            if char != "{":
                continue
            try:
                parsed, _end = decoder.raw_decode(text[idx:])
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                continue
        return None

    def _without_raw_model_output(self, value: dict[str, Any]) -> dict[str, Any]:
        copied = self._json_safe(value)
        if isinstance(copied, dict):
            copied.pop("raw_model_output", None)
            return copied
        return {}

    def _json_safe(self, value: Any) -> Any:
        try:
            return json.loads(json.dumps(value, ensure_ascii=False, default=str))
        except Exception:
            return copy.deepcopy(value)
