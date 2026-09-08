"""Content-free HTTP correlation, including requests rejected before validation."""
import logging
import time
from uuid import UUID, uuid4

from starlette.datastructures import Headers, MutableHeaders

logger = logging.getLogger(__name__)


class QueryCorrelationMiddleware:
    def __init__(self, app, *, path: str):
        self.app = app
        self.path = path

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['path'] != self.path or scope['method'] != 'POST':
            return await self.app(scope, receive, send)
        try:
            request_id = str(UUID(Headers(scope=scope).get('x-request-id', '')))
        except (ValueError, AttributeError):
            request_id = str(uuid4())
        scope.setdefault('state', {})['query_request_id'] = request_id
        started = time.perf_counter()
        status = 500
        logger.info('legal_query_received request_id=%s', request_id)

        async def correlated_send(message):
            nonlocal status
            if message['type'] == 'http.response.start':
                status = message['status']
                MutableHeaders(scope=message)['x-request-id'] = request_id
            await send(message)

        try:
            await self.app(scope, receive, correlated_send)
        finally:
            logger.info(
                'legal_query_finished request_id=%s http_status=%s elapsed_ms=%s',
                request_id, status, round((time.perf_counter() - started) * 1000),
            )
