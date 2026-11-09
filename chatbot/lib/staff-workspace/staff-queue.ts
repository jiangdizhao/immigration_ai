/**
 * Phase 13 M9-B — the scoped Staff/Lawyer workspace contract.
 *
 * Two rules shape this module:
 *
 * 1. **Discovery is authorization.** A category is listed only when the server could
 *    actually read it for *this* actor. A category that cannot be read is reported as
 *    `unavailable`/`disabled`/`unsupported`, never as an empty list, because "no
 *    reviews" and "we could not look" are different facts.
 *
 * 2. **No content in the queue.** An entry carries identity, source, status and reason
 *    codes only. Documents, facts, GS draft text, AI Chats, messages, package manifests
 *    and payment records are structurally absent from this type, so an unscoped queue
 *    response cannot leak protected material even if it were mis-served.
 */

export const STAFF_QUEUE_CATEGORIES = [
  "project_assignments",
  "professional_reviews",
  "lawyer_requests",
  "human_messages",
  "managed_handoffs",
] as const;
export type StaffQueueCategory = (typeof STAFF_QUEUE_CATEGORIES)[number];

export const STAFF_QUEUE_BUCKETS = [
  "assigned_projects",
  "needs_review",
  "awaiting_customer",
  "reviewed",
  "blocked",
] as const;
export type StaffQueueBucket = (typeof STAFF_QUEUE_BUCKETS)[number];

export const STAFF_QUEUE_ENTRY_KINDS = [
  "project_assignment",
  "professional_review",
  "lawyer_request",
  "human_message",
  "managed_handoff",
] as const;
export type StaffQueueEntryKind = (typeof STAFF_QUEUE_ENTRY_KINDS)[number];

export const STAFF_CATEGORY_STATES = [
  "available",
  "disabled",
  "unavailable",
  "unsupported",
  "restricted",
] as const;
export type StaffCategoryState = (typeof STAFF_CATEGORY_STATES)[number];

/**
 * One authorized queue entry.
 *
 * `labelCode` is a *stable code*, not prose: the UI resolves it from its own locale copy,
 * so a server response never becomes customer-visible text and never carries a free-form
 * customer sentence.
 */
export type StaffQueueEntry = {
  readonly kind: StaffQueueEntryKind;
  /** Opaque id of the underlying record (assignment, review request, request…). */
  readonly id: string;
  /** Set only when the actor's own authorization proved the Project. */
  readonly projectId: string | null;
  readonly bucket: StaffQueueBucket;
  readonly category: StaffQueueCategory;
  readonly labelCode: string;
  /** The owning service's own status vocabulary, verbatim. */
  readonly statusCode: string;
  readonly reasonCode: string | null;
  readonly updatedAt: string | null;
};

export type StaffCategoryView = {
  readonly state: StaffCategoryState;
  readonly reasonCode: string | null;
  readonly count: number | null;
};

export type StaffWorkspaceSummary = {
  readonly actorUserId: string;
  readonly actorRole: string;
  readonly entries: readonly StaffQueueEntry[];
  readonly counts: Readonly<Record<StaffQueueBucket | "all", number>>;
  readonly categories: Readonly<Record<StaffQueueCategory, StaffCategoryView>>;
  readonly limits: { readonly maxEntries: number };
  /**
   * True when any M4-006 review capability is unavailable, so the UI can explain why the
   * professional-review category is not actionable instead of implying zero work.
   */
  readonly professionalReview: {
    readonly state: "available" | "disabled" | "unavailable";
    readonly reasonCode: string | null;
  };
};

/** Bounded so a queue response can never be used to enumerate Projects. */
export const MAX_STAFF_QUEUE_ENTRIES = 50;

export const STAFF_ROLE_LAWYER = "lawyer" as const;

const BUCKET_ORDER: Record<StaffQueueBucket, number> = {
  needs_review: 0,
  awaiting_customer: 1,
  blocked: 2,
  assigned_projects: 3,
  reviewed: 4,
};

function emptyCounts(): Record<StaffQueueBucket | "all", number> {
  return {
    all: 0,
    assigned_projects: 0,
    awaiting_customer: 0,
    blocked: 0,
    needs_review: 0,
    reviewed: 0,
  };
}

export function emptyStaffCategories(
  state: StaffCategoryState,
  reasonCode: string | null
): Record<StaffQueueCategory, StaffCategoryView> {
  return {
    human_messages: { count: null, reasonCode, state },
    lawyer_requests: { count: null, reasonCode, state },
    managed_handoffs: { count: null, reasonCode, state },
    professional_reviews: { count: null, reasonCode, state },
    project_assignments: { count: null, reasonCode, state },
  };
}

/** Deterministic: pending work first, then most recently updated, then id. */
export function sortStaffQueueEntries(
  entries: readonly StaffQueueEntry[]
): StaffQueueEntry[] {
  return [...entries].sort((left, right) => {
    const bucket = BUCKET_ORDER[left.bucket] - BUCKET_ORDER[right.bucket];
    if (bucket !== 0) {
      return bucket;
    }
    const leftAt = left.updatedAt ?? "";
    const rightAt = right.updatedAt ?? "";
    if (leftAt !== rightAt) {
      return rightAt.localeCompare(leftAt);
    }
    return `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`);
  });
}

/**
 * Builds the queue from what the caller could actually read.
 *
 * `categories` must describe the *real* outcome of each attempted read. An entry whose
 * category is not `available` is rejected here, so a caller cannot smuggle in an item from
 * a category it could not authorize.
 */
export function buildStaffWorkspaceSummary(input: {
  readonly actorUserId: string;
  readonly actorRole: string;
  readonly categories: Record<StaffQueueCategory, StaffCategoryView>;
  readonly entries: readonly StaffQueueEntry[];
  readonly professionalReview: StaffWorkspaceSummary["professionalReview"];
  readonly maxEntries?: number;
}): StaffWorkspaceSummary {
  const maxEntries = input.maxEntries ?? MAX_STAFF_QUEUE_ENTRIES;
  const accepted = input.entries.filter(
    (entry) => input.categories[entry.category]?.state === "available"
  );
  // One entry per underlying record: a replay or duplicate read must not inflate the
  // queue, and the same record must never appear in two buckets.
  const seen = new Set<string>();
  const unique = accepted.filter((entry) => {
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  const sorted = sortStaffQueueEntries(unique);
  const counts = emptyCounts();
  for (const entry of sorted) {
    counts[entry.bucket] += 1;
    counts.all += 1;
  }
  const countsByCategory = new Map<StaffQueueCategory, number>();
  for (const entry of sorted) {
    countsByCategory.set(
      entry.category,
      (countsByCategory.get(entry.category) ?? 0) + 1
    );
  }
  const categories = {} as Record<StaffQueueCategory, StaffCategoryView>;
  for (const category of STAFF_QUEUE_CATEGORIES) {
    const current = input.categories[category];
    categories[category] = {
      count:
        current.state === "available"
          ? (countsByCategory.get(category) ?? 0)
          : null,
      reasonCode: current.reasonCode,
      state: current.state,
    };
  }
  return {
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    categories,
    counts,
    entries: sorted.slice(0, maxEntries),
    limits: { maxEntries },
    professionalReview: input.professionalReview,
  };
}

/**
 * An actor with no readable category still gets a well-formed, empty, *labelled* summary
 * instead of an error that would disclose whether Projects exist.
 */
export function emptyStaffWorkspaceSummary(input: {
  readonly actorUserId: string;
  readonly actorRole: string;
  readonly state?: StaffCategoryState;
  readonly reasonCode?: string | null;
  readonly professionalReview?: StaffWorkspaceSummary["professionalReview"];
}): StaffWorkspaceSummary {
  return buildStaffWorkspaceSummary({
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    categories: emptyStaffCategories(
      input.state ?? "unavailable",
      input.reasonCode ?? "staff_workspace_unavailable"
    ),
    entries: [],
    professionalReview: input.professionalReview ?? {
      reasonCode: "professional_authority_unavailable",
      state: "unavailable",
    },
  });
}

/**
 * Staff access to one Project's review detail.
 *
 * The order is deliberate and fail-closed: authenticated staff identity → server-derived
 * assignment state → Project lifecycle → capability. Nothing here reads customer data;
 * the caller must apply content authorization *after* this decision, and the detail type
 * below has no field for content.
 */
export type StaffProjectAccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reasonCode: string };

export function staffProjectAccessDecision(input: {
  readonly actorRole: string;
  readonly assignmentStatus:
    | "active"
    | "proposed"
    | "owner_approved"
    | "declined"
    | "withdrawn"
    | "revoked"
    | "missing"
    | "unavailable";
  readonly projectLifecycle: "active" | "closed" | "missing" | "unavailable";
}): StaffProjectAccessDecision {
  if (input.actorRole !== STAFF_ROLE_LAWYER) {
    return { allowed: false, reasonCode: "staff_role_required" };
  }
  if (input.assignmentStatus === "unavailable") {
    return { allowed: false, reasonCode: "staff_assignment_unavailable" };
  }
  if (input.assignmentStatus === "missing") {
    return { allowed: false, reasonCode: "staff_assignment_missing" };
  }
  if (input.assignmentStatus !== "active") {
    return { allowed: false, reasonCode: "staff_assignment_inactive" };
  }
  if (input.projectLifecycle === "missing") {
    return { allowed: false, reasonCode: "project_not_found" };
  }
  if (input.projectLifecycle !== "active") {
    return { allowed: false, reasonCode: "project_not_active" };
  }
  return { allowed: true };
}

/**
 * The minimal Project shell an active assignment authorizes.
 *
 * This mirrors the M4-002 consent notice: a lawyer receives *only* a minimal Project
 * shell. There is deliberately no name, no fact, no document, no chat and no message.
 */
export type StaffProjectShell = {
  readonly projectId: string;
  readonly assignmentId: string;
  readonly assignmentRole: string;
  readonly assignmentStatus: "active";
  readonly projectLifecycle: "active";
  readonly acceptedAt: string | null;
  readonly updatedAt: string | null;
};
