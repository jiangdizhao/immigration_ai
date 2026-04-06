from datetime import datetime

from pydantic import BaseModel, ConfigDict


class APIMessage(BaseModel):
    code: str
    detail: str


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    timestamp: datetime


class BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
