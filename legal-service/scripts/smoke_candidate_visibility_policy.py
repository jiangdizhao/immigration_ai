#!/usr/bin/env python3
from __future__ import annotations

from app.services.customer_answer_plan_service import CustomerAnswerPlanService
from app.services.schedule2_ranked_candidate_service import Schedule2RankedCandidateService


def main() -> None:
    ranked = Schedule2RankedCandidateService()
    removals = ranked._subclasses_requested_for_removal(
        {
            "coverage_audit": {
                "required_removals": [
                    "Remove Subclass 188 as a possible short-term work option.",
                    "Subclass 485 as a relevant option",
                ],
                "over_included_unrelated_options": [
                    "Permanent skilled visas such as 189/190/186",
                ],
            }
        }
    )
    expected = {"188", "485", "189", "190", "186"}
    missing = expected - removals
    if missing:
        raise SystemExit(f"Verifier removals were not parsed as binding subclass removals: {sorted(missing)}")

    plan = CustomerAnswerPlanService()
    audit = plan._coverage_audit(
        {
            "coverage_audit": {
                "missing_relevant_options": [
                    "The evidence package does not fully verify all visitor subclasses mentioned (600/601/651).",
                    "Subclass 407 Training",
                ],
                "required_removals": ["Subclass 188 as a possible short-term work option"],
            }
        }
    )
    if any("evidence package" in item.lower() for item in audit.get("missing_relevant_options", [])):
        raise SystemExit("Internal verifier diagnostic leaked into customer-facing coverage audit")

    coverage = plan._public_option_coverage_map(
        answer_scope_contract={"user_requested_scope": "all_possible_options", "breadth_required": "broad"},
        coverage_audit=audit,
        ranked_candidate_map=None,
    )
    flattened_subclasses = [code for item in coverage for code in item.get("subclasses", [])]
    if "188" in flattened_subclasses or any("evidence package" in str(item).lower() for item in coverage):
        raise SystemExit("Public option coverage map contains removed/fake verifier option")
    for required in ["400", "482", "407", "408", "403", "600", "601", "651", "417", "462"]:
        if required not in flattened_subclasses:
            raise SystemExit(f"Coverage floor is missing expected subclass {required}")

    print("OK: candidate visibility policy is installed")


if __name__ == "__main__":
    main()
