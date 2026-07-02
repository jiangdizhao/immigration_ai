from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.base import Base
from app.db import models  # noqa: F401
from app.db.session import engine, ensure_vector_extension
from app.schedule.schedule_index_health import validate_schedule_index_ready
# Unified context + tiered discovery must be the final QueryService controller.
# The legacy proposal_first_runtime_patch is intentionally NOT imported here,
# because it also monkey-patches QueryService.handle_query and otherwise
# intercepts broad immigration questions before the tier router can run.
from app.services import unified_context_runtime_patch  # noqa: F401

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging()
    validate_schedule_index_ready()
    if settings.auto_create_schema:
        ensure_vector_extension()
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": f"{settings.api_v1_prefix}/health",
    }
