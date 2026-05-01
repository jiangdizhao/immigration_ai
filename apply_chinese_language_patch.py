#!/usr/bin/env python3
"""
Apply Chinese response-language support to the latest immigration_ai repository.

Run from repository root after unzipping this package:

    python apply_chinese_language_patch.py

The patch creates .bak_chinese_language backups before changing existing files.
"""
from __future__ import annotations

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent
BACKUP_SUFFIX = ".bak_chinese_language"


def p(rel: str) -> Path:
    return ROOT / rel


def read(rel: str) -> str:
    file_path = p(rel)
    if not file_path.exists():
        raise FileNotFoundError(f"Missing expected file: {rel}")
    return file_path.read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    file_path = p(rel)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    backup = file_path.with_name(file_path.name + BACKUP_SUFFIX)
    if file_path.exists() and not backup.exists():
        shutil.copy2(file_path, backup)
    file_path.write_text(text, encoding="utf-8")
    print(f"patched {rel}")


def replace_once(text: str, old: str, new: str, rel: str) -> str:
    if old not in text:
        raise RuntimeError(f"Could not find expected block in {rel}:\n{old[:500]}")
    return text.replace(old, new, 1)


def insert_after(text: str, marker: str, addition: str, rel: str) -> str:
    if addition.strip() in text:
        return text
    if marker not in text:
        raise RuntimeError(f"Could not find insertion marker in {rel}:\n{marker[:500]}")
    return text.replace(marker, marker + addition, 1)


def replace_after(text: str, section_marker: str, old: str, new: str, rel: str) -> str:
    if section_marker not in text:
        raise RuntimeError(f"Missing section marker in {rel}: {section_marker}")
    before, after = text.split(section_marker, 1)
    if old not in after:
        raise RuntimeError(f"Could not find block after {section_marker} in {rel}:\n{old[:500]}")
    return before + section_marker + after.replace(old, new, 1)


def patch_query_schema() -> None:
    rel = "legal-service/app/schemas/query.py"
    text = read(rel)
    if "response_language:" not in text:
        text = replace_once(
            text,
            "class QueryRequest(BaseSchema):\n    question: str = Field(min_length=3, max_length=4000)\n",
            "class QueryRequest(BaseSchema):\n    question: str = Field(min_length=3, max_length=4000)\n    response_language: Literal[\"en\", \"zh\"] | None = None\n",
            rel,
        )
        text = replace_once(
            text,
            "class QueryResponse(BaseSchema):\n    matter_id: str | None = None\n    answer: str\n",
            "class QueryResponse(BaseSchema):\n    matter_id: str | None = None\n    answer: str\n    response_language: Literal[\"en\", \"zh\"] = \"en\"\n",
            rel,
        )
    write(rel, text)


def patch_query_service() -> None:
    rel = "legal-service/app/services/query_service.py"
    text = read(rel)

    if "from app.services.language_service import LanguageService" not in text:
        text = insert_after(
            text,
            "from app.services.fact_extraction_service import FactExtractionService\n",
            "from app.services.language_service import LanguageService\n",
            rel,
        )

    if "language_service: LanguageService | None = None" not in text:
        text = replace_once(
            text,
            "        lightweight_response_service: LightweightResponseService | None = None,\n    ) -> None:\n",
            "        lightweight_response_service: LightweightResponseService | None = None,\n        language_service: LanguageService | None = None,\n    ) -> None:\n",
            rel,
        )

    if "self.language_service = language_service or LanguageService()" not in text:
        text = insert_after(
            text,
            "        self.lightweight_response_service = lightweight_response_service or LightweightResponseService()\n",
            "        self.language_service = language_service or LanguageService()\n",
            rel,
        )

    old_start = "    def handle_query(self, db: Session, payload: QueryRequest) -> QueryResponse:\n        matter = self._get_or_create_matter(db, payload)\n"
    if old_start in text:
        new_start = """    def handle_query(self, db: Session, payload: QueryRequest) -> QueryResponse:
        original_question = payload.question
        language_context = self.language_service.prepare_turn(
            question=payload.question,
            requested_language=payload.response_language,
        )
        if language_context.internal_question_en.strip() != payload.question.strip() or payload.response_language != language_context.response_language:
            payload = QueryRequest(
                **{
                    **payload.model_dump(),
                    "question": language_context.internal_question_en,
                    "response_language": language_context.response_language,
                }
            )

        matter = self._get_or_create_matter(db, payload)
"""
        text = replace_once(text, old_start, new_start, rel)

    if '"original_user_question": original_question' not in text:
        text = replace_once(
            text,
            '                    "effective_question": effective_question,\n                    "pre_llm_router": enriched_debug["pre_llm_router"],\n',
            '                    "effective_question": effective_question,\n                    "original_user_question": original_question,\n                    "response_language": language_context.response_language,\n                    "language": language_context.to_debug_dict(),\n                    "pre_llm_router": enriched_debug["pre_llm_router"],\n',
            rel,
        )

    localize_marker = """        response = self._normalize_response_for_user(
            response=response,
            policy=policy,
            evidence=evidence,
            fact_slot_states=fact_slot_states,
            case_hypothesis=case_hypothesis,
        )

        response.conversation_state = state.conversation_state
"""
    if localize_marker in text and "self.language_service.localize_response_bundle" not in text:
        text = replace_once(
            text,
            localize_marker,
            """        response = self._normalize_response_for_user(
            response=response,
            policy=policy,
            evidence=evidence,
            fact_slot_states=fact_slot_states,
            case_hypothesis=case_hypothesis,
        )

        response, fact_slot_states, interaction_plan = self.language_service.localize_response_bundle(
            response=response,
            fact_slot_states=fact_slot_states,
            interaction_plan=interaction_plan,
            response_language=language_context.response_language,
        )

        response.conversation_state = state.conversation_state
""",
            rel,
        )

    if 'debug["language"] = language_context.to_debug_dict()' not in text:
        text = insert_after(
            text,
            "        debug = dict(response.retrieval_debug or {})\n",
            '        debug["language"] = language_context.to_debug_dict()\n',
            rel,
        )

    if "response.response_language = language_context.response_language" not in text:
        text = insert_after(
            text,
            "        response.compact_sources = self._compact_source_titles(response)\n",
            "        response.response_language = language_context.response_language\n",
            rel,
        )

    write(rel, text)


def patch_reasoning_service() -> None:
    rel = "legal-service/app/services/reasoning_service.py"
    text = read(rel)

    if "def _response_language_instruction" not in text:
        helper = """
    def _response_language_instruction(self, response_language: str | None) -> str:
        language = (response_language or "en").strip().lower()
        if language.startswith("zh"):
            return (
                "\\nResponse language requirement:\\n"
                "- Write the final user-facing answer in Simplified Chinese.\\n"
                "- Preserve legal uncertainty and cautions. Do not make deadlines, rights, or eligibility sound more certain than the supported facts allow.\\n"
                "- Keep official terms such as Home Affairs, ART, Subclass 500, Subclass 485, Bridging visa B, BVA/BVB, and visa condition numbers in English when useful, with Chinese explanation.\\n"
                "- Do not translate or alter citations/source titles unless needed for readability.\\n"
            )
        return "\\nResponse language requirement: write the final user-facing answer in English.\\n"

"""
        text = insert_after(
            text,
            "    # ------------------------------------------------------------------\n    # Fallbacks / serialization helpers\n    # ------------------------------------------------------------------\n",
            helper,
            rel,
        )

    section = "    def _synthesize_answer("
    if 'response_language = str((conversation_context or {}).get("response_language")' not in text:
        text = replace_after(
            text,
            section,
            "        answerability_json = json.dumps(answerability or {}, ensure_ascii=False)\n\n        system_prompt = (\n",
            "        answerability_json = json.dumps(answerability or {}, ensure_ascii=False)\n        response_language = str((conversation_context or {}).get(\"response_language\") or getattr(payload, \"response_language\", None) or \"en\").lower()\n        original_user_question = str((conversation_context or {}).get(\"original_user_question\") or payload.question)\n        language_instruction = self._response_language_instruction(response_language)\n\n        system_prompt = (\n",
            rel,
        )

    if "system_prompt += language_instruction" not in text:
        text = replace_after(
            text,
            section,
            '            "Keep the answer concise and grounded.\\n"\n        )\n        user_prompt = (\n',
            '            "Keep the answer concise and grounded.\\n"\n        )\n        system_prompt += language_instruction\n\n        user_prompt = (\n',
            rel,
        )

    if '"Original question:\\n{original_user_question}' not in text:
        text = replace_after(
            text,
            section,
            'f"Original question:\\n{payload.question}\\n\\n"',
            'f"Original question:\\n{original_user_question}\\n\\n"',
            rel,
        )

    write(rel, text)


def patch_widget_route() -> None:
    rel = "chatbot/app/api/widget-chat/route.ts"
    text = read(rel)

    if "responseLanguage" not in text.split("const widgetRequestBodySchema", 1)[1].split("});", 1)[0]:
        text = replace_once(
            text,
            "  intakeFacts: z.record(z.string(), z.any()).optional().default({}),\n});\n",
            "  intakeFacts: z.record(z.string(), z.any()).optional().default({}),\n  responseLanguage: z.enum([\"en\", \"zh\"]).optional(),\n});\n",
            rel,
        )

    if "response_language?: string | null;" not in text:
        text = replace_once(
            text,
            "type LegalServiceResponse = {\n  answer?: string;\n",
            "type LegalServiceResponse = {\n  answer?: string;\n  response_language?: string | null;\n",
            rel,
        )

    if "function containsChinese" not in text:
        text = insert_after(
            text,
            'function fallbackText(data: LegalServiceResponse): string {\n  if (data.answer?.trim()) return data.answer.trim();\n  return "Sorry, I could not generate a response right now.";\n}\n',
            '\nfunction containsChinese(text: string): boolean {\n  return /[\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff]/.test(text);\n}\n',
            rel,
        )

    text = text.replace(
        "const { id, matterId, messages, selectedChatModel, intakeFacts } =\n      widgetRequestBodySchema.parse(json);",
        "const { id, matterId, messages, selectedChatModel, intakeFacts, responseLanguage } =\n      widgetRequestBodySchema.parse(json);",
        1,
    )

    if 'const detectedResponseLanguage = responseLanguage ?? (containsChinese(question) ? "zh" : "en");' not in text:
        text = insert_after(
            text,
            '    if (!question) {\n      return emptyWidgetResponse("Please enter a question so I can help.", matterId ?? null);\n    }\n',
            '\n    const detectedResponseLanguage = responseLanguage ?? (containsChinese(question) ? "zh" : "en");\n',
            rel,
        )

    if "response_language: detectedResponseLanguage" not in text:
        text = replace_once(
            text,
            "      body: JSON.stringify({\n        question,\n",
            "      body: JSON.stringify({\n        question,\n        response_language: detectedResponseLanguage,\n",
            rel,
        )

    if "responseLanguage: data.response_language ?? detectedResponseLanguage" not in text:
        text = insert_after(
            text,
            "      text: fallbackText(data),\n",
            "      responseLanguage: data.response_language ?? detectedResponseLanguage,\n",
            rel,
        )

    write(rel, text)


def patch_guided_intake_types() -> None:
    rel = "chatbot/components/guided-intake-types.ts"
    text = read(rel)
    if "export type ResponseLanguage" not in text:
        text = 'export type ResponseLanguage = "en" | "zh" | string;\n' + text
    if "responseLanguage?: ResponseLanguage | null;" not in text:
        text = replace_once(
            text,
            "  text: string;\n  isStreaming?: boolean;\n",
            "  text: string;\n  isStreaming?: boolean;\n  responseLanguage?: ResponseLanguage | null;\n",
            rel,
        )
        text = replace_once(
            text,
            "export interface WidgetRouteResponse {\n  text: string;\n",
            "export interface WidgetRouteResponse {\n  text: string;\n  responseLanguage?: ResponseLanguage | null;\n",
            rel,
        )
    write(rel, text)


def patch_immigration_widget() -> None:
    rel = "chatbot/components/immigration-assistant-widget.tsx"
    text = read(rel)
    if "responseLanguage: data.responseLanguage ?? null" not in text:
        text = insert_after(
            text,
            "      isStreaming: true,\n",
            "      responseLanguage: data.responseLanguage ?? null,\n",
            rel,
        )
    text = text.replace(
        ': "Sorry, I could not generate a response right now.";',
        ': data.responseLanguage === "zh" ? "抱歉，我现在无法生成回复。" : "Sorry, I could not generate a response right now.";',
        1,
    )
    write(rel, text)


def write_smoke_test() -> None:
    rel = "legal-service/scripts/smoke_test_chinese_language.py"
    text = """from app.services.language_service import LanguageService


def main() -> None:
    service = LanguageService()
    samples = [
        "你好",
        "我的学生签证被拒了，我下一步怎么办？",
        "我还能申请复审吗？",
        "什么是8501签证条件？",
        "Can I leave Australia and come back if I only hold a bridging visa?",
    ]
    for sample in samples:
        ctx = service.prepare_turn(question=sample)
        print("---")
        print("input:", sample)
        print("language:", ctx.response_language)
        print("internal_question_en:", ctx.internal_question_en)
        print("reason:", ctx.canonicalization_reason)


if __name__ == "__main__":
    main()
"""
    write(rel, text)


def main() -> None:
    if not p("legal-service/app/services/language_service.py").exists():
        raise RuntimeError("language_service.py is missing. Unzip the whole patch package at the repository root.")

    patch_query_schema()
    patch_query_service()
    patch_reasoning_service()
    patch_widget_route()
    patch_guided_intake_types()
    patch_immigration_widget()
    write_smoke_test()

    print("\nChinese language patch applied.")
    print("Recommended checks:")
    print("  cd legal-service && python -m scripts.smoke_test_chinese_language")
    print("  cd chatbot && rm -rf .next && npm run dev")


if __name__ == "__main__":
    main()
