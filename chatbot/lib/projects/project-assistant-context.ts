import type { ActiveStepContextV1 } from "@/lib/workspace/active-step-context";
import type {
  ProjectState,
  ProjectStateAdmission,
  ProjectStateProvenance,
  ProjectStateStudent500,
} from "@/lib/workspace/project-state";

/** A separately versioned, bounded view of the actor-authorized M1 projection. */
export const PROJECT_ASSISTANT_CONTEXT_MAX_BYTES = 23_800;
export const PROJECT_ASSISTANT_MAX_SCHOOL_APPLICATIONS = 12;
export const PROJECT_ASSISTANT_MAX_ADMISSIONS_CASES = 16;
export const PROJECT_ASSISTANT_MAX_STUDENT500_APPLICATIONS = 6;

type DetailSection =
  | "schoolApplications"
  | "standaloneAdmissions"
  | "unresolvedLinkedAdmissions"
  | "student500Applications"
  | "unresolvedIssues"
  | "nextActions";

type SchoolIndexEntry = {
  applicationId: string;
  projectOrdinal: number;
  institutionName: string;
  courseTitle: string;
  status: string;
  progress: string;
  sourceStatus: string;
  package: {
    status: string;
    usable: boolean;
    version: number;
    staleReasonCodes: string[];
  } | null;
  linkedAdmissionsCaseId: string | null;
  relatedStudent500ApplicationIds: string[];
  provenanceRevision: number;
};

type AdmissionIndexEntry = {
  caseId: string;
  originKind: ProjectStateAdmission["originKind"];
  linkedSchoolApplicationId: string | null;
  schoolApplicationLinkState: ProjectStateAdmission["schoolApplicationLinkState"];
  institutionName: string;
  courseTitle: string | null;
  intakeLabel: string | null;
  progress: string;
  preparationState: string;
  outcomes: Array<{
    kind: string;
    state: string;
    provenance: string;
    independentlyVerified: boolean;
    superseded: boolean;
    version: number;
  }>;
  sourceAvailability: "available";
  provenanceRevision: number;
};

type Student500IndexEntry = {
  applicationId: string;
  projectOrdinal: number;
  status: string;
  progress: string;
  coeStatus: string;
  schoolDependency: ProjectStateStudent500["schoolDependency"];
  sourceVerification: string;
  preparationState: ProjectStateStudent500["preparation"]["state"];
  latestDraftVersion: number | null;
  latestSnapshotVersion: number | null;
  sourceAvailability: "available";
  provenanceRevision: number;
};

type ProjectAssistantIndexes = {
  schoolApplications: SchoolIndexEntry[] | null;
  linkedAdmissions: AdmissionIndexEntry[] | null;
  standaloneAdmissions: AdmissionIndexEntry[] | null;
  unresolvedLinkedAdmissions: AdmissionIndexEntry[] | null;
  student500Applications: Student500IndexEntry[] | null;
};

export type ProjectAssistantContext = {
  schemaVersion: "phase15.project-assistant-context.v1";
  contextOrigin: "project_chat";
  availability: "available" | "unavailable";
  reasonCode: string | null;
  consistency: "live_per_source_revision" | "unknown";
  project: ProjectState["project"] | null;
  capabilities: ProjectState["capabilities"] | null;
  facts: ProjectState["facts"] | null;
  factContext: {
    state: "available" | "unavailable" | "unknown";
    omitted: number | null;
  };
  indexes: ProjectAssistantIndexes;
  matters: Record<
    Exclude<DetailSection, "unresolvedIssues" | "nextActions">,
    Record<string, unknown>[] | null
  >;
  unresolvedIssues: Record<string, unknown>[];
  nextActions: Record<string, unknown>[];
  /** One server-resolved task overlay; it never replaces whole-Project state. */
  activeStep: ActiveStepContextV1 | null;
  omissions: Record<DetailSection, number> & {
    linkedAdmissions: number;
    admissionsCases: number;
  };
};

function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function provenance(source: ProjectStateProvenance) {
  return {
    ...source,
    history: [],
    // The latest event is retained separately; history is explicitly omitted.
    historyTruncated: source.historyTruncated || source.history.length > 0,
  };
}

function admission(item: ProjectStateAdmission) {
  return {
    ...item,
    externalActions: item.externalActions.slice(-3),
    externalActionsOmitted: Math.max(0, item.externalActions.length - 3),
    provenance: provenance(item.provenance),
  };
}

function groupByTarget<T extends { targetKind: string; targetId: string }>(
  items: readonly T[],
  key: "issues" | "actions",
  detail: (item: T) => Record<string, unknown>
): Record<string, unknown>[] {
  const groups = new Map<
    string,
    { targetKind: string; targetId: string; [key: string]: unknown }
  >();
  for (const item of items) {
    const id = JSON.stringify([item.targetKind, item.targetId]);
    let group = groups.get(id);
    if (!group) {
      group = {
        targetKind: item.targetKind,
        targetId: item.targetId,
        [key]: [],
      };
      groups.set(id, group);
    }
    (group[key] as Record<string, unknown>[]).push(detail(item));
  }
  return [...groups.values()];
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim();
}

function containsExactIdentity(question: string, identity: string): boolean {
  const normalizedIdentity = normalize(identity);
  if (normalizedIdentity.length < 4) {
    return false;
  }
  // Names and course titles are phrase matched. IDs also require token
  // boundaries so `school-1` does not match `school-10`.
  if (/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(normalizedIdentity)) {
    const escaped = normalizedIdentity.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`,
      "u"
    ).test(question);
  }
  return question.includes(normalizedIdentity);
}

const ENGLISH_ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  "1st": 1,
  "2nd": 2,
  "3rd": 3,
  "4th": 4,
  "5th": 5,
  "6th": 6,
  "7th": 7,
  "8th": 8,
  "9th": 9,
  "10th": 10,
  "11th": 11,
  "12th": 12,
};

function chineseOrdinal(value: string): number | null {
  if (/^\d+$/u.test(value)) {
    return Number(value);
  }
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (value === "十") {
    return 10;
  }
  if (value.startsWith("十") && digits[value.slice(1)]) {
    return 10 + digits[value.slice(1)];
  }
  if (value.endsWith("十") && digits[value.slice(0, -1)]) {
    return digits[value.slice(0, -1)] * 10;
  }
  return digits[value] ?? null;
}

function schoolOrdinalMention(question: string): number | null {
  const normalizedQuestion = normalize(question);
  const english = normalizedQuestion.match(
    /\b(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|11th|12th)\s+(?:school|university|college)\b/u
  );
  if (english) {
    return ENGLISH_ORDINALS[english[1]] ?? null;
  }
  const englishNumber = normalizedQuestion.match(
    /\b(?:school|university|college)\s+(?:number\s+)?(\d{1,2})\b/u
  );
  if (englishNumber) {
    return Number(englishNumber[1]);
  }
  const chinese = normalizedQuestion.match(
    /第([一二两三四五六七八九十\d]{1,3})(?:所|个)?(?:学校|大学|院校)/u
  );
  return chinese ? chineseOrdinal(chinese[1]) : null;
}

function prioritize<T>(
  items: readonly T[],
  score: (item: T, index: number) => number
): T[] {
  return items
    .map((item, order) => ({ item, order, score: score(item, order) }))
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .map(({ item }) => item);
}

function compactAdmission(item: ProjectStateAdmission): AdmissionIndexEntry {
  return {
    caseId: item.caseId,
    originKind: item.originKind,
    linkedSchoolApplicationId: item.linkedSchoolApplicationId,
    schoolApplicationLinkState: item.schoolApplicationLinkState,
    institutionName: item.institutionName,
    courseTitle: item.courseTitle,
    intakeLabel: item.intakeLabel,
    progress: item.progress,
    preparationState: item.preparationState,
    outcomes: item.outcomes.map((outcome) => ({
      kind: outcome.kind,
      state: outcome.state,
      provenance: outcome.provenance,
      independentlyVerified: outcome.independentlyVerified,
      superseded: outcome.superseded,
      version: outcome.version,
    })),
    sourceAvailability: "available",
    provenanceRevision: item.provenance.revision,
  };
}

function compactStudent500(
  item: ProjectStateStudent500,
  projectOrdinal: number
): Student500IndexEntry {
  return {
    applicationId: item.applicationId,
    projectOrdinal,
    status: item.status,
    progress: item.progress,
    coeStatus: item.coeStatus,
    schoolDependency: item.schoolDependency,
    sourceVerification: item.sourceVerification,
    preparationState: item.preparation.state,
    latestDraftVersion:
      item.preparation.drafts.reduce<number | null>(
        (latest, draft) => Math.max(latest ?? draft.version, draft.version),
        null
      ) ?? null,
    latestSnapshotVersion:
      item.preparation.snapshots.reduce<number | null>(
        (latest, snapshot) =>
          Math.max(latest ?? snapshot.version, snapshot.version),
        null
      ) ?? null,
    sourceAvailability: "available",
    provenanceRevision: item.provenance.revision,
  };
}

function unavailableContext(reasonCode: string): ProjectAssistantContext {
  return {
    schemaVersion: "phase15.project-assistant-context.v1",
    contextOrigin: "project_chat",
    availability: "unavailable",
    reasonCode,
    consistency: "unknown",
    project: null,
    capabilities: null,
    facts: null,
    factContext: { state: "unknown", omitted: null },
    indexes: {
      schoolApplications: null,
      linkedAdmissions: null,
      standaloneAdmissions: null,
      unresolvedLinkedAdmissions: null,
      student500Applications: null,
    },
    matters: {
      schoolApplications: null,
      standaloneAdmissions: null,
      unresolvedLinkedAdmissions: null,
      student500Applications: null,
    },
    unresolvedIssues: [],
    nextActions: [],
    activeStep: null,
    omissions: {
      schoolApplications: 0,
      standaloneAdmissions: 0,
      unresolvedLinkedAdmissions: 0,
      student500Applications: 0,
      linkedAdmissions: 0,
      unresolvedIssues: 0,
      nextActions: 0,
      admissionsCases: 0,
    },
  };
}

/**
 * Builds a bounded Project overview. Compact indexes are complete; detail
 * records are selected by explicit identifiers and remain separately counted.
 */
export function buildProjectAssistantContext(
  state: ProjectState | null,
  reasonCode = "project_state_unavailable",
  question = "",
  maxBytes = PROJECT_ASSISTANT_CONTEXT_MAX_BYTES
): ProjectAssistantContext {
  if (!state) {
    return unavailableContext(reasonCode);
  }

  const allSchools = state.matters.schoolApplications;
  const allStandaloneAdmissions = state.matters.standaloneAdmissions;
  const allUnresolvedAdmissions = state.matters.unresolvedLinkedAdmissions;
  const allStudent500 = state.matters.student500Applications;
  const schoolRows = allSchools ?? [];
  const standaloneRows = allStandaloneAdmissions ?? [];
  const unresolvedAdmissionRows = allUnresolvedAdmissions ?? [];
  const studentRows = allStudent500 ?? [];
  if (
    schoolRows.length > PROJECT_ASSISTANT_MAX_SCHOOL_APPLICATIONS ||
    standaloneRows.length + unresolvedAdmissionRows.length >
      PROJECT_ASSISTANT_MAX_ADMISSIONS_CASES ||
    studentRows.length > PROJECT_ASSISTANT_MAX_STUDENT500_APPLICATIONS
  ) {
    return unavailableContext("project_matter_index_exceeds_m1_record_limit");
  }

  const allAdmissions = new Map<string, ProjectStateAdmission>();
  for (const school of schoolRows) {
    if (school.linkedAdmissionsCase) {
      if (allAdmissions.has(school.linkedAdmissionsCase.caseId)) {
        return unavailableContext("project_duplicate_admission_index_identity");
      }
      allAdmissions.set(
        school.linkedAdmissionsCase.caseId,
        school.linkedAdmissionsCase
      );
    }
  }
  for (const item of [...standaloneRows, ...unresolvedAdmissionRows]) {
    if (allAdmissions.has(item.caseId)) {
      return unavailableContext("project_duplicate_admission_index_identity");
    }
    allAdmissions.set(item.caseId, item);
  }
  if (allAdmissions.size > PROJECT_ASSISTANT_MAX_ADMISSIONS_CASES) {
    return unavailableContext("project_matter_index_exceeds_m1_record_limit");
  }

  const admissionsBySchool = new Map<string, string[]>();
  for (const item of allAdmissions.values()) {
    if (
      item.schoolApplicationLinkState === "available" &&
      item.linkedSchoolApplicationId
    ) {
      const existing =
        admissionsBySchool.get(item.linkedSchoolApplicationId) ?? [];
      existing.push(item.caseId);
      admissionsBySchool.set(item.linkedSchoolApplicationId, existing);
    }
  }
  const student500BySchool = new Map<string, string[]>();
  for (const item of studentRows) {
    if (item.schoolDependency.state === "linked") {
      let schoolApplicationId: string | null = null;
      if ("schoolApplicationId" in item.schoolDependency) {
        schoolApplicationId = item.schoolDependency.schoolApplicationId;
      } else if ("admissionCaseId" in item.schoolDependency) {
        const admissionCase = allAdmissions.get(
          item.schoolDependency.admissionCaseId
        );
        if (admissionCase?.schoolApplicationLinkState === "available") {
          schoolApplicationId = admissionCase.linkedSchoolApplicationId;
        }
      }
      if (schoolApplicationId) {
        const existing = student500BySchool.get(schoolApplicationId) ?? [];
        existing.push(item.applicationId);
        student500BySchool.set(schoolApplicationId, existing);
      }
    }
  }

  const schoolIndexes: SchoolIndexEntry[] | null = allSchools
    ? schoolRows.map((item, index) => ({
        applicationId: item.applicationId,
        projectOrdinal: index + 1,
        institutionName: item.institution.name,
        courseTitle: item.course.title,
        status: item.status,
        progress: item.progress,
        sourceStatus: item.source.status,
        package: item.package
          ? {
              status: item.package.status,
              usable: item.package.usable,
              version: item.package.version,
              staleReasonCodes: [...item.package.staleReasonCodes],
            }
          : null,
        linkedAdmissionsCaseId:
          item.linkedAdmissionsCase?.caseId ??
          admissionsBySchool.get(item.applicationId)?.[0] ??
          null,
        relatedStudent500ApplicationIds: [
          ...(student500BySchool.get(item.applicationId) ?? []),
        ],
        provenanceRevision: item.provenance.revision,
      }))
    : null;
  const standaloneAdmissionIndexes: AdmissionIndexEntry[] | null =
    allStandaloneAdmissions ? standaloneRows.map(compactAdmission) : null;
  const linkedAdmissionIndexes: AdmissionIndexEntry[] | null = allSchools
    ? schoolRows.flatMap((item) =>
        item.linkedAdmissionsCase
          ? [compactAdmission(item.linkedAdmissionsCase)]
          : []
      )
    : null;
  const unresolvedAdmissionIndexes: AdmissionIndexEntry[] | null =
    allUnresolvedAdmissions
      ? unresolvedAdmissionRows.map(compactAdmission)
      : null;
  const studentIndexes: Student500IndexEntry[] | null = allStudent500
    ? studentRows.map(compactStudent500)
    : null;

  const packet: ProjectAssistantContext = {
    schemaVersion: "phase15.project-assistant-context.v1",
    contextOrigin: "project_chat",
    availability: "available",
    reasonCode: null,
    consistency: state.consistency,
    project: state.project,
    capabilities: state.capabilities,
    facts: state.facts,
    factContext: { state: "unknown", omitted: null },
    indexes: {
      schoolApplications: schoolIndexes,
      linkedAdmissions: linkedAdmissionIndexes,
      standaloneAdmissions: standaloneAdmissionIndexes,
      unresolvedLinkedAdmissions: unresolvedAdmissionIndexes,
      student500Applications: studentIndexes,
    },
    matters: {
      schoolApplications: allSchools ? [] : null,
      standaloneAdmissions: allStandaloneAdmissions ? [] : null,
      unresolvedLinkedAdmissions: allUnresolvedAdmissions ? [] : null,
      student500Applications: allStudent500 ? [] : null,
    },
    unresolvedIssues: [],
    nextActions: [],
    activeStep: null,
    omissions: {
      schoolApplications: schoolRows.length,
      standaloneAdmissions: standaloneRows.length,
      unresolvedLinkedAdmissions: unresolvedAdmissionRows.length,
      student500Applications: studentRows.length,
      unresolvedIssues: 0,
      nextActions: 0,
      linkedAdmissions: linkedAdmissionIndexes?.length ?? 0,
      admissionsCases: allAdmissions.size,
    },
  };

  // The index is the completeness contract. If it cannot fit, no partial
  // application overview is sent to the model as if it were complete.
  if (bytes(packet) > maxBytes) {
    return unavailableContext("project_matter_index_exceeds_context_bound");
  }

  const normalizedQuestion = normalize(question);
  const schoolOrdinal = schoolOrdinalMention(normalizedQuestion);
  const prioritizedSchools = schoolRows.map((item, index) => ({
    ...item,
    projectOrdinal: index + 1,
  }));
  const selectedSchoolIds = new Set(
    prioritizedSchools
      .filter((item) => {
        const explicitIdentity = [
          item.applicationId,
          item.institution.name,
          item.course.title,
        ].some((label) => containsExactIdentity(normalizedQuestion, label));
        return explicitIdentity || item.projectOrdinal === schoolOrdinal;
      })
      .map((item) => item.applicationId)
  );
  const selectedAdmissionIds = new Set(
    [...allAdmissions.values()]
      .filter(
        (item) =>
          selectedSchoolIds.has(item.linkedSchoolApplicationId ?? "") ||
          [item.caseId, item.institutionName, item.courseTitle ?? ""].some(
            (label) => containsExactIdentity(normalizedQuestion, label)
          )
      )
      .map((item) => item.caseId)
  );
  const selectedStudentIds = new Set(
    studentRows
      .filter((item) => {
        const dependencyIds =
          item.schoolDependency.state === "linked"
            ? [
                "schoolApplicationId" in item.schoolDependency
                  ? item.schoolDependency.schoolApplicationId
                  : "",
                "admissionCaseId" in item.schoolDependency
                  ? item.schoolDependency.admissionCaseId
                  : "",
              ]
            : [];
        return (
          containsExactIdentity(normalizedQuestion, item.applicationId) ||
          dependencyIds.some(
            (id) => selectedSchoolIds.has(id) || selectedAdmissionIds.has(id)
          )
        );
      })
      .map((item) => item.applicationId)
  );
  const selectedTargetIds = new Set([
    ...selectedSchoolIds,
    ...selectedAdmissionIds,
    ...selectedStudentIds,
  ]);
  const schoolScore = (item: (typeof prioritizedSchools)[number]) =>
    selectedSchoolIds.has(item.applicationId) ? 1 : 0;
  const admissionScore = (item: ProjectStateAdmission) =>
    selectedAdmissionIds.has(item.caseId) ? 1 : 0;
  const studentScore = (item: ProjectStateStudent500) =>
    selectedStudentIds.has(item.applicationId) ? 1 : 0;

  const sections: Record<DetailSection, Record<string, unknown>[]> = {
    schoolApplications: prioritize(prioritizedSchools, schoolScore).map(
      (item) => ({
        ...item,
        package: item.package
          ? {
              packageId: item.package.packageId,
              version: item.package.version,
              status: item.package.status,
              usable: item.package.usable,
              staleReasonCodes: item.package.staleReasonCodes,
            }
          : null,
        linkedAdmissionsCase: item.linkedAdmissionsCase
          ? admission(item.linkedAdmissionsCase)
          : null,
        provenance: provenance(item.provenance),
      })
    ),
    standaloneAdmissions: prioritize(standaloneRows, admissionScore).map(
      admission
    ),
    unresolvedLinkedAdmissions: prioritize(
      unresolvedAdmissionRows,
      admissionScore
    ).map(admission),
    student500Applications: prioritize(studentRows, studentScore).map(
      (item) => ({
        ...item,
        preparation: {
          ...item.preparation,
          drafts: [...item.preparation.drafts]
            .sort((a, b) => b.version - a.version)
            .slice(0, 2),
          draftsOmitted: Math.max(0, item.preparation.drafts.length - 2),
          snapshots: [...item.preparation.snapshots]
            .sort((a, b) => b.version - a.version)
            .slice(0, 2),
          snapshotsOmitted: Math.max(0, item.preparation.snapshots.length - 2),
        },
        provenance: provenance(item.provenance),
      })
    ),
    unresolvedIssues: prioritize(
      groupByTarget(state.unresolvedIssues, "issues", (item) => ({
        code: item.code,
        sourceRevision: item.provenance?.revision ?? null,
      })),
      (item) => (selectedTargetIds.has(String(item.targetId)) ? 1 : 0)
    ),
    nextActions: prioritize(
      groupByTarget(state.nextActions, "actions", (item) => ({
        code: item.code,
        reasonCode: item.reasonCode,
        responsibleActor: item.responsibleActor,
        actionability: item.actionability,
      })),
      (item) => (selectedTargetIds.has(String(item.targetId)) ? 1 : 0)
    ),
  };

  const detailOrder: DetailSection[] = [
    "schoolApplications",
    "standaloneAdmissions",
    "unresolvedLinkedAdmissions",
    "student500Applications",
    "unresolvedIssues",
    "nextActions",
  ];
  for (const key of detailOrder) {
    packet.omissions[key] = sections[key].length;
  }

  // Round robin preserves category coverage while the compact index retains
  // every authorized identity. Details that do not fit remain explicitly counted.
  for (let i = 0; detailOrder.some((key) => i < sections[key].length); i += 1) {
    for (const key of detailOrder) {
      const item = sections[key][i];
      if (!item) {
        continue;
      }
      const target =
        key === "unresolvedIssues" || key === "nextActions"
          ? packet[key]
          : packet.matters[key];
      if (!target || target.length >= 128) {
        continue;
      }
      target.push(item);
      packet.omissions[key] -= 1;
      if (bytes(packet) > maxBytes) {
        target.pop();
        packet.omissions[key] += 1;
      }
    }
  }

  const includedAdmissionIds = new Set<string>();
  for (const item of packet.matters.schoolApplications ?? []) {
    const linked = item.linkedAdmissionsCase;
    if (linked && typeof linked === "object" && "caseId" in linked) {
      includedAdmissionIds.add(String(linked.caseId));
    }
  }
  for (const category of [
    packet.matters.standaloneAdmissions,
    packet.matters.unresolvedLinkedAdmissions,
  ]) {
    for (const item of category ?? []) {
      if (typeof item.caseId === "string") {
        includedAdmissionIds.add(item.caseId);
      }
    }
  }
  packet.omissions.admissionsCases = Math.max(
    0,
    allAdmissions.size - includedAdmissionIds.size
  );
  const includedLinkedAdmissionIds = new Set<string>();
  for (const item of packet.matters.schoolApplications ?? []) {
    const linked = item.linkedAdmissionsCase;
    if (linked && typeof linked === "object" && "caseId" in linked) {
      includedLinkedAdmissionIds.add(String(linked.caseId));
    }
  }
  packet.omissions.linkedAdmissions = Math.max(
    0,
    (linkedAdmissionIndexes?.length ?? 0) - includedLinkedAdmissionIds.size
  );

  return packet;
}
