import { createHash } from "node:crypto";
import {
  PROJECT_REQUIREMENT_FAMILIES,
  type ProjectRequirementApplicability,
  type ProjectRequirementCollectionState,
  type ProjectRequirementFamily,
} from "@/lib/db/schema";

export type RequirementItem = {
  key: string;
  label: string;
  kind: "fact" | "evidence";
};

export type FactRequirementLocator = {
  projectId: string;
  assertionId: string;
  version: number;
};
export type EvidenceRequirementLocator = {
  projectId: string;
  evidenceRef: string;
  version: number;
};
export type RequirementLocator =
  | FactRequirementLocator
  | EvidenceRequirementLocator;

export const PROVISIONAL_REQUIREMENT_CATALOG: ReadonlyArray<{
  family: ProjectRequirementFamily;
  templateKey: string;
  schemaVersion: string;
  items: readonly RequirementItem[];
  sourceProvenance: {
    sourceIdentity: null;
    observedAt: null;
    effectiveAt: null;
    note: "Synthetic provisional placeholder; not an official checklist.";
  };
}> = [
  {
    family: "school_facts",
    templateKey: "school-facts-provisional",
    schemaVersion: "provisional-v1",
    items: [
      {
        key: "school_identity_detail",
        label: "School identity detail",
        kind: "fact",
      },
    ],
    sourceProvenance: {
      sourceIdentity: null,
      observedAt: null,
      effectiveAt: null,
      note: "Synthetic provisional placeholder; not an official checklist.",
    },
  },
  {
    family: "school_evidence",
    templateKey: "school-evidence-provisional",
    schemaVersion: "provisional-v1",
    items: [
      {
        key: "education_supporting_document",
        label: "Education supporting document",
        kind: "evidence",
      },
    ],
    sourceProvenance: {
      sourceIdentity: null,
      observedAt: null,
      effectiveAt: null,
      note: "Synthetic provisional placeholder; not an official checklist.",
    },
  },
  {
    family: "student500_facts",
    templateKey: "student500-facts-provisional",
    schemaVersion: "provisional-v1",
    items: [
      {
        key: "visa_background_detail",
        label: "Visa background detail",
        kind: "fact",
      },
    ],
    sourceProvenance: {
      sourceIdentity: null,
      observedAt: null,
      effectiveAt: null,
      note: "Synthetic provisional placeholder; not an official checklist.",
    },
  },
  {
    family: "student500_evidence",
    templateKey: "student500-evidence-provisional",
    schemaVersion: "provisional-v1",
    items: [
      {
        key: "visa_evidence_item",
        label: "Visa evidence item",
        kind: "evidence",
      },
    ],
    sourceProvenance: {
      sourceIdentity: null,
      observedAt: null,
      effectiveAt: null,
      note: "Synthetic provisional placeholder; not an official checklist.",
    },
  },
];

export type RequirementStateInput = {
  family: ProjectRequirementFamily;
  templateKey: string;
  templateVersionId: string;
  itemKey: string;
  applicability: ProjectRequirementApplicability;
  collectionState: ProjectRequirementCollectionState;
  factLocator: FactRequirementLocator | null;
  evidenceLocator: EvidenceRequirementLocator | null;
};

export function canonicalRequirementJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalRequirementJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${canonicalRequirementJson(record[key])}`
    )
    .join(",")}}`;
}

export function hashRequirementTemplateContent(input: {
  schemaVersion: string;
  items: readonly RequirementItem[];
  sourceProvenance: unknown;
}): string {
  return createHash("sha256")
    .update(canonicalRequirementJson(input), "utf8")
    .digest("hex");
}

export function validateRequirementStateShape(input: RequirementStateInput) {
  if (!PROJECT_REQUIREMENT_FAMILIES.includes(input.family)) {
    throw new TypeError("invalid_requirement_family");
  }
  if (!input.templateKey.trim() || !input.itemKey.trim()) {
    throw new TypeError("invalid_requirement_key");
  }
  if (
    input.factLocator &&
    (!input.factLocator.projectId ||
      !input.factLocator.assertionId.trim() ||
      !Number.isSafeInteger(input.factLocator.version) ||
      input.factLocator.version < 1)
  ) {
    throw new TypeError("invalid_fact_locator");
  }
  if (
    input.evidenceLocator &&
    (!input.evidenceLocator.projectId ||
      !input.evidenceLocator.evidenceRef.trim() ||
      !Number.isSafeInteger(input.evidenceLocator.version) ||
      input.evidenceLocator.version < 1)
  ) {
    throw new TypeError("invalid_evidence_locator");
  }
}

export function locatorBelongsToProject(
  locator: RequirementLocator | null,
  projectId: string
): boolean {
  return locator === null || locator.projectId === projectId;
}

export function redactUnauthorizedRequirementLocators(input: {
  factLocator: FactRequirementLocator | null;
  evidenceLocator: EvidenceRequirementLocator | null;
  canReadFact: boolean;
  canReadEvidence: boolean;
}) {
  return {
    factLocator: input.canReadFact ? input.factLocator : null,
    evidenceLocator: input.canReadEvidence ? input.evidenceLocator : null,
  };
}
