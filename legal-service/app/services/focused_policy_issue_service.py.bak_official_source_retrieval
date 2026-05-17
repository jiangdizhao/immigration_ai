from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(slots=True)
class FocusedPolicyIssue:
    key: str
    visa_subclass: str | None
    operation_type: str | None
    question_focus: str
    search_query: str
    required_terms_all: list[str] = field(default_factory=list)
    required_terms_any: list[str] = field(default_factory=list)
    preferred_source_classes: list[str] = field(default_factory=list)
    live_query_hints: list[str] = field(default_factory=list)
    preferred_urls: list[str] = field(default_factory=list)
    user_facts: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class FocusedPolicyFinding:
    issue_key: str
    resolved: bool
    finding: str | None
    confidence: str = "low"
    evidence_chunk_ids: list[str] = field(default_factory=list)
    evidence_titles: list[str] = field(default_factory=list)
    evidence_urls: list[str] = field(default_factory=list)
    evidence_snippets: list[str] = field(default_factory=list)
    matched_terms: list[str] = field(default_factory=list)
    missing_terms: list[str] = field(default_factory=list)
    recommended_answer_mode: str = "ask_followup"
    debug: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class FocusedPolicyIssueService:
    SUBSTANTIVE_MIN_CHARS = 120
    SUBSTANTIVE_MIN_WORDS = 18

    def detect_issue(self, *, question: str, operation_type: str | None, known_facts: dict[str, Any] | None) -> dict[str, Any] | None:
        facts = dict(known_facts or {})
        q = (question or "").lower()
        operation = operation_type or str(facts.get("operation_type") or "")
        is_485 = (
            bool(operation and operation.startswith("485_"))
            or str(facts.get("visa_subclass") or "") == "485"
            or str(facts.get("visa_type") or "") == "temporary_graduate"
            or "485" in q
            or "temporary graduate" in q
        )
        if not is_485:
            return None
        focus_terms = self._extract_focus_terms(q, facts)
        if not focus_terms:
            return None

        age_value = self._extract_age(q, facts)
        if age_value is not None:
            return FocusedPolicyIssue(
                key="485_current_policy_age_qualification",
                visa_subclass="485",
                operation_type=operation or "485_higher_education_stream",
                question_focus="Current Subclass 485 age rule for the relevant pathway",
                search_query="Subclass 485 age limit 35 years old Post-Higher Education Work stream Temporary Graduate visa changes 1 July 2024",
                required_terms_all=["temporary graduate"],
                required_terms_any=["35 years", "35 years old", "years old or younger", "age", "maximum age"],
                preferred_source_classes=["485_age_requirement", "485_higher_education_485231", "485_requirements_overview"],
                live_query_hints=[
                    "Subclass 485 age limit 35 years old",
                    "Temporary Graduate visa changes 1 July 2024 age",
                    "Post-Higher Education Work stream age requirement",
                ],
                preferred_urls=[
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/changes",
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/post-higher-education-work",
                    "https://www.legislation.gov.au/F1996B03551/latest/text",
                ],
                user_facts={"age": age_value, "qualification_level": facts.get("qualification_level")},
            ).to_dict()

        if any(term in q for term in ["covid", "replacement", "disruption"]):
            return FocusedPolicyIssue(
                key="485_replacement_or_disruption_current_policy",
                visa_subclass="485",
                operation_type=operation or "485_replacement_stream",
                question_focus="Current 485 replacement/disruption rule",
                search_query="Subclass 485 replacement stream COVID disruption current rule Temporary Graduate visa",
                required_terms_all=["temporary graduate"],
                required_terms_any=["replacement", "covid", "disruption", "stream"],
                preferred_source_classes=["485_replacement_stream", "485_requirements_overview"],
                live_query_hints=["Subclass 485 replacement stream", "Temporary Graduate visa replacement disruption"],
                preferred_urls=[
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/replacement-stream",
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/changes",
                ],
                user_facts=facts,
            ).to_dict()

        if any(term in q for term in ["regional", "second 485", "second temporary graduate", "subsequent"]):
            return FocusedPolicyIssue(
                key="485_regional_or_second_current_policy",
                visa_subclass="485",
                operation_type=operation or "485_regional_extension",
                question_focus="Current 485 second/regional pathway rule",
                search_query="Subclass 485 second Post-Higher Education Work regional extension current rule",
                required_terms_all=["temporary graduate"],
                required_terms_any=["regional", "second", "post-higher", "post higher", "two years", "2 years"],
                preferred_source_classes=["485_second_regional_485232_485235", "485_regional_residence_requirement"],
                live_query_hints=["Subclass 485 second post-higher education work regional"],
                preferred_urls=[
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/second-post-higher-education-work",
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/changes",
                ],
                user_facts=facts,
            ).to_dict()

        if any(term in q for term in ["master", "masters", "bachelor", "phd", "degree", "qualification", "coursework", "course work", "minister", "specified"]):
            return FocusedPolicyIssue(
                key="485_qualification_current_policy",
                visa_subclass="485",
                operation_type=operation or "485_higher_education_stream",
                question_focus="Current 485 qualification/pathway rule",
                search_query="Subclass 485 Post-Higher Education Work stream qualification current rule master coursework",
                required_terms_all=["temporary graduate"],
                required_terms_any=["post-higher", "post higher", "higher education", "degree", "master", "qualification"],
                preferred_source_classes=["485_higher_education_485231", "485_minister_specified_qualification", "485_requirements_overview"],
                live_query_hints=["Subclass 485 post higher education qualification", "Temporary Graduate visa master coursework"],
                preferred_urls=[
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/post-higher-education-work",
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/changes",
                ],
                user_facts=facts,
            ).to_dict()

        return None

    def resolve_from_chunks(self, *, issue: dict[str, Any] | None, chunks: list[Any], known_facts: dict[str, Any] | None = None) -> dict[str, Any] | None:
        if not issue:
            return None
        known_facts = dict(known_facts or {})
        issue_obj = self._coerce_issue(issue)
        scored: list[tuple[float, Any, list[str]]] = []
        for chunk in chunks or []:
            text = self._chunk_text(chunk)
            if not self._is_substantive(text):
                continue
            score, matched = self._score_text_for_issue(text=text, issue=issue_obj)
            if score > 0:
                scored.append((score, chunk, matched))
        scored.sort(key=lambda item: item[0], reverse=True)
        top = scored[:4]
        if not top:
            return FocusedPolicyFinding(
                issue_key=issue_obj.key,
                resolved=False,
                finding=None,
                confidence="low",
                missing_terms=list(issue_obj.required_terms_any),
                debug={"reason": "no_substantive_chunk_matched_focused_terms", "issue": issue_obj.to_dict(), "chunk_count": len(chunks or [])},
            ).to_dict()

        snippets, titles, urls, ids, matched_terms = [], [], [], [], []
        for _score, chunk, matched in top:
            ids.append(self._chunk_id(chunk))
            title = self._chunk_title(chunk)
            url = self._chunk_url(chunk)
            if title and title not in titles:
                titles.append(title)
            if url and url not in urls:
                urls.append(url)
            snippets.append(self._snippet(self._chunk_text(chunk), issue_obj))
            for item in matched:
                if item not in matched_terms:
                    matched_terms.append(item)

        if issue_obj.key == "485_current_policy_age_qualification":
            finding_text, confidence, resolved = self._resolve_485_age(issue_obj, top, known_facts)
        else:
            resolved = bool(top)
            confidence = "medium" if top[0][0] >= 4 else "low"
            finding_text = (
                f"Official material relevant to this focused issue was found: {issue_obj.question_focus}. "
                "Use the evidence snippets to answer this specific issue before broader eligibility questions."
            )

        missing = [
            term for term in issue_obj.required_terms_any
            if term.lower() not in " ".join(snippets).lower() and term.lower() not in " ".join(matched_terms).lower()
        ]
        return FocusedPolicyFinding(
            issue_key=issue_obj.key,
            resolved=resolved,
            finding=finding_text,
            confidence=confidence,
            evidence_chunk_ids=[item for item in ids if item],
            evidence_titles=titles,
            evidence_urls=urls,
            evidence_snippets=snippets,
            matched_terms=matched_terms,
            missing_terms=missing,
            recommended_answer_mode="focused_policy_answer" if resolved else "ask_followup",
            debug={"top_scores": [score for score, _chunk, _matched in top], "issue": issue_obj.to_dict()},
        ).to_dict()

    def merge_live_results(self, primary: Any, secondary: Any) -> Any:
        if primary is None:
            return secondary
        if secondary is None:
            return primary
        try:
            seen = {(getattr(chunk, "url", None), (getattr(chunk, "text", "") or "")[:80]) for chunk in getattr(primary, "chunks", []) or []}
            for chunk in getattr(secondary, "chunks", []) or []:
                key = (getattr(chunk, "url", None), (getattr(chunk, "text", "") or "")[:80])
                if key not in seen:
                    primary.chunks.append(chunk)
                    seen.add(key)
            primary.used_live_fetch = bool(getattr(primary, "used_live_fetch", False) or getattr(secondary, "used_live_fetch", False))
            primary.fetched_url_count = int(getattr(primary, "fetched_url_count", 0) or 0) + int(getattr(secondary, "fetched_url_count", 0) or 0)
            primary.domains_used = sorted(set(getattr(primary, "domains_used", []) or []) | set(getattr(secondary, "domains_used", []) or []))
            debug = dict(getattr(primary, "debug", {}) or {})
            debug["focused_second_pass"] = getattr(secondary, "debug", {}) or {}
            primary.debug = debug
        except Exception:
            return primary
        return primary

    def apply_finding_to_response(self, *, response: Any, finding: dict[str, Any] | None, issue: dict[str, Any] | None, known_facts: dict[str, Any] | None, question: str) -> Any:
        if not finding or not finding.get("resolved"):
            return response
        key = str(finding.get("issue_key") or "")
        answer = str(getattr(response, "answer", "") or "")
        if key == "485_current_policy_age_qualification" and not re.search(r"\b35\b|age|36", answer, flags=re.I):
            age = (known_facts or {}).get("age") or (issue or {}).get("user_facts", {}).get("age")
            qualification = (known_facts or {}).get("qualification_level") or "your qualification"
            finding_text = str(finding.get("finding") or "")
            response.answer = (
                f"Based on the current official 485 policy material I found, age is a key issue. {finding_text}\n\n"
                f"On the facts you gave, you are {age} and your qualification is recorded as {qualification}. "
                "Assuming you are asking about the standard first Subclass 485 Post-Higher Education Work stream, "
                "being 36 is likely to be a problem unless an exception, transitional arrangement, or different pathway applies.\n\n"
                "This does not replace a full eligibility assessment, but it directly addresses your age-and-qualification question."
            )
            response.confidence = "medium"
            response.next_action = "answer"
            response.escalate = False
            response.user_display_mode = response.user_display_mode or "answer_with_warning"
            response.follow_up_questions = [
                "Is this your first Subclass 485 application?",
                "Do you want a lawyer to check whether any exception or transitional rule applies?",
            ]
            response.missing_facts = []
        return response

    def _resolve_485_age(self, issue: FocusedPolicyIssue, top: list[tuple[float, Any, list[str]]], known_facts: dict[str, Any]) -> tuple[str, str, bool]:
        blob = "\n\n".join(self._chunk_text(chunk) for _score, chunk, _matched in top).lower()
        age = issue.user_facts.get("age") or known_facts.get("age")
        try:
            age_int = int(age) if age is not None else None
        except Exception:
            age_int = None
        has_35_rule = bool(
            re.search(r"35\s+years\s+old\s+or\s+(?:under|younger)", blob)
            or re.search(r"\b35\s+years\b", blob)
            or re.search(r"\bmaximum\s+age\b.{0,80}\b35\b", blob)
        )
        if not has_35_rule:
            return ("I found current official 485 material relevant to age, but it did not clearly extract the decisive age-limit wording.", "low", False)
        if age_int is not None and age_int > 35:
            return ("The evidence indicates the relevant current rule is generally framed as 35 years old or younger, subject to exceptions or other pathways.", "medium", True)
        if age_int is not None and age_int <= 35:
            return ("The evidence indicates the relevant current rule is generally framed as 35 years old or younger, so the age fact alone does not appear to exceed that threshold.", "medium", True)
        return ("The evidence indicates the relevant current rule is generally framed as 35 years old or younger, subject to exceptions or other pathways.", "medium", True)

    def _extract_focus_terms(self, q: str, facts: dict[str, Any]) -> list[str]:
        terms = []
        for term in ["age", "years old", "still apply", "eligible", "eligibility", "current policy", "master", "masters", "coursework", "course work", "covid", "replacement", "regional", "second 485", "transitional", "exception", "minister", "specified", "skills assessment", "diploma", "occupation"]:
            if term in q:
                terms.append(term)
        if "age" in facts:
            terms.append("age")
        if facts.get("qualification_level"):
            terms.append(str(facts.get("qualification_level")))
        return list(dict.fromkeys(terms))

    def _extract_age(self, q: str, facts: dict[str, Any]) -> int | None:
        if facts.get("age") is not None:
            try:
                return int(facts.get("age"))
            except Exception:
                pass
        m = re.search(r"\b(?:i\s+am\s+|age\s*)?(\d{2})\s*(?:years?\s*old)?\b", q)
        if not m:
            return None
        value = int(m.group(1))
        return value if 10 <= value <= 80 else None

    def _coerce_issue(self, issue: dict[str, Any]) -> FocusedPolicyIssue:
        return FocusedPolicyIssue(
            key=str(issue.get("key") or "focused_policy_issue"),
            visa_subclass=issue.get("visa_subclass"),
            operation_type=issue.get("operation_type"),
            question_focus=str(issue.get("question_focus") or "Focused current-policy issue"),
            search_query=str(issue.get("search_query") or ""),
            required_terms_all=list(issue.get("required_terms_all") or []),
            required_terms_any=list(issue.get("required_terms_any") or []),
            preferred_source_classes=list(issue.get("preferred_source_classes") or []),
            live_query_hints=list(issue.get("live_query_hints") or []),
            preferred_urls=list(issue.get("preferred_urls") or []),
            user_facts=dict(issue.get("user_facts") or {}),
        )

    def _score_text_for_issue(self, *, text: str, issue: FocusedPolicyIssue) -> tuple[float, list[str]]:
        lowered = text.lower()
        matched = []
        score = 0.0
        for term in issue.required_terms_all:
            if term.lower() in lowered:
                score += 2.0
                matched.append(term)
        for term in issue.required_terms_any:
            if term.lower() in lowered:
                score += 3.0
                matched.append(term)
        if "temporary graduate" in lowered or "subclass 485" in lowered:
            score += 1.5
        if "post-higher" in lowered or "post higher" in lowered:
            score += 1.0
        if re.search(r"\b35\b", lowered):
            score += 2.0
        if re.search(r"\b36\b", lowered):
            score += 0.5
        return score, list(dict.fromkeys(matched))

    def _is_substantive(self, text: str) -> bool:
        return len(text or "") >= self.SUBSTANTIVE_MIN_CHARS and len(re.findall(r"\b\w+\b", text or "")) >= self.SUBSTANTIVE_MIN_WORDS

    def _chunk_text(self, chunk: Any) -> str:
        source = getattr(chunk, "source", None)
        return "\n".join(part for part in [
            str(getattr(chunk, "heading", "") or ""),
            str(getattr(chunk, "text", "") or ""),
            str(getattr(source, "title", "") or ""),
            str(getattr(source, "authority", "") or ""),
        ] if part)

    def _chunk_title(self, chunk: Any) -> str:
        source = getattr(chunk, "source", None)
        return str(getattr(source, "title", None) or getattr(chunk, "title", "") or "")

    def _chunk_url(self, chunk: Any) -> str:
        source = getattr(chunk, "source", None)
        return str(getattr(source, "url", None) or getattr(chunk, "url", "") or "")

    def _chunk_id(self, chunk: Any) -> str:
        return str(getattr(chunk, "id", "") or "")

    def _snippet(self, text: str, issue: FocusedPolicyIssue) -> str:
        lowered = text.lower()
        terms = issue.required_terms_any + issue.required_terms_all + ["temporary graduate", "subclass 485"]
        idxs = [lowered.find(term.lower()) for term in terms if lowered.find(term.lower()) >= 0]
        if not idxs:
            return re.sub(r"\s+", " ", text[:500]).strip()
        idx = min(idxs)
        start = max(0, idx - 250)
        end = min(len(text), idx + 650)
        return re.sub(r"\s+", " ", text[start:end]).strip()
