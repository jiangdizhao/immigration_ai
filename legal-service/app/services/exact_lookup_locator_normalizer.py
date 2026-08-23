"""Generic normalization for model/navigation exact-lookup locators.

This module performs syntax-level locator canonicalization only.  It does not
choose a legal rule, assess materiality, or create evidence.  The existing
``ExactLegalSourceService`` remains responsible for coverage and local source
resolution.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Mapping

from app.schemas.tools import ExactLegalLookupBatchItem, ExactLegalLookupRequest


_SCHEDULE_LOCATOR_RE = re.compile(
    r"^\s*(?:the\s+)?schedule\s+(?P<schedule>[0-9]+[A-Z]?)\s+"
    r"(?:(?:criterion|criteria|provision|clause)\s+)?"
    r"(?P<provision>[0-9]{1,5}[A-Z]?(?:\.[0-9A-Z]+)*)\s*$",
    re.IGNORECASE,
)
_REGULATION_RE = re.compile(
    r"^\s*(?:the\s+)?(?:sub)?regulation\s+"
    r"(?P<provision>[0-9]{1,2}\.[0-9]{1,3}[A-Z]{0,3}(?:\([0-9A-Z]+\))?)\s*$",
    re.IGNORECASE,
)
_PIC_RE = re.compile(
    r"^\s*(?:PIC|public\s+interest\s+criteria?)\s+(?P<provision>[0-9]{4}[A-Z]?)\s*$",
    re.IGNORECASE,
)
_CONDITION_RE = re.compile(
    r"^\s*(?:visa\s+)?condition\s+(?P<provision>[0-9]{4}[A-Z]?)\s*$",
    re.IGNORECASE,
)
_ACT_SECTION_RE = re.compile(
    r"^\s*(?:(?:section|s\.?)\s+)?(?P<prefix>section|s\.?)\s*"
    r"(?P<provision>[0-9]{1,4}[A-Z]{0,2}(?:\([0-9A-Z]+\))?)"
    r"(?:\s+of\s+(?:the\s+)?migration\s+act(?:\s+1958)?)?\s*$",
    re.IGNORECASE,
)
_PROVISION_ONLY_RE = re.compile(
    r"^\s*[0-9]{1,5}[A-Z]?(?:\.[0-9A-Z]+)*(?:\([0-9A-Z]+\))?\s*$",
    re.IGNORECASE,
)
_SCHEDULE_TARGET_RE = re.compile(r"\bschedule\s+(?P<schedule>[0-9]+[A-Z]?)\b", re.IGNORECASE)


@dataclass(slots=True, frozen=True)
class NormalizedExactLookup:
    request: ExactLegalLookupRequest
    trace: dict[str, Any]


def _clean(value: Any, *, limit: int = 500) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text[:limit] or None


def _slug(value: str | None) -> str | None:
    cleaned = _clean(value, limit=100)
    if not cleaned:
        return None
    return re.sub(r"[^a-z0-9]+", "_", cleaned.casefold()).strip("_")


def _canonical_locator_type(locator_type: str | None, *, schedule: str | None, node_type: str | None) -> str | None:
    slug = _slug(locator_type)
    if slug in {
        "schedule3_criterion", "schedule3_criteria", "schedule_3_criterion",
        "schedule_3_criteria", "criterion", "criteria",
    }:
        return "schedule3_criterion"
    if slug in {"schedule2_provision", "schedule_2_provision"}:
        return "schedule2_provision"
    if slug in {"schedule4_pic", "schedule_4_pic", "pic", "public_interest_criterion"}:
        return "schedule4_pic"
    if slug in {"schedule8_condition", "schedule_8_condition", "condition", "visa_condition"}:
        return "schedule8_condition"
    if slug in {"regulation", "subregulation"}:
        return slug
    if slug in {"act_section", "section", "subsection"}:
        return "act_section"
    if (
        slug in {"provision", "clause"}
        or (slug is None and _slug(node_type) == "provision")
    ) and (schedule or _slug(node_type) == "provision"):
        return "schedule2_provision" if str(schedule or "2").upper() == "2" else "provision"
    return slug


def _parse_locator_text(text: str | None) -> tuple[str | None, str | None, str | None]:
    """Return (locator_type, schedule, provision) for pure locator syntax."""
    cleaned = _clean(text, limit=2000)
    if not cleaned:
        return None, None, None

    match = _SCHEDULE_LOCATOR_RE.match(cleaned)
    if match:
        schedule = match.group("schedule").upper()
        return (
            "schedule3_criterion" if schedule == "3" else "schedule2_provision" if schedule == "2" else "provision",
            schedule,
            match.group("provision").upper(),
        )
    match = _REGULATION_RE.match(cleaned)
    if match:
        return "regulation", None, match.group("provision").upper()
    match = _PIC_RE.match(cleaned)
    if match:
        return "schedule4_pic", "4", match.group("provision").upper()
    match = _CONDITION_RE.match(cleaned)
    if match:
        return "schedule8_condition", "8", match.group("provision").upper()
    match = _ACT_SECTION_RE.match(cleaned)
    if match:
        return "act_section", None, match.group("provision").upper()
    if _PROVISION_ONLY_RE.match(cleaned):
        return None, None, cleaned.upper()
    return None, None, None


def _target_document_fields(target_document: str | None) -> tuple[str | None, str | None]:
    cleaned = _clean(target_document)
    if not cleaned:
        return None, None
    schedule = _SCHEDULE_TARGET_RE.search(cleaned)
    if schedule:
        return schedule.group("schedule").upper(), None
    lower = cleaned.casefold()
    if "migration act" in lower:
        return None, "Migration Act 1958"
    if "migration regulation" in lower or lower == "regulations":
        return None, "Migration Regulations 1994"
    return None, cleaned


def normalize_exact_lookup_request(
    item: ExactLegalLookupBatchItem | Mapping[str, Any],
    *,
    as_of_date,
) -> NormalizedExactLookup:
    """Normalize one model/navigation item into the existing exact request.

    Unknown free-form queries remain queries for backward compatibility, but
    the trace marks them as unrecognized rather than pretending they were a
    structured locator.
    """
    if not isinstance(item, ExactLegalLookupBatchItem):
        item = ExactLegalLookupBatchItem(**dict(item))

    locator_type = _canonical_locator_type(
        item.locator_type,
        schedule=item.schedule,
        node_type=item.node_type,
    )
    schedule = _clean(item.schedule, limit=100)
    provision = _clean(item.provision or item.provision_ref, limit=255)
    document_id = _clean(item.document_id, limit=500)
    target_schedule, target_document_id = _target_document_fields(item.target_document)
    schedule = schedule or target_schedule
    if document_id is None and target_document_id and target_schedule is None:
        document_id = target_document_id

    parse_source = item.locator or item.query
    parsed_type, parsed_schedule, parsed_provision = _parse_locator_text(parse_source)
    if locator_type is None:
        locator_type = parsed_type
    schedule = schedule or parsed_schedule
    provision = provision or parsed_provision

    if provision is None and item.locator and _PROVISION_ONLY_RE.match(_clean(item.locator, limit=255) or ""):
        provision = _clean(item.locator, limit=255)

    if locator_type in {"schedule3_criterion", "schedule2_provision", "schedule4_pic", "schedule8_condition"}:
        implied_schedule = {
            "schedule2_provision": "2",
            "schedule3_criterion": "3",
            "schedule4_pic": "4",
            "schedule8_condition": "8",
        }[locator_type]
        schedule = schedule or implied_schedule
    if locator_type == "regulation":
        document_id = document_id or "Migration Regulations 1994"
    if locator_type == "act_section":
        document_id = document_id or "Migration Act 1958"

    source_types = list(item.source_types)
    if item.source_type and item.source_type not in source_types:
        source_types.append(item.source_type)
    if locator_type in {
        "schedule2_provision", "schedule3_criterion", "schedule4_pic",
        "schedule8_condition", "regulation", "subregulation", "act_section",
    } and not source_types:
        source_types = ["legislation"]

    recognized_query = (
        (parsed_type is not None or parsed_provision is not None)
        and _clean(item.query, limit=2000) == _clean(parse_source, limit=2000)
    )
    normalized_query = None if recognized_query or item.locator else _clean(item.query, limit=2000)
    normalization_status = "structured" if locator_type or provision or schedule or document_id else "unrecognized_free_form"

    request = ExactLegalLookupRequest(
        query=normalized_query,
        document_id=document_id,
        source_types=source_types,
        schedule=schedule,
        provision=provision,
        case_citation=item.case_citation,
        subclass=item.subclass,
        as_of_date=as_of_date,
        follow_cross_references=item.follow_cross_references,
        max_hits=item.max_hits,
    )

    trace = {
        "model_locator": {
            "locator_type": _clean(item.locator_type, limit=100),
            "locator": _clean(item.locator, limit=500),
            "target_document": _clean(item.target_document, limit=500),
            "node_type": _clean(item.node_type, limit=100),
            "provision_ref": _clean(item.provision_ref, limit=255),
            "source_types": [_clean(value, limit=100) for value in item.source_types],
            "source_type": _clean(item.source_type, limit=100),
            "schedule": _clean(item.schedule, limit=100),
            "provision": _clean(item.provision, limit=255),
            "subclass": _clean(item.subclass, limit=50),
            "case_citation": _clean(item.case_citation, limit=500),
            "query_present": item.query is not None,
            "query_length": len(item.query or ""),
        },
        "normalization_status": normalization_status,
        "normalized_locator_type": locator_type,
        # Preserve a normalized query only when it was recognized as a
        # locator syntax.  Unknown free-form text is represented by presence
        # and length metadata rather than copied into evaluation telemetry.
        "normalized_query": normalized_query if parsed_type is not None else None,
        "normalized_request": {
            key: value for key, value in request.model_dump(mode="json").items()
            if key != "query"
        } | {"query_present": normalized_query is not None},
    }
    return NormalizedExactLookup(request=request, trace=trace)
