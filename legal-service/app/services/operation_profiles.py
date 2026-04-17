from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable


ANSWER_MODE_DIRECT = "direct_answer"
ANSWER_MODE_QUALIFIED = "qualified_general"
ANSWER_MODE_FOLLOWUP = "ask_followup"
ANSWER_MODE_LIVE_FETCH = "live_fetch_then_retry"
ANSWER_MODE_WARNING = "answer_with_warning"
ANSWER_MODE_ESCALATE = "escalate"


@dataclass(frozen=True, slots=True)
class OperationProfile:
    name: str
    required_facts: tuple[str, ...] = ()
    required_source_classes_any: tuple[tuple[str, ...], ...] = ()
    optional_source_classes: tuple[str, ...] = ()
    live_fetch_domains: tuple[str, ...] = ()
    preferred_source_types: tuple[str, ...] = ()
    allowed_answer_modes: tuple[str, ...] = (
        ANSWER_MODE_QUALIFIED,
        ANSWER_MODE_FOLLOWUP,
    )
    confidence_cap_if_missing_facts: str | None = "low"
    escalate_if_deadline_sensitive_and_date_missing: bool = False
    freshness_triggers: tuple[str, ...] = ()


DEFAULT_OPERATION_PROFILE = OperationProfile(
    name="general_guidance",
    required_facts=(),
    required_source_classes_any=(),
    optional_source_classes=("requirements_overview", "official_next_steps"),
    live_fetch_domains=("immi.homeaffairs.gov.au", "legislation.gov.au"),
    preferred_source_types=("guidance", "legislation"),
    allowed_answer_modes=(ANSWER_MODE_QUALIFIED, ANSWER_MODE_FOLLOWUP, ANSWER_MODE_WARNING),
)


OPERATION_PROFILES: dict[str, OperationProfile] = {
    "student_refusal_next_steps": OperationProfile(
        name="student_refusal_next_steps",
        required_facts=("notification_date", "refusal_notice_available", "onshore_offshore"),
        required_source_classes_any=(
            ("review_rights", "review_deadline", "lawful_status_after_refusal", "official_next_steps"),
        ),
        optional_source_classes=("student_documents_guidance", "genuine_student_guidance", "student_visa_overview"),
        live_fetch_domains=("art.gov.au", "immi.homeaffairs.gov.au", "legislation.gov.au"),
        preferred_source_types=("guidance", "procedure", "legislation"),
        allowed_answer_modes=(ANSWER_MODE_FOLLOWUP, ANSWER_MODE_QUALIFIED, ANSWER_MODE_WARNING),
        confidence_cap_if_missing_facts="low",
        escalate_if_deadline_sensitive_and_date_missing=True,
    ),
    "review_rights": OperationProfile(
        name="review_rights",
        required_facts=("refusal_notice_available",),
        required_source_classes_any=(
            ("review_rights", "art_procedure", "official_next_steps"),
        ),
        optional_source_classes=("review_deadline", "lawful_status_after_refusal"),
        live_fetch_domains=("art.gov.au", "legislation.gov.au", "fedcourt.gov.au"),
        preferred_source_types=("procedure", "legislation", "guidance"),
        allowed_answer_modes=(ANSWER_MODE_FOLLOWUP, ANSWER_MODE_QUALIFIED, ANSWER_MODE_WARNING),
        confidence_cap_if_missing_facts="low",
        escalate_if_deadline_sensitive_and_date_missing=True,
    ),
    "review_deadline": OperationProfile(
        name="review_deadline",
        required_facts=("notification_date",),
        required_source_classes_any=(
            ("review_deadline", "review_rights", "art_procedure"),
        ),
        optional_source_classes=("official_next_steps",),
        live_fetch_domains=("art.gov.au", "legislation.gov.au", "fedcourt.gov.au"),
        preferred_source_types=("procedure", "legislation"),
        allowed_answer_modes=(ANSWER_MODE_FOLLOWUP, ANSWER_MODE_QUALIFIED),
        confidence_cap_if_missing_facts="low",
        escalate_if_deadline_sensitive_and_date_missing=True,
    ),
    "bridging_travel": OperationProfile(
        name="bridging_travel",
        required_facts=(),
        required_source_classes_any=(("bridging_travel", "bridging_visa_b"),),
        optional_source_classes=("lawful_status_after_refusal",),
        live_fetch_domains=("immi.homeaffairs.gov.au",),
        preferred_source_types=("guidance",),
        allowed_answer_modes=(ANSWER_MODE_DIRECT, ANSWER_MODE_WARNING, ANSWER_MODE_QUALIFIED),
    ),
    "485_eligibility_overview": OperationProfile(
        name="485_eligibility_overview",
        required_facts=(),
        required_source_classes_any=(("485_requirements_overview", "requirements_overview"),),
        optional_source_classes=("official_next_steps",),
        live_fetch_domains=("immi.homeaffairs.gov.au", "legislation.gov.au"),
        preferred_source_types=("guidance", "legislation"),
        allowed_answer_modes=(ANSWER_MODE_DIRECT, ANSWER_MODE_WARNING, ANSWER_MODE_QUALIFIED),
    ),
    "document_checklist": OperationProfile(
        name="document_checklist",
        required_facts=(),
        required_source_classes_any=(("student_documents_guidance", "document_checklist", "official_next_steps"),),
        optional_source_classes=("genuine_student_guidance", "student_visa_overview"),
        live_fetch_domains=("immi.homeaffairs.gov.au",),
        preferred_source_types=("guidance",),
        allowed_answer_modes=(ANSWER_MODE_DIRECT, ANSWER_MODE_QUALIFIED, ANSWER_MODE_WARNING),
    ),
    "pic4020_risk": OperationProfile(
        name="pic4020_risk",
        required_facts=(),
        required_source_classes_any=(("pic4020_guidance", "legislation_primary"),),
        optional_source_classes=("official_next_steps",),
        live_fetch_domains=("immi.homeaffairs.gov.au", "legislation.gov.au"),
        preferred_source_types=("guidance", "legislation"),
        allowed_answer_modes=(ANSWER_MODE_QUALIFIED, ANSWER_MODE_WARNING, ANSWER_MODE_FOLLOWUP),
        confidence_cap_if_missing_facts="low",
        escalate_if_deadline_sensitive_and_date_missing=False,
    ),
}


_OPERATION_ALIASES = {
    "485_requirements_overview": "485_eligibility_overview",
    "temporary_graduate_requirements": "485_eligibility_overview",
}


def canonical_operation_type(operation_type: str | None) -> str | None:
    if not operation_type:
        return operation_type
    normalized = str(operation_type).strip().lower()
    normalized = _OPERATION_ALIASES.get(normalized, normalized)
    return normalized or None


def get_operation_profile(
    operation_type: str | None,
    *,
    issue_type: str | None = None,
    visa_type: str | None = None,
) -> OperationProfile:
    op = canonical_operation_type(operation_type)
    if op and op in OPERATION_PROFILES:
        return OPERATION_PROFILES[op]

    issue = (issue_type or "").strip().lower()
    visa = (visa_type or "").strip().lower()
    if issue == "pic4020_issue":
        return OPERATION_PROFILES["pic4020_risk"]
    if visa == "temporary_graduate":
        return OPERATION_PROFILES["485_eligibility_overview"]
    return DEFAULT_OPERATION_PROFILE



def normalize_known_facts(known_facts: dict[str, Any] | None) -> dict[str, Any]:
    facts = dict(known_facts or {})
    if "onshore_offshore" not in facts:
        if _present(facts.get("in_australia")):
            facts["onshore_offshore"] = "onshore" if bool(facts.get("in_australia")) else "offshore"
        elif _present(facts.get("outside_australia")):
            facts["onshore_offshore"] = "offshore" if bool(facts.get("outside_australia")) else "onshore"
    return facts



def fact_is_present(known_facts: dict[str, Any], key: str) -> bool:
    facts = normalize_known_facts(known_facts)
    value = facts.get(key)
    return _present(value)



def _present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict, tuple, set)):
        return bool(value)
    return True



def infer_source_classes_from_parts(
    *,
    title: str | None = None,
    authority: str | None = None,
    source_type: str | None = None,
    bucket: str | None = None,
    sub_type: str | None = None,
    section_ref: str | None = None,
    heading: str | None = None,
    text: str | None = None,
    metadata_json: dict[str, Any] | None = None,
) -> list[str]:
    classes: set[str] = set()
    metadata_json = dict(metadata_json or {})

    existing = metadata_json.get("source_classes")
    if isinstance(existing, str):
        classes.add(existing)
    elif isinstance(existing, Iterable):
        for item in existing:
            if isinstance(item, str) and item.strip():
                classes.add(item.strip().lower())

    title_l = (title or "").lower()
    authority_l = (authority or "").lower()
    source_type_l = (source_type or "").lower()
    bucket_l = (bucket or "").lower()
    sub_type_l = (sub_type or "").lower()
    section_ref_l = (section_ref or "").lower()
    heading_l = (heading or "").lower()
    text_l = (text or "").lower()
    blob = "\n".join(
        item
        for item in [title_l, authority_l, source_type_l, bucket_l, sub_type_l, section_ref_l, heading_l, text_l]
        if item
    )

    if source_type_l == "legislation" or "legislation" in authority_l or "federal register of legislation" in authority_l:
        classes.add("legislation_primary")

    if any(term in blob for term in ["administrative review tribunal", "art.gov.au", "reviewable migration", "tribunal review", "merits review"]):
        classes.update({"review_rights", "art_procedure"})
    if ("review" in blob or "appeal" in blob) and any(term in blob for term in ["time limit", "deadline", "within ", " within", "days", "day "]):
        classes.add("review_deadline")
    if "review" in blob or "appeal" in blob:
        classes.add("review_rights")

    if any(term in blob for term in ["next steps", "what to do next", "what you can do", "after your visa is refused", "after refusal"]):
        classes.add("official_next_steps")

    if any(term in blob for term in ["lawful", "unlawful", "remain in australia", "bridging visa after refusal", "status after refusal"]):
        classes.add("lawful_status_after_refusal")

    if "genuine student" in blob or "gte" in blob or "genuine temporary entrant" in blob:
        classes.add("genuine_student_guidance")

    if "student visa" in blob or "subclass 500" in blob:
        classes.update({"student_visa_overview", "requirements_overview"})

    if any(term in blob for term in ["document", "documents", "checklist", "prepare", "preparation", "evidence", "upload"]):
        classes.add("document_checklist")
        if "student" in blob:
            classes.add("student_documents_guidance")

    if "temporary graduate" in blob or "subclass 485" in blob or " 485" in f" {blob} ":
        classes.update({"485_requirements_overview", "requirements_overview"})

    if "bridging visa" in blob or "bridging" in title_l:
        classes.add("bridging_travel")
    if "travel on a bridging visa" in blob or ("bridging visa" in blob and "travel" in blob):
        classes.add("bridging_travel")
    if "bridging visa b" in blob or "(bvb)" in blob or " bvb" in f" {blob} ":
        classes.add("bridging_visa_b")

    if any(term in blob for term in ["4020", "accurate information", "false or misleading", "misleading information", "incorrect information"]):
        classes.add("pic4020_guidance")

    if bucket_l == "procedure" or sub_type_l == "procedure":
        classes.add("procedure_guidance")

    return sorted(classes)
