from __future__ import annotations

from app.schemas.semantic_contracts import CommunicationPlan, LegalDecisionObject, SemanticTurnAnalysis


class CommunicationPlanService:
    """Create communication requirements from a validated legal decision.

    This service does not classify raw user language. It turns structured legal
    state into natural communication constraints. It encourages elegant layout
    without forcing every answer into the same canned template.
    """

    def build(
        self,
        *,
        decision: LegalDecisionObject,
        semantic_turn: dict | None = None,
        response_language: str = "en",
    ) -> CommunicationPlan:
        semantic = self._coerce_semantic(semantic_turn)
        plan = CommunicationPlan(response_language="zh" if response_language == "zh" else "en")

        if semantic and semantic.should_handle_as_task:
            plan.strategy = "task_fulfillment"
            plan.task_output.task_type = semantic.task_intent.task_type
            plan.task_output.complete_task_first = True
            plan.task_output.output_format = self._format_for_task(semantic.task_intent.task_type)  # type: ignore[assignment]
        elif decision.risk_assessment.should_escalate_to_lawyer:
            plan.strategy = "urgent_status_triage" if decision.risk_assessment.urgency in {"high", "urgent"} else "lawyer_handoff"
        elif decision.answer_mode in {"answer_then_ask", "ask_followup"}:
            plan.strategy = "answer_then_one_question"
        elif decision.answer_mode == "cannot_answer_safely":
            plan.strategy = "cannot_answer_safely"
        else:
            plan.strategy = "direct_consultant_answer"

        if decision.risk_assessment.urgency in {"high", "urgent"}:
            plan.style_rules.tone = "urgent_but_calm"
        elif decision.answer_mode == "cannot_answer_safely":
            plan.style_rules.tone = "careful_formal"
        else:
            plan.style_rules.tone = "professional_friendly"

        if decision.legal_position.provisional_conclusion:
            plan.content.must_include_points.append(decision.legal_position.provisional_conclusion)
        plan.content.must_include_points.extend(decision.legal_position.can_say)
        plan.content.must_not_include_points.extend(decision.legal_position.cannot_say)
        plan.content.caveats_to_include.extend(decision.legal_position.required_caveats)
        plan.content.practical_actions.extend(decision.action_recommendation.today_actions)
        plan.content.documents_to_prepare.extend(decision.action_recommendation.document_preparation)
        plan.content.optional_next_question = decision.action_recommendation.one_next_question

        # Layout guidance: formal, readable, but not a hard-coded paragraph template.
        if plan.strategy == "urgent_status_triage":
            plan.content.should_include_points.extend([
                "Use clear short headings, for example: 初步判断, 为什么紧急, 现在马上做, 准备给律师看的材料, 下一步.",
                "Keep the opening direct and case-specific.",
                "Use bullets for actions and documents.",
            ])
        elif plan.strategy == "task_fulfillment":
            plan.content.should_include_points.extend([
                "Complete the requested artifact first.",
                "Use clean headings and bullets so the output can be copied to a lawyer, school, Home Affairs, or the user.",
            ])
        else:
            plan.content.should_include_points.extend([
                "Use an elegant, readable structure with 2-4 short headings only when helpful.",
                "Prefer concise paragraphs and bullets over dense blocks of text.",
            ])

        # Firm prohibitions learned from competitor comparison.
        plan.content.must_not_include_points.extend([
            "Do not use fake percentages, risk scores, outcome graphics, pie charts, or AMEC-style marketing claims.",
            "Do not include donation, YouTube, unrelated advertising, or raw links unless the product has an approved booking URL.",
            "Do not sound like a copied template; vary wording naturally and anchor the answer to the user's facts.",
        ])

        if decision.missing_facts and decision.action_recommendation.one_next_question:
            plan.question_policy = "ask_one_required_question"
        elif decision.action_recommendation.one_next_question:
            plan.question_policy = "ask_one_optional_question"
        else:
            plan.question_policy = "ask_none"

        pending = decision.action_recommendation.pending_offer_to_create
        if isinstance(pending, dict):
            plan.call_to_action.offer_next_service = True
            plan.call_to_action.offered_service_type = str(pending.get("offer_type") or "") or None
            plan.call_to_action.offered_service_label = str(pending.get("label_zh" if plan.response_language == "zh" else "label_en") or "") or None

        if decision.risk_assessment.should_escalate_to_lawyer:
            plan.call_to_action.show_booking_cta = True
            plan.call_to_action.booking_reason = decision.risk_assessment.escalation_reason
            plan.call_to_action.urgent_cta_text = (
                "建议尽快让律师或注册移民代理核对关键日期、VEVO 状态和文件。"
                if plan.response_language == "zh"
                else "A lawyer or registered migration agent should check the key dates, VEVO status, and documents promptly."
            )

        plan.final_answer_generation_prompt = self._prompt_summary(plan)
        return plan

    def pending_offer_from_plan(self, plan: CommunicationPlan, *, operation_type: str | None, case_frame_id: str | None) -> dict | None:
        if not plan.call_to_action.offer_next_service or not plan.call_to_action.offered_service_type:
            return None
        return {
            "offer_type": plan.call_to_action.offered_service_type,
            "label": plan.call_to_action.offered_service_label,
            "source_operation_type": operation_type,
            "source_frame_id": case_frame_id,
            "language": plan.response_language,
            "status": "offered",
        }

    def _format_for_task(self, task_type: str) -> str:
        mapping = {
            "draft_user_statement": "draft",
            "draft_email_or_message": "draft",
            "document_checklist": "checklist",
            "lawyer_brief": "brief",
            "status_action_plan": "timeline",
            "timeline_plan": "timeline",
            "booking_handoff": "plain_answer",
        }
        return mapping.get(task_type, "plain_answer")

    def _prompt_summary(self, plan: CommunicationPlan) -> str:
        return (
            "Write naturally as a professional immigration-law intake assistant. "
            "Use an elegant, readable layout with short headings and bullets where helpful, but do not force every answer into the same template. "
            "Start with the most useful case-specific point. "
            "Preserve uncertainty and do not invent legal conclusions. "
            "Do not use fake scores, percentages, charts, or marketing content. "
            "Ask at most one next question."
        )

    def _coerce_semantic(self, value: dict | None) -> SemanticTurnAnalysis | None:
        if not isinstance(value, dict):
            return None
        try:
            return SemanticTurnAnalysis(**value)
        except Exception:
            return None
