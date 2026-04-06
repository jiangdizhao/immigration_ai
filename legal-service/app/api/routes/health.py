from datetime import datetime, timezone

from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.common import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def healthcheck() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        timestamp=datetime.now(timezone.utc),
    )
