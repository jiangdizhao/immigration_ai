from __future__ import annotations

import json
import os
import re
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.legal_focus import (
    ArtifactRequest,
    FocusEntityRole,
    FullContextTurnResolution,
    LegalFocusFrame,
    VisaEntityUpdate,
)
from app.schemas.semantic_contracts import SemanticTurnAnalysis
from app.schemas.state import MatterState
from app.schedule.schedule2_candidate_service import Schedule2CandidateSearchService


INTERNAL_FACT_KEYS = {
    "issue_type",
    "operation_type",
    "visa_type",
    "active_case_frame_id",
    "case_family",
    "answer_preference",
    "answer_tier",
    "pending_offer",
    "user_question",
    "preferred_language",
}

ARTIFACT_KEYWORDS_ZH = (
    "整理", "生成", "写", "起草", "做", "列", "准备", "摘要", "案情", "律师", "清单", "材料", "解释信"
)
ARTIFACT_KEYWORDS_EN = (
    "prepare", "make", "write", "draft", "generate", "lawyer", "brief", "summary", "checklist", "document list", "statement"
)

VISA_LABELS = {
    "010": "Bridging A",
    "020": "Bridging B",
    "030": "Bridging C",
    "050": "Bridging E",
    "485": "Temporary Graduate visa",
    "500": "Student visa",
    "600": "Visitor visa",
    "820": "Partner visa",
    "801": "Partner visa permanent stage",
}


class FullContextTurnResolverService:
    """Full-context legal-focus resolver.

    The resolver uses an LLM when available, but it also has a conservative
    deterministic fallback. Its purpose is not to answer the user. It updates
    visa entities, chooses the current legal focus, and decides whether an
    artifact was explicitly requested.
    """

    def __init__(
        self,
        *,
        candidate_service: Schedule2CandidateSearchService | None = None,
        use_llm: bool | None = None,
    ) -> None:
        self.settings = get_settings()
        self.candidate_service = candidate_service or Schedule2CandidateSearchService()
        self.model = os.getenv(
            "FULL_CONTEXT_RESOLVER_MODEL",
            os.getenv("SEMANTIC_TURN_MODEL", os.getenv("GENERAL_QA_MODEL", "gpt-5.4-mini")),
        )
        self.use_llm = (
            os.getenv("FULL_CONTEXT_RESOLVER_USE_LLM", "true").strip().lower() not in {"0", "false", "no"}
            if use_llm is None
            else use_llm
        )
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
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

        fallback = self._fallback_resolution(
            raw_user_message=raw_user_message,
            semantic_turn=semantic_turn,
            current_state=current_state,
            pending_offer=pending_offer,
            response_language=response_language,
            schedule_candidates=schedule_candidates,
        )

        if not self.use_llm:
            return fallback

        try:
            payload = {
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
                "recent_conversation_history": conversation_history or [],
                "semantic_turn_analysis": semantic_turn.model_dump(),
                "schedule2_candidates": [candidate.model_dump() for candidate in schedule_candidates],
                "fallback_resolution": fallback.model_dump(),
            }
            result = self.client.responses.create(
                model=self.model,
                input=[
                    {"role": "system", "content": self._system_prompt()},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
            )
            parsed = self._extract_json_object(result.output_text or "")
            if not isinstance(parsed, dict):
                return fallback
            parsed.setdefault("raw_model_output", {})
            parsed["raw_model_output"] = {"raw_model_output": parsed, "fallback_used_for_validation": fallback.model_dump()}
            resolution = FullContextTurnResolution(**parsed)
            return self._postprocess_resolution(resolution, fallback=fallback, semantic_turn=semantic_turn)
        except Exception:
            return fallback

    def _system_prompt(self) -> str:
        return "\n".join(
            [
                "You are a full-context turn resolver for an Australian immigration-law assistant.",
                "You do not answer the user. You output JSON only.",
                "Use the full conversation, latest message, existing facts, semantic turn, and Schedule 2 candidates.",
                "Visas are persistent entities; roles are contextual to the current focus.",
                "Do not classify a visa as permanently active/background. Instead, choose a turn-specific LegalFocusFrame.",
                "If the user mentions a previous visa and a refused/applied visa, the refused/applied visa is the primary focus for refusal/review questions.",
                "A pending offer is only a CTA. Do not treat new factual information as accepting the offer unless the latest user explicitly asks for the artifact.",
                "If the latest message adds facts such as location, family location, reasons, dates, officer comments, visa status, or documents, classify it as fact_update unless it explicitly asks for an artifact.",
                "Artifact generation requires explicit request language such as 'help me prepare', 'generate lawyer summary', '整理给律师看的案情摘要', 'make checklist', or similar.",
                "Return exactly this JSON shape:",
                "{\"response_language\": \"en|zh\", \"turn_purpose\": \"new_legal_question|fact_update|answer_to_previous_question|explicit_artifact_request|explicit_booking_request|topic_switch|smalltalk|unclear\", \"contains_substantive_new_facts\": false, \"substantive_fact_keys\": [], \"visa_entities_update\": [{\"subclass\": null, \"merge_with_existing_entity\": null, \"label\": null, \"add_roles\": [], \"add_facts\": {}, \"confidence\": \"medium\", \"reason\": null}], \"current_focus\": {\"focus_id\": null, \"user_request_summary\": null, \"primary_visa_entity_id\": null, \"primary_subclass\": null, \"primary_role\": null, \"supporting_entities\": [], \"candidate_focuses\": [], \"issue_family\": null, \"operation\": null, \"suggested_case_frame_id\": null, \"schedule2_candidate_subclasses\": [], \"schedule1_relevance\": \"none\", \"deferred_dependencies\": [], \"next_best_question\": null, \"answer_strategy\": \"answer_first_then_ask\", \"confidence\": \"medium\", \"reason\": null}, \"artifact_request\": {\"requested\": false, \"artifact_type\": \"none\", \"explicit_acceptance\": false, \"uses_pending_offer\": false, \"reason\": null}, \"pending_offer_accepted\": false, \"pending_offer_rejected_or_ignored\": false, \"execution_path\": \"legal_reasoning_pipeline\", \"force_schedule2_search\": true, \"force_fact_merge_before_artifact\": true, \"schedule2_candidates\": [], \"new_fact_updates\": {}, \"reasons\": [], \"raw_model_output\": {}}",
            ]
        )

    def _fallback_resolution(
        self,
        *,
        raw_user_message: str,
        semantic_turn: SemanticTurnAnalysis,
        current_state: MatterState,
        pending_offer: dict[str, Any] | None,
        response_language: str | None,
        schedule_candidates: list[Any],
    ) -> FullContextTurnResolution:
        facts = self._semantic_fact_dict(semantic_turn)
        substantive = self._substantive_fact_keys(semantic_turn)
        explicit_artifact, artifact_type, artifact_reason = self._explicit_artifact_request(raw_user_message)
        roles = self._visa_roles(raw_user_message=raw_user_message, facts={**dict(current_state.carried_intake_facts or {}), **facts}, candidates=schedule_candidates)
        primary_subclass, primary_role, operation, issue_family = self._primary_focus_from_roles(roles, semantic_turn)
        suggested_frame = self._suggested_case_frame(primary_subclass, primary_role, operation)
        supporting = []
        for role, subclass in roles.items():
            if subclass and subclass != primary_subclass:
                supporting.append(FocusEntityRole(subclass=subclass, role_in_this_focus=role))

        if explicit_artifact and not substantive:
            execution = "artifact_only"
        elif explicit_artifact:
            execution = "legal_reasoning_then_artifact"
        elif semantic_turn.conversation_act == "smalltalk" and not schedule_candidates:
            execution = "triage_only"
        else:
            execution = "legal_reasoning_pipeline"

        focus = LegalFocusFrame(
            user_request_summary=raw_user_message[:240],
            primary_subclass=primary_subclass,
            primary_role=primary_role,
            supporting_entities=supporting,
            issue_family=issue_family,
            operation=operation,
            suggested_case_frame_id=suggested_frame,
            schedule2_candidate_subclasses=[str(getattr(c, "subclass", "")) for c in schedule_candidates if getattr(c, "subclass", None)],
            next_best_question=self._next_question(primary_subclass, primary_role, operation),
            answer_strategy="answer_first_then_ask" if operation else "triage",
            confidence="high" if primary_subclass else "medium",
            reason="fallback_full_context_focus_resolution",
        )
        artifact = ArtifactRequest(
            requested=explicit_artifact,
            artifact_type=artifact_type,  # type: ignore[arg-type]
            explicit_acceptance=explicit_artifact,
            uses_pending_offer=bool(explicit_artifact and pending_offer and artifact_type == str(pending_offer.get("offer_type"))),
            reason=artifact_reason,
        )
        return FullContextTurnResolution(
            response_language="zh" if response_language == "zh" else "en",
            turn_purpose="explicit_artifact_request" if explicit_artifact and not substantive else "fact_update" if substantive else semantic_turn.conversation_act if semantic_turn.conversation_act in {"new_legal_question", "fact_update", "answer_to_previous_question", "topic_switch", "smalltalk", "unclear"} else "new_legal_question",
            contains_substantive_new_facts=bool(substantive),
            substantive_fact_keys=substantive,
            visa_entities_update=self._visa_entity_updates(roles, facts=facts),
            current_focus=focus,
            artifact_request=artifact,
            pending_offer_accepted=bool(artifact.uses_pending_offer),
            pending_offer_rejected_or_ignored=bool(pending_offer and not artifact.uses_pending_offer),
            execution_path=execution,  # type: ignore[arg-type]
            force_schedule2_search=True,
            force_fact_merge_before_artifact=True,
            schedule2_candidates=[candidate.model_dump() for candidate in schedule_candidates],
            new_fact_updates=facts,
            reasons=[
                "fallback_resolution",
                "substantive_facts_force_legal_pipeline" if substantive and not explicit_artifact else "",
                "explicit_artifact_request" if explicit_artifact else "no_explicit_artifact_request",
            ],
        )

    def _postprocess_resolution(
        self,
        resolution: FullContextTurnResolution,
        *,
        fallback: FullContextTurnResolution,
        semantic_turn: SemanticTurnAnalysis,
    ) -> FullContextTurnResolution:
        # Thin execution safeguard: factual turns without explicit artifact
        # request must stay in the legal reasoning pipeline, even if the LLM was
        # tempted by a pending offer.
        explicit_artifact, artifact_type, artifact_reason = self._explicit_artifact_request(
            resolution.current_focus.user_request_summary or ""
        )
        # The LLM may not have the exact raw text in current_focus summary; use
        # fallback artifact result as a conservative floor.
        if not fallback.artifact_request.requested and resolution.contains_substantive_new_facts:
            resolution.artifact_request.requested = False
            resolution.artifact_request.artifact_type = "none"
            resolution.artifact_request.explicit_acceptance = False
            resolution.artifact_request.uses_pending_offer = False
            resolution.pending_offer_accepted = False
            resolution.pending_offer_rejected_or_ignored = True
            resolution.execution_path = "legal_reasoning_pipeline"
            resolution.reasons.append("safeguard_fact_update_not_artifact")
        elif fallback.artifact_request.requested:
            resolution.artifact_request.requested = True
            resolution.artifact_request.artifact_type = fallback.artifact_request.artifact_type
            resolution.artifact_request.explicit_acceptance = True
            resolution.artifact_request.reason = artifact_reason or fallback.artifact_request.reason

        if not resolution.current_focus.primary_subclass:
            resolution.current_focus.primary_subclass = fallback.current_focus.primary_subclass
        if not resolution.current_focus.primary_role:
            resolution.current_focus.primary_role = fallback.current_focus.primary_role
        if not resolution.current_focus.operation:
            resolution.current_focus.operation = fallback.current_focus.operation
        if not resolution.current_focus.issue_family:
            resolution.current_focus.issue_family = fallback.current_focus.issue_family
        if not resolution.current_focus.suggested_case_frame_id:
            resolution.current_focus.suggested_case_frame_id = self._suggested_case_frame(
                resolution.current_focus.primary_subclass,
                resolution.current_focus.primary_role,
                resolution.current_focus.operation,
            )
        if not resolution.new_fact_updates:
            resolution.new_fact_updates = fallback.new_fact_updates
        return resolution

    def _schedule_candidates(self, raw_user_message: str, facts: dict[str, Any]) -> list[Any]:
        try:
            return self.candidate_service.search(question=raw_user_message, known_facts=facts)
        except Exception:
            return []

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

    def _substantive_fact_keys(self, semantic_turn: SemanticTurnAnalysis) -> list[str]:
        keys: list[str] = []
        for fact in semantic_turn.extracted_facts or []:
            if fact.fact_key in INTERNAL_FACT_KEYS:
                continue
            if fact.status != "filled" or fact.value in (None, "", [], {}):
                continue
            if fact.evidence_source not in {"latest_user_turn", "conversation_history", "structured_intake"}:
                continue
            keys.append(fact.fact_key)
        return keys

    def _explicit_artifact_request(self, text: str) -> tuple[bool, str, str | None]:
        q = (text or "").strip().lower()
        if not q:
            return False, "none", None
        zh = any(token in q for token in ARTIFACT_KEYWORDS_ZH)
        en = any(token in q for token in ARTIFACT_KEYWORDS_EN)
        if not (zh or en):
            return False, "none", None

        if re.search(r"(律师|移民代理).*(摘要|案情|brief|summary)|lawyer.*(brief|summary)|solicitor.*(brief|summary)|migration agent.*(brief|summary)", q, flags=re.I):
            return True, "lawyer_brief", "explicit_lawyer_brief_request"
        if re.search(r"(材料|文件).*(清单|列表)|document.*(checklist|list)|evidence.*(checklist|list)", q, flags=re.I):
            return True, "document_checklist", "explicit_document_checklist_request"
        if re.search(r"(解释信|陈述|statement|letter|email|邮件)", q, flags=re.I):
            return True, "draft_statement", "explicit_draft_request"
        if re.search(r"(时间线|timeline|行动计划|action plan|next step plan)", q, flags=re.I):
            return True, "timeline_plan", "explicit_timeline_request"
        if re.search(r"(预约|book|booking|appointment)", q, flags=re.I):
            return True, "booking_handoff", "explicit_booking_request"
        if re.search(r"^(好|可以|行|yes|ok|okay)[，,\s]*(帮我|please|do it|make it|prepare)", q, flags=re.I):
            return True, "lawyer_brief", "explicit_acceptance_with_task_verb"
        return False, "none", None

    def _visa_roles(self, *, raw_user_message: str, facts: dict[str, Any], candidates: list[Any]) -> dict[str, str]:
        roles: dict[str, str] = {}

        def norm(value: Any) -> str | None:
            text = str(value or "").lower()
            m = re.search(r"\b(010|020|030|040|041|050|051|060|070|300|309|400|403|407|417|482|485|489|491|494|500|590|600|601|651|801|802|820|870|884|888)\b", text)
            if m:
                return m.group(1).upper()
            if "student" in text or "学生" in text:
                return "500"
            if "temporary graduate" in text or "485" in text or "毕业" in text:
                return "485"
            if "partner" in text or "配偶" in text:
                return "820"
            if "visitor" in text or "tourist" in text or "旅游" in text:
                return "600"
            if "bva" in text or "bridging visa a" in text:
                return "010"
            if "bvb" in text or "bridging visa b" in text:
                return "020"
            return None

        for key in ("refused_visa_subclass", "refused_visa", "refused_application", "applied_visa_subclass", "applied_visa_type", "applied_visa"):
            sub = norm(facts.get(key))
            if sub:
                roles["refused_application" if "refus" in key or str(facts.get("visa_application_outcome") or "").lower() == "refused" else "applied_application"] = sub
        if str(facts.get("visa_application_outcome") or "").lower() in {"refused", "拒签", "refusal"}:
            sub = norm(facts.get("applied_visa_type") or facts.get("applied_visa") or facts.get("visa_subclass"))
            if sub:
                roles["refused_application"] = sub
        for key in ("previous_visa_subclass", "previous_visa_type", "previous_visa"):
            sub = norm(facts.get(key))
            if sub:
                roles["previous_visa"] = sub
        for key in ("current_visa", "bridging_status"):
            sub = norm(facts.get(key))
            if sub:
                roles["current_visa"] = sub
        for key in ("target_visa_subclass", "target_application", "intended_visa"):
            sub = norm(facts.get(key))
            if sub:
                roles["target_application"] = sub

        # Latest text can provide role hints even if semantic keys are non-standard.
        q = raw_user_message.lower()
        if "之前" in q or "previous" in q or "used to" in q:
            for sub in re.findall(r"\b(485|500|820|600|010|020)\b", raw_user_message):
                if sub == "485" and "previous_visa" not in roles:
                    roles["previous_visa"] = sub
        if ("被拒" in q or "refused" in q or "refusal" in q) and "refused_application" not in roles:
            for sub in re.findall(r"\b(500|485|820|600)\b", raw_user_message):
                roles["refused_application"] = sub
                break

        if not roles and candidates:
            roles["target_application"] = str(getattr(candidates[0], "subclass", ""))
        return roles

    def _primary_focus_from_roles(self, roles: dict[str, str], semantic_turn: SemanticTurnAnalysis) -> tuple[str | None, str | None, str | None, str | None]:
        q_operation = semantic_turn.case_routing.operation_type
        if roles.get("refused_application"):
            sub = roles["refused_application"]
            if sub == "500":
                return sub, "refused_application", "student_refusal_next_steps", "visa_refusal"
            if sub == "485":
                return sub, "refused_application", "review_rights", "visa_refusal"
            return sub, "refused_application", "review_rights", "visa_refusal"
        if roles.get("target_application"):
            sub = roles["target_application"]
            return sub, "target_application", q_operation or self._operation_for_subclass(sub), self._issue_for_subclass(sub)
        if roles.get("current_visa"):
            sub = roles["current_visa"]
            return sub, "current_visa", q_operation or self._operation_for_subclass(sub), self._issue_for_subclass(sub)
        if roles.get("previous_visa") and not roles.get("target_application"):
            sub = roles["previous_visa"]
            return sub, "previous_visa_context", q_operation or self._operation_for_subclass(sub), self._issue_for_subclass(sub)
        return None, None, q_operation, semantic_turn.case_routing.issue_type

    def _operation_for_subclass(self, subclass: str | None) -> str | None:
        if subclass == "500":
            return "student_500_application_readiness"
        if subclass == "485":
            return "485_stream_selection"
        if subclass in {"010", "020"}:
            return "bridging_travel"
        if subclass == "820":
            return "partner_820_general"
        return None

    def _issue_for_subclass(self, subclass: str | None) -> str | None:
        if subclass == "500":
            return "student_visa"
        if subclass == "485":
            return "temporary_graduate_visa"
        if subclass in {"010", "020", "030", "050"}:
            return "bridging_visa"
        if subclass == "820":
            return "partner_visa"
        return None

    def _suggested_case_frame(self, primary_subclass: str | None, primary_role: str | None, operation: str | None) -> str | None:
        if primary_subclass == "500" and primary_role == "refused_application":
            return "500_refusal_review"
        if primary_subclass == "485" and primary_role == "refused_application":
            return "485_refusal_review"
        if primary_subclass == "500" and operation == "student_refusal_next_steps":
            return "500_refusal_review"
        return None

    def _next_question(self, primary_subclass: str | None, primary_role: str | None, operation: str | None) -> str | None:
        if primary_role == "refused_application":
            return "你收到拒签通知是哪一天？拒签信里是否写了 review rights / ART？"
        if operation == "bridging_travel":
            return "你现在只有 BVA，还是已经拿到 BVB？"
        if primary_subclass == "820":
            return "你当前签证是否有 8503 / No Further Stay 条件？"
        return None

    def _visa_entity_updates(self, roles: dict[str, str], *, facts: dict[str, Any]) -> list[VisaEntityUpdate]:
        updates: list[VisaEntityUpdate] = []
        for role, sub in roles.items():
            updates.append(
                VisaEntityUpdate(
                    subclass=sub,
                    label=VISA_LABELS.get(sub),
                    add_roles=[role],
                    add_facts={key: value for key, value in facts.items() if key not in INTERNAL_FACT_KEYS},
                    confidence="high" if role in {"refused_application", "target_application"} else "medium",
                    reason="derived_from_full_context_semantic_facts",
                )
            )
        return updates

    def _extract_json_object(self, text: str) -> Any:
        text = (text or "").strip()
        if not text:
            return None
        try:
            return json.loads(text)
        except Exception:
            pass
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except Exception:
                return None
        return None
