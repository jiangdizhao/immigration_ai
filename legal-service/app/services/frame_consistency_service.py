from __future__ import annotations

from dataclasses import asdict, dataclass, field
import re
from typing import Any


@dataclass(slots=True)
class FrameConsistencyResult:
    consistency_status: str = "consistent"
    repair_frame_id: str | None = None
    repair_action: str | None = None
    reason: str = ""
    previous_frame: str | None = None
    candidate_frame: str | None = None
    candidate_family: str | None = None
    signal_families: list[str] = field(default_factory=list)
    concrete_signal: bool = False
    conflict_reason: str | None = None
    signals: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class FrameConsistencyGate:
    """
    Cross-module frame consistency gate.

    This is not a legal decision tree. It enforces state invariants:
    - temporary frames cannot answer concrete legal fact patterns;
    - concrete frames persist across short fact updates;
    - high-risk frames require positive evidence;
    - evidence/live-policy signals must not silently contradict the case frame.
    """

    TEMPORARY_FRAMES = {
        "visa_topic_triage",
        "student_visa_general_triage",
        "485_general_triage",
        "other_visa_general",
    }

    def evaluate(
        self,
        *,
        question: str,
        original_question: str | None,
        previous_frame: str | None,
        candidate_frame: str,
        candidate_family: str | None,
        positive_issue_flags: dict[str, Any] | None,
        known_facts: dict[str, Any],
        focused_policy_issue: dict[str, Any] | None,
        available_frame_ids: set[str],
    ) -> FrameConsistencyResult:
        text = self._combined_text(question, original_question)
        signals = self._infer_signals(
            text=text,
            known_facts=known_facts,
            positive_issue_flags=positive_issue_flags or {},
            focused_policy_issue=focused_policy_issue,
        )
        signal_families = signals["families"]
        concrete_signal = bool(signal_families)
        candidate_family_norm = self._frame_family(candidate_frame, candidate_family)

        result = FrameConsistencyResult(
            previous_frame=previous_frame,
            candidate_frame=candidate_frame,
            candidate_family=candidate_family_norm,
            signal_families=signal_families,
            concrete_signal=concrete_signal,
            signals=signals,
            reason="Frame and signal families are consistent.",
        )

        if candidate_family_norm == "refusal_review" and not signals.get("positive_refusal_or_review"):
            fallback = previous_frame if previous_frame and previous_frame not in self.TEMPORARY_FRAMES else None
            repaired = fallback if fallback in available_frame_ids else self._choose_frame_from_signals(signals, available_frame_ids)
            if repaired and repaired != candidate_frame:
                return self._repair(
                    result,
                    frame_id=repaired,
                    reason="High-risk refusal/review frame lacked positive refusal/review evidence.",
                )
            return self._conflict(result, "High-risk refusal/review frame lacked positive evidence and no safe repair frame was available.")

        if candidate_frame in self.TEMPORARY_FRAMES and concrete_signal:
            repaired = self._choose_frame_from_signals(signals, available_frame_ids)
            if repaired and repaired != candidate_frame:
                return self._repair(
                    result,
                    frame_id=repaired,
                    reason=(
                        "Temporary triage frame conflicted with concrete legal signal(s): "
                        + ", ".join(signal_families)
                    ),
                )
            return self._conflict(
                result,
                "Temporary triage frame had concrete signal(s) but no repair frame was available.",
            )

        if candidate_family_norm == "triage" and focused_policy_issue:
            repaired = self._choose_frame_from_signals(signals, available_frame_ids)
            if repaired and repaired != candidate_frame:
                return self._repair(
                    result,
                    frame_id=repaired,
                    reason="Focused policy issue indicated a concrete legal family while case frame was triage.",
                )
            return self._conflict(result, "Focused policy issue conflicted with triage frame.")

        return result

    def _repair(self, result: FrameConsistencyResult, *, frame_id: str, reason: str) -> FrameConsistencyResult:
        result.consistency_status = "repaired"
        result.repair_frame_id = frame_id
        result.repair_action = "repair_frame"
        result.reason = reason
        result.conflict_reason = reason
        return result

    def _conflict(self, result: FrameConsistencyResult, reason: str) -> FrameConsistencyResult:
        result.consistency_status = "conflict_unresolved"
        result.reason = reason
        result.conflict_reason = reason
        return result

    def _combined_text(self, question: str, original_question: str | None) -> str:
        return "\n".join([question or "", original_question or ""]).lower()

    def _infer_signals(
        self,
        *,
        text: str,
        known_facts: dict[str, Any],
        positive_issue_flags: dict[str, Any],
        focused_policy_issue: dict[str, Any] | None,
    ) -> dict[str, Any]:
        facts = known_facts or {}
        families: list[str] = []

        has_485 = (
            str(facts.get("visa_subclass") or "") == "485"
            or str(facts.get("visa_type") or "") == "temporary_graduate"
            or str(facts.get("target_visa_subclass") or "") == "485"
            or bool(positive_issue_flags.get("temporary_graduate_485"))
            or bool(focused_policy_issue and str(focused_policy_issue.get("visa_subclass") or "") == "485")
            or re.search(r"\b485\b|temporary\s+graduate|graduate\s+visa", text, re.I) is not None
        )
        has_500 = (
            str(facts.get("visa_subclass") or "") == "500"
            or str(facts.get("visa_type") or "") == "student"
            or bool(positive_issue_flags.get("student_500"))
            or re.search(r"\b500\b|student\s+visa|subclass\s*500", text, re.I) is not None
            or any(term in text for term in ["学生签证", "学生签", "student 500"])
        )
        has_condition = (
            bool(positive_issue_flags.get("visa_condition"))
            or re.search(r"\b(?:condition\s*)?(8\d{3})\b", text, re.I) is not None
            or any(term in text for term in ["签证条件", "condition"])
        )
        has_bridging = (
            bool(positive_issue_flags.get("bridging_travel"))
            or re.search(r"\bbridging\b|\bbva\b|\bbvb\b|\bbvc\b|\bbve\b", text, re.I) is not None
            or "过桥签" in text
        )
        positive_refusal_or_review = bool(positive_issue_flags.get("refusal_or_review")) or any(
            term in text
            for term in ["my visa was refused", "visa refused", "refusal notice", "apply for review", "art review", "拒签", "复审", "上诉"]
        )
        has_cancellation = bool(positive_issue_flags.get("cancellation")) or any(
            term in text
            for term in ["cancelled", "cancellation", "noicc", "notice of intention", "取消", "拟取消"]
        )
        status_risk = bool(positive_issue_flags.get("visa_expiry_or_status")) or any(
            term in text
            for term in [
                "expired",
                "expires",
                "unlawful",
                "overstay",
                "completion letter",
                "automatically extend",
                "过期",
                "到期",
                "非法",
                "自动延长",
                "completion letter",
            ]
        )
        pte_or_english = any(term in text for term in ["pte", "english test", "英语", "语言"])
        student_compliance = bool(positive_issue_flags.get("student_compliance")) or any(
            term in text
            for term in ["work hours", "work limit", "attendance", "course progress", "school warning", "工作时间", "出勤", "学校警告"]
        )

        if has_condition:
            families.append("visa_condition")
        if has_bridging:
            families.append("bridging")
        if positive_refusal_or_review:
            families.append("refusal_review")
        if has_cancellation:
            families.append("cancellation")
        if has_485:
            families.append("temporary_graduate_485")
        if has_500:
            families.append("student_500")

        return {
            "families": self._unique(families),
            "has_485": has_485,
            "has_500": has_500,
            "has_condition": has_condition,
            "has_bridging": has_bridging,
            "positive_refusal_or_review": positive_refusal_or_review,
            "has_cancellation": has_cancellation,
            "status_risk": status_risk,
            "pte_or_english": pte_or_english,
            "student_compliance": student_compliance,
            "focused_policy_issue": focused_policy_issue,
        }

    def _choose_frame_from_signals(self, signals: dict[str, Any], available_frame_ids: set[str]) -> str | None:
        candidates: list[str] = []

        if signals.get("positive_refusal_or_review"):
            if signals.get("has_485"):
                candidates.append("485_refusal_review")
            candidates.extend(["500_refusal_review", "student_refusal_next_steps"])

        if signals.get("has_condition"):
            candidates.append("visa_condition_explainer")

        if signals.get("has_bridging"):
            candidates.append("bridging_travel")

        if signals.get("has_485"):
            if signals.get("status_risk"):
                candidates.append("485_student_visa_expired_or_status_risk")
            if signals.get("pte_or_english"):
                candidates.append("485_english_test_or_pte_timing")
            candidates.extend(["485_post_higher_education", "485_general_triage"])

        if signals.get("has_500"):
            if signals.get("student_compliance"):
                candidates.append("student_500_compliance_risk")
            if signals.get("status_risk"):
                candidates.append("500_expiry_or_extension")
            candidates.append("student_visa_general_triage")

        for candidate in candidates:
            if candidate in available_frame_ids:
                return candidate
        return None

    def _frame_family(self, frame_id: str | None, candidate_family: str | None) -> str:
        if candidate_family:
            if candidate_family == "unknown_visa_topic":
                return "triage"
            if candidate_family == "temporary_graduate_485":
                return "temporary_graduate_485"
            if candidate_family == "student_visa":
                return "student_500"
            return candidate_family

        frame = frame_id or ""
        if frame in self.TEMPORARY_FRAMES:
            return "triage"
        if frame.startswith("485_") or frame.startswith("485."):
            return "temporary_graduate_485"
        if frame.startswith("500_") or frame.startswith("student_"):
            return "student_500"
        if "bridging" in frame:
            return "bridging"
        if "condition" in frame:
            return "visa_condition"
        if "refusal" in frame or "review" in frame:
            return "refusal_review"
        return "unknown"

    def _unique(self, values: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for value in values:
            if value not in seen:
                seen.add(value)
                out.append(value)
        return out
