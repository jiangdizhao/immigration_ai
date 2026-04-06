from app.db.models import LegalSource, SourceChunk
from app.db.session import SessionLocal


SAMPLE_SOURCE_URL = "https://example.org/student-visa-refusal-guidance-mock-v2"


if __name__ == "__main__":
    db = SessionLocal()
    try:
        existing = db.query(LegalSource).filter(LegalSource.url == SAMPLE_SOURCE_URL).first()
        if existing:
            print("Sample source already exists.")
            raise SystemExit(0)

        source = LegalSource(
            title="Student visa refusal guidance - mock source",
            source_type="guidance",
            authority="Mock legal memo",
            jurisdiction="AU",
            citation_text="Mock student visa refusal guidance",
            url=SAMPLE_SOURCE_URL,
            metadata_json={
                "note": "sample only",
                "topic": "student visa refusal",
                "visa_type": "student",
            },
        )
        db.add(source)
        db.flush()

        chunks = [
            SourceChunk(
                source_id=source.id,
                chunk_index=0,
                section_ref="general",
                heading="Immediate steps after student visa refusal",
                text=(
                    "If a student visa application is refused, the applicant should keep the refusal notice, "
                    "record the exact decision date, and seek legal advice urgently. Whether review rights "
                    "exist can depend on the applicant's location, visa history, and the refusal grounds."
                ),
                token_count=39,
                metadata_json={
                    "topic": "student visa refusal",
                    "subtopic": "immediate steps",
                },
            ),
            SourceChunk(
                source_id=source.id,
                chunk_index=1,
                section_ref="documents",
                heading="Documents to prepare for consultation",
                text=(
                    "For an initial consultation about a student visa refusal, useful documents include the "
                    "refusal notice, passport, Confirmation of Enrolment, financial evidence, English-language "
                    "evidence, GTE-related materials, and prior correspondence with the Department."
                ),
                token_count=35,
                metadata_json={
                    "topic": "student visa refusal",
                    "subtopic": "consultation documents",
                },
            ),
            SourceChunk(
                source_id=source.id,
                chunk_index=2,
                section_ref="warning",
                heading="Need for follow-up facts",
                text=(
                    "General guidance alone is not enough to determine the next legal step. A lawyer usually "
                    "needs to know whether the applicant is onshore or offshore, the date of refusal, the visa "
                    "subclass, and the main refusal reasons before advising on review or re-application options."
                ),
                token_count=42,
                metadata_json={
                    "topic": "student visa refusal",
                    "subtopic": "missing facts",
                },
            ),
        ]

        db.add_all(chunks)
        db.commit()
        print("Seeded sample data for student visa refusal scenario.")
    finally:
        db.close()