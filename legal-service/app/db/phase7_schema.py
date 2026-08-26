"""Narrow Phase 7.1 database safeguards."""

from sqlalchemy import text


APPEND_ONLY_FUNCTION = "phase7_experience_records_append_only"
APPEND_ONLY_TRIGGER = "trg_phase7_experience_records_append_only"


def ensure_phase7_1_append_only_trigger(bind) -> None:
    """Install only the ExperienceRecord append-only trigger, idempotently."""

    with bind.begin() as connection:
        connection.execute(text(f"""
            CREATE OR REPLACE FUNCTION public.{APPEND_ONLY_FUNCTION}()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            BEGIN
                RAISE EXCEPTION 'experience_records is append-only';
            END;
            $$;
        """))
        connection.execute(text(
            f"DROP TRIGGER IF EXISTS {APPEND_ONLY_TRIGGER} ON public.experience_records"
        ))
        connection.execute(text(f"""
            CREATE TRIGGER {APPEND_ONLY_TRIGGER}
            BEFORE UPDATE OR DELETE ON public.experience_records
            FOR EACH ROW EXECUTE FUNCTION public.{APPEND_ONLY_FUNCTION}()
        """))
