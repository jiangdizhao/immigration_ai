from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_db_session


DBSession = Annotated[Session, Depends(get_db_session)]
AppSettings = Annotated[Settings, Depends(get_settings)]


def verify_api_key(
    settings: AppSettings,
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> None:
    expected = settings.legal_service_api_key
    if not expected:
        return
    if x_api_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid X-API-Key",
        )
