CREATE TABLE IF NOT EXISTS phase8_learning_bridge_receipts (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    external_request_id varchar(255) NOT NULL,
    answer_trace_id varchar(255) NOT NULL,
    experience_record_id varchar(255),
    answer_review_id varchar(255),
    evaluation_artifact_id varchar(255),
    lesson_artifact_id varchar(255),
    status varchar(64) NOT NULL,
    last_error_code varchar(128),
    CONSTRAINT uq_phase8_learning_bridge_external_request UNIQUE (external_request_id)
);
CREATE INDEX IF NOT EXISTS ix_phase8_learning_bridge_receipts_external_request
    ON phase8_learning_bridge_receipts (external_request_id);
CREATE INDEX IF NOT EXISTS ix_phase8_learning_bridge_receipts_answer_trace
    ON phase8_learning_bridge_receipts (answer_trace_id);
CREATE INDEX IF NOT EXISTS ix_phase8_learning_bridge_receipts_status
    ON phase8_learning_bridge_receipts (status);
