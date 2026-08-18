"""Phase 5 — Search privacy guard.

Deterministic PII protection for outbound web-search queries.

Before an outbound web-search query can execute, this guard:
- Detects prohibited client-specific fields (name, DOB, passport, TRN, etc.)
- Blocks/sanitizes queries containing PII
- Never calls an LLM
- Never logs prohibited raw search text

Target: outbound web_search_pii_violation_count = 0
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Pattern


# ---------------------------------------------------------------------------
# Prohibited patterns — deterministic, not semantic
# ---------------------------------------------------------------------------

# Australian passport number: one letter followed by 7-8 digits
_PASSPORT_PATTERN: Pattern[str] = re.compile(
    r"\b[ABCEFGHJKLMNPRSTVWXYZ]\d{7,8}\b"
)

# Australian TRN (Transaction Reference Number): EGO + alphanumeric
_TRN_PATTERN: Pattern[str] = re.compile(
    r"\bEGO[A-Z0-9]{6,12}\b", re.IGNORECASE
)

# Application ID patterns: various formats
_APPLICATION_ID_PATTERN: Pattern[str] = re.compile(
    r"\b(?:application\s*(?:id|number|ref|reference)?\s*[:#]?\s*)?[A-Z]{3,4}\d{6,12}\b",
    re.IGNORECASE,
)

# Email address
_EMAIL_PATTERN: Pattern[str] = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
)

# Phone number (Australian and international)
_PHONE_PATTERN: Pattern[str] = re.compile(
    r"\b(?:\+?61\s*[2-478](?:\s*\d){7,8}|\+?\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4}|0\s*[2-478]\s*\d{4}\s*\d{4})\b"
)

# Date of birth patterns (various formats)
_DOB_PATTERN: Pattern[str] = re.compile(
    r"\b(?:DOB|date\s*of\s*birth|born)\s*[:=]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
    re.IGNORECASE,
)

# Residential address patterns (Australian postcodes)
_ADDRESS_PATTERN: Pattern[str] = re.compile(
    r"\b\d{1,5}\s+\w+(?:\s+\w+){1,4}\s+(?:street|st|road|rd|avenue|ave|drive|dr|court|ct|place|pl|lane|ln|parade|pde|crescent|cres|highway|hwy)\b",
    re.IGNORECASE,
)

# Australian postcode in isolation
_POSTCODE_PATTERN: Pattern[str] = re.compile(
    r"\b(?:postcode|post\s*code)\s*[:=]?\s*\d{4}\b",
    re.IGNORECASE,
)

# Full name patterns (two or more capitalized words that look like a person name)
# This is conservative — only matches when combined with other indicators
_NAME_INDICATOR_PATTERN: Pattern[str] = re.compile(
    r"\b(?:name|client|applicant|person|individual)\s*(?:is|:|=)\s*['\"]?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})['\"]?\b",
    re.IGNORECASE,
)

# Unique customer identifier patterns
_CUSTOMER_ID_PATTERN: Pattern[str] = re.compile(
    r"\b(?:customer|client|user|matter)\s*(?:id|number|ref|reference)?\s*[:#]?\s*[A-Z0-9]{6,32}\b",
    re.IGNORECASE,
)

# All prohibited patterns in priority order
_PROHIBITED_PATTERNS: list[tuple[str, Pattern[str], str]] = [
    ("email", _EMAIL_PATTERN, "email address detected"),
    ("passport", _PASSPORT_PATTERN, "passport number detected"),
    ("trn", _TRN_PATTERN, "TRN/application reference detected"),
    ("phone", _PHONE_PATTERN, "phone number detected"),
    ("dob", _DOB_PATTERN, "date of birth detected"),
    ("address", _ADDRESS_PATTERN, "residential address detected"),
    ("postcode", _POSTCODE_PATTERN, "postcode detected"),
    ("customer_id", _CUSTOMER_ID_PATTERN, "customer identifier detected"),
    ("name_indicator", _NAME_INDICATOR_PATTERN, "client name indicator detected"),
    ("application_id", _APPLICATION_ID_PATTERN, "application ID detected"),
]


@dataclass(slots=True)
class PrivacyCheckResult:
    """Result of a privacy check on a search query."""

    allowed: bool
    violations: list[str] = field(default_factory=list)
    sanitized_query: str | None = None


class SearchPrivacyGuard:
    """Deterministic PII protection for outbound web-search queries.

    Usage:
        guard = SearchPrivacyGuard()
        result = guard.check_query("What is the visa processing time?")
        if result.allowed:
            # safe to execute search
            ...
        else:
            # block and record violation
            ...
    """

    def check_query(self, query: str) -> PrivacyCheckResult:
        """Check a search query for prohibited PII.

        Returns PrivacyCheckResult with allowed=False if any PII is detected.
        """
        if not query or not query.strip():
            return PrivacyCheckResult(allowed=False, violations=["empty query"])

        violations: list[str] = []

        for category, pattern, description in _PROHIBITED_PATTERNS:
            if pattern.search(query):
                violations.append(f"{description} ({category})")

        if violations:
            return PrivacyCheckResult(
                allowed=False,
                violations=violations,
            )

        return PrivacyCheckResult(allowed=True)

    def sanitize_query(self, query: str) -> PrivacyCheckResult:
        """Attempt to sanitize a query by redacting PII.

        If sanitization is possible, returns allowed=True with sanitized_query.
        If PII cannot be safely removed, returns allowed=False.
        """
        if not query or not query.strip():
            return PrivacyCheckResult(allowed=False, violations=["empty query"])

        sanitized = query
        violations: list[str] = []

        for category, pattern, description in _PROHIBITED_PATTERNS:
            match = pattern.search(sanitized)
            if match:
                # For email, passport, TRN, phone, application_id, customer_id:
                # redact the entire match
                if category in {
                    "email", "passport", "trn", "phone",
                    "application_id", "customer_id",
                }:
                    sanitized = pattern.sub("[REDACTED]", sanitized)
                    violations.append(f"{description} — redacted ({category})")
                elif category == "dob":
                    sanitized = pattern.sub("[DATE REDACTED]", sanitized)
                    violations.append(f"{description} — redacted ({category})")
                elif category == "address":
                    sanitized = pattern.sub("[ADDRESS REDACTED]", sanitized)
                    violations.append(f"{description} — redacted ({category})")
                elif category == "postcode":
                    sanitized = pattern.sub("[POSTCODE REDACTED]", sanitized)
                    violations.append(f"{description} — redacted ({category})")
                elif category == "name_indicator":
                    # Name indicators are too risky — block entirely
                    return PrivacyCheckResult(
                        allowed=False,
                        violations=[f"{description} — cannot safely redact ({category})"],
                    )

        # Verify sanitization was effective
        for category, pattern, _description in _PROHIBITED_PATTERNS:
            if pattern.search(sanitized):
                return PrivacyCheckResult(
                    allowed=False,
                    violations=violations + [
                        f"sanitization incomplete — residual PII detected ({category})"
                    ],
                )

        return PrivacyCheckResult(
            allowed=True,
            violations=violations,
            sanitized_query=sanitized,
        )

    def check_queries(self, queries: list[str]) -> list[PrivacyCheckResult]:
        """Check multiple search queries for PII."""
        return [self.check_query(q) for q in queries]


def create_search_privacy_guard() -> SearchPrivacyGuard:
    """Create a new search privacy guard instance."""
    return SearchPrivacyGuard()