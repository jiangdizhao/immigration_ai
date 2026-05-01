# Chinese Response-Language Patch

This package adds Chinese-aware response behavior to the Immigration AI project.

## What it adds

Backend:
- `legal-service/app/services/language_service.py`
  - detects Chinese input
  - converts Chinese user turns into internal English canonical questions
  - localizes final user-facing responses, guided-intake fact labels, prompts, and fallback text
- `QueryRequest.response_language`
- `QueryResponse.response_language`
- `QueryService` language orchestration
- `ReasoningService` final-answer language instruction so normal RAG answers are drafted directly in Simplified Chinese

Frontend:
- `chatbot/app/api/widget-chat/route.ts` detects Chinese and forwards `response_language` to FastAPI
- `chatbot/components/guided-intake-types.ts` adds `responseLanguage`
- `chatbot/components/immigration-assistant-widget.tsx` stores the returned response language and uses a Chinese fallback string when needed

## How to apply

From the repository root:

```bash
unzip immigration_ai_chinese_language_patch.zip -d .
python apply_chinese_language_patch.py
```

Then restart both services:

```bash
cd legal-service
python -m scripts.smoke_test_chinese_language
uvicorn app.main:app --reload

cd ../chatbot
rm -rf .next
npm run dev
```

## What to test

Backend Swagger / widget:

```text
你好
我的学生签证被拒了，我下一步怎么办？
我还能申请复审吗？
什么是8501签证条件？
Can I leave Australia and come back if I only hold a bridging visa?
```

Expected behavior:
- Chinese input returns Chinese user-facing answers.
- The backend still uses English internal operation types and fact keys.
- English input continues to behave as before.
- Chinese refusal/review questions are internally canonicalized to English before routing/retrieval.
- The answer is normally generated directly in Chinese, not translated after an English answer.

## Notes

This patch intentionally keeps legal reasoning backend-owned. The frontend only detects/passes the language and displays the backend result.
