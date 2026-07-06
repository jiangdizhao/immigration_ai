from __future__ import annotations

from typing import Any

from app.schemas.ranked_candidates import LegalIntent, SkeletonScreeningResult
from app.services.schedule2_skeleton_index_service import Schedule2SkeletonIndexService


class Schedule2SkeletonScreeningService:
    """Screens every Schedule 2 skeleton against structured legal intent."""

    def __init__(self, *, index_service: Schedule2SkeletonIndexService | None = None) -> None:
        self.index_service = index_service or Schedule2SkeletonIndexService()

    def screen_all(self, *, intent: LegalIntent) -> list[SkeletonScreeningResult]:
        results = [
            self.screen_skeleton(skeleton=skeleton, intent=intent)
            for skeleton in self.index_service.all_skeletons()
        ]
        return sorted(results, key=lambda item: item.score, reverse=True)

    def screen_skeleton(
        self,
        *,
        skeleton: dict[str, Any],
        intent: LegalIntent,
    ) -> SkeletonScreeningResult:
        subclass = str(skeleton.get("subclass") or "").strip().upper()
        title = str(skeleton.get("title") or "").strip() or None
        family = str(skeleton.get("family") or "").strip() or None
        purpose_tags = self._str_set(skeleton.get("purpose_tags"))
        actor_tags = self._str_set(skeleton.get("actor_tags"))
        activity_tags = self._str_set(skeleton.get("activity_tags"))
        duration_tags = self._str_set(skeleton.get("duration_tags"))
        title_text = (title or "").lower()

        score = 0.0
        positive: list[str] = []
        negative: list[str] = []
        missing: list[str] = []
        matched_tags: list[str] = []
        conflicted_tags: list[str] = []

        def add(points: float, reason: str, *tags: str) -> None:
            nonlocal score
            score += points
            positive.append(reason)
            matched_tags.extend(tag for tag in tags if tag)

        def sub(points: float, reason: str, *tags: str) -> None:
            nonlocal score
            score -= points
            negative.append(reason)
            conflicted_tags.extend(tag for tag in tags if tag)

        explicit = subclass in intent.explicitly_mentioned_subclasses
        if explicit:
            add(30, f"Subclass {subclass} was explicitly mentioned.", "explicit_subclass")

        if family and self._family_blocked(family, intent):
            return SkeletonScreeningResult(
                subclass=subclass,
                title=title,
                family=family,
                status="excluded",
                score=-80.0 + (10.0 if explicit else 0.0),
                negative_reasons=[self._family_block_reason(family)],
                missing_decisive_facts=[],
                conflicted_tags=[family],
            )

        if intent.family_relationship_issue and family and family.startswith("family_"):
            if intent.person_role == "parent":
                if self._is_parent_family_skeleton(
                    family=family,
                    title_text=title_text,
                    purpose_tags=purpose_tags,
                    actor_tags=actor_tags,
                ):
                    add(100, "Parent-family facts activate parent visa subclasses.", "family_parent")
                else:
                    sub(
                        35,
                        "Parent-family facts do not match partner, child, or other-relative subclasses.",
                        family,
                    )
            elif intent.person_role == "partner":
                if family == "family_partner":
                    add(95, "Partner-family facts activate partner subclasses.", family)
                else:
                    sub(30, "Partner-family facts do not match this family subclass.", family)
            elif intent.person_role == "child":
                if family == "family_child":
                    add(95, "Child-family facts activate child subclasses.", family)
                else:
                    sub(30, "Child-family facts do not match this family subclass.", family)
            else:
                add(80, "Family relationship facts activate family-migration subclasses.", family)
        elif intent.family_relationship_issue and (
            family == "employer_sponsored_skilled"
            or "work" in activity_tags
            or "temporary_work" in purpose_tags
            or "skilled_work" in purpose_tags
        ):
            sub(
                60,
                "Family-migration facts do not activate temporary or sponsored work subclasses.",
                "family_migration",
            )
        if intent.study_issue and family == "student_or_graduate" and "graduate" not in purpose_tags:
            add(75, "Study facts activate student-family subclasses.", "study")
        if intent.graduate_issue and "graduate" in purpose_tags:
            add(82, "Graduate facts activate graduate-pathway subclasses.", "graduate")
        elif intent.graduate_issue and (
            "work" in activity_tags or "temporary_work" in purpose_tags or family == "employer_sponsored_skilled"
        ):
            sub(
                25,
                "Graduate-pathway facts alone do not activate temporary or employer-sponsored work subclasses.",
                "graduate",
            )
        if intent.protection_or_humanitarian_issue and family and family.startswith("protection_humanitarian"):
            add(84, "Protection or humanitarian facts activate this family.", family)
        if intent.bridging_or_status_issue and family == "bridging_status":
            add(80, "Current status, pending application, refusal, or review facts activate bridging subclasses.", family)

        if intent.business_meetings_only:
            if family == "visitor_transit_medical" and "business_visit" in activity_tags:
                add(90, "Meetings-only facts activate business visitor analysis.", "business_visit")
            elif "work" in activity_tags or "temporary_work" in purpose_tags:
                sub(50, "Meetings-only facts conflict with actual-work pathways.", "actual_work")

        if intent.training_purpose:
            if "training" in purpose_tags or "training" in activity_tags:
                add(92, "Structured training purpose activates training subclasses.", "training")
            elif "work" in activity_tags or "temporary_work" in purpose_tags:
                sub(25, "Training purpose may be different from ordinary productive work.", "training")
        elif (
            intent.training_purpose is None
            and "training" in purpose_tags
            and intent.activity_type in {None, "temporary_work"}
            and intent.specialisation is None
            and not intent.employer_involvement
        ):
            add(25, "Training subclass is adjacent because training purpose is unknown.", "training")
            missing.append("whether the purpose is structured occupational training")

        if intent.actual_work_in_australia:
            if "work" in activity_tags:
                add(30, "Actual work in Australia matches work activity tags.", "work")
            if family == "visitor_transit_medical":
                sub(55, "Actual work usually conflicts with visitor/business visitor pathways.", "actual_work")
        elif intent.actual_work_in_australia is False:
            if family == "visitor_transit_medical":
                add(30, "No actual work makes visitor/business visitor pathways more plausible.", "visitor")
            if "work" in activity_tags:
                sub(35, "No actual work weakens work visa pathways.", "work")

        if intent.employer_involvement:
            if "australian_employer_or_sponsor" in actor_tags:
                add(45, "Australian employer involvement matches sponsored-work skeletons.", "employer")
            if "australian_business_or_inviter" in actor_tags:
                add(35, "Australian business/inviter involvement matches temporary specialist work.", "employer")
            if family == "general_skilled_or_graduate":
                sub(
                    55,
                    "Employer-sponsored facts do not by themselves activate general skilled migration subclasses.",
                    family,
                )

        if intent.ongoing_role:
            if family == "employer_sponsored_skilled":
                add(70, "Ongoing sponsored role facts activate employer-sponsored skilled subclasses.", family)
            if "non_ongoing_task" in purpose_tags:
                sub(55, "Ongoing role facts conflict with non-ongoing task pathways.", "ongoing_role")
        elif intent.ongoing_role is False:
            if "non_ongoing_task" in purpose_tags:
                add(50, "Non-ongoing/fixed task facts match this pathway.", "non_ongoing_task")
            if family == "employer_sponsored_skilled":
                sub(25, "A fixed short-term task weakens normal ongoing sponsored-work pathways.", family)
        elif family == "employer_sponsored_skilled" and intent.employer_involvement:
            add(35, "Sponsored skilled work is adjacent until ongoing-role and nomination facts are known.", family)
            missing.extend(
                [
                    "whether the employer is filling an ongoing sponsored job role",
                    "whether there is sponsor approval, nomination, or nominated occupation evidence",
                ]
            )

        if intent.duration_intent in {"short_term", "temporary"}:
            if intent.duration_intent == "short_term" and (
                "short_term" in duration_tags or "short_term" in purpose_tags
            ):
                add(45, "Short-term duration matches this skeleton.", "short_term")
            elif "temporary" in duration_tags or "temporary_stay" in purpose_tags:
                add(18, "Temporary duration is broadly compatible.", "temporary")
        elif intent.duration_intent == "permanent":
            if "permanent_or_longer_term" in duration_tags:
                add(35, "Permanent-residence intent matches this skeleton.", "permanent")
            elif "temporary" in duration_tags or "temporary_stay" in purpose_tags:
                sub(20, "Permanent-residence intent weakens temporary-stay pathways.", "permanent")
        if intent.specialisation == "specialist":
            if "specialist_work" in purpose_tags or "specialist_task" in activity_tags:
                add(55, "Specialist-work facts match this skeleton.", "specialist_work")
            elif "skilled_work" in purpose_tags:
                add(20, "Skilled-work pathway is adjacent to specialist-work facts.", "skilled_work")

        if family == "employer_sponsored_skilled":
            if "skills in demand" in title_text:
                add(
                    18,
                    "Skills-in-demand skeleton is the closer temporary sponsored-work match.",
                    "skills_in_demand",
                )
            elif intent.ongoing_role is False:
                sub(
                    45,
                    "Other employer-sponsored skeletons are not the closest fit for a fixed short-term task.",
                    "fixed_task",
                )
            if self._is_regional_or_provisional_skeleton(title_text) and not intent.regional_issue:
                sub(
                    75,
                    "Regional or provisional sponsored-work skeleton needs regional/provisional facts.",
                    "regional",
                )
            if self._is_permanent_sponsored_skeleton(title_text) and not intent.permanent_residence_intent:
                sub(
                    75,
                    "Permanent employer-sponsored skeleton needs permanent-residence or transition facts.",
                    "permanent",
                )

        if family == "employer_sponsored_skilled" and not intent.ongoing_role:
            missing.append("whether this is an ongoing sponsored skilled job role")
        if "non_ongoing_task" in purpose_tags and intent.ongoing_role is None:
            missing.append("whether the task is temporary/non-ongoing")
        if "specialist_work" in purpose_tags and intent.specialisation is None:
            missing.append("whether the work is highly specialised")
        if family == "visitor_transit_medical" and intent.actual_work_in_australia is None:
            missing.append("whether the person will do actual work or only attend meetings")

        if score >= 70:
            status = "activated"
        elif score >= 25:
            status = "adjacent"
        elif explicit and score > -20:
            status = "uncertain"
        elif score <= -25:
            status = "excluded"
        else:
            status = "uncertain"

        return SkeletonScreeningResult(
            subclass=subclass,
            title=title,
            family=family,
            status=status,
            score=round(score, 2),
            positive_reasons=self._unique(positive),
            negative_reasons=self._unique(negative),
            missing_decisive_facts=self._unique(missing),
            matched_tags=self._unique(matched_tags),
            conflicted_tags=self._unique(conflicted_tags),
        )

    def _family_blocked(self, family: str, intent: LegalIntent) -> bool:
        if family.startswith("family_") and not intent.family_relationship_issue:
            return True
        if family == "student_or_graduate" and not (intent.study_issue or intent.graduate_issue):
            return True
        if family == "student_guardian" and not intent.study_issue:
            return True
        if family.startswith("protection_humanitarian") and not intent.protection_or_humanitarian_issue:
            return True
        if family == "bridging_status" and not (
            intent.bridging_or_status_issue or intent.refusal_or_review_issue
        ):
            return True
        return False

    def _family_block_reason(self, family: str) -> str:
        if family.startswith("family_"):
            return "Family migration skeleton excluded because no family relationship facts are active."
        if family == "student_or_graduate":
            return "Student/graduate skeleton excluded because no study or graduate facts are active."
        if family.startswith("protection_humanitarian"):
            return "Protection/humanitarian skeleton excluded because no protection facts are active."
        if family == "bridging_status":
            return "Bridging/status skeleton excluded because no current status, pending application, refusal, or review facts are active."
        return f"{family} skeleton excluded because matching facts are not active."

    def _is_parent_family_skeleton(
        self,
        *,
        family: str | None,
        title_text: str,
        purpose_tags: set[str],
        actor_tags: set[str],
    ) -> bool:
        return (
            family == "family_parent"
            or "parent_migration" in purpose_tags
            or "parent" in actor_tags
            or "parent" in title_text
        )

    def _is_regional_or_provisional_skeleton(self, title_text: str) -> bool:
        return "regional" in title_text or "provisional" in title_text

    def _is_permanent_sponsored_skeleton(self, title_text: str) -> bool:
        return "employer nomination scheme" in title_text or "regional sponsored migration scheme" in title_text

    def _str_set(self, value: Any) -> set[str]:
        if not isinstance(value, list):
            return set()
        return {str(item).strip().lower() for item in value if str(item).strip()}

    def _unique(self, values: list[str]) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for value in values:
            text = " ".join(str(value or "").split())
            key = text.lower()
            if text and key not in seen:
                seen.add(key)
                out.append(text)
        return out
