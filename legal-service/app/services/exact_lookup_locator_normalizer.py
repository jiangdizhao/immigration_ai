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


_PROVISION_TOKEN = r"[0-9]{1,5}[A-Z]?(?:\.[0-9A-Z]+)*(?:\([0-9A-Z]+\))*"
_SCHEDULE_LOCATOR_RE = re.compile(
    rf"^\s*(?:the\s+)?schedule\s+(?P<schedule>[0-9]+[A-Z]?)\s+"
    rf"(?:(?:criterion|criteria|provision|clause)\s+)?"
    rf"(?P<provision>{_PROVISION_TOKEN})\s*$",
    re.IGNORECASE,
)
_SCHEDULE_COMPOUND_LOCATOR_RE = re.compile(
    rf"^\s*(?:the\s+)?schedule\s+(?P<schedule>[0-9]+[A-Z]?)\s+"
    rf"(?:(?:criterion|criteria|provision|clause)\s+)?"
    rf"(?P<provisions>{_PROVISION_TOKEN}(?:\s*(?:;|,|and)\s*{_PROVISION_TOKEN})+)\s*$",
    re.IGNORECASE,
)
_REGULATION_RE = re.compile(
    rf"^\s*(?:the\s+)?(?:subregulation|regulation|subreg|reg)\.?\s+"
    rf"(?P<provision>{_PROVISION_TOKEN})\s*$",
    re.IGNORECASE,
)
_CRITERION_RE = re.compile(
    rf"^\s*(?:criterion|criteria|provision|clause)\s+(?P<provision>{_PROVISION_TOKEN})\s*$",
    re.IGNORECASE,
)
_PIC_RE = re.compile(
    r"^\s*(?:PIC|public\s+interest\s+(?:criterion|criteria))\s+(?P<provision>[0-9]{4}[A-Z]?)\s*$",
    re.IGNORECASE,
)
_CONDITION_RE = re.compile(
    r"^\s*(?:visa\s+)?condition\s+(?P<provision>[0-9]{4}[A-Z]?)\s*$",
    re.IGNORECASE,
)
_ACT_SECTION_RE = re.compile(
    rf"^\s*(?:(?:the\s+)?migration\s+act(?:\s+1958)?\s+)?"
    rf"(?:section|s\.?)\s*(?P<provision>{_PROVISION_TOKEN})"
    rf"(?:\s+of\s+(?:the\s+)?migration\s+act(?:\s+1958)?)?\s*$",
    re.IGNORECASE,
)
_PROVISION_ONLY_RE = re.compile(
    rf"^\s*{_PROVISION_TOKEN}\s*$",
    re.IGNORECASE,
)
_SCHEDULE_FIELD_RE = re.compile(r"^\s*(?:the\s+)?schedule\s+(?P<schedule>[0-9]+[A-Z]?)\s*$", re.IGNORECASE)
_SUBCLASS_RE = re.compile(r"^\s*(?:subclass\s+)?(?P<subclass>[0-9]{3})\s*$", re.IGNORECASE)
_COMPOUND_SEPARATOR_RE = re.compile(r"\s*(?:;|,|\band\b)\s*", re.IGNORECASE)
_SCHEDULE_TARGET_RE = re.compile(r"\bschedule\s+(?P<schedule>[0-9]+[A-Z]?)\b", re.IGNORECASE)

_SOURCE_TYPE_ALIASES = {
    "regulation": "legislation",
    "regulations": "legislation",
    "statute": "legislation",
    "act": "legislation",
    "legislation": "legislation",
    "instrument": "legislative_instrument",
    "legislative_instrument": "legislative_instrument",
    "guidance": "guidance",
    "official_guidance": "guidance",
    "policy": "guidance",
    "court": "court_decision",
    "court_decision": "court_decision",
    "case": "court_decision",
    "tribunal": "tribunal_decision",
    "tribunal_decision": "tribunal_decision",
}


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


def _canonical_schedule(value: str | None) -> str | None:
    cleaned = _clean(value, limit=100)
    if not cleaned:
        return None
    match = _SCHEDULE_FIELD_RE.match(cleaned)
    if match:
        return match.group("schedule").upper()
    return cleaned.upper() if re.fullmatch(r"[0-9]+[A-Z]?", cleaned, re.IGNORECASE) else cleaned


def _canonical_subclass(value: str | None) -> str | None:
    cleaned = _clean(value, limit=50)
    if not cleaned:
        return None
    match = _SUBCLASS_RE.match(cleaned)
    return match.group("subclass") if match else cleaned


def _canonical_source_types(values: list[str], *, structured: bool) -> list[str]:
    """Normalize advisory source-type spellings without adding SQL clauses.

    A typed legal locator owns its source family.  Model-provided source types
    are therefore advisory for structured locators and cannot turn a valid
    exact locator into an accidental conjunction.
    """
    if structured:
        return ["legislation"]
    normalized: list[str] = []
    for value in values:
        cleaned = _clean(value, limit=100)
        if not cleaned:
            continue
        slug = _slug(cleaned) or cleaned
        canonical = _SOURCE_TYPE_ALIASES.get(slug, slug)
        if canonical not in normalized:
            normalized.append(canonical)
    return normalized


def _canonical_provision(value: str | None, *, locator_type: str | None = None) -> str | None:
    cleaned = _clean(value, limit=255)
    if not cleaned:
        return None
    # Typed payloads can carry the same label that is accepted in the free-form
    # locator field (for example ``provision="reg 1.03"``).  Canonicalize that
    # label before the request reaches SQL; labels are syntax, not a second
    # legal predicate.  ``_parse_locator_text`` is defined below and is fully
    # initialized by the time this function is called.
    parsed_type, _, parsed_provision = _parse_locator_text(cleaned)
    if parsed_provision is not None and (parsed_type is not None or locator_type is not None):
        return parsed_provision.upper()
    match = _CRITERION_RE.match(cleaned)
    if match:
        return match.group("provision").upper()
    if _PROVISION_ONLY_RE.match(cleaned):
        return cleaned.upper()
    return cleaned


def _split_compound_provisions(value: str | None) -> list[str] | None:
    """Split only a bounded list of complete provision tokens.

    Parenthesized subsection suffixes remain part of each token.  Prose is
    never expanded, and a malformed mixed string is left untouched for the
    normal schema/service path to report honestly.
    """
    cleaned = _clean(value, limit=255)
    if not cleaned or not _COMPOUND_SEPARATOR_RE.search(cleaned):
        return None
    parts = [part.strip() for part in _COMPOUND_SEPARATOR_RE.split(cleaned) if part.strip()]
    if len(parts) < 2 or not all(_PROVISION_ONLY_RE.match(part) for part in parts):
        return None
    return [part.upper() for part in parts]


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
    if slug in {"regulation", "subregulation", "reg", "subreg"}:
        return "regulation"
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
    match = _CRITERION_RE.match(cleaned)
    if match:
        return "provision", None, match.group("provision").upper()
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
    schedule = _canonical_schedule(item.schedule)
    provision = _canonical_provision(
        item.provision or item.provision_ref,
        locator_type=locator_type,
    )
    document_id = _clean(item.document_id, limit=500)
    target_schedule, target_document_id = _target_document_fields(item.target_document)
    schedule = schedule or target_schedule
    if document_id is None and target_document_id and target_schedule is None:
        document_id = target_document_id

    parse_source = item.locator or item.query
    parsed_type, parsed_schedule, parsed_provision = _parse_locator_text(parse_source)
    if locator_type is None:
        locator_type = parsed_type
    schedule = schedule or _canonical_schedule(parsed_schedule)
    provision = provision or _canonical_provision(parsed_provision, locator_type=locator_type)

    if provision is None and item.locator and _PROVISION_ONLY_RE.match(_clean(item.locator, limit=255) or ""):
        provision = _canonical_provision(item.locator, locator_type=locator_type)

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

    structured_identity = bool(locator_type or provision or schedule or document_id or item.subclass)
    source_type_values = list(item.source_types)
    if item.source_type:
        source_type_values.append(item.source_type)
    if locator_type in {
        "schedule2_provision", "schedule3_criterion", "schedule4_pic",
        "schedule8_condition", "regulation", "subregulation", "act_section",
    }:
        source_types = ["legislation"]
    else:
        source_types = _canonical_source_types(source_type_values, structured=structured_identity)

    subclass = _canonical_subclass(item.subclass)

    recognized_query = (
        (parsed_type is not None or parsed_provision is not None)
        and _clean(item.query, limit=2000) == _clean(parse_source, limit=2000)
    )
    # Once a deterministic identity is known, query prose is advisory and is
    # deliberately not added as an additional SQL predicate.
    normalized_query = None if structured_identity or recognized_query or item.locator else _clean(item.query, limit=2000)
    normalization_status = "structured" if locator_type or provision or schedule or document_id else "unrecognized_free_form"

    request = ExactLegalLookupRequest(
        query=normalized_query,
        document_id=document_id,
        source_types=source_types,
        schedule=schedule,
        provision=provision,
        case_citation=item.case_citation,
        subclass=subclass,
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
        "advisory_fields_ignored": {
            "query": bool(item.query and structured_identity),
            "source_types": bool(source_type_values and structured_identity),
        },
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


def expand_exact_lookup_item(
    item: ExactLegalLookupBatchItem | Mapping[str, Any],
    *,
    as_of_date,
) -> list[NormalizedExactLookup]:
    """Expand one supported compound model locator into bounded exact items."""
    if not isinstance(item, ExactLegalLookupBatchItem):
        item = ExactLegalLookupBatchItem(**dict(item))

    compound_parts = _split_compound_provisions(item.provision or item.provision_ref)
    compound_source = item.locator or item.query
    if compound_parts is None and compound_source:
        schedule_match = _SCHEDULE_COMPOUND_LOCATOR_RE.match(_clean(compound_source, limit=2000) or "")
        if schedule_match:
            compound_parts = _split_compound_provisions(schedule_match.group("provisions"))
            compound_schedule = schedule_match.group("schedule").upper()
        elif item.schedule:
            compound_parts = _split_compound_provisions(compound_source)
            compound_schedule = None
        else:
            compound_schedule = None
    else:
        compound_schedule = None

    if not compound_parts:
        return [normalize_exact_lookup_request(item, as_of_date=as_of_date)]

    expanded: list[NormalizedExactLookup] = []
    for index, provision in enumerate(compound_parts):
        payload = item.model_dump(mode="python")
        payload.update({
            "query": None,
            "locator": None,
            "provision": provision,
            "provision_ref": provision,
        })
        if compound_schedule:
            payload["schedule"] = compound_schedule
        normalized = normalize_exact_lookup_request(payload, as_of_date=as_of_date)
        normalized.trace["compound"] = {
            "expanded": True,
            "group_size": len(compound_parts),
            "expanded_index": index,
        }
        expanded.append(normalized)
    return expanded
