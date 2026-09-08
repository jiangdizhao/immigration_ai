"""Offline request-boundary regressions: no DB, provider, or canonical corpus."""
import asyncio
import logging
import threading
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import FastAPI, Request
from pydantic import ValidationError

from app.core.query_correlation import QueryCorrelationMiddleware
from app.schemas.query import QueryRequest


@pytest.mark.parametrize('question', ['hi', '你好', '好', '1', 'no', '第二个', 'yes', 'What are my options?', '  hi  ', 'x' * 4000])
def test_nonempty_questions_are_accepted_without_rewriting(question):
    assert QueryRequest(question=question).question == question


@pytest.mark.parametrize('question', ['', ' ', '\t\n', '\u3000', 'x' * 4001])
def test_blank_and_oversized_questions_are_rejected(question):
    with pytest.raises(ValidationError):
        QueryRequest(question=question)


def _app(handler):
    app = FastAPI()
    app.add_api_route('/api/v1/query', handler, methods=['POST'])
    app.add_middleware(QueryCorrelationMiddleware, path='/api/v1/query')
    return app


def test_http_validation_and_correlation_do_not_log_content(caplog):
    seen = []

    def handler(payload: QueryRequest, request: Request):
        seen.append(payload.question)
        return {'request_id': request.state.query_request_id}

    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=_app(handler)), base_url='http://test') as client:
            for text in ['hi', '你好']:
                request_id = str(uuid4())
                response = await client.post('/api/v1/query', json={'question': text}, headers={'X-Request-ID': request_id})
                assert response.status_code == 200
                assert response.headers['x-request-id'] == request_id == response.json()['request_id']
            response = await client.post('/api/v1/query', json={'question': ''}, headers={'X-Request-ID': 'private-invalid-header'})
            assert response.status_code == 422
            UUID(response.headers['x-request-id'])

    with caplog.at_level(logging.INFO):
        asyncio.run(run())
    assert seen == ['hi', '你好']
    assert 'private-invalid-header' not in caplog.text
    assert '你好' not in caplog.text
    assert 'http_status=422' in caplog.text


def test_sync_request_worker_does_not_serialize_greetings():
    entered = threading.Event()
    release = threading.Event()

    def handler(payload: QueryRequest):
        if payload.question == 'slow fixture':
            entered.set()
            assert release.wait(5)
        return {'answer': payload.question}

    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=_app(handler)), base_url='http://test') as client:
            slow = asyncio.create_task(client.post('/api/v1/query', json={'question': 'slow fixture'}))
            try:
                assert await asyncio.to_thread(entered.wait, 2)
                responses = await asyncio.wait_for(asyncio.gather(*[
                    client.post('/api/v1/query', json={'question': text}) for text in ['hi', '你好']
                ]), timeout=2)
                assert [r.status_code for r in responses] == [200, 200]
                assert not slow.done()
            finally:
                release.set()
                assert (await slow).status_code == 200

    asyncio.run(run())


@pytest.mark.parametrize('question', ['hi', '你好', '1', 'no'])
def test_short_general_turn_uses_one_provider_and_no_research_or_checker(monkeypatch, question):
    from datetime import date
    from app.core.config import Settings
    from app.schemas.agent import AgentRuntimeRequest, ExecutionBudget
    from app.services.agent_runtime_service import AgentRuntimeService, ProviderResponse
    from app.services.agent_observability_service import AbsoluteTurnDeadline
    from app.services.request_evidence_registry import create_registry
    from app.services.tool_executor_service import ToolCallRequest
    import time

    calls = []
    settings = Settings(DATABASE_URL='postgresql://test', OPENAI_API_KEY='test', COMPACT_CHECKER_ENABLED=True)
    monkeypatch.setattr('app.services.agent_runtime_service.get_settings', lambda: settings)
    monkeypatch.setattr('app.services.agent_policy_service.get_settings', lambda: settings)

    class Provider:
        async def call(self, **kwargs):
            calls.append(kwargs)
            return ProviderResponse(
                response_id='fake-provider-response', model='fake', status='ok',
                tool_calls=[ToolCallRequest(call_id='submit', name='submit_answer', arguments={
                    'schema_version': 'agent_submission.v2', 'answer_class': 'general',
                    'draft_markdown': 'Hello.', 'claims': [], 'citations': [],
                    'research_status': 'not_required', 'state_patch': [],
                })],
            )

    payload = QueryRequest(question=question)
    request = AgentRuntimeRequest(
        request_id='short-turn', turn_id='turn', mode='default', user_text=payload.question,
        response_language='en', as_of_date=date(2026, 9, 8), matter_state={},
        execution_budget=ExecutionBudget(
            turn_deadline_ms=60000,
            answer_research_target_ms=40000,
            checker_target_ms=8000,
        ),
        experiment_arm='N',
    )
    result = asyncio.run(AgentRuntimeService(provider=Provider()).run(
        request, deadline=AbsoluteTurnDeadline(time.perf_counter(), 60000), registry=create_registry('short-turn'),
    ))
    assert len(calls) == 1
    assert result.submission.draft_markdown == 'Hello.'
    assert result.submission.research_status == 'not_required'
    assert result.checker_provider_call_count == 0
    # Only the accepted submit_answer execution is recorded; no research tool
    # (native web, Flat-RAG, Schedule-2 navigation, exact lookup) may run.
    assert [output.tool_call_id for output in result.tool_outputs] == ['submit']
