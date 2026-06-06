from __future__ import annotations

from app.schedule.schedule2_candidate_service import Schedule2CandidateSearchService

SCENARIOS = [
    ("Student 500 refusal", "我之前是485，后来申请500学生签证被拒了，说我不是真正的学生。"),
    ("Partner 820", "我人在悉尼，旅游签快到期了。我和澳洲 PR 结婚了，是不是可以申请820？"),
    ("BVA travel", "我在悉尼申请了820，现在拿着 Bridging Visa A。我想回国两周，可以直接走吗？"),
    ("485", "I am 36 and finished a master by coursework. Can I still apply for a 485 visa?"),
]


def main() -> None:
    service = Schedule2CandidateSearchService()
    for name, question in SCENARIOS:
        print(f"\n== {name} ==")
        for candidate in service.search(question=question, known_facts={}):
            print(f"{candidate.subclass:>4}  {candidate.confidence:<6}  {candidate.match_type:<16}  {candidate.reason}")


if __name__ == "__main__":
    main()
