from fastapi import APIRouter

from app.api.routes import escalate, health, intake, matters, query, sources

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(intake.router, prefix="/intake", tags=["intake"])
api_router.include_router(query.router, prefix="/query", tags=["query"])
api_router.include_router(escalate.router, prefix="/escalate", tags=["escalation"])
api_router.include_router(sources.router, prefix="/sources", tags=["sources"])
api_router.include_router(matters.router, prefix="/matters", tags=["matters"])
