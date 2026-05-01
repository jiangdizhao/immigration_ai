# Frontend Chinese Static UI Patch

This patch fixes remaining hard-coded English widget labels after the main Chinese language patch.

It targets labels like:

- `One quick question`
- `This helps make the guidance more specific...`
- `Continue`
- `Sources`
- `Follow-up questions`
- `Yes / No / Not sure`
- `Skip for now`
- form placeholders

## Apply

From the root of the `immigration_ai` repository:

```bash
python apply_frontend_chinese_static_ui_patch.py
```

The script creates backups with suffix:

```text
.bak_frontend_zh_ui
```

Then restart the frontend:

```bash
cd chatbot
rm -rf .next
npm run dev
```

## Expected browser behavior

For a Chinese conversation, the guided-intake card should show:

```text
一个简单问题
这可以帮助我根据你的情况给出更具体的说明。你也可以选择“不确定”后继续。
继续
参考来源
```

For an English conversation, the original English UI should remain.
