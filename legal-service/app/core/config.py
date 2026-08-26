from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
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
    lawyer_review_assertion_secret: str | None = Field(
        default=None, alias="LAWYER_REVIEW_ASSERTION_SECRET"
    )
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    enable_lawyer_review_trace: bool = Field(default=False, alias="ENABLE_LAWYER_REVIEW_TRACE")
    # Phase 7.1 is observational only.  It never feeds archived experiences
    # back into an answer, retrieval, or checker path.
    phase7_experience_archive_enabled: bool = Field(
        default=False, alias="PHASE7_EXPERIENCE_ARCHIVE_ENABLED"
    )
    # Phase 7.3A provisional control-plane safety limits. They govern only
    # current non-retired rules and are intentionally not quality claims.
    phase7_reasoning_bank_max_rules: int = Field(
        default=150, ge=1, alias="PHASE7_REASONING_BANK_MAX_RULES"
    )
    phase7_reasoning_bank_max_rules_per_type: int = Field(
        default=50, ge=1, alias="PHASE7_REASONING_BANK_MAX_RULES_PER_TYPE"
    )
    # Phase 7 real-bank retrieval is explicit and feature-gated.  The default
    # remains fail-neutral/off; active supplies bounded process guidance only
    # to the existing Default answer/research prompts and Luna runtime.
    phase7_reasoning_bank_runtime_mode: Literal["off", "shadow", "active"] = Field(
        default="off", alias="PHASE7_REASONING_BANK_RUNTIME_MODE"
    )

    # v2.1.1 Phase 1 contracts. ANSWER_ENGINE remains legacy/v1 until a later
    # separately approved rollout; the remaining values do not activate calls.
    answer_engine: str = Field(default="v1", alias="ANSWER_ENGINE")
    default_agent_model: str = Field(default="gpt-5.6-luna", alias="DEFAULT_AGENT_MODEL")
    # Phase 5.1A: make GPT-5.6 Luna reasoning effort explicit and configurable.
    # The approved current calibration baseline is "low". This remains a
    # configuration field, not a quality decision or a second configuration
    # system.
    default_agent_reasoning_effort: Literal["none", "low", "medium", "high"] = Field(
        default="low", alias="DEFAULT_AGENT_REASONING_EFFORT"
    )
    premium_agent_model: str = Field(default="gpt-5.6-sol", alias="PREMIUM_AGENT_MODEL")
    legal_fact_check_model: str = Field(
        default="gpt-5.6-luna", alias="LEGAL_FACT_CHECK_MODEL"
    )
    compact_checker_model: str = Field(
        default="gpt-5.6-luna", alias="COMPACT_CHECKER_MODEL"
    )
    compact_checker_reasoning_effort: Literal["none", "low", "medium", "high"] = Field(
        default="low", alias="COMPACT_CHECKER_REASONING_EFFORT"
    )
    compact_checker_min_start_budget_ms: int = Field(
        default=3000, ge=1, alias="COMPACT_CHECKER_MIN_START_BUDGET_MS"
    )
    compact_checker_post_reserve_ms: int = Field(
        default=1000, ge=0, alias="COMPACT_CHECKER_POST_RESERVE_MS"
    )
    agent_tool_choice: Literal["auto"] = Field(default="auto", alias="AGENT_TOOL_CHOICE")
    agent_max_tool_rounds: int = Field(default=2, ge=0, le=20, alias="AGENT_MAX_TOOL_ROUNDS")
    agent_max_provider_calls: int = Field(
        default=3, ge=1, le=20, alias="AGENT_MAX_PROVIDER_CALLS"
    )
    agent_max_retries: int = Field(default=1, ge=0, le=10, alias="AGENT_MAX_RETRIES")
    agent_max_flat_rag_calls: int = Field(
        default=1, ge=0, le=100, alias="AGENT_MAX_FLAT_RAG_CALLS"
    )
    agent_retry_viability_threshold_ms: int = Field(
        default=8000, ge=0, le=40000, alias="AGENT_RETRY_VIABILITY_THRESHOLD_MS"
    )
    default_turn_deadline_ms: int = Field(
        default=60000, ge=1, alias="DEFAULT_TURN_DEADLINE_MS"
    )
    premium_turn_deadline_ms: int = Field(
        default=45000, ge=1, alias="PREMIUM_TURN_DEADLINE_MS"
    )
    default_answer_research_target_ms: int = Field(
        default=32000, ge=1, alias="DEFAULT_ANSWER_RESEARCH_TARGET_MS"
    )
    premium_answer_research_target_ms: int = Field(
        default=37000, ge=1, alias="PREMIUM_ANSWER_RESEARCH_TARGET_MS"
    )
    legal_fact_check_target_ms: int = Field(
        default=8000, ge=1, alias="LEGAL_FACT_CHECK_TARGET_MS"
    )
    legal_evidence_postcondition_enabled: bool = Field(
        default=True, alias="LEGAL_EVIDENCE_POSTCONDITION_ENABLED"
    )
    compact_checker_enabled: bool = Field(
        default=False, alias="COMPACT_CHECKER_ENABLED"
    )
    web_search_enabled: bool = Field(default=False, alias="WEB_SEARCH_ENABLED")
    exact_legal_lookup_enabled: bool = Field(
        default=False, alias="EXACT_LEGAL_LOOKUP_ENABLED"
    )
    lightrag_enabled: bool = Field(default=False, alias="LIGHTRAG_ENABLED")
    lightrag_storage_profile: str | None = Field(
        default=None, alias="LIGHTRAG_STORAGE_PROFILE"
    )
    flat_rag_tool_enabled: bool = Field(default=False, alias="FLAT_RAG_TOOL_ENABLED")
    compact_matter_state_enabled: bool = Field(
        default=False, alias="COMPACT_MATTER_STATE_ENABLED"
    )
    backend_political_failsafe_enabled: bool = Field(
        default=True, alias="BACKEND_POLITICAL_FAILSAFE_ENABLED"
    )
    agent_shadow_enabled: bool = Field(default=False, alias="AGENT_SHADOW_ENABLED")
    agent_rollout_percent_default: int = Field(
        default=0, ge=0, le=100, alias="AGENT_ROLLOUT_PERCENT_DEFAULT"
    )
    agent_rollout_percent_premium: int = Field(
        default=0, ge=0, le=100, alias="AGENT_ROLLOUT_PERCENT_PREMIUM"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_agent_deadline_targets(self):
        if (
            self.default_answer_research_target_ms + self.legal_fact_check_target_ms
            > self.default_turn_deadline_ms
        ):
            raise ValueError("default answer/checker targets must fit inside the turn deadline")
        if (
            self.premium_answer_research_target_ms + self.legal_fact_check_target_ms
            > self.premium_turn_deadline_ms
        ):
            raise ValueError("premium answer/checker targets must fit inside the turn deadline")
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
