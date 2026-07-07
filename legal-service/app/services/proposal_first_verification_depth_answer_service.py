from __future__ import annotations

import json
import os
import time
from typing import Any

from sqlalchemy.orm import Session

from app.schemas.query import QueryRequest, QueryResponse
from app.schemas.source import CitationOut
from app.services.proposal_first_verified_answer_service import (
    EvidenceBundle,
    ProposalFirstVerifiedAnswerService,
)
from app.services.schedule2_exhaustive_discovery_service import (
    Schedule2ExhaustiveDiscoveryService,
)


class ProposalFirstVerificationDepthAnswerService(ProposalFirstVerifiedAnswerService):
    """GPT proposal first, verification-depth execution second.

    This restores the agreed hierarchy:
      1. every substantive query goes to backend GPT with full context;
      2. GPT returns a rich proposal memo plus verification_plan JSON;
      3. the backend executes only the required post-proposal checking depth;
      4. final GPT answer uses proposal + verification evidence.
    """

    def __init__(self) -> None:
        super().__init__()
        self.legacy_exhaustive_debug_enabled = (
            os.getenv("ENABLE_LEGACY_SCHEDULE2_EXHAUSTIVE_DEBUG", "")
            .strip()
            .lower()
            in {"1", "true", "yes", "on"}
        )
        self.exhaustive_discovery = (
            Schedule2ExhaustiveDiscoveryService()
            if self.legacy_exhaustive_debug_enabled
            else None
        )

    def answer(
        self,
        *,
        db: Session,
        payload: QueryRequest,
        original_question: str,
        effective_question: str,
        memory_packet: Any,
        response_language: str,
        matter_id: str | None,
    ) -> QueryResponse:
        conversation_history = list(getattr(memory_packet, "full_conversation_history", []) or [])
        known_facts = self._known_facts_from_memory(memory_packet)
        pfvd_started_at = time.perf_counter()
        last_stage_at = pfvd_started_at
        stage_timing: dict[str, float] = {}

        def mark_stage(name: str) -> None:
            nonlocal last_stage_at
            now = time.perf_counter()
            stage_timing[name] = round((now - last_stage_at) * 1000, 1)
            stage_timing["total_ms"] = round((now - pfvd_started_at) * 1000, 1)
            last_stage_at = now
        pfvd_started = time.perf_counter()
        pfvd_last_mark = pfvd_started
        pfvd_stage_timings: list[dict[str, Any]] = []

        def mark_pfvd_stage(stage: str, **metadata: Any) -> None:
            nonlocal pfvd_last_mark
            now = time.perf_counter()
            item: dict[str, Any] = {
                "stage": stage,
                "duration_ms": round((now - pfvd_last_mark) * 1000, 2),
                "total_ms": round((now - pfvd_started) * 1000, 2),
            }
            if metadata:
                item["metadata"] = metadata
            pfvd_stage_timings.append(item)
            pfvd_last_mark = now

        proposal = self._build_free_proposal_with_verification_plan(
            original_question=original_question,
            effective_question=effective_question,
            conversation_history=conversation_history,
            known_facts=known_facts,
            response_language=response_language,
        )
        mark_pfvd_stage(
            "proposal",
            candidate_count=len(self._dict_list(proposal.get("candidate_index"))),
            scope=str((proposal.get("answer_scope_contract") or {}).get("user_requested_scope") or ""),
        )

        if not bool(proposal.get("is_immigration_related", True)):
            answer_text = self._answer_general_question_directly(original_question or effective_question, response_language)
            return QueryResponse(
                matter_id=matter_id,
                answer=answer_text,
                response_language="zh" if response_language == "zh" else "en",
                confidence="medium",
                issue_type="general_topic",
                missing_facts=[],
                follow_up_questions=[],
                citations=[],
                compact_sources=[],
                escalate=False,
                next_action="answer",
                user_display_mode="direct_short",
                retrieval_debug={
                    "proposal_first_verification_depth": {
                        "used": True,
                        "non_immigration_general_fallback": True,
                        "proposal": proposal,
                    }
                },
            )

        verification_plan = self._normalize_verification_plan(proposal.get("verification_plan"))
        verification_plan = self._apply_safety_overrides(
            plan=verification_plan,
            original_question=original_question,
            effective_question=effective_question,
            proposal=proposal,
        )
        proposal = self._ensure_plan_candidates_in_proposal(proposal, verification_plan)

        evidence = EvidenceBundle()
        legacy_schedule2_exhaustive_debug: dict[str, Any] | None = None
        depth = verification_plan.get("verification_depth") or "targeted_rag"

        if depth in {"targeted_rag", "exhaustive_schedule2", "high_risk_handoff"}:
            evidence = self._collect_evidence(
                db=db,
                payload=payload,
                effective_question=effective_question,
                known_facts=known_facts,
                proposal=proposal,
            )

        mark_pfvd_stage(
            "collect_evidence",
            local_chunk_count=len(evidence.local_chunks),
            live_chunk_count=len(evidence.live_chunks),
            schedule_clause_count=len(evidence.schedule_clauses),
            schedule_candidate_count=len(evidence.schedule_candidates),
            retrieval_run_count=len(evidence.retrieval_runs),
            verification_depth=str(depth),
        )
        mark_stage("collect_evidence")

        if (
            depth == "exhaustive_schedule2"
            and self.legacy_exhaustive_debug_enabled
            and self.exhaustive_discovery is not None
        ):
            try:
                discovery = self.exhaustive_discovery.discover(
                    question="\n".join(
                        [
                            effective_question,
                            str(proposal.get("proposal_summary") or ""),
                            "\n".join(proposal.get("search_plan") or []),
                            " ".join(verification_plan.get("candidate_subclasses_to_verify") or []),
                        ]
                    ),
                    memory_packet=memory_packet,
                    limit=20,
                )
                legacy_schedule2_exhaustive_debug = discovery.model_dump()
            except Exception as exc:  # pragma: no cover - defensive runtime guard
                legacy_schedule2_exhaustive_debug = {"enabled": False, "error": str(exc)[:400]}
        elif depth == "exhaustive_schedule2":
            legacy_schedule2_exhaustive_debug = {
                "enabled": False,
                "skipped": True,
                "reason": (
                    "Legacy all-clause Schedule 2 exhaustive discovery is disabled by default; "
                    "coverage-first skeleton screening and RankedCandidateMap now control candidate ranking. "
                    "Set ENABLE_LEGACY_SCHEDULE2_EXHAUSTIVE_DEBUG=true only for legacy diagnostics."
                ),
            }
        evidence_text = self._format_evidence_for_llm(evidence)
        if depth == "light" and not evidence_text:
            evidence_text = "No external evidence package was required by the GPT verification plan for this light general explanation."

        verification = self._verify_proposal(
            original_question=original_question,
            effective_question=effective_question,
            known_facts=known_facts,
            proposal=proposal,
            evidence_text=evidence_text,
            response_language=response_language,
        )
        mark_pfvd_stage(
            "verify_proposal",
            confidence=str(verification.get("confidence") or ""),
            coverage_satisfied=str((verification.get("coverage_audit") or {}).get("answer_scope_satisfied")),
        )

        ranked_candidate_map = self.schedule2_ranked_candidate_service.build(
            original_question=original_question,
            effective_question=effective_question,
            known_facts=known_facts,
            proposal=proposal,
            verification=verification,
        )
        mark_pfvd_stage(
            "ranked_candidate_map",
            ranked_count=len(ranked_candidate_map.ranked_candidates),
            screened_count=ranked_candidate_map.screened_subclass_count,
        )
        customer_answer_plan = self.customer_answer_plan_service.build(
            original_question=original_question,
            effective_question=effective_question,
            known_facts=known_facts,
            proposal=proposal,
            verification=verification,
            evidence=evidence,
            verification_plan=verification_plan,
            response_language=response_language,
            ranked_candidate_map=ranked_candidate_map,
        )
        mark_pfvd_stage(
            "customer_answer_plan",
            coverage_bucket_count=len(customer_answer_plan.public_option_coverage_map),
            table_allowed=customer_answer_plan.answer_composition_plan.table_allowed,
        )
        customer_answer_trace = self.customer_answer_plan_service.trace_fields(customer_answer_plan)
        mark_stage("customer_answer_plan")

        final = self._draft_verified_answer(
            original_question=original_question,
            effective_question=effective_question,
            known_facts=known_facts,
            proposal=proposal,
            verification=verification,
            evidence_text=evidence_text,
            response_language=response_language,
            customer_answer_plan=customer_answer_plan.model_dump(),
        )
        mark_pfvd_stage(
            "final_answer",
            final_confidence=str(final.get("confidence") or ""),
            final_next_action=str(final.get("next_action") or ""),
        )

        answer_text = str(final.get("answer") or "").strip()
        if not answer_text:
            answer_text = self._fallback_answer_from_verification(
                proposal=proposal,
                verification=verification,
                response_language=response_language,
            )
        answer_text, deterministic_coverage_additions = self._ensure_public_option_coverage_text(
            answer_text,
            customer_answer_plan,
            response_language=response_language,
        )
        if deterministic_coverage_additions:
            final["answer"] = answer_text
        mark_pfvd_stage(
            "coverage_postprocess",
            deterministic_addition_count=deterministic_coverage_additions,
        )

        answer_text = self._enforce_public_option_coverage(
            answer_text=answer_text,
            customer_answer_plan=customer_answer_plan.model_dump(),
            response_language=response_language,
        )

        answer_text = self._ensure_public_option_coverage_in_answer(
            answer_text=answer_text,
            customer_answer_plan=customer_answer_plan,
            response_language=response_language,
        )
        citations = self._build_citations_with_schedule(evidence=evidence, verification_plan=verification_plan)
        visible_citations = self.customer_answer_plan_service.filter_customer_visible_citations(
            citations,
            customer_answer_plan,
        )
        compact_sources = self._compact_sources(
            citations=visible_citations,
            evidence=evidence,
            verification_plan=verification_plan,
            legacy_schedule2_exhaustive_debug=legacy_schedule2_exhaustive_debug,
        )
        mark_pfvd_stage(
            "citation_packaging",
            visible_citation_count=len(visible_citations),
            compact_source_count=len(compact_sources),
        )

        missing_facts = self._string_list(final.get("missing_facts")) or self._string_list(
            proposal.get("missing_decisive_facts")
        )[:6]
        planned_follow_up = str(customer_answer_plan.one_decisive_question or "").strip()
        if planned_follow_up:
            follow_ups = [planned_follow_up]
        else:
            follow_ups = self._one_question(
                self._string_list(final.get("follow_up_questions"))
                or [str(proposal.get("one_decisive_question") or "")]
            )
        next_action = "ask_followup" if follow_ups else self._normalize_next_action(final.get("next_action"))
        confidence = self._normalize_confidence(final.get("confidence") or verification.get("confidence"))
        if ranked_candidate_map.confidence_floor != "high" and confidence == "high":
            confidence = ranked_candidate_map.confidence_floor

        debug = {
            "proposal_first_verification_depth": {
                "used": True,
                "paradigm": "backend_gpt_proposal_plus_verification_plan_then_post_proposal_checking",
                "proposal": proposal,
                "verification_plan": verification_plan,
                "verification": verification,
                "evidence_summary": {
                    "local_chunk_count": len(evidence.local_chunks),
                    "live_chunk_count": len(evidence.live_chunks),
                    "schedule_clause_count": len(evidence.schedule_clauses),
                    "schedule_candidate_count": len(evidence.schedule_candidates),
                    "retrieval_run_count": len(evidence.retrieval_runs),
                    "verification_depth": depth,
                },
                "retrieval_runs": evidence.retrieval_runs,
                "live_debug": evidence.live_debug,
                "legacy_schedule2_exhaustive_discovery": legacy_schedule2_exhaustive_debug,
                "ranked_candidate_map": ranked_candidate_map.model_dump(),
                **customer_answer_trace,
                "final_json": final,
                "stage_timing": {
                    "total_ms": round((time.perf_counter() - pfvd_started) * 1000, 2),
                    "stages": pfvd_stage_timings,
                },
            },
            "customer_answer_quality": customer_answer_trace,
            "unified_context": {
                "enabled": True,
                "workflow": "proposal_first_then_verification_depth",
                "verification_depth": verification_plan,
                "memory_packet": getattr(memory_packet, "context_packaging_debug", {}) or {},
                "conversation_identity": {
                    "matter_id": getattr(memory_packet, "matter_id", None),
                    "session_id": getattr(memory_packet, "session_id", None),
                    "backend_history_turn_count": len(getattr(memory_packet, "full_conversation_history", []) or []),
                    "frontend_message_count": len(getattr(memory_packet, "frontend_messages", []) or []),
                },
                "legacy_schedule2_exhaustive_discovery": legacy_schedule2_exhaustive_debug,
            },
            "reasoning_model": self.model,
            "reasoning_mode": "proposal_first_verification_depth",
            "original_question": original_question,
            "effective_question": effective_question,
        }

        return QueryResponse(
            matter_id=matter_id,
            answer=answer_text,
            response_language="zh" if response_language == "zh" else "en",
            confidence=confidence,
            user_display_mode="answer_then_ask" if follow_ups else "general_with_warning",
            issue_type=str(final.get("issue_type") or verification.get("issue_type") or "visa_options_or_legal_discovery"),
            missing_facts=missing_facts,
            follow_up_questions=follow_ups,
            citations=visible_citations[:12],
            compact_sources=compact_sources[:6],
            escalate=bool(final.get("escalate", depth == "high_risk_handoff")),
            next_action=next_action,
            legal_reasoning_trace=customer_answer_trace,
            retrieval_debug=debug,
        )



    def _ensure_public_option_coverage_text(
        self,
        answer_text: str,
        customer_answer_plan: Any,
        *,
        response_language: str,
    ) -> tuple[str, int]:
        """Deterministically preserve broad public option coverage.

        The final-answer LLM sometimes follows the ranked candidates but drops
        conditional buckets from public_option_coverage_map. For broad
        all-options questions, append missing customer-visible buckets so the
        answer cannot collapse back into a narrow likely-options response.
        """
        plan = customer_answer_plan.model_dump() if hasattr(customer_answer_plan, "model_dump") else dict(customer_answer_plan or {})
        scope = str((plan.get("answer_scope_contract") or {}).get("user_requested_scope") or "").strip()
        if scope != "all_possible_options":
            return answer_text, 0

        coverage = [
            item
            for item in (plan.get("public_option_coverage_map") or [])
            if isinstance(item, dict) and item.get("show_to_customer", True) is not False
        ]
        if not coverage:
            return answer_text, 0

        answer_lower = answer_text.lower()
        missing: list[dict[str, Any]] = []
        seen: set[tuple[str, tuple[str, ...], str]] = set()
        for item in coverage:
            subclasses = tuple(str(value).strip() for value in (item.get("subclasses") or []) if str(value).strip())
            label = str(item.get("label") or "").strip()
            bucket = str(item.get("bucket") or "").strip()
            key = (bucket, subclasses, label.lower())
            if key in seen:
                continue
            seen.add(key)
            if self._coverage_item_already_visible(answer_lower, label=label, subclasses=list(subclasses)):
                continue
            missing.append(item)

        if not missing:
            return answer_text, 0

        is_zh = str(response_language or "").lower().startswith("zh")
        if is_zh:
            lines = [
                "### 还需要保留在选项地图里的条件性路径",
                "下面这些并不一定适合本案，但在用户要求“所有可能选项”时，不能完全省略：",
            ]
        else:
            lines = [
                "### Other conditional options to keep on the map",
                "These are not all equally suitable, but they should still be checked when the question asks for all possible options:",
            ]
        for item in missing[:10]:
            label = str(item.get("label") or "").strip() or "Additional pathway"
            when_relevant = str(item.get("when_relevant") or "").strip()
            if when_relevant:
                lines.append(f"- **{label}**: {when_relevant}")
            else:
                lines.append(f"- **{label}**")

        addition = "\n".join(lines).strip()
        if not addition:
            return answer_text, 0
        return self._insert_before_decisive_question(answer_text, addition), len(missing)

    def _coverage_item_already_visible(self, answer_lower: str, *, label: str, subclasses: list[str]) -> bool:
        if subclasses:
            for subclass in subclasses:
                number = "".join(ch for ch in str(subclass) if ch.isdigit())
                if not number:
                    continue
                if not re.search(rf"(?:subclass\s*)?\b{re.escape(number)}\b", answer_lower):
                    return False
            return True
        label_text = " ".join(label.lower().split())
        return bool(label_text and label_text in answer_lower)

    def _insert_before_decisive_question(self, answer_text: str, addition: str) -> str:
        markers = (
            "\nOne decisive question:",
            "\nOne quick question:",
            "\nA simple question:",
            "\n一个关键问题：",
            "\n一个简单问题：",
        )
        for marker in markers:
            if marker in answer_text:
                return answer_text.replace(marker, f"\n\n{addition}{marker}", 1)
        return f"{answer_text.rstrip()}\n\n{addition}"

    def _is_politics_sensitive_text(self, *parts: Any) -> bool:
        text = " ".join(str(part or "") for part in parts).lower()
        semantic_markers = (
            "politics_sensitive",
            "political_sensitive",
            "political_persuasion",
            "election_persuasion",
            "election_voting_advice",
            "partisan_persuasion",
        )
        if any(marker in text for marker in semantic_markers):
            return True
        persuasion_phrases = (
            "who should i vote",
            "which party should i vote",
            "which candidate should i vote",
            "tell me who to vote",
            "convince me to vote",
            "persuade me to vote",
            "should i vote for",
            "vote for trump",
            "vote for biden",
            "vote for albanese",
            "vote for dutton",
        )
        if any(phrase in text for phrase in persuasion_phrases):
            return True
        political_terms = (
            " election",
            " elections",
            " voting",
            " political party",
            " candidate",
            " campaign",
            " president",
            " prime minister",
            " parliament",
            " labor party",
            " liberal party",
            " the greens",
            " republican",
            " democrat",
            " trump",
            " biden",
            " albanese",
            " dutton",
        )
        opinion_or_action_terms = (
            "should",
            "better",
            "worse",
            "support",
            "oppose",
            "vote",
            "trust",
            "prefer",
            "best",
            "worst",
            "recommend",
            "persuade",
            "convince",
        )
        return any(term in text for term in political_terms) and any(
            term in text for term in opinion_or_action_terms
        )

    def _politics_sensitive_general_answer(self, response_language: str) -> str:
        if response_language == "zh":
            return "我不能协助政治敏感、选举投票建议、党派立场或政治说服类问题。你可以继续询问普通非政治问题，或澳洲移民、签证和预约律师相关问题。"
        return (
            "I can’t help with politically sensitive, election-voting, partisan, "
            "or political persuasion topics. You can ask an ordinary non-political "
            "general question, or an Australian immigration, visa, or lawyer appointment question."
        )

    def _answer_general_question_directly(self, question: str, response_language: str = "en") -> str:
        language_rule = (
            "Answer in Simplified Chinese."
            if response_language == "zh"
            else "Answer in English."
        )
        system_prompt = (
            "You are a concise, helpful general assistant. "
            "Answer ordinary non-political general questions directly. "
            "Do not mention immigration law, legal retrieval, citations, or internal routing. "
            + language_rule
        )
        try:
            response = self.client.responses.create(
                model=os.getenv("GENERAL_QA_MODEL", getattr(self, "model", "gpt-5.4-mini")),
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "User question:\n" + str(question or "")},
                ],
            )
            text = (response.output_text or "").strip()
            if text:
                return text
        except Exception:
            pass
        return "我暂时无法回答这个普通问题。" if response_language == "zh" else "I couldn’t answer that general question right now."

    def _build_free_proposal_with_verification_plan(
        self,
        *,
        original_question: str,
        effective_question: str,
        conversation_history: list[dict[str, Any]],
        known_facts: dict[str, Any],
        response_language: str,
    ) -> dict[str, Any]:
        history_text = self._conversation_history_text(conversation_history)
        known_facts_json = json.dumps(known_facts, ensure_ascii=False)
        language_rule = self._language_rule(response_language)
        system_prompt = (
            "You are an expert Australian immigration legal research assistant working inside a lawyer-supervised AI intake system.\n"
            "Your task is NOT to give final legal advice immediately. Your task is to generate a rich preliminary legal proposal and a verification plan for later source checking.\n\n"
            "Important source definitions:\n"
            "1. Schedule 1 means MIGRATION REGULATIONS 1994 - SCHEDULE 1. It mainly concerns visa application classes, application validity, lodgement, fees, and related application requirements.\n"
            "2. Schedule 2 means MIGRATION REGULATIONS 1994 - SCHEDULE 2, 'Provisions with respect to the grant of Subclasses of visas'. It is a highly authoritative official legislative source. It contains visa subclass-by-subclass grant criteria, including primary/secondary criteria, time-of-application criteria, time-of-decision criteria, streams, and conditions for grant.\n"
            "3. Home Affairs official guidance means information from immi.homeaffairs.gov.au. It is useful for practical explanation, current program pages, checklists, forms, eligibility summaries, and procedural guidance. Where legislation and guidance conflict, legislation is controlling and the issue should be flagged for lawyer review.\n"
            "4. Other official/current sources may include legislation.gov.au, Federal Register materials, tribunal/review information, and official policy/procedure pages when relevant.\n\n"
            "First-stage role:\n"
            "- Read the user question and full conversation context.\n"
            "- Infer the user's goal, relevant facts, implied facts, missing decisive facts, and possible visa/legal pathways.\n"
            "- Generate a rich proposal memo first, similar to a strong general GPT legal research answer.\n"
            "- Do not refuse merely because facts are incomplete. Do not ask the user to provide all facts before proposing options.\n"
            "- If facts are incomplete, still give provisional candidate pathways and identify what must be verified.\n"
            "- Do not invent legal rules, deadlines, eligibility guarantees, or success probabilities.\n"
            "- Do not treat word overlap as legal relevance. A candidate is relevant only if the user facts legally connect to that pathway.\n"
            "- Do not include a visa subclass merely because it contains generic words such as 'has', 'employer', 'nomination', 'temporary', or 'skills'.\n"
            "- Clearly separate likely options, possible options, weak options, and excluded/irrelevant options.\n"
            "- Use Schedule 2 as the main target for subclass grant-criteria verification when the question involves visa eligibility, visa options, or subclass comparison.\n"
            "- Use Schedule 1 when application validity, lodgement, visa class, application requirements, or timing of application may matter.\n"
            "- Use Home Affairs guidance when practical program explanation, current policy, conditions, forms, or procedural details may matter.\n\n"
            "Verification-depth planning:\n"
            "The verification depth controls post-proposal checking only. It must not suppress your proposal memo.\n"
            "Use these depths: light, targeted_rag, exhaustive_schedule2, high_risk_handoff.\n"
            "light = simple general explanation, low legal risk, no subclass comparison, no current policy sensitivity.\n"
            "targeted_rag = a specific legal issue or single known visa/subclass/condition requires targeted local or official source checking.\n"
            "exhaustive_schedule2 = visa options, pathway recommendation, subclass comparison, or broad eligibility discovery where multiple visa subclasses may be relevant.\n"
            "high_risk_handoff = refusal, review deadline, cancellation, NOICC, unlawful status, detention, PIC 4020, character, family violence, child welfare, or other sensitive/urgent matter.\n\n"
            "Out-of-domain handling:\n"
            "- If the latest user request is not about Australian immigration, visas, migration law, or booking a lawyer appointment, set is_immigration_related=false.\n"
            "- Ordinary non-immigration general questions are allowed; the backend may answer them through a fast general-answer path.\n"
            "- If the request asks for election-voting advice, partisan persuasion, or political persuasion, flag it using risk_flags or lawyer_review_notes with 'politics_sensitive'.\n"
            "- Do not expose internal classification text such as 'the user is asking...' in non_immigration_response.\n\n"
            "Return ONLY valid JSON. Do not include markdown outside JSON. Required shape:\n"
            "{\n"
            '  "is_immigration_related": boolean,\n'
            '  "non_immigration_response": string | null,\n'
            '  "domain_routing": {"domain_type": "immigration" | "general_non_political" | "politics_sensitive" | "mixed" | "unclear", "should_use_general_answer": boolean, "should_block_for_politics": boolean, "should_use_legal_pipeline": boolean, "reason": string | null},\n'
            '  "response_language": "en" | "zh",\n'
            '  "user_goal": string,\n'
            '  "known_facts": [{"fact": string, "source": "latest_user_turn" | "conversation_history" | "inferred", "confidence": "high" | "medium" | "low"}],\n'
            '  "proposal_memo_markdown": string,\n'
            '  "proposal_summary": string,\n'
            '  "candidate_index": [{"candidate_label": string, "subclass": string | null, "stream_or_activity": string | null, "category": "visa_subclass" | "visa_stream" | "visa_condition" | "review_pathway" | "procedural_issue" | "other", "initial_fit": "likely" | "possible" | "weak" | "excluded", "confidence_before_verification": "high" | "medium" | "low", "why_possible": string[], "why_maybe_not": string[], "must_verify": string[], "source_targets": string[], "search_queries": string[]}],\n'
            '  "excluded_or_low_relevance_options": [{"candidate_label": string, "subclass": string | null, "why_low_relevance_or_excluded": string[]}],\n'
            '  "verification_plan": {"verification_depth": "light" | "targeted_rag" | "exhaustive_schedule2" | "high_risk_handoff", "requires_full_context": true, "requires_targeted_rag": boolean, "requires_live_official_check": boolean, "requires_exhaustive_schedule2": boolean, "requires_schedule1_check": boolean, "requires_candidate_comparison": boolean, "candidate_subclasses_to_verify": string[], "source_targets": string[], "legal_questions_to_verify": string[], "reasons": string[]},\n'
            '  "search_plan": string[],\n'
            '  "missing_decisive_facts": string[],\n'
            '  "one_decisive_question": string | null,\n'
            '  "risk_flags": string[],\n'
            '  "lawyer_review_notes": string[]\n'
            "}\n"
            "Preserve abundance in proposal_memo_markdown. JSON must not compress away useful reasoning.\n"
        )
        system_prompt += language_rule
        user_prompt = (
            f"Original user message:\n{original_question}\n\n"
            f"Effective standalone question:\n{effective_question}\n\n"
            f"Known facts JSON:\n{known_facts_json}\n\n"
            f"Full/recent conversation history:\n{history_text or 'N/A'}\n\n"
            "Generate the first-stage legal proposal memo and verification plan JSON."
        )
        parsed = self._call_json(model=self.model, system_prompt=system_prompt, user_prompt=user_prompt)
        if not parsed:
            return {
                "is_immigration_related": True,
                "non_immigration_response": None,
                "response_language": "zh" if response_language == "zh" else "en",
                "user_goal": effective_question,
                "known_facts": [],
                "proposal_memo_markdown": f"Initial proposal could not be generated cleanly. User question: {effective_question}",
                "proposal_summary": effective_question,
                "candidate_index": [],
                "excluded_or_low_relevance_options": [],
                "answer_scope_contract": {
                    "user_requested_scope": "answer_question",
                    "breadth_required": "medium",
                    "must_include_buckets": [],
                    "may_include_buckets": [],
                    "must_not_include_buckets": [],
                    "completeness_standard": "Answer the user question safely.",
                    "compactness_standard": "Be compact.",
                },
                "live_retrieval_plan": {
                    "needed": True,
                    "source_target_subclasses": [],
                    "source_targets": ["Home Affairs guidance", "Schedule 2 if relevant"],
                    "max_pages": 4,
                    "must_find": [],
                },
                "verification_plan": {
                    "verification_depth": "targeted_rag",
                    "requires_full_context": True,
                    "requires_targeted_rag": True,
                    "requires_live_official_check": True,
                    "requires_exhaustive_schedule2": False,
                    "requires_schedule1_check": False,
                    "requires_candidate_comparison": False,
                    "candidate_subclasses_to_verify": [],
                    "source_targets": ["Home Affairs guidance", "Schedule 2 if relevant"],
                    "legal_questions_to_verify": [effective_question],
                    "reasons": ["proposal_json_parse_failed_fallback"],
                },
                "search_plan": [effective_question],
                "missing_decisive_facts": [],
                "one_decisive_question": None,
                "risk_flags": ["proposal_json_parse_failed"],
                "lawyer_review_notes": [],
            }
        parsed["proposal_memo_markdown"] = str(parsed.get("proposal_memo_markdown") or "")[: self.MAX_PROPOSAL_CHARS]
        parsed["domain_routing"] = self._domain_routing_from_proposal(parsed)
        parsed["candidate_index"] = self._normalize_candidate_index(parsed.get("candidate_index"))
        parsed["search_plan"] = self._string_list(parsed.get("search_plan"))
        parsed["missing_decisive_facts"] = self._string_list(parsed.get("missing_decisive_facts"))
        parsed["risk_flags"] = self._string_list(parsed.get("risk_flags"))
        parsed["lawyer_review_notes"] = self._string_list(parsed.get("lawyer_review_notes"))
        parsed["answer_scope_contract"] = self._normalize_answer_scope_contract(parsed.get("answer_scope_contract"), original_question=original_question, effective_question=effective_question)
        parsed["live_retrieval_plan"] = self._normalize_live_retrieval_plan(parsed.get("live_retrieval_plan"), proposal=parsed)
        parsed["verification_plan"] = self._normalize_verification_plan(parsed.get("verification_plan"))
        return parsed

    def _known_facts_from_memory(self, memory_packet: Any) -> dict[str, Any]:
        facts: dict[str, Any] = {}
        for name in ("stable_facts", "carried_intake_facts", "active_focus"):
            value = getattr(memory_packet, name, None)
            if isinstance(value, dict):
                facts.update(value)
        return facts

    def _normalize_answer_scope_contract(self, value: Any, *, original_question: str, effective_question: str) -> dict[str, Any]:
        out = dict(value) if isinstance(value, dict) else {}
        text = f"{original_question}\n{effective_question}".lower()
        if not out:
            if any(marker in text for marker in ("all possible", "all option", "all pathway", "provide all")):
                out["user_requested_scope"] = "all_possible_options"
                out["breadth_required"] = "broad"
            elif any(marker in text for marker in ("most likely", "best option", "what visa", "which visa", "suggest")):
                out["user_requested_scope"] = "most_likely_options"
                out["breadth_required"] = "medium"
        out.setdefault("user_requested_scope", "answer_question")
        out.setdefault("breadth_required", "medium")
        out.setdefault("must_include_buckets", [])
        out.setdefault("may_include_buckets", [])
        out.setdefault("must_not_include_buckets", [])
        out.setdefault("completeness_standard", "Satisfy the user's requested answer scope.")
        out.setdefault("compactness_standard", "Use a compact answer shape without omitting required buckets.")
        return out

    def _normalize_live_retrieval_plan(self, value: Any, *, proposal: dict[str, Any]) -> dict[str, Any]:
        out = dict(value) if isinstance(value, dict) else {}
        subclasses: list[str] = []

        # Candidate index is LLM JSON. Consume it defensively; never let a
        # malformed candidate list crash PFVD after the expensive proposal call.
        raw_candidates = proposal.get("candidate_index")
        candidate_items = raw_candidates if isinstance(raw_candidates, list) else []
        for item in candidate_items:
            if not isinstance(item, dict):
                continue
            subclass = str(item.get("subclass") or "").strip()
            if subclass and subclass not in subclasses:
                subclasses.append(subclass)

        for subclass in self._subclass_list(out.get("source_target_subclasses")):
            if subclass not in subclasses:
                subclasses.append(subclass)

        out.setdefault("needed", True)
        out["source_target_subclasses"] = subclasses[:12]
        out.setdefault("source_targets", ["Home Affairs guidance", "Schedule 2"])
        try:
            out["max_pages"] = int(out.get("max_pages") or 6)
        except Exception:
            out["max_pages"] = 6
        out["max_pages"] = max(1, min(out["max_pages"], 8))
        out.setdefault("must_find", [])
        return out

    def _normalize_verification_plan(self, value: Any) -> dict[str, Any]:
        plan = value if isinstance(value, dict) else {}
        depth = str(plan.get("verification_depth") or "targeted_rag").strip()
        if depth not in {"light", "targeted_rag", "exhaustive_schedule2", "high_risk_handoff"}:
            depth = "targeted_rag"
        return {
            "verification_depth": depth,
            "requires_full_context": True,
            "requires_targeted_rag": bool(plan.get("requires_targeted_rag", depth in {"targeted_rag", "exhaustive_schedule2", "high_risk_handoff"})),
            "requires_live_official_check": bool(plan.get("requires_live_official_check", depth != "light")),
            "requires_exhaustive_schedule2": bool(plan.get("requires_exhaustive_schedule2", depth == "exhaustive_schedule2")),
            "requires_schedule1_check": bool(plan.get("requires_schedule1_check", False)),
            "requires_candidate_comparison": bool(plan.get("requires_candidate_comparison", depth == "exhaustive_schedule2")),
            "candidate_subclasses_to_verify": self._subclass_list(plan.get("candidate_subclasses_to_verify")),
            "source_targets": self._string_list(plan.get("source_targets")),
            "legal_questions_to_verify": self._string_list(plan.get("legal_questions_to_verify")),
            "reasons": self._string_list(plan.get("reasons")),
        }

    def _apply_safety_overrides(
        self,
        *,
        plan: dict[str, Any],
        original_question: str,
        effective_question: str,
        proposal: dict[str, Any],
    ) -> dict[str, Any]:
        # These are narrow safety floors only. They must not suppress GPT proposal.
        q = f"{original_question}\n{effective_question}\n{' '.join(self._string_list(proposal.get('risk_flags')))}".lower()
        depth = plan.get("verification_depth") or "targeted_rag"
        if any(term in q for term in ["refusal", "refused", "review", "appeal", "tribunal", "deadline", "cancel", "noicc", "unlawful", "detention", "4020", "character"]):
            depth = "high_risk_handoff"
        if "schedule 2" in q and any(term in q for term in ["all", "possible", "compare", "option", "which visa", "what visa"]):
            depth = "exhaustive_schedule2"
        out = dict(plan)
        out["verification_depth"] = depth
        out["requires_targeted_rag"] = depth in {"targeted_rag", "exhaustive_schedule2", "high_risk_handoff"}
        out["requires_live_official_check"] = depth != "light"
        out["requires_exhaustive_schedule2"] = depth == "exhaustive_schedule2"
        out["requires_candidate_comparison"] = bool(out.get("requires_candidate_comparison") or depth == "exhaustive_schedule2")
        return out

    def _ensure_plan_candidates_in_proposal(self, proposal: dict[str, Any], plan: dict[str, Any]) -> dict[str, Any]:
        existing = {str(item.get("subclass") or "").strip() for item in proposal.get("candidate_index") or [] if isinstance(item, dict)}
        candidate_index = list(proposal.get("candidate_index") or [])
        for subclass in self._subclass_list(plan.get("candidate_subclasses_to_verify")):
            if subclass and subclass not in existing:
                candidate_index.append(
                    {
                        "candidate_label": f"Subclass {subclass}",
                        "subclass": subclass,
                        "stream_or_activity": None,
                        "category": "visa_subclass",
                        "initial_fit": "possible",
                        "confidence_before_verification": "medium",
                        "why_possible": ["Included by GPT verification plan for source checking."],
                        "why_maybe_not": [],
                        "must_verify": [f"Schedule 2 criteria for subclass {subclass}"],
                        "source_targets": ["Schedule 2", "Home Affairs guidance"],
                        "search_queries": [f"Subclass {subclass} Schedule 2 criteria Home Affairs"],
                    }
                )
        proposal = dict(proposal)
        proposal["candidate_index"] = candidate_index
        return proposal

    def _ensure_public_option_coverage_in_answer(
        self,
        *,
        answer_text: str,
        customer_answer_plan: Any,
        response_language: str,
    ) -> str:
        """Deterministically preserve public option buckets for broad option-map answers.

        The final-answer LLM can still omit lower-probability buckets even when the
        planner has correctly built public_option_coverage_map. For broad customer
        questions such as "all possible options", this postprocessor appends only
        missing, planner-approved customer-visible buckets. It does not invent new
        subclasses and it does not change the ranking of the primary answer.
        """
        plan = customer_answer_plan.model_dump() if hasattr(customer_answer_plan, "model_dump") else dict(customer_answer_plan or {})
        scope = str((plan.get("answer_scope_contract") or {}).get("user_requested_scope") or "").strip()
        if scope != "all_possible_options":
            return answer_text
        if "Additional options to check for completeness" in answer_text:
            return answer_text

        coverage_map = [item for item in plan.get("public_option_coverage_map") or [] if isinstance(item, dict)]
        if not coverage_map:
            return answer_text

        answer_lower = answer_text.lower()
        rows: list[tuple[str, str]] = []
        seen_labels: set[str] = set()
        for item in coverage_map:
            if item.get("show_to_customer") is False:
                continue
            label = str(item.get("label") or item.get("bucket") or "").strip()
            when_relevant = str(item.get("when_relevant") or "Conditional option to check if the facts fit.").strip()
            subclasses = [str(value).strip() for value in (item.get("subclasses") or []) if str(value).strip()]
            bucket = str(item.get("bucket") or "").strip()
            if not label or label.lower() in seen_labels:
                continue
            # A bucket is already covered if the answer names any subclass in that
            # bucket or clearly names the non-numbered visitor / working-holiday label.
            has_subclass = any(re.search(rf"\\b{subclass}\\b", answer_lower) for subclass in subclasses)
            label_terms = [label.lower()]
            if "visitor" in label.lower():
                label_terms.extend(["visitor", "eta", "evisitor"])
            if "working holiday" in label.lower() or "work and holiday" in label.lower():
                label_terms.extend(["working holiday", "work and holiday"])
            if "training" in label.lower():
                label_terms.append("training")
            if "temporary activity" in label.lower():
                label_terms.append("temporary activity")
            label_present = any(term and term in answer_lower for term in label_terms)
            if has_subclass or label_present:
                seen_labels.add(label.lower())
                continue
            # Avoid appending duplicate primary/ranked buckets whose subclass has
            # already been discussed through another bucket label.
            if bucket in {"primary", "ranked_alternative"} and subclasses:
                continue
            rows.append((label, when_relevant))
            seen_labels.add(label.lower())

        if not rows:
            return answer_text

        if response_language == "zh":
            heading = "补充：为了覆盖你问到的所有可能选项，还应检查以下类别："
            col1 = "选项类别"
            col2 = "什么时候可能相关"
        else:
            heading = "Additional options to check for completeness:"
            col1 = "Option bucket"
            col2 = "When it may matter"

        table_lines = ["", heading, "", f"| {col1} | {col2} |", "|---|---|"]
        for label, when_relevant in rows[:10]:
            safe_label = label.replace("|", "/")
            safe_when = when_relevant.replace("|", "/")
            table_lines.append(f"| {safe_label} | {safe_when} |")
        addition = "\n".join(table_lines).strip()

        decisive_patterns = [
            r"\n+(One decisive question\s*:)",
            r"\n+(One key question\s*:)",
            r"\n+(一个关键问题[：:])",
            r"\n+(一个决定性问题[：:])",
        ]
        for pattern in decisive_patterns:
            match = re.search(pattern, answer_text, flags=re.IGNORECASE)
            if match:
                return answer_text[: match.start()] .rstrip() + "\n\n" + addition + "\n\n" + answer_text[match.start():].lstrip()
        return answer_text.rstrip() + "\n\n" + addition

    def _safe_live_source_title(self, chunk: Any) -> str | None:
        source = getattr(chunk, "source", None)
        title = str(getattr(source, "title", "") or "").strip()
        authority = str(getattr(source, "authority", "") or "").strip()
        if not title:
            return None
        if authority and authority.lower() not in title.lower():
            return f"{authority} — {title}"
        return title

    def _dict_list(self, value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, dict)]

    def _subclass_list(self, value: Any) -> list[str]:
        if isinstance(value, str):
            raw = [value]
        elif isinstance(value, list):
            raw = value
        else:
            raw = []
        out: list[str] = []
        for item in raw:
            text = str(item or "").strip().upper()
            # Keep ordinary subclass identifiers such as 400, 482, 010, 186.
            digits = "".join(ch for ch in text if ch.isdigit())
            if digits and digits not in out:
                out.append(digits)
        return out[:20]


    def _enforce_public_option_coverage(
        self,
        *,
        answer_text: str,
        customer_answer_plan: dict[str, Any],
        response_language: str,
    ) -> str:
        """Guarantee broad option-map answers do not drop required public buckets."""
        plan = customer_answer_plan or {}
        scope = str((plan.get("answer_scope_contract") or {}).get("user_requested_scope") or "").strip()
        if scope != "all_possible_options":
            return answer_text
        coverage = [
            item
            for item in self._dict_list(plan.get("public_option_coverage_map"))
            if item.get("show_to_customer", True)
        ]
        if not coverage:
            return answer_text
        lower_answer = answer_text.lower()
        missing: list[dict[str, Any]] = []
        for item in coverage:
            if not self._coverage_item_present(lower_answer, item):
                missing.append(item)
        if not missing:
            return answer_text
        if "additional conditional options to keep in mind" in lower_answer:
            return answer_text
        heading = (
            "\n\nAdditional conditional options to keep in mind:\n"
            if response_language != "zh"
            else "\n\n还需要同时保留的有条件选项：\n"
        )
        lines: list[str] = []
        for item in missing:
            label = str(item.get("label") or "").strip()
            when_relevant = str(item.get("when_relevant") or "").strip()
            subclasses = "/".join(self._subclass_list(item.get("subclasses")))
            if not label and subclasses:
                label = f"Subclass {subclasses}"
            if not label:
                continue
            suffix = f" — {when_relevant}" if when_relevant else ""
            lines.append(f"- **{label}**{suffix}")
        if not lines:
            return answer_text
        addition = heading + "\n".join(lines)
        return self._insert_before_decisive_question(answer_text, addition)

    def _coverage_item_present(self, lower_answer: str, item: dict[str, Any]) -> bool:
        subclasses = self._subclass_list(item.get("subclasses"))
        label = str(item.get("label") or "").lower()
        bucket = str(item.get("bucket") or "").lower()
        if subclasses and all(self._answer_mentions_subclass(lower_answer, subclass) for subclass in subclasses):
            return True
        if bucket == "business_visitor_no_work":
            return "visitor" in lower_answer and ("eta" in lower_answer or "evisitor" in lower_answer or "business visitor" in lower_answer)
        if bucket == "independent_work_rights_if_eligible":
            return "working holiday" in lower_answer or "work and holiday" in lower_answer or "417" in lower_answer or "462" in lower_answer
        label_terms = [part.strip() for part in re.split(r"[—/(),]", label) if len(part.strip()) >= 4]
        return any(term in lower_answer for term in label_terms[:3])

    def _answer_mentions_subclass(self, lower_answer: str, subclass: str) -> bool:
        s = re.escape(str(subclass).strip())
        if not s:
            return False
        return bool(re.search(rf"\bsubclass\s+{s}\b|\b{s}\b", lower_answer, flags=re.I))

    def _insert_before_decisive_question(self, answer_text: str, addition: str) -> str:
        markers = [
            "\n\nOne decisive question:",
            "\n\nOne quick question:",
            "\n\nA useful question:",
            "\n\n一个关键问题：",
            "\n\n一个简单问题：",
        ]
        for marker in markers:
            idx = answer_text.find(marker)
            if idx >= 0:
                return answer_text[:idx].rstrip() + addition + answer_text[idx:]
        return answer_text.rstrip() + addition

    def _build_citations_with_schedule(self, *, evidence: EvidenceBundle, verification_plan: dict[str, Any]) -> list[CitationOut]:
        citations = list(self._build_citations(evidence))
        seen = {c.title + "|" + (c.section_ref or "") for c in citations}
        for clause in evidence.schedule_clauses[:12]:
            schedule_no = str(clause.get("schedule_no") or "")
            subclass = str(clause.get("subclass") or "")
            title = (
                "MIGRATION REGULATIONS 1994 - SCHEDULE 2 Provisions with respect to the grant of Subclasses of visas"
                if schedule_no == "2"
                else "MIGRATION REGULATIONS 1994 - SCHEDULE 1 Classes of visa"
            )
            section = str(clause.get("clause_ref") or clause.get("heading") or f"Subclass {subclass}")
            key = title + "|" + section
            if key in seen:
                continue
            seen.add(key)
            citations.append(
                CitationOut(
                    source_id=f"schedule-{schedule_no}-{subclass}-{section}",
                    chunk_id=None,
                    title=title,
                    authority="Migration Regulations 1994 / legislation.gov.au",
                    citation_text=section,
                    section_ref=section,
                    url="https://www.legislation.gov.au/",
                    quote_text=str(clause.get("text") or "")[:420] or None,
                    rationale="Used for post-proposal legislative verification.",
                    confidence_score=0.82,
                )
            )
            if len(citations) >= 12:
                break
        return citations

    def _compact_sources(
        self,
        *,
        citations: list[CitationOut],
        evidence: EvidenceBundle,
        verification_plan: dict[str, Any],
        legacy_schedule2_exhaustive_debug: dict[str, Any] | None,
    ) -> list[str]:
        out: list[str] = []
        def add(value: str | None) -> None:
            text = (value or "").strip()
            if text and text not in out:
                out.append(text)
        for chunk in evidence.live_chunks[:4]:
            add(self._safe_live_source_title(chunk))
            if len(out) >= 6:
                break
        for c in citations:
            authority_blob = f"{c.title} {c.authority} {c.url}".lower()
            if "homeaffairs.gov.au" in authority_blob or "department of home affairs" in authority_blob:
                add(c.title)
                if len(out) >= 3:
                    break
        # Prefer live official source titles before generic Schedule names.
        for chunk in evidence.live_chunks[:4]:
            source = getattr(chunk, "source", None)
            add(getattr(source, "title", None) if source is not None else None)
            if len(out) >= 4:
                break
        if verification_plan.get("requires_exhaustive_schedule2") or evidence.schedule_clauses:
            add("MIGRATION REGULATIONS 1994 - SCHEDULE 2 Provisions with respect to the grant of Subclasses of visas")
        if verification_plan.get("requires_schedule1_check"):
            add("MIGRATION REGULATIONS 1994 - SCHEDULE 1 Classes of visa")
        for chunk in evidence.live_chunks[:8]:
            source = getattr(chunk, "source", None)
            title = str(getattr(source, "title", "") or getattr(chunk, "title", "") or "").strip()
            authority = str(getattr(source, "authority", "") or getattr(chunk, "authority", "") or "").strip()
            url = str(getattr(source, "url", "") or getattr(chunk, "url", "") or "").strip()
            official_blob = f"{title} {authority} {url}".lower()
            if title and ("home affairs" in official_blob or "homeaffairs.gov.au" in official_blob):
                add(title)
            if len(out) >= 6:
                break
        for c in citations:
            add(c.title)
            if len(out) >= 6:
                break
        return out[:6]
