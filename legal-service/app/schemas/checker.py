from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictCheckerContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class CheckerDecision(StrictCheckerContract):
    claim_id: str = Field(min_length=1, max_length=100)
    decision: Literal["keep", "drop"]
    reason_code: str = Field(min_length=1, max_length=100)
    qualification: str | None = Field(default=None, max_length=8000)
    original_claim_sha256: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def validate_qualification(self):
        if self.qualification is not None and self.decision != "keep":
            raise ValueError("only kept claims may carry a qualification")
        if self.qualification is not None and self.original_claim_sha256 is None:
            raise ValueError("qualification requires original_claim_sha256")
        return self


class CompactCheckerResult(StrictCheckerContract):
    schema_version: Literal["compact_checker.result.v1"]
    decisions: list[CheckerDecision] = Field(min_length=1, max_length=100)
    escalate: bool = False
