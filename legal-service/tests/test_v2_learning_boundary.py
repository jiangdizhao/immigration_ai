from __future__ import annotations

from app.services.v2.verified_answer_service import QueryServiceV2


class _DatabaseMustNotBeRead:
    query_calls = 0

    def query(self, *_args, **_kwargs):
        self.query_calls += 1
        raise AssertionError("V2 lesson selection must not read learning/review stores")


def test_v2_lesson_selection_uses_only_static_seed_rules():
    database = _DatabaseMustNotBeRead()
    service = object.__new__(QueryServiceV2)

    lessons = service._lessons(database, "parent visa sponsor requirement")

    assert lessons
    assert database.query_calls == 0
    assert {lesson.source for lesson in lessons} == {"seed"}
    assert all(lesson.source != "review_artifact" for lesson in lessons)
    assert all("review_artifact" not in lesson.instruction for lesson in lessons)
