from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import IntakeAnswer, Matter
from app.schemas.intake import IntakeAnswerIn, IntakeUpsertRequest


class IntakeService:
    def upsert_matter(self, db: Session, payload: IntakeUpsertRequest) -> tuple[Matter, bool, int]:
        created = False
        updated_answers = 0

        matter = None
        if payload.matter_id:
            matter = db.get(Matter, payload.matter_id)

        if matter is None and payload.session_id:
            matter = db.scalar(
                select(Matter)
                .where(Matter.session_id == payload.session_id)
                .order_by(Matter.created_at.desc())
            )

        if matter is None:
            matter = Matter(
                session_id=payload.session_id,
                client_display_name=payload.client_display_name,
                contact_email=payload.contact_email,
                issue_summary=payload.issue_summary,
                issue_type=payload.issue_type,
                visa_type=payload.visa_type,
                risk_level=payload.risk_level,
                metadata_json=payload.metadata_json,
                last_user_message_at=datetime.now(timezone.utc),
            )
            db.add(matter)
            db.flush()
            created = True
        else:
            matter.client_display_name = payload.client_display_name or matter.client_display_name
            matter.contact_email = payload.contact_email or matter.contact_email
            matter.issue_summary = payload.issue_summary or matter.issue_summary
            matter.issue_type = payload.issue_type or matter.issue_type
            matter.visa_type = payload.visa_type or matter.visa_type
            matter.risk_level = payload.risk_level or matter.risk_level
            matter.last_user_message_at = datetime.now(timezone.utc)
            matter.metadata_json = {**(matter.metadata_json or {}), **payload.metadata_json}

        for answer in payload.answers:
            updated_answers += self._upsert_answer(db, matter.id, answer)

        db.commit()

        matter = db.scalar(
            select(Matter)
            .options(selectinload(Matter.intake_answers))
            .where(Matter.id == matter.id)
        )
        assert matter is not None
        return matter, created, updated_answers

    def get_matter(self, db: Session, matter_id: str) -> Matter | None:
        return db.scalar(
            select(Matter)
            .options(selectinload(Matter.intake_answers))
            .where(Matter.id == matter_id)
        )

    def _upsert_answer(self, db: Session, matter_id: str, answer: IntakeAnswerIn) -> int:
        existing = db.scalar(
            select(IntakeAnswer).where(
                IntakeAnswer.matter_id == matter_id,
                IntakeAnswer.question_key == answer.question_key,
            )
        )
        if existing is None:
            db.add(
                IntakeAnswer(
                    matter_id=matter_id,
                    question_key=answer.question_key,
                    question_label=answer.question_label,
                    answer_text=answer.answer_text,
                    answer_json=answer.answer_json,
                    source=answer.source,
                )
            )
            return 1

        existing.question_label = answer.question_label or existing.question_label
        existing.answer_text = answer.answer_text
        existing.answer_json = answer.answer_json
        existing.source = answer.source
        return 1
