from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict, dataclass
import json
import os
import re
from typing import Any, Literal

from openai import OpenAI

from app.core.config import get_settings

LanguageCode = Literal["en", "zh"]


@dataclass(frozen=True, slots=True)
class LanguageContext:
    original_question: str
    response_language: LanguageCode
    internal_question_en: str
    detected_chinese: bool
    used_canonicalization_llm: bool = False
    canonicalization_reason: str = ""

    def to_debug_dict(self) -> dict[str, Any]:
        return asdict(self)


class LanguageService:
    """
    Language boundary for the legal assistant.

    Chinese user turns are converted into an internal English canonical query so
    the current English-oriented router/retriever/state machine can keep working.
    User-facing responses are then generated or localized in Chinese.
    """

    CJK_PATTERN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")

    ZH_FACT_LABELS: dict[str, str] = {
        "notification_date": "收到通知的日期",
        "refusal_notice_available": "是否有拒签通知",
        "onshore_offshore": "决定时所在位置",
        "refusal_reason_if_known": "已知的拒签原因",
        "visa_subclass": "签证类别 / subclass",
        "current_visa": "当前签证或身份",
        "visa_condition_number": "签证条件编号",
        "travel_need": "旅行计划",
        "completion_date": "课程完成日期",
        "incorrect_information_issue": "被质疑的信息或文件",
        "qualification_level": "学历层级",
        "first_485_or_subsequent": "第一次或后续 485 申请",
        "skills_assessment_status": "职业评估状态",
        "nominated_occupation": "提名职业",
        "regional_residence_duration": "偏远地区居住时长",
        "replacement_reason": "Replacement stream 原因",
    }

    ZH_FACT_PROMPTS: dict[str, str] = {
        "notification_date": "你是哪一天收到拒签或决定通知的？",
        "refusal_notice_available": "你现在有拒签通知书或决定信吗？",
        "onshore_offshore": "做出决定时，你是在澳大利亚境内还是境外？",
        "refusal_reason_if_known": "你知道通知书里写的主要拒签原因吗？",
        "visa_subclass": "涉及的是哪个签证 subclass？例如 500、485、010、020。",
        "current_visa": "你现在持有什么签证，或目前是什么移民身份？",
        "visa_condition_number": "你想了解哪个签证条件编号？例如 8501、8503。",
        "travel_need": "你是想离开澳大利亚后再回来，还是只是一般性询问？",
        "completion_date": "你是什么时候完成课程，或预计什么时候完成？",
        "incorrect_information_issue": "移民局具体质疑的是哪项信息或哪份文件？",
        "qualification_level": "你完成的是什么学历？例如 diploma、trade qualification、Bachelor、Masters 或 PhD。",
        "first_485_or_subsequent": "这是你的第一次 485 申请，还是第二次、后续或 replacement 申请？",
        "skills_assessment_status": "你是否已经申请或获得职业评估？",
        "nominated_occupation": "你打算使用哪个提名职业？",
        "regional_residence_duration": "你在偏远地区居住、工作或学习了多久？",
        "replacement_reason": "你认为 replacement stream 适用的原因是什么？",
    }

    ZH_FACT_WHY: dict[str, str] = {
        "notification_date": "日期可能影响复审期限和下一步选择。",
        "refusal_notice_available": "拒签通知通常会写明拒签依据、复审信息和关键日期。",
        "onshore_offshore": "决定时你在境内还是境外，可能影响可用的法律路径。",
        "refusal_reason_if_known": "拒签原因会影响应准备哪些证据，以及是否需要尽快请律师审查。",
        "visa_subclass": "签证类别可以帮助缩小适用规则和实际路径。",
        "current_visa": "当前签证或身份会影响合法停留、旅行和下一步选择。",
        "visa_condition_number": "签证条件编号决定了具体义务或限制。",
        "travel_need": "旅行目的会影响过桥签证和回澳风险的判断。",
        "completion_date": "课程完成时间可能影响 485 等签证的时限和资格。",
        "incorrect_information_issue": "PIC 4020 或错误信息风险高度依赖具体被质疑的内容。",
        "qualification_level": "学历层级会帮助判断 485 的具体 stream。",
        "first_485_or_subsequent": "第一次、第二次、后续或 replacement 485 对应的法律路径不同。",
        "skills_assessment_status": "职业评估是 vocational stream 的关键风险点。",
        "nominated_occupation": "提名职业会影响 vocational stream 和学历相关性判断。",
        "regional_residence_duration": "偏远地区居住/工作/学习时长会影响 regional extension。",
        "replacement_reason": "Replacement stream 取决于之前 485 和受影响原因。",
    }

    ZH_VALUE_DISPLAY: dict[str, str] = {
        "Yes": "是",
        "No": "否",
        "Not sure": "不确定",
        "In Australia": "在澳大利亚境内",
        "Outside Australia": "在澳大利亚境外",
        "in_australia": "在澳大利亚境内",
        "outside_australia": "在澳大利亚境外",
        "not_sure": "不确定",
        "leave_and_return": "离开后再返回澳大利亚",
        "general_question": "一般性询问",
    }

    ZH_PRIMARY_PROMPTS: dict[str, str] = {
        "guided_intake": "我可以先给你一般方向，但还需要一个关键信息，才能更贴近你的情况。",
        "analysis_ready": "我已经有足够的基础信息，可以继续进行一般性分析。",
        "answer": "我已经有足够的基础信息，可以给出更有针对性的说明。",
        "escalation": "这个问题可能涉及期限、身份或文件风险，建议尽快让律师审查。",
    }

    COMMON_ZH_TRANSLATIONS: dict[str, str] = {
        "I’m sorry, but I couldn’t answer that question right now.": "抱歉，我现在无法回答这个问题。",
        "Sorry, I could not generate a response right now.": "抱歉，我现在无法生成回复。",
        "I do not have enough retrieved immigration-law material to answer this reliably. Please provide more details or arrange a consultation with the lawyer.": "我目前没有足够的检索材料来可靠回答这个问题。请补充更多细节，或预约律师咨询。",
        "I could not reliably generate a fully grounded answer from the retrieved material. Please provide more details or arrange a consultation with the lawyer.": "我无法仅根据当前检索材料可靠地生成完整答案。请补充更多细节，或预约律师咨询。",
        "What visa issue would you like help with?": "你想咨询哪一类签证问题？",
        "Do you want me to explain how this condition affects your specific visa?": "你想让我结合你的具体签证解释这个条件会怎样影响你吗？",
    }

    def __init__(self) -> None:
        self.settings = get_settings()
        self.model = os.getenv("LANGUAGE_CANONICALIZATION_MODEL", os.getenv("GENERAL_QA_MODEL", "gpt-5.4-mini"))
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(api_key=self.settings.openai_api_key)
        return self._client

    def detect_response_language(self, text: str, requested_language: str | None = None) -> LanguageCode:
        requested = (requested_language or "").strip().lower()
        if requested in {"zh", "zh-cn", "chinese", "simplified_chinese"}:
            return "zh"
        if requested in {"en", "english"}:
            return "en"
        return "zh" if self.contains_chinese(text) else "en"

    def contains_chinese(self, text: str | None) -> bool:
        return bool(text and self.CJK_PATTERN.search(text))

    def prepare_turn(self, *, question: str, requested_language: str | None = None) -> LanguageContext:
        response_language = self.detect_response_language(question, requested_language)
        detected_chinese = self.contains_chinese(question)

        if response_language != "zh" or not detected_chinese:
            return LanguageContext(
                original_question=question,
                response_language=response_language,
                internal_question_en=question.strip(),
                detected_chinese=detected_chinese,
                used_canonicalization_llm=False,
                canonicalization_reason="english_or_no_cjk_detected",
            )

        cheap = self._cheap_chinese_to_english(question)
        if cheap is not None:
            return LanguageContext(
                original_question=question,
                response_language="zh",
                internal_question_en=cheap,
                detected_chinese=True,
                used_canonicalization_llm=False,
                canonicalization_reason="deterministic_chinese_mapping",
            )

        internal_question = self._canonicalize_chinese_question_with_llm(question)
        if internal_question:
            return LanguageContext(
                original_question=question,
                response_language="zh",
                internal_question_en=internal_question,
                detected_chinese=True,
                used_canonicalization_llm=True,
                canonicalization_reason="llm_canonicalization",
            )

        return LanguageContext(
            original_question=question,
            response_language="zh",
            internal_question_en=self._fallback_chinese_to_english(question),
            detected_chinese=True,
            used_canonicalization_llm=False,
            canonicalization_reason="fallback_keyword_canonicalization",
        )

    def localize_response_bundle(
        self,
        *,
        response: Any,
        fact_slot_states: list[Any],
        interaction_plan: Any | None,
        response_language: str | None,
    ) -> tuple[Any, list[Any], Any | None]:
        language = self.detect_response_language("", response_language)
        response = self._clone_model(response)
        fact_slot_states = [self._localize_fact_slot(self._clone_model(slot), language) for slot in fact_slot_states]
        interaction_plan = (
            self._localize_interaction_plan(self._clone_model(interaction_plan), language)
            if interaction_plan is not None
            else None
        )

        setattr(response, "response_language", language)
        if language != "zh":
            return response, fact_slot_states, interaction_plan

        answer = str(getattr(response, "answer", "") or "")
        if answer and not self.contains_chinese(answer):
            setattr(response, "answer", self.translate_user_text(answer, target_language="zh"))

        followups = getattr(response, "follow_up_questions", None)
        if isinstance(followups, list):
            setattr(response, "follow_up_questions", [self.localize_user_text(str(item), "zh") for item in followups if item])

        missing_facts = getattr(response, "missing_facts", None)
        if isinstance(missing_facts, list):
            localized_missing = [self.ZH_FACT_LABELS.get(str(item), str(item)) for item in missing_facts]
            setattr(response, "missing_facts", localized_missing)

        return response, fact_slot_states, interaction_plan

    def localize_user_text(self, text: str, language: str | None) -> str:
        if self.detect_response_language("", language) != "zh":
            return text
        if not text or self.contains_chinese(text):
            return text
        if text in self.COMMON_ZH_TRANSLATIONS:
            return self.COMMON_ZH_TRANSLATIONS[text]
        return self._localize_common_followup(text)

    def translate_user_text(self, text: str, *, target_language: LanguageCode = "zh") -> str:
        if target_language != "zh" or not text or self.contains_chinese(text):
            return text
        if text in self.COMMON_ZH_TRANSLATIONS:
            return self.COMMON_ZH_TRANSLATIONS[text]
        try:
            response = self.client.responses.create(
                model=self.model,
                input=[
                    {
                        "role": "system",
                        "content": (
                            "Translate this user-facing Australian immigration assistant text into Simplified Chinese. "
                            "Do not add, remove, or strengthen any legal claim. Preserve uncertainty, cautions, deadlines, "
                            "source names, visa subclass numbers, and official terms. Return only the translated text."
                        ),
                    },
                    {"role": "user", "content": text},
                ],
            )
            translated = (response.output_text or "").strip()
            return translated or text
        except Exception:
            return self._fallback_translate_to_chinese(text)

    def _canonicalize_chinese_question_with_llm(self, question: str) -> str | None:
        try:
            response = self.client.responses.create(
                model=self.model,
                input=[
                    {
                        "role": "system",
                        "content": (
                            "You translate the user's Chinese Australian immigration-law message into a concise internal English query.\n"
                            "Preserve only what the user positively said: visa subclasses, dates, documents, locations, goals, uncertainty, and facts.\n"
                            "Do NOT list missing categories. Do NOT write phrases like 'has not provided refusal/cancellation/review details'.\n"
                            "Do NOT introduce refusal, cancellation, review, tribunal, ART, deadline, travel, or document issues unless the user positively mentioned them.\n"
                            "Do not answer the question. Do not add legal advice.\n"
                            "Return ONLY valid JSON with this shape: {\"internal_question_en\": string}."
                        ),
                    },
                    {"role": "user", "content": question},
                ],
            )
            parsed = self._extract_json_object(response.output_text or "")
            internal = str((parsed or {}).get("internal_question_en") or "").strip()
            return internal or None
        except Exception:
            return None

    def _cheap_chinese_to_english(self, question: str) -> str | None:
        # Keep this deliberately tiny. Semantic Chinese interpretation is handled
        # by RestrictedLLMTurnAnalysisService, not by case-by-case keyword maps.
        compact = re.sub(r"\s+", "", (question or "").strip()).lower()
        if compact in {"你好", "您好", "嗨", "hello", "hi"}:
            return "Hello."
        return None

    def _fallback_chinese_to_english(self, question: str) -> str:
        return "Australian immigration question from a Chinese-speaking user: " + question.strip()

    def _localize_fact_slot(self, slot: Any, language: LanguageCode) -> Any:
        if language != "zh" or slot is None:
            return slot
        key = str(getattr(slot, "fact_key", None) or getattr(slot, "key", "") or "")
        if key in self.ZH_FACT_LABELS:
            setattr(slot, "label", self.ZH_FACT_LABELS[key])
        if key in self.ZH_FACT_WHY:
            setattr(slot, "why_needed", self.ZH_FACT_WHY[key])
        value_display = getattr(slot, "value_display", None) or getattr(slot, "valueDisplay", None)
        if value_display is not None:
            localized = self.ZH_VALUE_DISPLAY.get(str(value_display), str(value_display))
            if hasattr(slot, "value_display"):
                setattr(slot, "value_display", localized)
            if hasattr(slot, "valueDisplay"):
                setattr(slot, "valueDisplay", localized)
        return slot

    def _localize_interaction_plan(self, plan: Any, language: LanguageCode) -> Any:
        if language != "zh" or plan is None:
            return plan
        mode = str(getattr(plan, "mode", "") or "")
        if mode in self.ZH_PRIMARY_PROMPTS:
            setattr(plan, "primary_prompt", self.ZH_PRIMARY_PROMPTS[mode])

        requested = getattr(plan, "requested_facts", None)
        if isinstance(requested, list):
            for fact in requested:
                key = str(getattr(fact, "fact_key", None) or getattr(fact, "key", "") or "")
                if key in self.ZH_FACT_LABELS:
                    setattr(fact, "label", self.ZH_FACT_LABELS[key])
                if key in self.ZH_FACT_PROMPTS:
                    setattr(fact, "prompt", self.ZH_FACT_PROMPTS[key])
                if key in self.ZH_FACT_WHY:
                    setattr(fact, "why_needed", self.ZH_FACT_WHY[key])

        warnings = getattr(plan, "warnings", None)
        if isinstance(warnings, list):
            setattr(plan, "warnings", [self._localize_warning(str(item)) for item in warnings if item])

        known = getattr(plan, "known_facts_summary", None)
        if isinstance(known, dict):
            localized_known: dict[str, Any] = {}
            for key, value in known.items():
                display_key = self.ZH_FACT_LABELS.get(str(key), str(key))
                display_value = self.ZH_VALUE_DISPLAY.get(str(value), value)
                localized_known[display_key] = display_value
            setattr(plan, "known_facts_summary", localized_known)

        return plan

    def _localize_common_followup(self, text: str) -> str:
        lowered = text.lower()
        if "notification date" in lowered or "notified" in lowered:
            return self.ZH_FACT_PROMPTS["notification_date"]
        if "refusal notice" in lowered or "decision letter" in lowered:
            return self.ZH_FACT_PROMPTS["refusal_notice_available"]
        if "in australia" in lowered or "outside australia" in lowered or "onshore" in lowered or "offshore" in lowered:
            return self.ZH_FACT_PROMPTS["onshore_offshore"]
        if "visa subclass" in lowered or "subclass" in lowered:
            return self.ZH_FACT_PROMPTS["visa_subclass"]
        if "current visa" in lowered or "immigration status" in lowered:
            return self.ZH_FACT_PROMPTS["current_visa"]
        if "condition number" in lowered or "visa condition" in lowered:
            return self.ZH_FACT_PROMPTS["visa_condition_number"]
        if text in self.COMMON_ZH_TRANSLATIONS:
            return self.COMMON_ZH_TRANSLATIONS[text]
        return self.translate_user_text(text, target_language="zh")

    def _localize_warning(self, text: str) -> str:
        lowered = text.lower()
        if "timing" in lowered or "notification date" in lowered or "deadline" in lowered:
            return "这里可能涉及期限问题，建议尽早确认收到通知的日期。"
        if "high-risk" in lowered or "legal review" in lowered or "escal" in lowered:
            return "这个问题可能存在较高风险，建议让律师进一步审查。"
        return self.translate_user_text(text, target_language="zh")

    def _fallback_translate_to_chinese(self, text: str) -> str:
        if not text:
            return text
        if text in self.COMMON_ZH_TRANSLATIONS:
            return self.COMMON_ZH_TRANSLATIONS[text]
        return "我可以提供一般性说明，但这个问题需要结合具体事实、日期和文件来判断。请补充关键信息，或预约律师咨询。"

    def _clone_model(self, obj: Any) -> Any:
        if obj is None:
            return None
        if hasattr(obj, "model_copy"):
            try:
                return obj.model_copy(deep=True)
            except Exception:
                pass
        return deepcopy(obj)

    def _extract_json_object(self, text: str) -> dict[str, Any] | None:
        if not text:
            return None
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            pass
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        try:
            parsed = json.loads(text[start : end + 1])
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None
