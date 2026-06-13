#!/usr/bin/env bash
set -euo pipefail

# Export passive lawyer-review data as JSONL for offline analysis.
# This is not a full DB dump and should not be used as production restore data.

LEGAL_DB_URL="${LEGAL_DB_URL:-postgresql://immigration_local:local_phase1b_password@127.0.0.1:5433/immigration_legal}"
OUT_DIR="${OUT_DIR:-artifacts/phase1c/review_exports}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$OUT_DIR/review_data_${STAMP}.jsonl"

mkdir -p "$OUT_DIR"

echo "Exporting review data from: $LEGAL_DB_URL"

psql "$LEGAL_DB_URL" -At -v ON_ERROR_STOP=1 -c "
SELECT jsonb_build_object(
  'trace_id', t.id,
  'matter_id', t.matter_id,
  'session_id', t.session_id,
  'turn_index', t.turn_index,
  'issue_type', t.issue_type,
  'visa_type', t.visa_type,
  'operation_type', t.operation_type,
  'conversation_state', t.conversation_state,
  'confidence', t.confidence,
  'next_action', t.next_action,
  'escalate', t.escalate,
  'response_language', t.response_language,
  'review_status', t.review_status,
  'created_at', t.created_at,
  'user_message_preview', left(coalesce(t.user_message, ''), 1000),
  'assistant_answer_preview', left(coalesce(t.assistant_answer, ''), 2000),
  'reviews', coalesce(r.reviews, '[]'::jsonb)
)::text
FROM answer_traces t
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'review_id', ar.id,
    'rating', ar.rating,
    'severity', ar.severity,
    'error_categories', ar.error_categories,
    'review_status', ar.review_status,
    'should_create_eval_case', ar.should_create_eval_case,
    'should_create_lesson', ar.should_create_lesson,
    'should_create_patch_task', ar.should_create_patch_task,
    'lawyer_comment_preview', left(coalesce(ar.lawyer_comment, ''), 1000),
    'corrected_answer_preview', left(coalesce(ar.corrected_answer, ''), 1500),
    'lesson_candidate_preview', left(coalesce(ar.lesson_candidate, ''), 1000),
    'created_at', ar.created_at
  ) ORDER BY ar.created_at) AS reviews
  FROM answer_reviews ar
  WHERE ar.answer_trace_id = t.id
) r ON true
ORDER BY t.created_at DESC;
" > "$OUT_FILE"

printf 'Review export written to:\n  %s\n' "$OUT_FILE"
