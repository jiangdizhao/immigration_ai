#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

root = Path(__file__).resolve().parents[1]
renderer = root / "components" / "assistant-rich-markdown.tsx"
workspace = root / "components" / "immigration-ai-workspace.tsx"
widget = root / "components" / "immigration-assistant-widget.tsx"

missing = [str(path.relative_to(root)) for path in (renderer, workspace, widget) if not path.exists()]
assert not missing, f"Missing expected frontend files: {missing}"

renderer_text = renderer.read_text(encoding="utf-8")
workspace_text = workspace.read_text(encoding="utf-8")
widget_text = widget.read_text(encoding="utf-8")

# The shared renderer must have real markdown-table support, not just line-by-line text display.
for marker in (
    "function isMarkdownTableStart",
    "function splitMarkdownTableRow",
    "function MarkdownTable",
    "<table",
    "overflow-x-auto",
):
    assert marker in renderer_text, f"assistant-rich-markdown.tsx is missing marker: {marker}"

# Both public chat surfaces should use the shared rich renderer.
assert "AssistantRichMarkdown" in workspace_text, "workspace does not import/use AssistantRichMarkdown"
assert "AssistantRichMarkdown" in widget_text, "floating widget does not import/use AssistantRichMarkdown"
assert "<AssistantRichMarkdown text={message.text} />" in workspace_text, "workspace is not rendering assistant messages through AssistantRichMarkdown"
assert "<AssistantRichMarkdown text={message.text} />" in widget_text, "widget is not rendering assistant messages through AssistantRichMarkdown"

# The old workspace renderer printed assistant messages as raw pre-wrapped text.
old_workspace_plain_render = "<div className=\"whitespace-pre-wrap\">\n                            {message.text}\n                          </div>"
assert old_workspace_plain_render not in workspace_text, "old raw workspace text renderer is still present"

print("OK: rich markdown renderer is installed for workspace and widget")
