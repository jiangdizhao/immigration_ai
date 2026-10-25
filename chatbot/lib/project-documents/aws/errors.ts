export type ProjectDocumentAwsErrorCode =
  | "adapter_disabled"
  | "invalid_configuration"
  | "client_region_mismatch"
  | "invalid_object_key"
  | "invalid_object_identity"
  | "invalid_content_type"
  | "payload_too_large"
  | "checksum_mismatch"
  | "checksum_unverified"
  | "write_conflict"
  | "write_ambiguous"
  | "bucket_versioning_unavailable"
  | "missing_version_id"
  | "object_version_not_found"
  | "version_identity_mismatch"
  | "object_size_mismatch"
  | "encryption_mismatch"
  | "read_too_large"
  | "invalid_s3_response"
  | "region_mismatch"
  | "storage_unavailable"
  | "event_too_large"
  | "malformed_event"
  | "invalid_event_shape"
  | "unsupported_event_type"
  | "event_identity_mismatch"
  | "invalid_scan_status"
  | "invalid_object_key_in_event"
  | "invalid_scan_result_pair"
  | "delivery_context_required"
  | "delivery_untrusted"
  | "scan_not_completed"
  | "scan_target_not_found"
  | "scan_identity_mismatch"
  | "scan_target_not_active"
  | "scan_target_stale"
  | "stale_event"
  | "event_replay_conflict"
  | "event_already_processed";

export class ProjectDocumentAwsError extends Error {
  readonly code: ProjectDocumentAwsErrorCode;
  readonly writeMayHaveSucceeded: boolean;

  constructor(
    code: ProjectDocumentAwsErrorCode,
    options: { writeMayHaveSucceeded?: boolean } = {}
  ) {
    super(code);
    this.name = "ProjectDocumentAwsError";
    this.code = code;
    this.writeMayHaveSucceeded = options.writeMayHaveSucceeded === true;
  }
}
