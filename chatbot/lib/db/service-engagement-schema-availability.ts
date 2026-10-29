import "server-only";

import postgres from "postgres";

type ReadinessRow = {
  engagementTable: string | null;
  agreementTable: string | null;
  acceptanceTable: string | null;
  evidenceTable: string | null;
  grantTable: string | null;
  requiredColumns: number;
  requiredIndexes: number;
  requiredConstraints: number;
  requiredTriggers: number;
};

let catalogClient: ReturnType<typeof postgres> | null = null;

/**
 * Fail closed unless Migration 0043's complete M4-004 schema exists. Any missing
 * table, column, index, named constraint or guard trigger disables every M4-004
 * route without touching M4-002/M4-003 or customer Chat behavior.
 */
export async function serviceEngagementSchemaAvailable(): Promise<boolean> {
  const postgresUrl = process.env.POSTGRES_URL?.trim();
  if (!postgresUrl) {
    return false;
  }
  catalogClient ??= postgres(postgresUrl, {
    max: 1,
    idle_timeout: 20,
    connection: { TimeZone: "UTC" },
  });
  const rows = await catalogClient<ReadinessRow[]>`
    WITH expected_columns(table_name, column_name) AS (
      VALUES
        ('ServiceEngagement', 'id'), ('ServiceEngagement', 'projectId'),
        ('ServiceEngagement', 'customerOwnerUserId'), ('ServiceEngagement', 'serviceMode'),
        ('ServiceEngagement', 'scopeCodes'), ('ServiceEngagement', 'status'),
        ('ServiceEngagement', 'currentAgreementVersionId'), ('ServiceEngagement', 'revision'),
        ('ServiceEngagement', 'createdProjectRevision'), ('ServiceEngagement', 'lastProjectRevision'),
        ('ServiceEngagement', 'createdOperationRecordId'), ('ServiceEngagement', 'lastOperationRecordId'),
        ('ServiceEngagement', 'activatedProjectRevision'), ('ServiceEngagement', 'activatedAt'),
        ('ServiceEngagement', 'suspendedAt'), ('ServiceEngagement', 'terminatedAt'),
        ('ServiceEngagement', 'terminalReasonCode'), ('ServiceEngagement', 'createdAt'),
        ('ServiceEngagement', 'updatedAt'),
        ('ServiceAgreementVersion', 'id'), ('ServiceAgreementVersion', 'engagementId'),
        ('ServiceAgreementVersion', 'projectId'), ('ServiceAgreementVersion', 'versionNumber'),
        ('ServiceAgreementVersion', 'status'), ('ServiceAgreementVersion', 'termsSchemaVersion'),
        ('ServiceAgreementVersion', 'termsPayload'), ('ServiceAgreementVersion', 'termsSha256'),
        ('ServiceAgreementVersion', 'scopeCodes'), ('ServiceAgreementVersion', 'customerNoticeVersion'),
        ('ServiceAgreementVersion', 'customerNoticeSha256'), ('ServiceAgreementVersion', 'authoredByUserId'),
        ('ServiceAgreementVersion', 'authorityCode'), ('ServiceAgreementVersion', 'createdProjectRevision'),
        ('ServiceAgreementVersion', 'createdOperationRecordId'), ('ServiceAgreementVersion', 'issuedAt'),
        ('ServiceAgreementVersion', 'issuedProjectRevision'), ('ServiceAgreementVersion', 'issuedOperationRecordId'),
        ('ServiceAgreementVersion', 'supersedesAgreementVersionId'),
        ('ServiceAgreementVersion', 'supersededByAgreementVersionId'),
        ('ServiceAgreementVersion', 'supersededAt'),
        ('ServiceAgreementVersion', 'supersededOperationRecordId'),
        ('ServiceAgreementVersion', 'createdAt'),
        ('ServiceAgreementAcceptance', 'id'), ('ServiceAgreementAcceptance', 'engagementId'),
        ('ServiceAgreementAcceptance', 'projectId'), ('ServiceAgreementAcceptance', 'agreementVersionId'),
        ('ServiceAgreementAcceptance', 'termsSha256'), ('ServiceAgreementAcceptance', 'acceptedByUserId'),
        ('ServiceAgreementAcceptance', 'customerNoticeVersion'),
        ('ServiceAgreementAcceptance', 'customerNoticeSha256'),
        ('ServiceAgreementAcceptance', 'acceptedProjectRevision'), ('ServiceAgreementAcceptance', 'acceptedAt'),
        ('ServiceAgreementAcceptance', 'operationRecordId'),
        ('ServiceSignatureEvidence', 'id'), ('ServiceSignatureEvidence', 'engagementId'),
        ('ServiceSignatureEvidence', 'projectId'), ('ServiceSignatureEvidence', 'agreementVersionId'),
        ('ServiceSignatureEvidence', 'termsSha256'), ('ServiceSignatureEvidence', 'signerUserId'),
        ('ServiceSignatureEvidence', 'signerRole'), ('ServiceSignatureEvidence', 'evidenceRef'),
        ('ServiceSignatureEvidence', 'evidenceSha256'), ('ServiceSignatureEvidence', 'signaturePayloadSha256'),
        ('ServiceSignatureEvidence', 'declaredSignedAt'), ('ServiceSignatureEvidence', 'verificationStatus'),
        ('ServiceSignatureEvidence', 'verificationMethod'), ('ServiceSignatureEvidence', 'verificationProviderCode'),
        ('ServiceSignatureEvidence', 'verificationProvenance'), ('ServiceSignatureEvidence', 'submittedByUserId'),
        ('ServiceSignatureEvidence', 'submittedAt'), ('ServiceSignatureEvidence', 'submittedProjectRevision'),
        ('ServiceSignatureEvidence', 'submittedOperationRecordId'), ('ServiceSignatureEvidence', 'verifiedAt'),
        ('ServiceSignatureEvidence', 'verificationProjectRevision'),
        ('ServiceSignatureEvidence', 'verificationOperationRecordId'),
        ('ServiceSignatureEvidence', 'rejectionReasonCode'),
        ('ProjectResourceDisclosureGrant', 'id'), ('ProjectResourceDisclosureGrant', 'projectId'),
        ('ProjectResourceDisclosureGrant', 'resourceOwnerUserId'),
        ('ProjectResourceDisclosureGrant', 'recipientAssignmentId'),
        ('ProjectResourceDisclosureGrant', 'recipientUserId'),
        ('ProjectResourceDisclosureGrant', 'resourceCategory'),
        ('ProjectResourceDisclosureGrant', 'resourceId'),
        ('ProjectResourceDisclosureGrant', 'resourceVersion'),
        ('ProjectResourceDisclosureGrant', 'resourceFingerprint'),
        ('ProjectResourceDisclosureGrant', 'purposeCode'),
        ('ProjectResourceDisclosureGrant', 'noticeVersion'),
        ('ProjectResourceDisclosureGrant', 'noticeSha256'),
        ('ProjectResourceDisclosureGrant', 'status'),
        ('ProjectResourceDisclosureGrant', 'grantedByUserId'),
        ('ProjectResourceDisclosureGrant', 'grantedAt'),
        ('ProjectResourceDisclosureGrant', 'grantedProjectRevision'),
        ('ProjectResourceDisclosureGrant', 'createdOperationRecordId'),
        ('ProjectResourceDisclosureGrant', 'expiresAt'),
        ('ProjectResourceDisclosureGrant', 'revokedByUserId'),
        ('ProjectResourceDisclosureGrant', 'revokedAt'),
        ('ProjectResourceDisclosureGrant', 'revokedProjectRevision'),
        ('ProjectResourceDisclosureGrant', 'revokedOperationRecordId'),
        ('ProjectResourceDisclosureGrant', 'revocationReasonCode')
    )
    SELECT
      to_regclass('public."ServiceEngagement"')::text AS "engagementTable",
      to_regclass('public."ServiceAgreementVersion"')::text AS "agreementTable",
      to_regclass('public."ServiceAgreementAcceptance"')::text AS "acceptanceTable",
      to_regclass('public."ServiceSignatureEvidence"')::text AS "evidenceTable",
      to_regclass('public."ProjectResourceDisclosureGrant"')::text AS "grantTable",
      (SELECT count(*)::int FROM expected_columns expected
       JOIN information_schema.columns actual
         ON actual.table_schema = 'public'
        AND actual.table_name = expected.table_name
        AND actual.column_name = expected.column_name) AS "requiredColumns",
      (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
        'ServiceEngagement_id_project_unique', 'ServiceEngagement_id_project_owner_unique',
        'ServiceEngagement_project_live_unique', 'ServiceEngagement_project_status_idx',
        'ServiceAgreementVersion_number_unique', 'ServiceAgreementVersion_engagement_identity_unique',
        'ServiceAgreementVersion_id_engagement_unique',
        'ServiceAgreementVersion_hash_identity_unique', 'ServiceAgreementVersion_issued_unique',
        'ServiceAgreementVersion_engagement_status_idx',
        'ServiceAgreementAcceptance_version_unique', 'ServiceAgreementAcceptance_operation_unique',
        'ServiceSignatureEvidence_evidence_unique', 'ServiceSignatureEvidence_verified_version_unique',
        'ServiceSignatureEvidence_submitted_operation_unique',
        'ServiceSignatureEvidence_verification_operation_unique',
        'ServiceSignatureEvidence_engagement_status_idx',
        'ProjectResourceDisclosureGrant_id_project_unique',
        'ProjectResourceDisclosureGrant_live_unique',
        'ProjectResourceDisclosureGrant_created_operation_unique',
        'ProjectResourceDisclosureGrant_revoked_operation_unique',
        'ProjectResourceDisclosureGrant_recipient_status_idx',
        'ProjectResourceDisclosureGrant_owner_status_idx'
      )) AS "requiredIndexes",

      (SELECT count(*)::int FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace AND conname IN (
        'ServiceEngagement_mode_check', 'ServiceEngagement_scope_check',
        'ServiceEngagement_status_check', 'ServiceEngagement_revision_check',
        'ServiceEngagement_timestamps_check', 'ServiceEngagement_lifecycle_check',
        'ServiceAgreementVersion_status_check', 'ServiceAgreementVersion_version_check',
        'ServiceAgreementVersion_hash_check', 'ServiceAgreementVersion_terms_check',
        'ServiceAgreementVersion_scope_check', 'ServiceAgreementVersion_notice_check',
        'ServiceAgreementVersion_authority_check', 'ServiceAgreementVersion_lifecycle_check',
        'ServiceAgreementAcceptance_hash_check', 'ServiceAgreementAcceptance_notice_check',
        'ServiceAgreementAcceptance_revision_check',
        'ServiceSignatureEvidence_status_check', 'ServiceSignatureEvidence_signer_role_check',
        'ServiceSignatureEvidence_hash_check', 'ServiceSignatureEvidence_evidence_ref_check',
        'ServiceSignatureEvidence_method_check', 'ServiceSignatureEvidence_lifecycle_check',
        'ServiceSignatureEvidence_revision_check',
        'ProjectResourceDisclosureGrant_category_check', 'ProjectResourceDisclosureGrant_purpose_check',
        'ProjectResourceDisclosureGrant_status_check', 'ProjectResourceDisclosureGrant_hash_check',
        'ProjectResourceDisclosureGrant_notice_check',
        'ProjectResourceDisclosureGrant_fingerprint_check',
        'ProjectResourceDisclosureGrant_version_check',
        'ProjectResourceDisclosureGrant_owner_granted_by_check',
        'ProjectResourceDisclosureGrant_lifecycle_check',
        'ProjectEvent_service_engagement_subject_check',
        'ProjectOperation_type_check', 'ProjectOperation_result_kind_check',
        'ProjectOperation_actor_type_check'
      )) AS "requiredConstraints",
      (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal AND (
        (tgname = 'ServiceEngagement_guard' AND tgrelid = '"ServiceEngagement"'::regclass)
        OR (tgname = 'ServiceAgreementVersion_guard' AND tgrelid = '"ServiceAgreementVersion"'::regclass)
        OR (tgname = 'ServiceAgreementAcceptance_guard' AND tgrelid = '"ServiceAgreementAcceptance"'::regclass)
        OR (tgname = 'ServiceSignatureEvidence_guard' AND tgrelid = '"ServiceSignatureEvidence"'::regclass)
        OR (tgname = 'ProjectResourceDisclosureGrant_guard' AND tgrelid = '"ProjectResourceDisclosureGrant"'::regclass)
        OR (tgname = 'ServiceEngagementOperation_complete' AND tgrelid = '"ProjectOperation"'::regclass)
      )) AS "requiredTriggers"
  `;
  const row = rows[0];
  return Boolean(
    row?.engagementTable &&
      row.agreementTable &&
      row.acceptanceTable &&
      row.evidenceTable &&
      row.grantTable &&
      row.requiredColumns === 99 &&
      row.requiredIndexes === 23 &&
      row.requiredConstraints === 37 &&
      row.requiredTriggers === 6
  );
}

export async function closeServiceEngagementSchemaClient() {
  const client = catalogClient;
  catalogClient = null;
  if (client) {
    await client.end({ timeout: 5 });
  }
}
