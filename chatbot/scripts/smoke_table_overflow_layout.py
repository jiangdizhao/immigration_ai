#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
renderer = (ROOT / "components" / "assistant-rich-markdown.tsx").read_text(encoding="utf-8")
workspace = (ROOT / "components" / "immigration-ai-workspace.tsx").read_text(encoding="utf-8")
widget = (ROOT / "components" / "immigration-assistant-widget.tsx").read_text(encoding="utf-8")
route = (ROOT / "app" / "api" / "widget-chat" / "route.ts").read_text(encoding="utf-8")

assert "overflow-x-auto" in renderer, "table wrapper must support horizontal scroll"
assert "overscroll-x-contain" in renderer, "table wrapper must isolate horizontal overscroll"
assert "min-w-[720px]" in renderer or "w-max" in renderer, "table must keep enough width for complex columns"
assert "min-w-0" in renderer, "markdown root must shrink inside flex/grid layouts"
assert "min-w-0" in workspace, "workspace must contain wide tables correctly"
assert "overflow-hidden" in workspace, "assistant bubble should clip to the table scroll container"
assert "AssistantRichMarkdown" in workspace, "workspace must use rich markdown renderer"
assert "AssistantRichMarkdown" in widget, "floating widget must use rich markdown renderer"
assert "pfvdStageTiming" in route, "widget route should surface PFVD timing debug"
print("smoke_table_overflow_layout: ok")
