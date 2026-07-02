#!/usr/bin/env bash
set -euo pipefail

cd ~/immigration_ai

export AWS_PROFILE=aulawyers-staging
export AWS_REGION=ap-southeast-2
export AWS_DEFAULT_REGION=ap-southeast-2
export AWS_ACCOUNT_ID=747452892291

OUT_DIR="artifacts/staging_review_export"
mkdir -p "$OUT_DIR"
mkdir -p ~/.aws/aulawyers

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
if [ "$ACCOUNT_ID" != "747452892291" ]; then
  echo "ERROR: Wrong AWS account. Expected 747452892291, got $ACCOUNT_ID"
  exit 1
fi

aws ssm get-parameter \
  --name /immigration-ai/staging/legal-service/database-url \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text > ~/.aws/aulawyers/staging_legal_database_url_from_ssm.txt

chmod 600 ~/.aws/aulawyers/staging_legal_database_url_from_ssm.txt

export LEGAL_DATABASE_URL="$(cat ~/.aws/aulawyers/staging_legal_database_url_from_ssm.txt)"
export LEGAL_PSQL_URL="$(python - <<'PY'
import os
url = os.environ["LEGAL_DATABASE_URL"]
print(url.replace("postgresql+psycopg://", "postgresql://", 1))
PY
)"

echo "Testing legal DB connection..."
psql "$LEGAL_PSQL_URL" -c "select current_database(), current_user;"

echo "Checking table counts..."
psql "$LEGAL_PSQL_URL" -c "
select 'answer_traces' as table_name, count(*) from answer_traces
union all
select 'answer_reviews', count(*) from answer_reviews
union all
select 'review_artifacts', count(*) from review_artifacts;
"

echo "Exporting CSV..."
psql "$LEGAL_PSQL_URL" -c "\copy (
select
  ar.id as review_id,
  ar.answer_trace_id,
  ar.matter_id,
  ar.reviewer_name,
  ar.reviewer_role,
  ar.rating,
  ar.severity,
  ar.error_categories,
  ar.lawyer_comment,
  ar.corrected_answer,
  ar.lesson_candidate,
  ar.should_create_eval_case,
  ar.should_create_lesson,
  ar.should_create_patch_task,
  ar.review_status,
  ar.created_at as review_created_at,
  ar.updated_at as review_updated_at,
  at.user_message,
  at.assistant_answer,
  at.response_language,
  at.confidence,
  at.next_action,
  at.escalate,
  at.user_display_mode,
  at.issue_type,
  at.visa_type,
  at.operation_type,
  at.conversation_state,
  at.created_at as answer_created_at
from answer_reviews ar
join answer_traces at on at.id = ar.answer_trace_id
order by ar.created_at desc
) to '$OUT_DIR/lawyer_reviews_with_traces.csv' with csv header"

echo "Exporting JSON..."
psql "$LEGAL_PSQL_URL" -t -A -c "
select coalesce(jsonb_pretty(jsonb_agg(to_jsonb(x))), '[]')
from (
  select
    ar.id as review_id,
    ar.answer_trace_id,
    ar.matter_id,
    ar.reviewer_name,
    ar.reviewer_role,
    ar.rating,
    ar.severity,
    ar.error_categories,
    ar.lawyer_comment,
    ar.corrected_answer,
    ar.lesson_candidate,
    ar.should_create_eval_case,
    ar.should_create_lesson,
    ar.should_create_patch_task,
    ar.review_status,
    ar.created_at as review_created_at,
    ar.updated_at as review_updated_at,
    at.user_message,
    at.assistant_answer,
    at.response_language,
    at.confidence,
    at.next_action,
    at.escalate,
    at.user_display_mode,
    at.issue_type,
    at.visa_type,
    at.operation_type,
    at.conversation_state,
    at.trace_json,
    at.created_at as answer_created_at
  from answer_reviews ar
  join answer_traces at on at.id = ar.answer_trace_id
  order by ar.created_at desc
) x;
" > "$OUT_DIR/lawyer_reviews_with_traces.json"

jq '
  map({
    review_id,
    matter_id,
    trace_id: .answer_trace_id,
    user_message,
    assistant_answer,
    rating,
    severity,
    error_categories,
    lawyer_comment,
    corrected_answer,
    lesson_candidate,
    should_create_eval_case,
    should_create_lesson,
    should_create_patch_task,
    review_created_at
  })
' "$OUT_DIR/lawyer_reviews_with_traces.json" \
  > "$OUT_DIR/lawyer_feedback_training_cases.json"

echo "Exporting review artifacts..."
psql "$LEGAL_PSQL_URL" -c "\copy (
select
  ra.id as artifact_id,
  ra.answer_review_id,
  ra.artifact_type,
  ra.artifact_payload,
  ra.artifact_status,
  ra.created_at,
  ra.updated_at
from review_artifacts ra
order by ra.created_at desc
) to '$OUT_DIR/review_artifacts.csv' with csv header"

echo "Done."
echo "CSV:  $OUT_DIR/lawyer_reviews_with_traces.csv"
echo "JSON: $OUT_DIR/lawyer_reviews_with_traces.json"
echo "CASES:$OUT_DIR/lawyer_feedback_training_cases.json"
echo
echo "Review count:"
jq length "$OUT_DIR/lawyer_feedback_training_cases.json"
echo
echo "Searching for test comment:"
grep -n "test comment" "$OUT_DIR/lawyer_reviews_with_traces.csv" || true
