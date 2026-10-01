import {
  createSecurityReconciliationService,
  type ScannerVerdict,
  type SecurityRepository,
} from "./security-reconciliation";

const MAX_BODY_BYTES = 64 * 1024;
const OBJECT_PREFIX = "matter-documents/";
const MAX_STORAGE_KEY_LENGTH = 512;
const SCANNER_ID = "aws-guardduty-malware-protection";

const STATUS_VERDICTS: Readonly<Record<string, ScannerVerdict>> = {
  NO_THREATS_FOUND: "clean",
  THREATS_FOUND: "rejected",
  UNSUPPORTED: "failed",
  ACCESS_DENIED: "failed",
  FAILED: "failed",
};

export type GuardDutyEvent = {
  version: "0";
  id: string;
  time: string;
  resources: string[];
  source: "aws.guardduty";
  "detail-type": "GuardDuty Malware Protection Object Scan Result";
  account: string;
  region: string;
  detail: {
    schemaVersion: "1.0";
    resourceType: "S3_OBJECT";
    s3ObjectDetails: { bucketName: string; objectKey: string };
    scanResultDetails: { scanResultStatus: string };
  };
};

export type MalwareQueueConfig = {
  expectedAccountId: string;
  region: string;
  bucket: string;
};

export class MalwareMessageError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "MalwareMessageError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, maxLength = 1024): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.trim() === value
  );
}

export function validateGuardDutyEvent(
  body: string,
  config: MalwareQueueConfig
): GuardDutyEvent {
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    throw new MalwareMessageError("event_too_large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new MalwareMessageError("malformed_json");
  }
  if (!isRecord(parsed) || !isRecord(parsed.detail)) {
    throw new MalwareMessageError("invalid_event_shape");
  }
  const detail = parsed.detail;
  if (
    parsed.version !== "0" ||
    !nonEmptyString(parsed.time, 64) ||
    !Number.isFinite(Date.parse(parsed.time)) ||
    !Array.isArray(parsed.resources) ||
    parsed.resources.some((resource) => !nonEmptyString(resource, 2048)) ||
    parsed.source !== "aws.guardduty" ||
    parsed["detail-type"] !==
      "GuardDuty Malware Protection Object Scan Result" ||
    detail.schemaVersion !== "1.0" ||
    detail.resourceType !== "S3_OBJECT"
  ) {
    throw new MalwareMessageError("unsupported_event_type");
  }
  if (
    !nonEmptyString(parsed.id, 128) ||
    !/^[A-Za-z0-9._:-]+$/.test(parsed.id) ||
    !/^\d{12}$/.test(config.expectedAccountId) ||
    parsed.account !== config.expectedAccountId ||
    parsed.region !== config.region
  ) {
    throw new MalwareMessageError("event_identity_mismatch");
  }
  if (
    !isRecord(detail.s3ObjectDetails) ||
    !isRecord(detail.scanResultDetails) ||
    detail.s3ObjectDetails.bucketName !== config.bucket
  ) {
    throw new MalwareMessageError("invalid_s3_object_details");
  }
  const objectKey = detail.s3ObjectDetails.objectKey;
  if (
    !nonEmptyString(objectKey, MAX_STORAGE_KEY_LENGTH) ||
    !objectKey.startsWith(OBJECT_PREFIX) ||
    objectKey.length === OBJECT_PREFIX.length
  ) {
    throw new MalwareMessageError("invalid_object_key");
  }
  if (!nonEmptyString(detail.scanResultDetails.scanResultStatus, 64)) {
    throw new MalwareMessageError("invalid_scan_status");
  }
  if (
    !Object.hasOwn(STATUS_VERDICTS, detail.scanResultDetails.scanResultStatus)
  ) {
    throw new MalwareMessageError("unknown_scan_status");
  }
  return parsed as unknown as GuardDutyEvent;
}

export function mapGuardDutyStatus(status: string): ScannerVerdict {
  const verdict = STATUS_VERDICTS[status];
  if (!verdict) {
    throw new MalwareMessageError("unknown_scan_status");
  }
  return verdict;
}

export type MalwareDocumentLookup = {
  getByStorageKey(storageKey: string): Promise<{
    documentId: string;
    securityStatus: string;
  } | null>;
} & SecurityRepository;

export type QueueMessage = {
  messageId?: string;
  receiptHandle?: string;
  body?: string;
};

export type GuardDutyMessageOutcome = {
  eventId: string;
  documentId: string;
  verdict: ScannerVerdict;
  result: "reconciled" | "already_reconciled";
};

/** Process one validated event. The caller acknowledges only these safe outcomes. */
export async function reconcileGuardDutyQueueMessage(input: {
  message: QueueMessage;
  config: MalwareQueueConfig;
  repository: MalwareDocumentLookup;
}): Promise<GuardDutyMessageOutcome> {
  if (!input.message.body) {
    throw new MalwareMessageError("missing_message_body");
  }
  const event = validateGuardDutyEvent(input.message.body, input.config);
  const storageKey = event.detail.s3ObjectDetails.objectKey;
  const document = await input.repository.getByStorageKey(storageKey);
  if (!document) {
    throw new MalwareMessageError("document_not_found");
  }
  const verdict = mapGuardDutyStatus(
    event.detail.scanResultDetails.scanResultStatus
  );
  const reconciliation = createSecurityReconciliationService({
    repository: input.repository,
    scanner: {
      scan: async () => ({ verdict, scannerId: SCANNER_ID, scanId: event.id }),
    },
  });
  const result = await reconciliation.reconcileResult(document.documentId, {
    verdict,
    scannerId: SCANNER_ID,
    scanId: event.id,
  });
  if (
    result.result !== "reconciled" &&
    result.result !== "already_reconciled"
  ) {
    throw new MalwareMessageError(result.result);
  }
  return {
    eventId: event.id,
    documentId: document.documentId,
    verdict,
    result: result.result,
  };
}

export type SafeWorkerLog = (entry: {
  resultCode: string;
  eventId?: string;
  documentId?: string;
  verdict?: ScannerVerdict;
}) => void;

/** Delete only after reconciliation reaches the requested terminal verdict. */
export async function processGuardDutySqsMessage(input: {
  message: QueueMessage;
  config: MalwareQueueConfig;
  repository: MalwareDocumentLookup;
  deleteMessage(receiptHandle: string): Promise<void>;
  log: SafeWorkerLog;
}): Promise<GuardDutyMessageOutcome> {
  try {
    const outcome = await reconcileGuardDutyQueueMessage(input);
    if (!input.message.receiptHandle) {
      throw new MalwareMessageError("missing_receipt_handle");
    }
    await input.deleteMessage(input.message.receiptHandle);
    input.log({
      resultCode: outcome.result,
      eventId: outcome.eventId,
      documentId: outcome.documentId,
      verdict: outcome.verdict,
    });
    return outcome;
  } catch (error) {
    input.log({
      resultCode:
        error instanceof MalwareMessageError ? error.code : "processing_failed",
    });
    throw error;
  }
}
