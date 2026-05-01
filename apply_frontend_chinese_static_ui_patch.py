#!/usr/bin/env python3
"""
Patch remaining hard-coded English frontend labels for Chinese-mode conversations.

Run from the root of the immigration_ai repo after the main Chinese language patch:

    python apply_frontend_chinese_static_ui_patch.py

The script is idempotent where possible and creates .bak_frontend_zh_ui backups.
"""
from __future__ import annotations

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent
BACKUP_SUFFIX = ".bak_frontend_zh_ui"


def p(rel: str) -> Path:
    return ROOT / rel


def read(rel: str) -> str:
    path = p(rel)
    if not path.exists():
        raise FileNotFoundError(f"Missing expected file: {rel}")
    return path.read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    path = p(rel)
    path.parent.mkdir(parents=True, exist_ok=True)
    backup = path.with_name(path.name + BACKUP_SUFFIX)
    if path.exists() and not backup.exists():
        shutil.copy2(path, backup)
    path.write_text(text, encoding="utf-8")
    print(f"patched {rel}")


def replace_once(text: str, old: str, new: str, rel: str) -> str:
    if old not in text:
        raise RuntimeError(f"Could not find expected block in {rel}:\n{old[:600]}")
    return text.replace(old, new, 1)


def insert_after(text: str, marker: str, addition: str, rel: str) -> str:
    if addition.strip() in text:
        return text
    if marker not in text:
        raise RuntimeError(f"Could not find insertion marker in {rel}:\n{marker[:600]}")
    return text.replace(marker, marker + addition, 1)


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


def patch_guided_intake_card() -> None:
    rel = "chatbot/components/guided-intake-card.tsx"
    text = read(rel)

    if "function isZhLanguage(" not in text:
        text = insert_after(
            text,
            'const SHOW_WIDGET_DEBUG = process.env.NEXT_PUBLIC_WIDGET_DEBUG === "true";\n',
            '\nfunction isZhLanguage(responseLanguage?: string | null) {\n  return (responseLanguage ?? "").toLowerCase().startsWith("zh");\n}\n',
            rel,
        )

    if "responseLanguage?: string | null;" not in text:
        text = replace_once(
            text,
            "  onBookConsultation?: () => void;\n  isSubmitting?: boolean;\n};\n",
            "  onBookConsultation?: () => void;\n  isSubmitting?: boolean;\n  responseLanguage?: string | null;\n};\n",
            rel,
        )

    if "  responseLanguage," not in text:
        text = replace_once(
            text,
            "  onBookConsultation,\n  isSubmitting,\n}: Props) {\n",
            "  onBookConsultation,\n  isSubmitting,\n  responseLanguage,\n}: Props) {\n",
            rel,
        )

    if "const zh = isZhLanguage(responseLanguage);" not in text:
        text = replace_once(
            text,
            "  if (!interactionPlan) return null;\n\n  const mode = interactionPlan.mode ?? \"guided_intake\";\n",
            "  if (!interactionPlan) return null;\n\n  const zh = isZhLanguage(responseLanguage);\n  const mode = interactionPlan.mode ?? \"guided_intake\";\n",
            rel,
        )

    text = text.replace(
        '{requestedFacts.length ? "One quick question" : "Ready for the next step"}',
        '{requestedFacts.length\n            ? zh ? "一个简单问题" : "One quick question"\n            : zh ? "可以继续下一步" : "Ready for the next step"}',
    )
    text = text.replace(
        '"This helps make the guidance more specific to your situation. You can also choose “Not sure” and continue."\n            : "I have enough basic information to continue the general analysis."',
        '(zh\n                ? "这可以帮助我根据你的情况给出更具体的说明。你也可以选择“不确定”后继续。"\n                : "This helps make the guidance more specific to your situation. You can also choose “Not sure” and continue.")\n            : (zh\n                ? "我已经有足够的基础信息，可以继续进行一般性分析。"\n                : "I have enough basic information to continue the general analysis.")',
    )
    text = text.replace(
        '{isSubmitting ? "Submitting..." : "Continue"}',
        '{isSubmitting ? (zh ? "正在提交..." : "Submitting...") : (zh ? "继续" : "Continue")}',
    )
    text = text.replace(
        "<AlertTitle>Important</AlertTitle>",
        "<AlertTitle>{zh ? \"重要提示\" : \"Important\"}</AlertTitle>",
    )
    text = text.replace(
        "<AlertTitle>Ready for analysis</AlertTitle>",
        "<AlertTitle>{zh ? \"可以继续分析\" : \"Ready for analysis\"}</AlertTitle>",
    )
    text = text.replace(
        "The backend has enough information to continue the legal analysis.",
        "{zh ? \"后端已经有足够信息，可以继续进行法律分析。\" : \"The backend has enough information to continue the legal analysis.\"}",
    )
    text = text.replace(
        "Fact slot details",
        "{zh ? \"事实字段详情\" : \"Fact slot details\"}",
    )

    if "responseLanguage={responseLanguage}" not in text:
        text = replace_once(
            text,
            "                showMeta={SHOW_WIDGET_DEBUG}\n              />\n",
            "                showMeta={SHOW_WIDGET_DEBUG}\n                responseLanguage={responseLanguage}\n              />\n",
            rel,
        )

    write(rel, text)


def patch_fact_input_field() -> None:
    rel = "chatbot/components/fact-input-field.tsx"
    text = read(rel)

    if "responseLanguage?: string | null;" not in text:
        text = replace_once(
            text,
            "  onChange: (key: string, value: string | number | boolean | null) => void;\n  showMeta?: boolean;\n};\n",
            "  onChange: (key: string, value: string | number | boolean | null) => void;\n  showMeta?: boolean;\n  responseLanguage?: string | null;\n};\n",
            rel,
        )

    if "function isZhLanguage(" not in text:
        text = insert_after(
            text,
            "type Props = {\n",
            "",
            rel,
        )
        helper = '''\nfunction isZhLanguage(responseLanguage?: string | null) {\n  return (responseLanguage ?? "").toLowerCase().startsWith("zh");\n}\n\nfunction optionDisplayLabel(option: string, zh: boolean) {\n  if (!zh) return option.replaceAll("_", " ");\n  const map: Record<string, string> = {\n    yes: "是",\n    no: "否",\n    not_sure: "不确定",\n    in_australia: "在澳大利亚境内",\n    outside_australia: "在澳大利亚境外",\n    leave_and_return: "离开后再返回澳大利亚",\n    general_question: "一般性询问",\n  };\n  return map[option] ?? option.replaceAll("_", " ");\n}\n'''
        text = insert_after(
            text,
            "};\n\n",
            helper,
            rel,
        )

    if "responseLanguage = null" not in text:
        text = replace_once(
            text,
            "export function FactInputField({ fact, value, onChange, showMeta = false }: Props) {\n",
            "export function FactInputField({ fact, value, onChange, showMeta = false, responseLanguage = null }: Props) {\n",
            rel,
        )

    if "const zh = isZhLanguage(responseLanguage);" not in text:
        text = replace_once(
            text,
            "  const inputType = fact.input_type ?? \"short_text\";\n",
            "  const zh = isZhLanguage(responseLanguage);\n  const inputType = fact.input_type ?? \"short_text\";\n",
            rel,
        )

    text = text.replace('{fact.required ? <Badge variant="secondary">Required</Badge> : null}', '{fact.required ? <Badge variant="secondary">{zh ? "必填" : "Required"}</Badge> : null}')
    text = text.replace('{fact.blocking ? <Badge variant="destructive">Blocking</Badge> : null}', '{fact.blocking ? <Badge variant="destructive">{zh ? "关键" : "Blocking"}</Badge> : null}')
    text = text.replace('{ label: "Yes", raw: true, keyValue: "yes" },', '{ label: zh ? "是" : "Yes", raw: true, keyValue: "yes" },')
    text = text.replace('{ label: "No", raw: false, keyValue: "no" },', '{ label: zh ? "否" : "No", raw: false, keyValue: "no" },')
    text = text.replace('{ label: "Not sure", raw: "not_sure", keyValue: "not_sure" },', '{ label: zh ? "不确定" : "Not sure", raw: "not_sure", keyValue: "not_sure" },')
    text = text.replace('<SelectValue placeholder="Select an option" />', '<SelectValue placeholder={zh ? "请选择一个选项" : "Select an option"} />')
    text = text.replace('{option.replaceAll("_", " ")}', '{optionDisplayLabel(option, zh)}')
    text = text.replace('"Describe or paste document details"', 'zh ? "描述或粘贴文件内容" : "Describe or paste document details"')
    text = text.replace('"Enter a short answer"', 'zh ? "请输入简短回答" : "Enter a short answer"')
    text = text.replace('placeholder="Enter details"', 'placeholder={zh ? "请输入详细信息" : "Enter details"}')
    text = text.replace('>\n            Not sure\n          </button>', '>\n            {zh ? "不确定" : "Not sure"}\n          </button>')
    text = text.replace('>\n            Skip for now\n          </button>', '>\n            {zh ? "暂时跳过" : "Skip for now"}\n          </button>')
    text = text.replace('Why this matters: {fact.why_needed}', '{zh ? "为什么需要这个信息：" : "Why this matters: "}{fact.why_needed}')

    write(rel, text)


def patch_immigration_widget() -> None:
    rel = "chatbot/components/immigration-assistant-widget.tsx"
    text = read(rel)

    if "function isZhLanguage(" not in text:
        text = insert_after(
            text,
            "function compactSourcesForMessage(message: Extract<WidgetMessage, { role: \"assistant\" }>) {\n",
            "",
            rel,
        )
        helper = '''\nfunction isZhLanguage(responseLanguage?: string | null) {\n  return (responseLanguage ?? "").toLowerCase().startsWith("zh");\n}\n\n'''
        text = insert_after(
            text,
            "}\n\nexport function ImmigrationAssistantWidget() {\n",
            helper,
            rel,
        )

    if "responseLanguage: data.responseLanguage ?? null" not in text:
        text = replace_once(
            text,
            "      isStreaming: true,\n",
            "      isStreaming: true,\n      responseLanguage: data.responseLanguage ?? null,\n",
            rel,
        )

    if "const messageZh = isAssistant && isZhLanguage(message.responseLanguage);" not in text:
        text = replace_once(
            text,
            "                    const assistantReady = isAssistant && !message.isStreaming;\n",
            "                    const assistantReady = isAssistant && !message.isStreaming;\n                    const messageZh = isAssistant && isZhLanguage(message.responseLanguage);\n",
            rel,
        )

    if "responseLanguage={message.responseLanguage ?? null}" not in text:
        text = replace_once(
            text,
            "                              isSubmitting={status !== \"ready\"}\n                            />\n",
            "                              isSubmitting={status !== \"ready\"}\n                              responseLanguage={message.responseLanguage ?? null}\n                            />\n",
            rel,
        )

    text = text.replace("Follow-up questions", '{messageZh ? "后续问题" : "Follow-up questions"}')
    text = text.replace("Sources", '{messageZh ? "参考来源" : "Sources"}')
    text = text.replace("A consultation with a lawyer is recommended.", '{messageZh ? "建议预约律师咨询。" : "A consultation with a lawyer is recommended."}')
    text = text.replace("This issue may depend on facts, dates, or documents that need review.", '{messageZh ? "这个问题可能取决于具体事实、日期或文件，需要进一步审查。" : "This issue may depend on facts, dates, or documents that need review."}')
    text = text.replace("Open source", '{messageZh ? "打开来源" : "Open source"}')

    write(rel, text)


def patch_widget_route() -> None:
    # Make sure responseLanguage survives the route, in case the previous patch was only partly applied.
    rel = "chatbot/app/api/widget-chat/route.ts"
    text = read(rel)

    if "response_language?: string | null;" not in text:
        text = replace_once(
            text,
            "type LegalServiceResponse = {\n  answer?: string;\n",
            "type LegalServiceResponse = {\n  answer?: string;\n  response_language?: string | null;\n",
            rel,
        )

    if "responseLanguage: data.response_language" not in text:
        text = replace_once(
            text,
            "      text: fallbackText(data),\n",
            "      text: fallbackText(data),\n      responseLanguage: data.response_language ?? null,\n",
            rel,
        )

    write(rel, text)


def main() -> None:
    patch_guided_intake_types()
    patch_guided_intake_card()
    patch_fact_input_field()
    patch_immigration_widget()
    patch_widget_route()
    print("\nFrontend Chinese static UI patch applied.")
    print("Next steps:")
    print("  cd chatbot")
    print("  rm -rf .next")
    print("  npm run dev")


if __name__ == "__main__":
    main()
