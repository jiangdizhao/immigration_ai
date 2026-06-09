from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="Immigration Legal Service", alias="APP_NAME")
    app_env: str = Field(default="development", alias="APP_ENV")
    app_host: str = Field(default="0.0.0.0", alias="APP_HOST")
    app_port: int = Field(default=8001, alias="APP_PORT")
    app_version: str = Field(default="0.1.0", alias="APP_VERSION")
    api_v1_prefix: str = Field(default="/api/v1", alias="API_V1_PREFIX")

    database_url: str = Field(alias="DATABASE_URL")
    auto_create_schema: bool = Field(default=True, alias="AUTO_CREATE_SCHEMA")
    #embedding_dimension: int = Field(default=1536, alias="EMBEDDING_DIMENSION")
    embedding_model: str = Field(default="text-embedding-3-small", alias="EMBEDDING_MODEL")
    embedding_dimension: int = Field(default=1536, alias="EMBEDDING_DIMENSION")
    embedding_distance: str = Field(default="cosine", alias="EMBEDDING_DISTANCE")
    embedding_batch_size: int = Field(default=64, alias="EMBEDDING_BATCH_SIZE")
    default_top_k: int = Field(default=5, alias="DEFAULT_TOP_K")
    canonical_jurisdiction: str = Field(default="Cth", alias="CANONICAL_JURISDICTION")

    allowed_origins: str = Field(default="http://localhost:3000", alias="ALLOWED_ORIGINS")
    legal_service_api_key: str | None = Field(default=None, alias="LEGAL_SERVICE_API_KEY")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
