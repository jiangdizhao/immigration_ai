from __future__ import annotations

import re
from typing import Any

from app.schemas.ranked_candidates import (
    LegalIntent,
    RankedCandidate,
    RankedCandidateMap,
    SkeletonScreeningResult,
)
from app.services.schedule2_skeleton_index_service import Schedule2SkeletonIndexService
from app.services.schedule2_skeleton_screening_service import Schedule2SkeletonScreeningService


SUBCLASS_RE = re.compile(r"\b(?:subclass\s*)?([0-9]{3,4}[A-Z]?)\b", re.I)


class Schedule2RankedCandidateService:
    """Builds a ranked candidate map from Schedule 2 skeleton screening."""

    def __init__(
        self,
        *,
        index_service: Schedule2SkeletonIndexService | None = None,
        screening_service: Schedule2SkeletonScreeningService | None = None,
    ) -> None:
        self.index_service = index_service or Schedule2SkeletonIndexService()
        self.screening_service = screening_service or Schedule2SkeletonScreeningService(
            index_service=self.index_service
        )

    def build(
        self,
        *,
        original_question: str,
        effective_question: str,
        known_facts: dict[str, Any],
        proposal: dict[str, Any],
        verification: dict[str, Any] | None = None,
    ) -> RankedCandidateMap:
        verification = verification or {}
        legal_intent = self.extract_legal_intent(
            original_question=original_question,
            effective_question=effective_question,
            known_facts=known_facts,
            proposal=proposal,
        )
        screened = self.screening_service.screen_all(intent=legal_intent)
        screen_by_subclass = {item.subclass: item for item in screened}
        candidate_subclasses = self._candidate_subclasses(
            legal_intent=legal_intent,
            proposal=proposal,
            verification=verification,
            screened=screened,
        )

        ranked_candidates: list[RankedCandidate] = []
        for subclass in candidate_subclasses:
            result = screen_by_subclass.get(subclass)
            if result is None:
                skeleton = self.index_service.skeleton_by_subclass(subclass)
                if not skeleton:
                    continue
                result = self.screening_service.screen_skeleton(
                    skeleton=skeleton,
                    intent=legal_intent,
                )
            if result.status == "excluded" and subclass not in legal_intent.explicitly_mentioned_subclasses:
                continue
            if result.family == "bridging_status" and not legal_intent.bridging_or_status_issue and subclass not in legal_intent.explicitly_mentioned_subclasses:
                continue
            ranked_candidates.append(self._ranked_candidate_from_screening(result, legal_intent=legal_intent))

        ranked_candidates = sorted(
            ranked_candidates,
            key=lambda item: (item.legal_fit_score, self._fit_weight(item.fit)),
            reverse=True,
        )
        # visibility_policy_applied_v1: verifier removal constraints are binding.
        ranked_candidates = [
            candidate
            for candidate in ranked_candidates
            if not self._should_hide_ranked_candidate(
                candidate=candidate,
                legal_intent=legal_intent,
                verification=verification,
            )
        ][:8]
        for index, candidate in enumerate(ranked_candidates, start=1):
            candidate.rank = index

        counts = self._counts(screened)
        excluded_candidates = [item for item in screened if item.status == "excluded"][:30]
        noisy_or_rejected = [
            item
            for item in screened
            if item.status in {"excluded", "uncertain"} and item.score <= 10
        ][:30]
        boundary = self._primary_decision_boundary(legal_intent, ranked_candidates)
        confidence_floor = self._confidence_floor(legal_intent, ranked_candidates, boundary)

        return RankedCandidateMap(
            legal_intent=legal_intent,
            screened_subclass_count=len(screened),
            activated_count=counts["activated"],
            adjacent_count=counts["adjacent"],
            excluded_count=counts["excluded"],
            uncertain_count=counts["uncertain"],
            ranked_candidates=ranked_candidates,
            excluded_candidates=excluded_candidates,
            noisy_or_rejected_candidates=noisy_or_rejected,
            primary_decision_boundary=boundary,
            confidence_floor=confidence_floor,
        )

    def extract_legal_intent(
        self,
        *,
        original_question: str,
        effective_question: str,
        known_facts: dict[str, Any],
        proposal: dict[str, Any],
    ) -> LegalIntent:
        text = self._intent_text(
            original_question=original_question,
            effective_question=effective_question,
            known_facts=known_facts,
            proposal=proposal,
        )
        # Explicit subclasses should come from the user's text and known facts only.
        # GPT proposal candidates are added later as candidate inclusions, but they
        # must not become factual intent evidence.
        explicitly_mentioned = self._explicit_subclasses(text, None)

        family_issue = self._has_any(
            text,
            (
                "parent",
                "child",
                "spouse",
                "partner",
                "family",
                "adoption",
                "sponsor my parent",
                "balance of family",
            ),
        )
        graduate_issue = self._has_any(text, ("graduate", "485", "temporary graduate", "recent qualification"))
        study_issue = self._has_any(text, ("student", "study", "course", "coe", "education provider", "500"))
        protection_issue = self._has_any(text, ("protection", "refugee", "asylum", "humanitarian"))
        refusal_issue = self._has_any(text, ("refusal", "refused", "review", "appeal", "tribunal", "art"))
        bridging_issue = self._has_bridging_or_status_issue(text=text, refusal_issue=refusal_issue)
        meetings_only = self._has_any(
            text,
            ("meetings only", "only attending meetings", "attending meetings", "negotiations only"),
        ) and not self._has_any(text, ("perform work", "doing work", "will work", "actual work will be"))
        training = self._bool_from_text(
            text,
            true_terms=("training", "trainee", "occupational training", "structured training"),
            false_terms=("not training", "no training"),
        )
        employer_involvement = self._has_any(
            text,
            ("employer", "sponsored skilled", "nomination", "nominated occupation", "australian business"),
        )
        regional_issue = self._has_any(text, ("regional", "designated regional", "regional area"))
        permanent_residence_intent = self._has_any(
            text,
            (
                "permanent residence",
                "permanent residency",
                "permanent visa",
                "permanent employer",
                "employer nomination scheme",
                "ens",
                "transition to permanent",
            ),
        )
        actual_work = self._bool_from_text(
            text,
            true_terms=("actual work", "perform work", "doing work", "worker", "job role", "duties", "productive work"),
            false_terms=("no actual work", "not working", "meetings only", "negotiations only"),
        )
        if actual_work is None and self._has_any(text, ("overseas worker", "specialist worker", "skilled worker")):
            actual_work = True
        if meetings_only:
            actual_work = False

        ongoing_role = self._bool_from_text(
            text,
            true_terms=("ongoing role", "ongoing job", "ongoing sponsored", "fill a role", "12 months", "one year"),
            false_terms=("non-ongoing", "fixed task", "fixed temporary", "short-term task", "clear end date"),
        )
        duration_intent = None
        if self._has_any(text, ("short-term", "short term", "short stay", "fixed task", "few weeks", "few months")):
            duration_intent = "short_term"
        elif permanent_residence_intent:
            duration_intent = "permanent"
        elif self._has_any(text, ("temporary", "temporary project", "temporary task")):
            duration_intent = "temporary"
        elif ongoing_role:
            duration_intent = "ongoing"

        specialisation = None
        if self._has_any(text, ("specialist", "specialised", "specialized", "expert", "highly specialised")):
            specialisation = "specialist"

        activity_type = self._activity_type(
            meetings_only=meetings_only,
            training=training,
            actual_work=actual_work,
            graduate_issue=graduate_issue,
            study_issue=study_issue,
            family_issue=family_issue,
        )
        uncertainty_notes = self._uncertainty_notes(
            actual_work=actual_work,
            ongoing_role=ongoing_role,
            training=training,
            activity_type=activity_type,
        )

        return LegalIntent(
            matter_domain="australian_immigration",
            person_role=self._person_role(text),
            australian_party_role="employer" if employer_involvement else None,
            activity_type=activity_type,
            duration_intent=duration_intent,
            specialisation=specialisation,
            regional_issue=regional_issue,
            permanent_residence_intent=permanent_residence_intent,
            employer_involvement=employer_involvement or None,
            actual_work_in_australia=actual_work,
            ongoing_role=ongoing_role,
            training_purpose=training,
            business_meetings_only=meetings_only or None,
            family_relationship_issue=family_issue,
            study_issue=study_issue and not graduate_issue,
            graduate_issue=graduate_issue,
            protection_or_humanitarian_issue=protection_issue,
            refusal_or_review_issue=refusal_issue,
            bridging_or_status_issue=bridging_issue,
            explicitly_mentioned_subclasses=explicitly_mentioned,
            uncertainty_notes=uncertainty_notes,
        )

    def _candidate_subclasses(
        self,
        *,
        legal_intent: LegalIntent,
        proposal: dict[str, Any],
        verification: dict[str, Any],
        screened: list[SkeletonScreeningResult],
    ) -> list[str]:
        candidates: list[str] = []
        candidates.extend(
            item.subclass
            for item in screened
            if item.status in {"activated", "adjacent"}
        )
        candidates.extend(
            item.subclass
            for item in screened
            if item.status == "uncertain" and item.score >= 25
        )
        candidates.extend(legal_intent.explicitly_mentioned_subclasses)
        for item in self._dict_list(proposal.get("candidate_index")):
            subclass = self._subclass(item.get("subclass"))
            if subclass:
                candidates.append(subclass)
        for item in self._dict_list(verification.get("verified_candidates")):
            candidates.extend(self._explicit_subclasses(str(item.get("candidate_label") or ""), {}))

        removal_subclasses = self._subclasses_requested_for_removal(verification)
        explicit = set(legal_intent.explicitly_mentioned_subclasses or [])
        if removal_subclasses:
            candidates = [
                subclass for subclass in candidates
                if subclass not in removal_subclasses or subclass in explicit
            ]
        return self._unique(candidates)

    def _subclasses_requested_for_removal(self, verification: dict[str, Any] | None) -> set[str]:
        """Return subclass codes the verifier explicitly told us not to show.

        The verifier's coverage audit is a structural constraint, not just prose.
        If it says "remove Subclass 188", that subclass must not survive into the
        ranked public candidate map unless the user explicitly asked about it.
        """
        verification = verification or {}
        coverage = verification.get("coverage_audit") if isinstance(verification, dict) else {}
        if not isinstance(coverage, dict):
            coverage = {}
        fields: list[Any] = []
        for key in (
            "required_removals",
            "over_included_unrelated_options",
        ):
            value = coverage.get(key)
            if isinstance(value, list):
                fields.extend(value)
            elif isinstance(value, str):
                fields.append(value)
        for key in ("must_remove_or_qualify", "unsupported_or_contradicted_claims"):
            value = verification.get(key)
            if isinstance(value, list):
                fields.extend(value)
            elif isinstance(value, str):
                fields.append(value)
        out: set[str] = set()
        for item in fields:
            text = str(item or "")
            if not text:
                continue
            lower = text.lower()
            removal_context = any(
                marker in lower
                for marker in (
                    "remove",
                    "unrelated",
                    "unsupported",
                    "not relevant",
                    "irrelevant",
                    "over-included",
                    "over included",
                    "must not",
                )
            )
            if not removal_context:
                continue
            for code in self._explicit_subclasses(text, {}):
                out.add(code)
        return out

    def _should_hide_ranked_candidate(
        self,
        *,
        candidate: RankedCandidate,
        legal_intent: LegalIntent,
        verification: dict[str, Any] | None,
    ) -> bool:
        subclass = str(candidate.subclass or "").strip()
        if not subclass:
            return True
        explicit = set(legal_intent.explicitly_mentioned_subclasses or [])
        if subclass in explicit:
            return False
        if subclass in self._subclasses_requested_for_removal(verification):
            return True

        # For a short-term specialist-work question, keep long-term/permanent
        # pathways out of the ranked "best fit" table. They may still be shown by
        # CustomerAnswerPlan as a clearly labelled longer-term boundary bucket.
        short_term_work = (
            legal_intent.activity_type == "temporary_work"
            and legal_intent.duration_intent in {"short_term", "temporary", None}
            and not legal_intent.permanent_residence_intent
        )
        if short_term_work and subclass in {
            "186", "187", "188", "189", "190", "191", "491", "494", "858", "888"
        }:
            return True
        return False

    def _ranked_candidate_from_screening(self, result: SkeletonScreeningResult, *, legal_intent: LegalIntent | None = None) -> RankedCandidate:
        if result.status == "activated":
            fit = "likely" if result.score >= 75 else "possible"
        elif result.status == "adjacent":
            fit = "possible" if result.score >= 40 else "weak"
        elif result.status == "excluded":
            fit = "excluded"
        else:
            fit = "uncertain"

        if result.score >= 90 and not result.missing_decisive_facts:
            confidence = "high"
        elif result.score >= 35:
            confidence = "medium"
        else:
            confidence = "low"

        if legal_intent is not None and result.family == "employer_sponsored_skilled":
            # Employer-sponsored pathways can be important alternatives, but they
            # should not be labelled "likely" merely because employer facts are
            # present. If ongoing-role/sponsor/nomination facts are still missing,
            # cap public fit at possible.
            missing_blob = " ".join(result.missing_decisive_facts).lower()
            if legal_intent.ongoing_role is None or "sponsor" in missing_blob or "nomination" in missing_blob:
                if fit == "likely":
                    fit = "possible"
                if confidence == "high":
                    confidence = "medium"

        return RankedCandidate(
            subclass=result.subclass,
            title=result.title,
            rank=999,
            fit=fit,
            confidence=confidence,
            legal_fit_score=result.score,
            why_likely_or_possible=result.positive_reasons[:6],
            why_maybe_not=result.negative_reasons[:6],
            missing_decisive_facts=result.missing_decisive_facts[:6],
            source_refs=self._source_refs(result),
        )

    def _source_refs(self, result: SkeletonScreeningResult) -> list[str]:
        refs = [f"schedule-2-{result.subclass}", f"subclass:{result.subclass}"]
        skeleton = self.index_service.skeleton_by_subclass(result.subclass) or {}
        for ref in skeleton.get("source_clause_refs") or []:
            text = str(ref or "").strip()
            if text:
                refs.append(f"schedule-2-{result.subclass}-{text}")
        return refs[:12]

    def _primary_decision_boundary(
        self,
        legal_intent: LegalIntent,
        ranked_candidates: list[RankedCandidate],
    ) -> str | None:
        subclasses = {candidate.subclass for candidate in ranked_candidates}
        if {"400", "482"}.issubset(subclasses):
            return "whether this is a fixed short-term specialist task or an ongoing sponsored skilled job role"
        if legal_intent.business_meetings_only or "600" in subclasses:
            return "whether the person will only attend meetings or will actually do work in Australia"
        if "407" in subclasses and (
            legal_intent.training_purpose
            or (ranked_candidates and ranked_candidates[0].subclass == "407")
        ):
            return "whether the purpose is structured occupational training rather than ordinary productive work"
        for candidate in ranked_candidates:
            if (
                candidate.missing_decisive_facts
                and candidate.fit in {"likely", "possible"}
                and candidate.legal_fit_score >= 40
                and not self._irrelevant_missing_fact(
                    legal_intent=legal_intent,
                    missing_fact=candidate.missing_decisive_facts[0],
                )
            ):
                return candidate.missing_decisive_facts[0]
        return None

    def _confidence_floor(
        self,
        legal_intent: LegalIntent,
        ranked_candidates: list[RankedCandidate],
        boundary: str | None,
    ) -> str:
        if boundary or legal_intent.uncertainty_notes:
            return "medium"
        if ranked_candidates and ranked_candidates[0].confidence == "high":
            return "high"
        return "medium" if ranked_candidates else "low"

    def _counts(self, screened: list[SkeletonScreeningResult]) -> dict[str, int]:
        out = {"activated": 0, "adjacent": 0, "excluded": 0, "uncertain": 0}
        for item in screened:
            out[item.status] += 1
        return out

    def _intent_text(
        self,
        *,
        original_question: str,
        effective_question: str,
        known_facts: dict[str, Any],
        proposal: dict[str, Any],
    ) -> str:
        """Build factual text for LegalIntent extraction.

        Important: do not use proposal_memo_markdown, candidate_index.why_possible,
        or other GPT alternative-pathway discussion here. Those fields are useful
        for candidate inclusion and verification, but they are not user facts. If
        they are treated as factual intent, alternatives such as training or
        visitor activity can contaminate the primary decision boundary.
        """

        parts: list[str] = [original_question, effective_question]
        for item in self._dict_list(proposal.get("known_facts")):
            # Only user-sourced facts may shape LegalIntent. Inferred or missing
            # facts from the proposal are useful for verification, but treating
            # them as user facts can activate unrelated pathways such as bridging
            # status merely because the proposal says "visa status unknown".
            source = str(item.get("source") or "").strip().lower()
            if source not in {"latest_user_turn", "conversation_history", "user", "user_fact", "provided_by_user"}:
                continue
            fact = str(item.get("fact") or "").strip()
            if fact:
                parts.append(fact)
        for key, value in known_facts.items():
            parts.append(f"{key}: {value}")
        return " ".join(parts).lower()

    def _explicit_subclasses(self, text: str, proposal: dict[str, Any] | None) -> list[str]:
        out: list[str] = []
        for match in SUBCLASS_RE.finditer(text or ""):
            out.append(match.group(1).upper())
        if proposal:
            for item in self._dict_list(proposal.get("candidate_index")):
                subclass = self._subclass(item.get("subclass"))
                if subclass:
                    out.append(subclass)
        return self._unique(out)

    def _activity_type(
        self,
        *,
        meetings_only: bool,
        training: bool | None,
        actual_work: bool | None,
        graduate_issue: bool,
        study_issue: bool,
        family_issue: bool,
    ) -> str | None:
        if meetings_only:
            return "business_meetings"
        if training:
            return "training"
        if graduate_issue:
            return "graduate_pathway"
        if study_issue:
            return "study"
        if family_issue:
            return "family_migration"
        if actual_work:
            return "temporary_work"
        return None

    def _person_role(self, text: str) -> str | None:
        if "parent" in text:
            return "parent"
        if "partner" in text or "spouse" in text:
            return "partner"
        if "child" in text or "dependent child" in text:
            return "child"
        if "worker" in text:
            return "overseas_worker"
        return None

    def _irrelevant_missing_fact(self, *, legal_intent: LegalIntent, missing_fact: str) -> bool:
        fact = missing_fact.lower()
        if "structured occupational training" in fact:
            return legal_intent.activity_type not in {None, "temporary_work", "training"}
        if "actual work" in fact:
            return legal_intent.activity_type in {"family_migration", "graduate_pathway", "study"}
        return False

    def _uncertainty_notes(
        self,
        *,
        actual_work: bool | None,
        ongoing_role: bool | None,
        training: bool | None,
        activity_type: str | None,
    ) -> list[str]:
        notes: list[str] = []
        if actual_work is None:
            notes.append("whether the person will do actual work in Australia")
        if ongoing_role is None and activity_type in {None, "temporary_work"}:
            notes.append("whether the role is a fixed short-term task or an ongoing job role")
        if training is None and activity_type in {None, "temporary_work"}:
            notes.append("whether the purpose is structured training rather than ordinary work")
        return notes

    def _bool_from_text(
        self,
        text: str,
        *,
        true_terms: tuple[str, ...],
        false_terms: tuple[str, ...],
    ) -> bool | None:
        if self._has_any(text, false_terms):
            return False
        if self._has_any(text, true_terms):
            return True
        return None

    def _has_any(self, text: str, terms: tuple[str, ...]) -> bool:
        return any(term in text for term in terms)

    def _has_bridging_or_status_issue(self, *, text: str, refusal_issue: bool) -> bool:
        if refusal_issue:
            return True
        # Use concrete bridging/status-problem markers only. Broad phrases such as
        # "visa status" or "current visa" are often generated as unknown/missing
        # facts and should not activate bridging subclasses.
        concrete_terms = (
            "bridging visa",
            "bridging a",
            "bridging b",
            "bridging c",
            "bridging e",
            "bva",
            "bvb",
            "bvc",
            "bve",
            "pending application",
            "pending visa application",
            "current visa expiring",
            "current visa expires",
            "visa expired",
            "unlawful",
            "no current visa",
            "substantive visa expired",
            "review application",
            "tribunal review",
        )
        return self._has_any(text, concrete_terms)

    def _dict_list(self, value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        return [dict(item) for item in value if isinstance(item, dict)]

    def _subclass(self, value: Any) -> str | None:
        text = str(value or "").strip().upper()
        if not text:
            return None
        digits = "".join(ch for ch in text if ch.isdigit())
        return digits or None

    def _fit_weight(self, fit: str) -> int:
        return {"likely": 5, "possible": 4, "uncertain": 3, "weak": 2, "excluded": 1}.get(fit, 0)

    def _unique(self, values: list[str]) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for value in values:
            text = str(value or "").strip().upper()
            if text and text not in seen:
                seen.add(text)
                out.append(text)
        return out
