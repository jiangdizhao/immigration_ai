from __future__ import annotations

import json
import re
from typing import Any

from app.schemas.customer_answer import (
    CustomerAnswerPlan,
    SupportedChecklistItem,
    SupportedExample,
    SupportedFact,
    VerificationValueSummary,
)
from app.schemas.ranked_candidates import AnswerCompositionPlan, RankedCandidateMap


class CustomerAnswerPlanService:
    """Builds the customer-facing answer plan after legal verification.

    The planner is intentionally deterministic in the first patch. It does not
    add another LLM call; it packages verified facts, evidence gates, terminology
    rules, and verification-value tracing for the final-answer LLM.
    """

    PLAIN_LANGUAGE_REPLACEMENTS: dict[str, str] = {
        "stream": "visa category / pathway",
        "nomination": "the employer's request to sponsor the job role",
        "nominated occupation": "the job role the employer wants the worker to do",
        "sponsor": "the person or organisation supporting the visa application",
        "non-ongoing": "a temporary task that will finish",
        "grant criteria": "rules for approval",
        "productive work": "actually doing work or providing services",
        "subclass": "visa number / visa type",
    }

    CURRENT_DETAIL_TERMS = (
        "fee",
        "fees",
        "charge",
        "salary",
        "threshold",
        "processing time",
        "date",
        "deadline",
        "condition",
        "conditions",
    )

    DOCUMENT_TERMS = (
        "document",
        "documents",
        "checklist",
        "evidence",
        "prepare",
    )

    HIGH_RISK_TERMS = (
        "refusal",
        "refused",
        "review",
        "appeal",
        "tribunal",
        "deadline",
        "cancel",
        "noicc",
        "unlawful",
        "detention",
        "4020",
        "character",
    )

    def build(
        self,
        *,
        original_question: str,
        effective_question: str,
        known_facts: dict[str, Any],
        proposal: dict[str, Any],
        verification: dict[str, Any],
        evidence: Any,
        verification_plan: dict[str, Any] | None = None,
        response_language: str = "en",
        ranked_candidate_map: RankedCandidateMap | dict[str, Any] | None = None,
    ) -> CustomerAnswerPlan:
        verification_plan = verification_plan or {}
        ranked_candidate_map = self._ranked_candidate_map(ranked_candidate_map)
        verified_candidates = self._dict_list(verification.get("verified_candidates"))
        candidate_index = self._dict_list(proposal.get("candidate_index"))
        answer_style = self._answer_style(
            original_question=original_question,
            effective_question=effective_question,
            proposal=proposal,
            verification_plan=verification_plan,
            verified_candidates=verified_candidates,
            candidate_index=candidate_index,
            ranked_candidate_map=ranked_candidate_map,
        )
        one_question = self._one_decisive_question(
            proposal=proposal,
            verification=verification,
            ranked_candidate_map=ranked_candidate_map,
        )
        unsupported = self._unsupported_claims(verification)
        supported_facts = self._supported_facts(
            known_facts=known_facts,
            proposal=proposal,
            verified_candidates=verified_candidates,
        )
        allowed_examples = self._allowed_examples(proposal=proposal)
        allowed_checklist_items = self._allowed_checklist_items(proposal=proposal)
        blocked_examples = self._blocked_examples(
            original_question=original_question,
            proposal=proposal,
            allowed_examples=allowed_examples,
        )
        blocked_checklist_items = self._blocked_checklist_items(
            original_question=original_question,
            proposal=proposal,
            allowed_checklist_items=allowed_checklist_items,
        )
        verification_value_summary = self._verification_value_summary(
            evidence=evidence,
            verification=verification,
            verification_plan=verification_plan,
            proposal=proposal,
            response_language=response_language,
            verified_candidates=verified_candidates,
            unsupported=unsupported,
            one_question=one_question,
        )
        answer_composition_plan = self._answer_composition_plan(
            answer_style=answer_style,
            proposal=proposal,
            ranked_candidate_map=ranked_candidate_map,
            one_question=one_question,
            allowed_examples=allowed_examples,
            allowed_checklist_items=allowed_checklist_items,
        )

        return CustomerAnswerPlan(
            answer_style=answer_style,
            plain_english_bottom_line=self._bottom_line_hint(
                verified_candidates=verified_candidates,
                proposal=proposal,
                answer_style=answer_style,
                ranked_candidate_map=ranked_candidate_map,
            ),
            recommended_modules=self._recommended_modules(
                answer_style=answer_style,
                verified_candidates=verified_candidates,
                candidate_index=candidate_index,
                one_question=one_question,
                allowed_examples=allowed_examples,
                allowed_checklist_items=allowed_checklist_items,
                ranked_candidate_map=ranked_candidate_map,
            ),
            customer_terms_to_avoid=list(self.PLAIN_LANGUAGE_REPLACEMENTS.keys()),
            required_plain_language_replacements=dict(self.PLAIN_LANGUAGE_REPLACEMENTS),
            supported_customer_facts=supported_facts,
            unsupported_or_do_not_say=unsupported,
            allowed_examples=allowed_examples,
            blocked_examples=blocked_examples,
            allowed_checklist_items=allowed_checklist_items,
            blocked_checklist_items=blocked_checklist_items,
            verification_value_summary=verification_value_summary,
            ranked_candidate_map=ranked_candidate_map,
            answer_composition_plan=answer_composition_plan,
            customer_visible_source_refs=self._customer_visible_source_refs(ranked_candidate_map),
            debug_hidden_source_refs=self._debug_hidden_source_refs(ranked_candidate_map),
            one_decisive_question=one_question,
        )

    def final_answer_prompt_rules(self, plan: dict[str, Any] | CustomerAnswerPlan | None) -> str:
        """Prompt section consumed by the final-answer LLM."""
        if plan is None:
            plan_json = "{}"
        elif hasattr(plan, "model_dump"):
            plan_json = json.dumps(plan.model_dump(), ensure_ascii=False)
        else:
            plan_json = json.dumps(plan, ensure_ascii=False)
        return (
            "\nCustomerAnswerPlan rules:\n"
            "You are writing for a normal customer, not a lawyer.\n"
            "Use the CustomerAnswerPlan to decide which answer modules fit. Do not force every module into every answer.\n"
            "Put the practical bottom line first when the user asks for options, recommendation, eligibility, or next steps.\n"
            "Use plain English. Avoid legal terminology unless needed; if needed, briefly explain it in ordinary language.\n"
            "Do not invent examples, document checklists, thresholds, dates, fees, salary figures, visa conditions, processing times, deadlines, or practical warnings.\n"
            "Use examples only from CustomerAnswerPlan.allowed_examples. If allowed_examples is empty, do not include examples.\n"
            "Use checklist items only from CustomerAnswerPlan.allowed_checklist_items. If allowed_checklist_items is empty, do not include a document checklist.\n"
            "Do not state anything listed in unsupported_or_do_not_say except to say it remains unverified or should be checked by a lawyer.\n"
            "When the verified candidate map supports it, separate the most likely option, possible option, and usually unsuitable option.\n"
            "If CustomerAnswerPlan.ranked_candidate_map is present, follow ranked_candidate_map.ranked_candidates order exactly. Do not promote a lower-ranked candidate above a higher-ranked candidate.\n"
            "Use CustomerAnswerPlan.answer_composition_plan for the answer shape, opening style, decision boundary, and table permission.\n"
            "Use a short decision table only when answer_composition_plan.table_allowed is true.\n"
            "Do not mention internal JSON, proposal memo, retrieval debug, Schedule 2 discovery, verification depth, or source classes.\n"
            "You may include the short customer checking note only if verification_value_summary.customer_visible_summary is not null.\n"
            "Ask at most one decisive follow-up question, using one_decisive_question when it is present.\n"
            f"CustomerAnswerPlan JSON:\n{plan_json}\n"
        )

    def trace_fields(self, plan: CustomerAnswerPlan | dict[str, Any]) -> dict[str, Any]:
        plan_dict = plan.model_dump() if hasattr(plan, "model_dump") else dict(plan)
        return {
            "customer_answer_plan": plan_dict,
            "verification_value_summary": plan_dict.get("verification_value_summary"),
            "unsupported_claims_removed": plan_dict.get("unsupported_or_do_not_say", []),
            "customer_terms_avoided": plan_dict.get("customer_terms_to_avoid", []),
            "examples_allowed_or_blocked": {
                "allowed": plan_dict.get("allowed_examples", []),
                "blocked": plan_dict.get("blocked_examples", []),
            },
            "checklist_items_allowed_or_blocked": {
                "allowed": plan_dict.get("allowed_checklist_items", []),
                "blocked": plan_dict.get("blocked_checklist_items", []),
            },
            "answer_composition_plan": plan_dict.get("answer_composition_plan"),
            "customer_visible_source_refs": plan_dict.get("customer_visible_source_refs", []),
            "debug_hidden_source_refs": plan_dict.get("debug_hidden_source_refs", []),
        }

    def filter_customer_visible_citations(
        self,
        citations: list[Any],
        plan: CustomerAnswerPlan | dict[str, Any] | None,
    ) -> list[Any]:
        plan_dict = plan.model_dump() if hasattr(plan, "model_dump") else dict(plan or {})
        ranked_map = plan_dict.get("ranked_candidate_map") or {}
        ranked_candidates = ranked_map.get("ranked_candidates") or []
        subclasses = [
            str(item.get("subclass") or "").strip()
            for item in ranked_candidates
            if isinstance(item, dict) and str(item.get("subclass") or "").strip()
        ]
        if not subclasses:
            return citations

        visible: list[Any] = []
        for citation in citations:
            blob = " ".join(
                [
                    str(getattr(citation, "source_id", "") or ""),
                    str(getattr(citation, "title", "") or ""),
                    str(getattr(citation, "section_ref", "") or ""),
                    str(getattr(citation, "citation_text", "") or ""),
                    str(getattr(citation, "quote_text", "") or "")[:500],
                ]
            ).lower()
            if any(self._citation_mentions_subclass(blob, subclass) for subclass in subclasses):
                visible.append(citation)
        return visible

    def _answer_style(
        self,
        *,
        original_question: str,
        effective_question: str,
        proposal: dict[str, Any],
        verification_plan: dict[str, Any],
        verified_candidates: list[dict[str, Any]],
        candidate_index: list[dict[str, Any]],
        ranked_candidate_map: RankedCandidateMap | None,
    ) -> str:
        if ranked_candidate_map:
            if ranked_candidate_map.confidence_floor == "low":
                return "risk_warning"
            if len(ranked_candidate_map.ranked_candidates) >= 2:
                return "ranked_options"
            if ranked_candidate_map.ranked_candidates:
                return "eligibility_explanation"
        text = self._combined_text(original_question, effective_question, proposal.get("risk_flags"))
        depth = str(verification_plan.get("verification_depth") or "").strip()
        if depth == "high_risk_handoff" or self._contains_any(text, self.HIGH_RISK_TERMS):
            return "lawyer_handoff"
        if self._contains_any(text, self.DOCUMENT_TERMS):
            return "document_guidance"
        if len(verified_candidates) >= 2 or len(candidate_index) >= 2:
            return "ranked_options"
        if verified_candidates or candidate_index:
            return "eligibility_explanation"
        return "direct_short"

    def _recommended_modules(
        self,
        *,
        answer_style: str,
        verified_candidates: list[dict[str, Any]],
        candidate_index: list[dict[str, Any]],
        one_question: str | None,
        allowed_examples: list[SupportedExample],
        allowed_checklist_items: list[SupportedChecklistItem],
        ranked_candidate_map: RankedCandidateMap | None,
    ) -> list[str]:
        modules: list[str] = ["bottom_line"]
        if (
            answer_style == "ranked_options"
            or len(verified_candidates) >= 2
            or len(candidate_index) >= 2
            or (ranked_candidate_map is not None and len(ranked_candidate_map.ranked_candidates) >= 2)
        ):
            modules.append("ranked_option_map")
        if (
            verified_candidates
            or candidate_index
            or one_question
            or (ranked_candidate_map is not None and ranked_candidate_map.primary_decision_boundary)
        ):
            modules.append("decision_boundary")
        if any(str(item.get("fit") or "").strip() in {"weak", "excluded"} for item in verified_candidates) or (
            ranked_candidate_map is not None
            and any(candidate.fit in {"weak", "excluded"} for candidate in ranked_candidate_map.ranked_candidates)
        ):
            modules.append("unsuitable_option_warning")
        if allowed_examples:
            modules.append("verified_examples")
        if allowed_checklist_items:
            modules.append("verified_checklist")
        if one_question:
            modules.append("one_follow_up_question")
        if answer_style in {"lawyer_handoff", "risk_warning"}:
            modules.append("lawyer_handoff")
        return self._unique_strings(modules)

    def _bottom_line_hint(
        self,
        *,
        verified_candidates: list[dict[str, Any]],
        proposal: dict[str, Any],
        answer_style: str,
        ranked_candidate_map: RankedCandidateMap | None,
    ) -> str | None:
        if ranked_candidate_map and ranked_candidate_map.ranked_candidates:
            top = ranked_candidate_map.ranked_candidates[0]
            if top.fit == "likely":
                return f"Lead with the first pathway to check: Subclass {top.subclass} {top.title or ''}.".strip()
            return f"Lead with Subclass {top.subclass} {top.title or ''} as the first candidate to check.".strip()
        likely = [
            str(item.get("candidate_label") or "").strip()
            for item in verified_candidates
            if str(item.get("fit") or "").strip() == "likely"
        ]
        if likely:
            return f"Lead with the most likely pathway: {likely[0]}."
        summary = str(proposal.get("proposal_summary") or "").strip()
        if summary:
            return summary[:500]
        if answer_style == "lawyer_handoff":
            return "Lead with the risk and recommend lawyer review before the user acts."
        return None

    def _supported_facts(
        self,
        *,
        known_facts: dict[str, Any],
        proposal: dict[str, Any],
        verified_candidates: list[dict[str, Any]],
    ) -> list[SupportedFact]:
        facts: list[SupportedFact] = []
        for key, value in (known_facts or {}).items():
            if value in (None, "", [], {}):
                continue
            facts.append(
                SupportedFact(
                    text=f"{key}: {value}",
                    source="user_fact",
                    confidence="medium",
                )
            )
        for item in self._dict_list(proposal.get("known_facts")):
            text = str(item.get("fact") or "").strip()
            if text:
                facts.append(
                    SupportedFact(
                        text=text,
                        source="user_fact" if item.get("source") != "inferred" else "verification",
                        confidence=self._confidence(item.get("confidence")),
                    )
                )
        for candidate in verified_candidates:
            evidence_numbers = self._int_list(candidate.get("evidence_numbers"))
            for point in self._string_list(candidate.get("supported_points")):
                facts.append(
                    SupportedFact(
                        text=point,
                        source="verified_evidence",
                        evidence_numbers=evidence_numbers,
                        confidence="medium",
                    )
                )
        return self._unique_facts(facts)[:20]

    def _allowed_examples(self, *, proposal: dict[str, Any]) -> list[SupportedExample]:
        out: list[SupportedExample] = []
        for item in self._dict_list(proposal.get("lawyer_approved_examples")):
            text = str(item.get("text") or item.get("example") or "").strip()
            if not text:
                continue
            out.append(
                SupportedExample(
                    text=text,
                    support_source="lawyer_approved_static",
                    evidence_numbers=self._int_list(item.get("evidence_numbers")),
                    source_note=str(item.get("source_note") or "lawyer-approved static example"),
                )
            )
        return out[:6]

    def _allowed_checklist_items(self, *, proposal: dict[str, Any]) -> list[SupportedChecklistItem]:
        out: list[SupportedChecklistItem] = []
        for item in self._dict_list(proposal.get("lawyer_approved_checklist_items")):
            text = str(item.get("item") or item.get("text") or "").strip()
            if not text:
                continue
            out.append(
                SupportedChecklistItem(
                    item=text,
                    support_source="lawyer_approved_static",
                    evidence_numbers=self._int_list(item.get("evidence_numbers")),
                    source_note=str(item.get("source_note") or "lawyer-approved static checklist item"),
                )
            )
        return out[:10]

    def _blocked_examples(
        self,
        *,
        original_question: str,
        proposal: dict[str, Any],
        allowed_examples: list[SupportedExample],
    ) -> list[str]:
        if allowed_examples:
            return []
        text = self._combined_text(original_question, proposal.get("proposal_memo_markdown"))
        if "example" in text or "for example" in text:
            return ["Examples blocked because no supported or lawyer-approved examples were provided."]
        return []

    def _blocked_checklist_items(
        self,
        *,
        original_question: str,
        proposal: dict[str, Any],
        allowed_checklist_items: list[SupportedChecklistItem],
    ) -> list[str]:
        if allowed_checklist_items:
            return []
        text = self._combined_text(original_question, proposal.get("proposal_memo_markdown"))
        if self._contains_any(text, self.DOCUMENT_TERMS):
            return ["Checklist items blocked unless supported by verified evidence or lawyer-approved content."]
        return []

    def _verification_value_summary(
        self,
        *,
        evidence: Any,
        verification: dict[str, Any],
        verification_plan: dict[str, Any],
        proposal: dict[str, Any],
        response_language: str,
        verified_candidates: list[dict[str, Any]],
        unsupported: list[str],
        one_question: str | None,
    ) -> VerificationValueSummary:
        corrections: list[str] = []
        uncertainties: list[str] = []
        for candidate in verified_candidates:
            corrections.extend(self._string_list(candidate.get("corrections")))
            uncertainties.extend(self._string_list(candidate.get("missing_verification")))
        uncertainties.extend(self._string_list(proposal.get("missing_decisive_facts")))
        if one_question:
            uncertainties.append(one_question)

        source_count = self._checked_source_count(evidence)
        candidate_count = len(verified_candidates)
        depth = str(verification_plan.get("verification_depth") or "targeted_rag")
        customer_summary = self._customer_visible_summary(
            response_language=response_language,
            candidate_count=candidate_count,
            source_count=source_count,
            uncertainties=uncertainties,
        )
        lawyer_summary = (
            f"Checked {candidate_count} candidate(s) across {source_count} evidence item(s); "
            f"{len(corrections)} correction(s), {len(unsupported)} unsupported claim(s), "
            f"{len(self._unique_strings(uncertainties))} key uncertainty item(s)."
        )

        return VerificationValueSummary(
            checking_depth=depth,
            checked_candidate_count=candidate_count,
            checked_source_count=source_count,
            important_corrections=self._unique_strings(corrections)[:12],
            unsupported_claims_removed=unsupported[:12],
            key_uncertainties=self._unique_strings(uncertainties)[:12],
            customer_visible_summary=customer_summary,
            lawyer_visible_summary=lawyer_summary,
        )

    def _customer_visible_summary(
        self,
        *,
        response_language: str,
        candidate_count: int,
        source_count: int,
        uncertainties: list[str],
    ) -> str | None:
        if candidate_count <= 0 and source_count <= 0:
            return None
        uncertainty = self._unique_strings(uncertainties)
        if response_language == "zh":
            if uncertainty:
                return "我先核对了关键路径；目前最需要确认的是：" + uncertainty[0]
            return "我先核对了关键路径，再给出下面的初步方向。"
        if uncertainty:
            return f"I checked the key pathway before answering; the main point to confirm is: {uncertainty[0]}"
        return "I checked the key pathway before giving this answer."

    def _unsupported_claims(self, verification: dict[str, Any]) -> list[str]:
        out: list[str] = []
        out.extend(self._string_list(verification.get("unsupported_or_contradicted_claims")))
        out.extend(self._string_list(verification.get("must_remove_or_qualify")))
        return self._unique_strings(out)

    def _one_decisive_question(
        self,
        *,
        proposal: dict[str, Any],
        verification: dict[str, Any],
        ranked_candidate_map: RankedCandidateMap | None,
    ) -> str | None:
        if ranked_candidate_map and ranked_candidate_map.primary_decision_boundary:
            boundary = ranked_candidate_map.primary_decision_boundary
            if "fixed short-term specialist task" in boundary:
                return "Is this a fixed short-term specialist task with a clear end date, or is the employer trying to fill an ongoing sponsored job role?"
            if "only attend meetings" in boundary:
                return "Will the person only attend meetings or negotiations, or will they actually perform work in Australia?"
            if "structured occupational training" in boundary:
                return "Is the main purpose structured occupational training, or ordinary productive work?"
        for value in (verification.get("one_decisive_question"), proposal.get("one_decisive_question")):
            text = str(value or "").strip()
            if text:
                return text
        return None

    def _answer_composition_plan(
        self,
        *,
        answer_style: str,
        proposal: dict[str, Any],
        ranked_candidate_map: RankedCandidateMap | None,
        one_question: str | None,
        allowed_examples: list[SupportedExample],
        allowed_checklist_items: list[SupportedChecklistItem],
    ) -> AnswerCompositionPlan:
        required_sections = ["bottom_line"]
        optional_sections: list[str] = []
        forbidden_sections = ["unsupported_examples", "unsupported_document_checklist"]
        table_allowed = False
        table_purpose = None
        practical_bottom_line = self._summary_text(proposal)
        boundary = None
        if ranked_candidate_map:
            boundary = ranked_candidate_map.primary_decision_boundary
            if ranked_candidate_map.ranked_candidates:
                top = ranked_candidate_map.ranked_candidates[0]
                practical_bottom_line = (
                    f"The first pathway to check is Subclass {top.subclass}"
                    + (f" ({top.title})" if top.title else "")
                    + "."
                )
            if len(ranked_candidate_map.ranked_candidates) >= 2:
                required_sections.append("ranked_option_map")
                table_allowed = True
                table_purpose = "separate the first pathway, alternatives, and decision boundary"
            if boundary:
                required_sections.append("decision_boundary")
        if one_question:
            required_sections.append("one_decisive_question")
        if allowed_examples:
            optional_sections.append("verified_examples")
        if allowed_checklist_items:
            optional_sections.append("verified_checklist")

        return AnswerCompositionPlan(
            answer_shape="ranked_options_with_boundary"
            if table_allowed
            else ("risk_handoff" if answer_style == "lawyer_handoff" else "eligibility_explanation"),
            opening_style="risk_first" if answer_style == "lawyer_handoff" else "bottom_line_first",
            customer_goal_summary=self._summary_text(proposal),
            practical_bottom_line=practical_bottom_line,
            primary_decision_boundary=boundary,
            required_sections=self._unique_strings(required_sections),
            optional_sections=self._unique_strings(optional_sections),
            forbidden_sections=forbidden_sections,
            table_allowed=table_allowed,
            table_purpose=table_purpose,
            examples_allowed=bool(allowed_examples),
            checklist_allowed=bool(allowed_checklist_items),
            tone_rules=[
                "professional, practical, and consultation-style",
                "plain English first, legal labels only when useful",
                "do not overstate confidence when decisive facts are missing",
            ],
            length_target="medium",
        )

    def _customer_visible_source_refs(self, ranked_candidate_map: RankedCandidateMap | None) -> list[str]:
        if not ranked_candidate_map:
            return []
        refs: list[str] = []
        for candidate in ranked_candidate_map.ranked_candidates:
            refs.extend(candidate.source_refs)
        return self._unique_strings(refs)

    def _debug_hidden_source_refs(self, ranked_candidate_map: RankedCandidateMap | None) -> list[str]:
        if not ranked_candidate_map:
            return []
        refs: list[str] = []
        visible = set(self._customer_visible_source_refs(ranked_candidate_map))
        for item in [
            *ranked_candidate_map.excluded_candidates,
            *ranked_candidate_map.noisy_or_rejected_candidates,
        ]:
            ref = f"schedule-2-{item.subclass}"
            if ref not in visible:
                refs.append(ref)
        return self._unique_strings(refs)[:50]

    def _ranked_candidate_map(
        self,
        value: RankedCandidateMap | dict[str, Any] | None,
    ) -> RankedCandidateMap | None:
        if value is None:
            return None
        if isinstance(value, RankedCandidateMap):
            return value
        if isinstance(value, dict):
            return RankedCandidateMap.model_validate(value)
        return None

    def _citation_mentions_subclass(self, blob: str, subclass: str) -> bool:
        sub = str(subclass or "").strip().lower()
        if not sub:
            return False
        return (
            f"subclass {sub}" in blob
            or f"schedule-2-{sub}" in blob
            or f"schedule 2 {sub}" in blob
            or bool(re.search(rf"\b{re.escape(sub)}\.", blob))
        )

    def _summary_text(self, proposal: dict[str, Any]) -> str | None:
        text = str(proposal.get("proposal_summary") or proposal.get("user_goal") or "").strip()
        return text[:500] if text else None

    def _checked_source_count(self, evidence: Any) -> int:
        keys: set[str] = set()
        for attr in ("live_chunks", "local_chunks"):
            for chunk in getattr(evidence, attr, []) or []:
                source = getattr(chunk, "source", None)
                keys.add(
                    "|".join(
                        [
                            str(getattr(source, "title", "") or ""),
                            str(getattr(source, "url", "") or ""),
                            str(getattr(chunk, "section_ref", "") or ""),
                            str(getattr(chunk, "heading", "") or ""),
                        ]
                    )
                )
        for clause in getattr(evidence, "schedule_clauses", []) or []:
            if isinstance(clause, dict):
                keys.add(
                    "|".join(
                        [
                            str(clause.get("schedule_no") or ""),
                            str(clause.get("subclass") or ""),
                            str(clause.get("clause_ref") or ""),
                            str(clause.get("heading") or ""),
                        ]
                    )
                )
        return len({key for key in keys if key.strip("|")})

    def _combined_text(self, *parts: Any) -> str:
        return " ".join(str(part or "") for part in parts).lower()

    def _contains_any(self, text: str, terms: tuple[str, ...]) -> bool:
        return any(term in text for term in terms)

    def _dict_list(self, value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        return [dict(item) for item in value if isinstance(item, dict)]

    def _string_list(self, value: Any) -> list[str]:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str) and value.strip():
            return [value.strip()]
        return []

    def _int_list(self, value: Any) -> list[int]:
        if not isinstance(value, list):
            return []
        out: list[int] = []
        for item in value:
            try:
                out.append(int(item))
            except Exception:
                continue
        return out

    def _confidence(self, value: Any) -> str:
        text = str(value or "").lower().strip()
        if text in {"low", "medium", "high"}:
            return text
        return "medium"

    def _unique_strings(self, values: list[str]) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for value in values:
            text = " ".join(str(value or "").split())
            key = text.lower()
            if not text or key in seen:
                continue
            seen.add(key)
            out.append(text)
        return out

    def _unique_facts(self, facts: list[SupportedFact]) -> list[SupportedFact]:
        out: list[SupportedFact] = []
        seen: set[str] = set()
        for fact in facts:
            key = fact.text.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(fact)
        return out
