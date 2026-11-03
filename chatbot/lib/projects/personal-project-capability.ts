import { projectChatWritesEnabled } from "./chat-policy";

/**
 * Phase 13 P1 personal-Project capability policy.
 *
 * Personal Project ownership is derived exclusively from the server-authenticated
 * session. Every website identity — guest session, registered Free/VIP customer,
 * lawyer, administrator — may create and manage its *own* Project.
 *
 * The capability deliberately carries `professionalAuthority: false`. Owning a
 * personal Project never grants staff assignment, customer-data access, payment,
 * signature, managed-submission or external-provider authority. Those remain
 * governed by their own independent, fail-closed rules.
 */

export type PersonalProjectSessionType = "guest" | "regular";
export type PersonalProjectUserRole = "user" | "lawyer" | "admin";
export type ProjectFoundationSchemaState =
  | "absent"
  | "partial"
  | "ready"
  | "unknown";

/** What the Project entry panel may render and offer. */
export type ProjectEntryAvailability = "available" | "disabled" | "unavailable";

export type PersonalProjectEntryState =
  | "signed_out"
  | "available"
  | "disabled"
  | "unavailable";

export type PersonalProjectUnavailableReason =
  | "signed_out"
  | "project_writes_disabled"
  | "schema_absent"
  | "schema_partial"
  | "schema_probe_failed";

export type PersonalProjectCapability = {
  readonly state: PersonalProjectEntryState;
  /** Presentation state for the Project entry panel. */
  readonly availability: ProjectEntryAvailability;
  readonly reason: PersonalProjectUnavailableReason | null;
  /** Interactive Create Project / Project Chat controls are allowed. */
  readonly canCreateProject: boolean;
  readonly canWriteProjectChats: boolean;
  /** Never true: personal ownership is not professional/admin authority. */
  readonly professionalAuthority: false;
  /** Guest Projects are session-scoped and not transferable yet. */
  readonly temporaryGuestProject: boolean;
  /**
   * M5.1/M5.2 school preparation binds M2 document/fact references and stays
   * restricted to registered personal accounts by the accepted M5 authority
   * contract. Guests and staff receive a truthful restricted state instead.
   */
  readonly schoolPreparationEligible: boolean;
};

/**
 * M5 preparation availability derived from the Project capability.
 *
 * Correction C: `PHASE13_PROJECT_CHAT_ENABLED=false` is a Project-wide emergency
 * disable. Because M5 school preparation is Project-scoped, it must be switched
 * off with the same policy — a direct HTTP mutation cannot bypass it, and the UI
 * never implies preparation writes are available.
 */
export type SchoolPreparationAvailability = {
  readonly applicationsEnabled: boolean;
  readonly admissionsEnabled: boolean;
  /** M5 is configured on but this identity may not use it yet. */
  readonly restricted: boolean;
};

export function resolveSchoolPreparationAvailability(input: {
  readonly project: Pick<
    PersonalProjectCapability,
    "availability" | "schoolPreparationEligible"
  >;
  readonly applicationsEnabled: boolean;
  readonly admissionsEnabled: boolean;
}): SchoolPreparationAvailability {
  const projectWritesAvailable = input.project.availability === "available";
  const eligible =
    projectWritesAvailable && input.project.schoolPreparationEligible;
  const applicationsEnabled = eligible && input.applicationsEnabled;
  return {
    admissionsEnabled: applicationsEnabled && input.admissionsEnabled,
    applicationsEnabled,
    restricted:
      projectWritesAvailable &&
      !input.project.schoolPreparationEligible &&
      (input.applicationsEnabled || input.admissionsEnabled),
  };
}

/**
 * Phase 13 M6.1 Student 500 preparation availability.
 *
 * Same authority contract as M5 school preparation: the capability is only
 * offered when the Project itself is writable AND the identity is a registered
 * personal account. Guests and staff receive a truthful restricted state, and the
 * HTTP/service layers re-check capability, schema and authority on every request.
 */
export type Student500Availability = {
  readonly enabled: boolean;
  /** Configured on, but this identity may not use it yet. */
  readonly restricted: boolean;
};

export function resolveStudent500Availability(input: {
  readonly project: Pick<
    PersonalProjectCapability,
    "availability" | "schoolPreparationEligible"
  >;
  readonly student500Enabled: boolean;
}): Student500Availability {
  const projectWritesAvailable = input.project.availability === "available";
  const eligible =
    projectWritesAvailable && input.project.schoolPreparationEligible;
  return {
    enabled: eligible && input.student500Enabled,
    restricted:
      projectWritesAvailable &&
      !input.project.schoolPreparationEligible &&
      input.student500Enabled,
  };
}

/**
 * Deterministic capability resolution. No LLM, no client-supplied identity and
 * no database call: callers pass the server session projection plus the schema
 * probe outcome.
 */
export function resolvePersonalProjectCapability(input: {
  readonly sessionType?: PersonalProjectSessionType | null;
  readonly userId?: string | null;
  readonly role?: PersonalProjectUserRole | string | null;
  readonly writesEnabled?: boolean;
  readonly schemaStatus?: ProjectFoundationSchemaState;
}): PersonalProjectCapability {
  const hasSession = Boolean(input.sessionType && input.userId);
  const guest = input.sessionType === "guest";
  const staff = !guest && input.role !== undefined && input.role !== "user";
  const writesEnabled = input.writesEnabled ?? projectChatWritesEnabled();
  const schemaStatus: ProjectFoundationSchemaState =
    input.schemaStatus ?? "unknown";

  const base = {
    professionalAuthority: false as const,
    temporaryGuestProject: guest && hasSession,
    schoolPreparationEligible: false,
  };

  if (!hasSession) {
    return {
      ...base,
      availability: "unavailable",
      canCreateProject: false,
      canWriteProjectChats: false,
      reason: "signed_out",
      state: "signed_out",
    };
  }

  if (!writesEnabled) {
    return {
      ...base,
      availability: "disabled",
      canCreateProject: false,
      canWriteProjectChats: false,
      reason: "project_writes_disabled",
      state: "disabled",
    };
  }

  if (schemaStatus !== "ready") {
    return {
      ...base,
      availability: "unavailable",
      canCreateProject: false,
      canWriteProjectChats: false,
      reason:
        schemaStatus === "absent"
          ? "schema_absent"
          : schemaStatus === "partial"
            ? "schema_partial"
            : "schema_probe_failed",
      state: "unavailable",
    };
  }

  return {
    ...base,
    availability: "available",
    canCreateProject: true,
    canWriteProjectChats: true,
    reason: null,
    schoolPreparationEligible: !guest && !staff,
    state: "available",
  };
}
