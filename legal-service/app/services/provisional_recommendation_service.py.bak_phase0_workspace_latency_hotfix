
from __future__ import annotations

import json
import os
import re
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.query import QueryResponse


class ProvisionalRecommendationService:
    """
    LLM-backed recommendation-first answer generator.

    It does not replace legal evidence or policy rules. It converts the active case frame,
    known facts, evidence snapshot, and answer preference into a useful customer answer with
    bounded certainty.
    """

    WEAK_ANSWER_PATTERNS = (
        re.compile(r"\bI\s+(?:can\s*)?(?:not|can't)\s+(?:confirm|determine|decide|judge)\b", re.I),
        re.compile(r"\bnot enough information\b", re.I),
        re.compile(r"\binsufficient information\b", re.I),
        re.compile(r"\bcurrent retrieved\b", re.I),
        re.compile(r"\bretrieved (?:material|data|sources?)\b", re.I),
        re.compile(r"\bsource classes?\b", re.I),
        re.compile(r"\bevidence package\b", re.I),
        re.compile(r"\b不能判断\b"),
        re.compile(r"\b无法判断\b"),
        re.compile(r"\b信息还不够\b"),
        re.compile(r"\b不能确认\b"),
    )

    def __init__(self) -> None:
        self.settings = get_settings()
        self.model = os.getenv("RECOMMENDATION_MODEL", os.getenv("REASONING_MODEL", "gpt-5.4-mini"))
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(api_key=self.settings.openai_api_key)
        return self._client

    def apply_to_response(
        self,
        *,
        response: QueryResponse,
        case_frame: dict[str, Any] | None,
        known_facts: dict[str, Any],
        fact_status: dict[str, str] | None = None,
        chunks: list[Any],
        retrieval_debug: dict[str, Any] | None,
        response_language: str,
        original_question: str,
        effective_question: str,
    ) -> tuple[QueryResponse, dict[str, Any]]:
        if not case_frame:
            return response, {"applied": False, "reason": "no_case_frame"}

        frame_id = str(case_frame.get("frame_id") or "")
        answer_preference = str(case_frame.get("answer_preference") or "answer_first")
        response_tier = str(case_frame.get("response_tier") or "provisional_recommendation")
        weak_answer = self._is_weak_answer(response.answer)
        should_apply = (
            response_tier in {"triage_question", "provisional_recommendation", "urgent_provisional_recommendation", "focused_policy_recommendation", "warning_answer"}
            or answer_preference in {"answer_first", "final_recommendation"}
            or weak_answer
        )
        if answer_preference == "continue_intake" and not weak_answer and response_tier != "triage_question":
            return response, {"applied": False, "reason": "continue_intake_preference"}
        if not should_apply:
            return response, {"applied": False, "reason": "not_needed"}

        is_zh = self._is_zh(response_language, original_question)
        if response_tier == "triage_question" or frame_id == "visa_topic_triage":
            response.answer = self._triage_answer(is_zh=is_zh)
            response.confidence = "high"
            response.escalate = False
            response.next_action = "answer"
            response.missing_facts = []
            response.follow_up_questions = []
            response.citations = []
            response.compact_sources = []
            response.user_display_mode = "direct_short"
            return response, {"applied": True, "strategy": "triage_direct_answer", "frame_id": frame_id}

        evidence_snapshot = self._evidence_snapshot(chunks, retrieval_debug)
        working_assumptions = self._build_working_assumptions(
            known_facts=known_facts,
            fact_status=fact_status or {},
            case_frame=case_frame,
        )
        generated = self._generate(
            case_frame=case_frame,
            known_facts=known_facts,
            fact_status=fact_status or {},
            working_assumptions=working_assumptions,
            evidence_snapshot=evidence_snapshot,
            is_zh=is_zh,
            original_question=original_question,
            effective_question=effective_question,
        )
        if not generated:
            generated = self._fallback_answer(case_frame=case_frame, known_facts=known_facts, is_zh=is_zh)

        response.answer = self._sanitize(generated, is_zh=is_zh)
        response.confidence = "low" if str(case_frame.get("risk_level") or "") == "high" else "medium"
        # Escalation can coexist with a useful answer. It should not erase the answer.
        response.escalate = bool(str(case_frame.get("risk_level") or "") == "high" or response.escalate)
        response.next_action = "answer"
        response.missing_facts = []
        response.follow_up_questions = []
        response.user_display_mode = "general_with_warning"
        return response, {
            "applied": True,
            "strategy": "llm_provisional_recommendation" if generated else "fallback_provisional_recommendation",
            "frame_id": frame_id,
            "answer_preference": answer_preference,
            "weak_answer_replaced": weak_answer,
            "working_assumptions": working_assumptions,
        }

    def _generate(
        self,
        *,
        case_frame: dict[str, Any],
        known_facts: dict[str, Any],
        fact_status: dict[str, str],
        working_assumptions: list[dict[str, Any]],
        evidence_snapshot: dict[str, Any],
        is_zh: bool,
        original_question: str,
        effective_question: str,
    ) -> str | None:
        language_rule = "Write in Simplified Chinese." if is_zh else "Write in English."
        system_prompt = (
            "You are a senior migration-law intake assistant. Your job is to give useful provisional recommendations, not to refuse to help.\n"
            "Use the active case frame, known user facts, and evidence snapshot.\n"
            "Legal certainty must be bounded: do not give exact legal deadlines, final eligibility decisions, or document-specific legal advice unless clearly supported.\n"
            "Missing facts should reduce certainty and become caveats, not block the answer.\n"
            "Known fact commitment rule: facts listed in working_assumptions are the current working assumptions from the user/history. Treat them as already provided unless the user contradicts them.\n"
            "Do not ask whether a working-assumption fact exists again. Do not phrase a known fact as unknown. If caution is needed, write 'if the fact you gave is accurate' rather than 'whether this happened'.\n"
            "When a new user turn adds one fact to an existing frame, continue from the stored facts and update the risk analysis; do not restart generic pathway classification.\n"
            "Do not mention retrieved data, source classes, corpus, evidence package, internal policy, or backend logic.\n"
            "Answer structure:\n"
            "1. Start with a direct provisional view.\n"
            "2. Explain what the situation likely means.\n"
            "3. Give practical next steps.\n"
            "4. Give warning / what not to assume.\n"
            "5. End with exactly one optional next question if it would improve precision.\n"
            f"{language_rule}\n"
        )
        user_prompt = json.dumps(
            {
                "original_question": original_question,
                "effective_question": effective_question,
                "active_case_frame": case_frame,
                "known_user_facts": known_facts,
                "fact_status": fact_status,
                "working_assumptions": working_assumptions,
                "evidence_snapshot": evidence_snapshot,
                "forbidden_overclaims": [
                    "do not say a visa will definitely be cancelled",
                    "do not say a visa is definitely safe",
                    "do not say the user is definitely unlawful unless the facts/evidence support it",
                    "do not give exact ART/review deadlines without the required date and source",
                    "do not ask refusal/review questions when the active frame is 485 timing or Student 500 compliance unless the user explicitly mentioned refusal/review",
                ],
            },
            ensure_ascii=False,
        )
        try:
            result = self.client.responses.create(
                model=self.model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            text = (result.output_text or "").strip()
            return text or None
        except Exception:
            return None

    def _fallback_answer(self, *, case_frame: dict[str, Any], known_facts: dict[str, Any], is_zh: bool) -> str:
        frame_id = str(case_frame.get("frame_id") or "")
        next_question = str(case_frame.get("default_next_question") or "").strip()
        if is_zh:
            if frame_id == "student_500_compliance_risk":
                return (
                    "根据你目前提供的信息，这不是“马上一定会被取消”的结论，但确实是 Student visa compliance risk。学校邮件本身通常不是 Home Affairs 的取消决定，但它提醒你出勤或学习进度可能已经出现风险。\n\n"
                    "建议你现在先做几件事：停止继续超出工作限制；尽快改善出勤；保存学校邮件、工资单、roster 和出勤记录；检查 ImmiAccount、email 和 VEVO，看是否有 Home Affairs 的正式通知。\n\n"
                    "不要假设学校警告可以忽略。如果收到 NOICC、拟取消通知或取消决定，应尽快找 migration lawyer/agent 核对。"
                    + (f"\n\n一个简单问题：{next_question}" if next_question else "")
                )
            if frame_id == "485_student_visa_expired_or_status_risk":
                return (
                    "这是比较紧急的情况。不要假设 completion letter 会自动延长 Student visa。你现在第一步应马上查 VEVO / ImmiAccount，确认当前签证状态。\n\n"
                    "基于你说的学生签证已经过期，可能存在 current status、lawful status 或 485 valid lodgement 风险。实际建议是：今天先查 VEVO，保存 completion letter、成绩单、CoE 和签证记录，并尽快让 migration lawyer/agent 检查是否还能有效处理 485 或当前身份问题。"
                    + (f"\n\n一个简单问题：{next_question}" if next_question else "")
                )
            if frame_id == "485_english_test_or_pte_timing":
                return (
                    "你的情况还有时间，但不应该等到签证快过期或过期后再处理。建议你同时做两件事：尽快预约最早的 PTE/English test，并同步准备 485 申请材料。\n\n"
                    "不要只等 PTE 成绩出来才开始准备。先整理 completion letter、official transcript、passport、health insurance、AFP/体检等可能材料。如果时间非常紧，应尽快让律师检查可行的 lodgement strategy。"
                    + (f"\n\n一个简单问题：{next_question}" if next_question else "")
                )
            return (
                "根据你目前提供的信息，我可以先给出一般性的方向判断。最终结论仍取决于具体签证状态、关键日期和文件内容，但你不需要等到所有资料齐全才开始处理。\n\n"
                "建议你先确认当前签证状态、保存相关文件，并尽快处理最紧急的时间或合规风险。"
                + (f"\n\n一个简单问题：{next_question}" if next_question else "")
            )
        else:
            if frame_id == "student_500_compliance_risk":
                return (
                    "Based on what you described, this is not the same as saying your visa will definitely be cancelled, but it is a real Student visa compliance risk. A school warning is not a Home Affairs cancellation decision, but it should not be ignored.\n\n"
                    "Practical next steps: stop exceeding work limits, improve attendance, keep the school email, payslips, rosters and attendance records, and check ImmiAccount/email/VEVO for any formal Home Affairs notice. If you receive a NOICC or cancellation notice, get migration advice quickly."
                    + (f"\n\nOne useful next question: {next_question}" if next_question else "")
                )
            return (
                "Based on the information you provided, I can give a provisional recommendation rather than a final legal conclusion. The safest practical step is to confirm your current visa status, preserve the key documents, and act early on any timing or compliance risk."
                + (f"\n\nOne useful next question: {next_question}" if next_question else "")
            )

    def _build_working_assumptions(
        self,
        *,
        known_facts: dict[str, Any],
        fact_status: dict[str, str],
        case_frame: dict[str, Any] | None,
    ) -> list[dict[str, Any]]:
        # Build a compact, frame-aware list of facts the answer should commit to.
        # This is deliberately generic. It converts persisted user facts into
        # explicit working assumptions so the generator does not re-ask or weaken
        # already-known facts.
        facts = dict(known_facts or {})
        statuses = dict(fact_status or {})
        frame = dict(case_frame or {})
        valid_keys = set(frame.get("valid_fact_keys") or [])
        metadata_keys = {
            "issue_type",
            "visa_type",
            "operation_type",
            "active_case_frame_id",
            "case_family",
            "answer_preference",
            "answer_tier",
            "preferred_language",
        }

        priority_keys = list(frame.get("accepted_facts") or [])
        if valid_keys:
            priority_keys.extend([key for key in facts.keys() if key in valid_keys])
        else:
            priority_keys.extend(facts.keys())

        ordered: list[str] = []
        for key in priority_keys:
            key_s = str(key)
            if key_s not in ordered:
                ordered.append(key_s)

        assumptions: list[dict[str, Any]] = []
        for key in ordered:
            if key in metadata_keys:
                continue
            value = facts.get(key)
            if not self._present(value):
                continue
            status = str(statuses.get(key) or "")
            if status.startswith("known:"):
                confidence = status.split(":", 1)[1] or "medium"
            elif status in {"known", "user_input", "carried_context"}:
                confidence = "medium"
            else:
                confidence = "medium"

            assumptions.append(
                {
                    "fact_key": key,
                    "value": value,
                    "confidence": confidence if confidence in {"low", "medium", "high"} else "medium",
                    "commitment_instruction": (
                        "Treat this as a current working assumption from the user/history. "
                        "Do not ask whether it exists again unless the user contradicts it."
                    ),
                }
            )
            if len(assumptions) >= 12:
                break
        return assumptions

    def _present(self, value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip()) and value.strip().lower() not in {
                "not_sure",
                "not sure",
                "unknown",
                "unsure",
                "n/a",
                "na",
            }
        if isinstance(value, (list, tuple, set, dict)):
            return bool(value)
        return True

    def _evidence_snapshot(self, chunks: list[Any], retrieval_debug: dict[str, Any] | None) -> dict[str, Any]:
        sources: list[dict[str, Any]] = []
        for chunk in (chunks or [])[:6]:
            source = getattr(chunk, "source", None)
            title = str(getattr(source, "title", "") or getattr(chunk, "title", "") or "")
            authority = str(getattr(source, "authority", "") or getattr(chunk, "authority", "") or "")
            source_type = str(getattr(source, "source_type", "") or getattr(chunk, "source_type", "") or "")
            text = str(getattr(chunk, "text", "") or "")[:500]
            if title or text:
                sources.append({"title": title, "authority": authority, "source_type": source_type, "text_preview": text})
        dbg = retrieval_debug or {}
        return {
            "sources": sources,
            "live_fetch_used": bool(dbg.get("live_fetch_used")),
            "live_domains_used": dbg.get("live_domains_used") or [],
            "top_titles": dbg.get("top_titles") or [],
        }

    def _triage_answer(self, *, is_zh: bool) -> str:
        if is_zh:
            return (
                "可以，我可以帮你先看澳洲签证或移民问题。你可以直接描述情况，也可以先选一个方向：\n\n"
                "1. 学生签证 Student visa 500\n"
                "2. 485 Temporary Graduate visa\n"
                "3. Bridging visa\n"
                "4. 拒签 / ART 复审\n"
                "5. 签证取消风险或学校/雇主警告\n"
                "6. 签证条件，例如 8105、8501、8503\n\n"
                "你不需要一次性准备所有材料，先告诉我是哪一类问题即可。"
            )
        return (
            "Yes. I can help with general Australian visa and migration questions. You can describe the situation directly, or choose one area to start with:\n\n"
            "1. Student visa 500\n"
            "2. 485 Temporary Graduate visa\n"
            "3. Bridging visa\n"
            "4. Refusal / ART review\n"
            "5. Cancellation risk or school/employer warning\n"
            "6. Visa conditions such as 8105, 8501, or 8503\n\n"
            "You do not need to provide every document at once. Start with the broad issue."
        )

    def _is_weak_answer(self, answer: str | None) -> bool:
        text = answer or ""
        return any(pattern.search(text) for pattern in self.WEAK_ANSWER_PATTERNS)

    def _is_zh(self, response_language: str, original_question: str) -> bool:
        return (response_language or "").lower().startswith("zh") or bool(re.search(r"[\u3400-\u4dbf\u4e00-\u9fff]", original_question or ""))

    def _sanitize(self, text: str, *, is_zh: bool) -> str:
        cleaned = text.strip()
        replacements = [
            (r"(?i)retrieved (?:material|data|sources?)", "available information"),
            (r"(?i)source classes?", "source information"),
            (r"(?i)evidence package", "available information"),
            (r"(?i)local corpus", "available information"),
            (r"(?i)current retrieved data alone", "the available information"),
        ]
        for pattern, repl in replacements:
            cleaned = re.sub(pattern, repl, cleaned)
        if is_zh:
            cleaned = cleaned.replace("检索到的资料", "目前可用的信息").replace("当前检索资料", "目前可用的信息")
        return re.sub(r"\n{3,}", "\n\n", cleaned).strip()
