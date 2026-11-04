import type { Student500Context } from "./contracts";

/**
 * Phase 13 M6 - official Home Affairs document-checklist integration.
 *
 * The Document Checklist Tool is applicant-specific: the authoritative result
 * depends on inputs this milestone does not always hold (passport country and
 * education provider). One example checklist is therefore never presented as a
 * universal official checklist.
 *
 * Integration levels, highest genuinely supported first:
 *   verified_official_result     - an actual official result was retrieved for the
 *                                  exact inputs (never produced in this delivery).
 *   official_link_out            - official tool identity is established and the
 *                                  customer is sent to it with the inputs required.
 *   customer_reported            - the customer pasted a checklist result; it is a
 *                                  customer statement, not an official retrieval.
 *   unavailable_manual_check     - no machine-readable interface exists.
 */

export const STUDENT_500_OFFICIAL_CHECKLIST_TOOL = {
  id: "home-affairs-document-checklist-tool",
  title: "Department of Home Affairs - Document Checklist Tool",
  url: "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool",
  requiresInputs: ["passport_country", "education_provider"] as const,
  /** No public machine-readable API is authorised for this tool. */
  machineReadableInterface: false,
} as const;

export type Student500OfficialChecklistStatus =
  | "verified_official_result"
  | "official_link_out"
  | "customer_reported"
  | "unavailable_manual_check";

export type Student500OfficialChecklistView = {
  readonly status: Student500OfficialChecklistStatus;
  readonly toolId: string;
  readonly toolTitle: string;
  readonly toolUrl: string;
  /** Inputs the tool needs before any result could be official for this matter. */
  readonly missingToolInputs: readonly (typeof STUDENT_500_OFFICIAL_CHECKLIST_TOOL.requiresInputs)[number][];
  readonly customerReportedResult: boolean;
  readonly retrievedAt: string | null;
  readonly note: string;
  readonly legalSourceVerification:
    | "verified_official_corpus"
    | "declared_pending_verification";
};

/**
 * Deterministic classification. It never upgrades a customer report into an
 * official result and never claims completeness without an applicable retrieval.
 */
export function resolveStudent500OfficialChecklist(input: {
  readonly context: Student500Context;
  readonly customerReportedResult: boolean;
}): Student500OfficialChecklistView {
  const missingToolInputs = [
    ...STUDENT_500_OFFICIAL_CHECKLIST_TOOL.requiresInputs,
  ];
  if (input.customerReportedResult) {
    return {
      customerReportedResult: true,
      legalSourceVerification: "declared_pending_verification",
      missingToolInputs,
      note: "A customer-supplied checklist result is recorded as customer information only. It is not an official retrieval and is not treated as verified.",
      retrievedAt: null,
      status: "customer_reported",
      toolId: STUDENT_500_OFFICIAL_CHECKLIST_TOOL.id,
      toolTitle: STUDENT_500_OFFICIAL_CHECKLIST_TOOL.title,
      toolUrl: STUDENT_500_OFFICIAL_CHECKLIST_TOOL.url,
    };
  }
  return {
    customerReportedResult: false,
    legalSourceVerification: "declared_pending_verification",
    missingToolInputs,
    note: "No official checklist result was retrieved. The official tool needs the applicant's passport country and education provider, and exposes no machine-readable interface, so the checklist stays incomplete and must be run by the customer or a reviewer.",
    retrievedAt: null,
    status: STUDENT_500_OFFICIAL_CHECKLIST_TOOL.machineReadableInterface
      ? "official_link_out"
      : "unavailable_manual_check",
    toolId: STUDENT_500_OFFICIAL_CHECKLIST_TOOL.id,
    toolTitle: STUDENT_500_OFFICIAL_CHECKLIST_TOOL.title,
    toolUrl: STUDENT_500_OFFICIAL_CHECKLIST_TOOL.url,
  };
}
