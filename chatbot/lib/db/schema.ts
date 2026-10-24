import { type InferSelectModel, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { MATTER_DOCUMENT_MIME_TYPES } from "@/lib/matter-documents/formats";

export const user = pgTable(
  "User",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    email: varchar("email", { length: 64 }).notNull(),
    password: varchar("password", { length: 64 }),
    emailVerifiedAt: timestamp("emailVerifiedAt"),
    authVersion: integer("authVersion").notNull().default(1),
    role: varchar("role", { enum: ["user", "lawyer", "admin"] })
      .notNull()
      .default("user"),
    membershipTier: varchar("membershipTier", { enum: ["free", "vip"] })
      .notNull()
      .default("free"),
    vipExpiresAt: timestamp("vipExpiresAt"),
  },
  (table) => ({
    emailNormalizedUnique: uniqueIndex("User_email_normalized_unique").on(
      sql`lower(trim(${table.email}))`
    ),
  })
);

export type User = InferSelectModel<typeof user>;

export const emailVerificationToken = pgTable(
  "EmailVerificationToken",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("EmailVerificationToken_token_hash_unique").on(
      table.tokenHash
    ),
    userCreatedIndex: index("EmailVerificationToken_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
  })
);

export type EmailVerificationToken = InferSelectModel<
  typeof emailVerificationToken
>;

export const passwordResetToken = pgTable(
  "PasswordResetToken",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("PasswordResetToken_token_hash_unique").on(
      table.tokenHash
    ),
    userCreatedIndex: index("PasswordResetToken_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
  })
);

export type PasswordResetToken = InferSelectModel<typeof passwordResetToken>;

export const vipPurchase = pgTable(
  "VipPurchase",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerPaymentId: varchar("providerPaymentId", { length: 255 }).notNull(),
    amountMinor: integer("amountMinor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: varchar("status", {
      enum: ["pending", "paid", "failed", "cancelled"],
    })
      .notNull()
      .default("pending"),
    purchasedAt: timestamp("purchasedAt"),
    vipStartsAt: timestamp("vipStartsAt"),
    vipExpiresAt: timestamp("vipExpiresAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    providerPaymentUnique: uniqueIndex(
      "VipPurchase_provider_payment_unique"
    ).on(table.provider, table.providerPaymentId),
    userStatusIndex: index("VipPurchase_user_status_idx").on(
      table.userId,
      table.status
    ),
  })
);

export type VipPurchase = InferSelectModel<typeof vipPurchase>;

// Phase 9 M1: dedicated recurring VIP billing foundation. These tables are
// intentionally separate from the historical one-time VipPurchase simulation.
export const vipPlanPrice = pgTable(
  "VipPlanPrice",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    amountMinor: integer("amountMinor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
    billingInterval: varchar("billingInterval", { enum: ["month"] })
      .notNull()
      .default("month"),
    active: boolean("active").notNull().default(true),
    createdByUserId: uuid("createdByUserId").references(() => user.id, {
      onDelete: "set null",
    }),
    provider: varchar("provider", { length: 32 }),
    providerProductId: varchar("providerProductId", { length: 255 }),
    providerPriceId: varchar("providerPriceId", { length: 255 }),
    providerSyncStatus: varchar("providerSyncStatus", {
      enum: ["unprovisioned", "ready", "failed"],
    })
      .notNull()
      .default("unprovisioned"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    retiredAt: timestamp("retiredAt"),
  },
  (table) => ({
    // DB-enforced invariant: at most one active VIP price at a time. Historical
    // price rows stay immutable so existing subscriptions keep their price.
    activePriceUnique: uniqueIndex("VipPlanPrice_active_unique")
      .on(table.active)
      .where(sql`${table.active} = true`),
  })
);

export type VipPlanPrice = InferSelectModel<typeof vipPlanPrice>;

export const vipSubscription = pgTable(
  "VipSubscription",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    planPriceId: uuid("planPriceId")
      .notNull()
      .references(() => vipPlanPrice.id, { onDelete: "restrict" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerCustomerId: varchar("providerCustomerId", { length: 255 }),
    providerSubscriptionId: varchar("providerSubscriptionId", { length: 255 }),
    providerCheckoutSessionId: varchar("providerCheckoutSessionId", {
      length: 255,
    }),
    providerPriceId: varchar("providerPriceId", { length: 255 }),
    // Price snapshot retained alongside the historical price reference.
    amountMinor: integer("amountMinor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: varchar("status", {
      enum: [
        "pending",
        "incomplete",
        "active",
        "past_due",
        "unpaid",
        "paused",
        "cancelled",
      ],
    })
      .notNull()
      .default("pending"),
    currentPeriodStart: timestamp("currentPeriodStart"),
    currentPeriodEnd: timestamp("currentPeriodEnd"),
    cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").notNull().default(false),
    cancelledAt: timestamp("cancelledAt"),
    endedAt: timestamp("endedAt"),
    lastPaidInvoiceId: varchar("lastPaidInvoiceId", { length: 255 }),
    lastPaidAt: timestamp("lastPaidAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    providerSubscriptionUnique: uniqueIndex(
      "VipSubscription_provider_subscription_unique"
    ).on(table.provider, table.providerSubscriptionId),
    providerCheckoutSessionUnique: uniqueIndex(
      "VipSubscription_provider_checkout_session_unique"
    ).on(table.providerCheckoutSessionId),
    userStatusIndex: index("VipSubscription_user_status_idx").on(
      table.userId,
      table.status
    ),
    planPriceIndex: index("VipSubscription_plan_price_idx").on(
      table.planPriceId
    ),
    // DB-enforced invariant: a user has at most one non-historical (not
    // cancelled) recurring subscription. Cancelled rows remain as history.
    liveSubscriptionPerUserUnique: uniqueIndex(
      "VipSubscription_live_per_user_unique"
    )
      .on(table.userId)
      .where(sql`${table.status} <> 'cancelled'`),
  })
);

export type VipSubscription = InferSelectModel<typeof vipSubscription>;

export const vipBillingEvent = pgTable(
  "VipBillingEvent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerEventId: varchar("providerEventId", { length: 255 }).notNull(),
    eventType: varchar("eventType", { length: 128 }).notNull(),
    processingStatus: varchar("processingStatus", {
      enum: ["received", "processing", "processed", "failed", "ignored"],
    })
      .notNull()
      .default("received"),
    processingToken: varchar("processingToken", { length: 128 }),
    processingStartedAt: timestamp("processingStartedAt"),
    attemptCount: integer("attemptCount").notNull().default(0),
    lastErrorCode: varchar("lastErrorCode", { length: 128 }),
    receivedAt: timestamp("receivedAt").notNull().defaultNow(),
    processedAt: timestamp("processedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    // Idempotency ledger: duplicate provider webhook deliveries are detected
    // by this unique constraint. Raw provider payloads are intentionally NOT
    // stored here.
    providerEventUnique: uniqueIndex(
      "VipBillingEvent_provider_event_unique"
    ).on(table.provider, table.providerEventId),
    statusUpdatedIndex: index("VipBillingEvent_status_updated_idx").on(
      table.processingStatus,
      table.updatedAt
    ),
  })
);

export type VipBillingEvent = InferSelectModel<typeof vipBillingEvent>;

// Transactional billing notification outbox. Webhook DB mutations must not
// depend on SES succeeding synchronously: notifications are enqueued in the
// same transaction as the billing mutation and delivered afterwards.
// Raw email bodies and provider payloads are intentionally NOT stored.
export const vipBillingNotification = pgTable(
  "VipBillingNotification",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    billingEventId: uuid("billingEventId")
      .notNull()
      .references(() => vipBillingEvent.id, { onDelete: "cascade" }),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    notificationType: varchar("notificationType", {
      enum: [
        "vip_activated",
        "vip_renewal_paid",
        "vip_payment_failed",
        "vip_cancellation_scheduled",
      ],
    }).notNull(),
    deliveryStatus: varchar("deliveryStatus", {
      enum: ["pending", "sending", "sent", "failed"],
    })
      .notNull()
      .default("pending"),
    deliveryToken: varchar("deliveryToken", { length: 128 }),
    attemptCount: integer("attemptCount").notNull().default(0),
    lastErrorCode: varchar("lastErrorCode", { length: 128 }),
    sentAt: timestamp("sentAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    // One notification per billing event + type: duplicate webhook delivery
    // must not create duplicate notification rows or duplicate sends.
    eventNotificationUnique: uniqueIndex(
      "VipBillingNotification_event_type_unique"
    ).on(table.billingEventId, table.notificationType),
    deliveryStatusIndex: index("VipBillingNotification_status_idx").on(
      table.deliveryStatus,
      table.updatedAt
    ),
  })
);

export type VipBillingNotification = InferSelectModel<
  typeof vipBillingNotification
>;

export const lawyerClarificationRequest = pgTable(
  "LawyerClarificationRequest",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    chatId: uuid("chatId"),
    userMessageId: uuid("userMessageId"),
    assistantMessageId: uuid("assistantMessageId"),
    legalMatterId: varchar("legalMatterId", { length: 255 }),
    requestSource: varchar("requestSource", {
      enum: ["vip_customer", "admin_test"],
    }).notNull(),
    assistantMode: varchar("assistantMode", {
      enum: ["default", "premium", "unknown"],
    })
      .notNull()
      .default("unknown"),
    status: varchar("status", {
      enum: [
        "pending",
        "in_review",
        "confirmed",
        "corrected",
        "needs_more_information",
        "closed",
      ],
    })
      .notNull()
      .default("pending"),
    snapshotVersion: varchar("snapshotVersion", { length: 32 })
      .notNull()
      .default("phase8.m3.v1"),
    questionSnapshot: text("questionSnapshot").notNull(),
    answerSnapshot: text("answerSnapshot").notNull(),
    evidenceSnapshot: json("evidenceSnapshot").notNull(),
    contextSnapshot: json("contextSnapshot").notNull(),
    customerNote: text("customerNote"),
    reviewerUserId: uuid("reviewerUserId").references(() => user.id, {
      onDelete: "set null",
    }),
    assignedLawyerUserId: uuid("assignedLawyerUserId").references(
      () => user.id,
      { onDelete: "set null" }
    ),
    assignedAt: timestamp("assignedAt"),
    customerLastViewedAt: timestamp("customerLastViewedAt"),
    lawyerResponse: text("lawyerResponse"),
    correctedAnswer: text("correctedAnswer"),
    reviewedAt: timestamp("reviewedAt"),
    closedAt: timestamp("closedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    userAssistantUnique: uniqueIndex(
      "LawyerClarificationRequest_user_assistant_unique"
    ).on(table.userId, table.assistantMessageId),
    userCreatedStatusIndex: index(
      "LawyerClarificationRequest_user_created_status_idx"
    ).on(table.userId, table.createdAt, table.status),
    statusCreatedIndex: index(
      "LawyerClarificationRequest_status_created_idx"
    ).on(table.status, table.createdAt),
    assignedLawyerStatusIndex: index(
      "LawyerClarificationRequest_assigned_lawyer_status_idx"
    ).on(table.assignedLawyerUserId, table.status, table.updatedAt),
  })
);

export type LawyerClarificationRequest = InferSelectModel<
  typeof lawyerClarificationRequest
>;

export const lawyerClarificationMessage = pgTable(
  "LawyerClarificationMessage",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    requestId: uuid("requestId")
      .notNull()
      .references(() => lawyerClarificationRequest.id, { onDelete: "cascade" }),
    authorUserId: uuid("authorUserId").references(() => user.id, {
      onDelete: "set null",
    }),
    authorRole: varchar("authorRole", {
      enum: ["customer", "lawyer", "admin"],
    }).notNull(),
    body: varchar("body", { length: 8000 }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    requestCreatedIndex: index(
      "LawyerClarificationMessage_request_created_idx"
    ).on(table.requestId, table.createdAt),
  })
);

export type LawyerClarificationMessage = InferSelectModel<
  typeof lawyerClarificationMessage
>;

export const lawyerClarificationEvent = pgTable(
  "LawyerClarificationEvent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    requestId: uuid("requestId")
      .notNull()
      .references(() => lawyerClarificationRequest.id, { onDelete: "cascade" }),
    actorUserId: uuid("actorUserId").references(() => user.id, {
      onDelete: "set null",
    }),
    actorRole: varchar("actorRole", {
      enum: ["customer", "lawyer", "admin", "system"],
    }).notNull(),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    fromStatus: varchar("fromStatus", { length: 64 }),
    toStatus: varchar("toStatus", { length: 64 }),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    requestCreatedIndex: index(
      "LawyerClarificationEvent_request_created_idx"
    ).on(table.requestId, table.createdAt),
  })
);

export type LawyerClarificationEvent = InferSelectModel<
  typeof lawyerClarificationEvent
>;

export const immigrationAnswerTraceLink = pgTable(
  "ImmigrationAnswerTraceLink",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    assistantMessageId: uuid("assistantMessageId").notNull(),
    legalMatterId: varchar("legalMatterId", { length: 255 }),
    answerTraceId: varchar("answerTraceId", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    assistantUnique: uniqueIndex(
      "ImmigrationAnswerTraceLink_chat_assistant_unique"
    ).on(table.chatId, table.assistantMessageId),
    traceUnique: uniqueIndex("ImmigrationAnswerTraceLink_trace_unique").on(
      table.answerTraceId
    ),
  })
);

export type ImmigrationAnswerTraceLink = InferSelectModel<
  typeof immigrationAnswerTraceLink
>;

export const lawyerClarificationLearningBridge = pgTable(
  "LawyerClarificationLearningBridge",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    requestId: uuid("requestId")
      .notNull()
      .references(() => lawyerClarificationRequest.id, { onDelete: "cascade" }),
    assistantMessageId: uuid("assistantMessageId"),
    legalMatterId: varchar("legalMatterId", { length: 255 }),
    actingStaffRole: varchar("actingStaffRole", { enum: ["lawyer", "admin"] }),
    answerTraceId: varchar("answerTraceId", { length: 255 }),
    experienceRecordId: varchar("experienceRecordId", { length: 255 }),
    status: varchar("status", {
      enum: [
        "pending",
        "completed",
        "blocked_missing_trace_link",
        "blocked_missing_experience",
        "failed_retryable",
        "failed_permanent",
      ],
    })
      .notNull()
      .default("pending"),
    phase7AnswerReviewId: varchar("phase7AnswerReviewId", { length: 255 }),
    evaluationArtifactId: varchar("evaluationArtifactId", { length: 255 }),
    reasoningLessonCandidateArtifactId: varchar(
      "reasoningLessonCandidateArtifactId",
      { length: 255 }
    ),
    preferredReasoningOrResearchApproach: text(
      "preferredReasoningOrResearchApproach"
    ),
    createReasoningLessonCandidate: boolean("createReasoningLessonCandidate")
      .notNull()
      .default(false),
    attemptCount: integer("attemptCount").notNull().default(0),
    lastAttemptAt: timestamp("lastAttemptAt"),
    completedAt: timestamp("completedAt"),
    lastErrorCode: varchar("lastErrorCode", { length: 128 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    requestUnique: uniqueIndex(
      "LawyerClarificationLearningBridge_request_unique"
    ).on(table.requestId),
    statusUpdatedIndex: index(
      "LawyerClarificationLearningBridge_status_updated_idx"
    ).on(table.status, table.updatedAt),
  })
);

export type LawyerClarificationLearningBridge = InferSelectModel<
  typeof lawyerClarificationLearningBridge
>;

export const chat = pgTable(
  "Chat",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    visibility: varchar("visibility", { enum: ["public", "private"] })
      .notNull()
      .default("private"),
  },
  (table) => ({
    idOwnerUnique: uniqueIndex("Chat_id_user_id_unique").on(
      table.id,
      table.userId
    ),
  })
);

export type Chat = InferSelectModel<typeof chat>;

export const immigrationConversation = pgTable("ImmigrationConversation", {
  chatId: uuid("chatId")
    .primaryKey()
    .notNull()
    .references(() => chat.id, { onDelete: "cascade" }),
  legalMatterId: varchar("legalMatterId", { length: 255 }),
  title: text("title"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export type ImmigrationConversation = InferSelectModel<
  typeof immigrationConversation
>;

export const conversationTurn = pgTable(
  "ConversationTurn",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientTurnId: varchar("clientTurnId", { length: 128 }).notNull(),
    assistantMode: varchar("assistantMode", { length: 32 }),
    requestHash: varchar("requestHash", { length: 64 }),
    userMessageId: uuid("userMessageId"),
    assistantMessageId: uuid("assistantMessageId"),
    status: varchar("status", {
      enum: ["user_persisted", "assistant_persisted", "failed"],
    })
      .notNull()
      .default("user_persisted"),
    attemptCount: integer("attemptCount").notNull().default(1),
    errorCode: varchar("errorCode", { length: 64 }),
    pendingAssistantParts: json("pendingAssistantParts").$type<unknown[]>(),
    /**
     * Phase 12 Stage 1 R1 execution ownership. Only the request that holds the
     * live lease may execute the model stage for a turn, and only the fencing
     * token stored in `executionOwnerId` may write that turn's terminal state.
     */
    executionOwnerId: varchar("executionOwnerId", { length: 64 }),
    executionLeaseExpiresAt: timestamp("executionLeaseExpiresAt"),
    executionStartedAt: timestamp("executionStartedAt"),
    executionAttempt: integer("executionAttempt").notNull().default(0),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    chatClientTurnUnique: uniqueIndex(
      "ConversationTurn_chat_client_turn_unique"
    ).on(table.chatId, table.clientTurnId),
    ownerCreatedIndex: index("ConversationTurn_owner_created_idx").on(
      table.userId,
      table.createdAt
    ),
    executionLeaseIndex: index("ConversationTurn_execution_lease_idx").on(
      table.executionLeaseExpiresAt
    ),
  })
);

export type ConversationTurnRow = InferSelectModel<typeof conversationTurn>;

// Keep these PostgreSQL check() declarations aligned with migration 0030.
// Drizzle Kit 0.25 serializes indexes and foreign keys into snapshots but
// omits check constraints, so the generated SQL requires the explicit CHECK
// statements appended to that additive migration.
export const studyJourneyProject = pgTable(
  "StudyJourneyProject",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    ownerUserId: uuid("ownerUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: varchar("status", { enum: ["active", "closed"] })
      .notNull()
      .default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    closedAt: timestamp("closedAt"),
  },
  (table) => ({
    revisionPositive: check(
      "StudyJourneyProject_revision_positive_check",
      sql`${table.revision} > 0`
    ),
    lifecycleConsistent: check(
      "StudyJourneyProject_lifecycle_check",
      sql`(${table.status} = 'active' and ${table.closedAt} is null) or (${table.status} = 'closed' and ${table.closedAt} is not null)`
    ),
    statusAllowed: check(
      "StudyJourneyProject_status_check",
      sql`${table.status} in ('active', 'closed')`
    ),
  })
);

export type StudyJourneyProject = InferSelectModel<typeof studyJourneyProject>;

export const projectMembership = pgTable(
  "ProjectMembership",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => studyJourneyProject.id, { onDelete: "restrict" }),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: varchar("status", { enum: ["pending", "active", "revoked"] })
      .notNull()
      .default("pending"),
    invitedByUserId: uuid("invitedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    acceptedAt: timestamp("acceptedAt"),
    revokedAt: timestamp("revokedAt"),
  },
  (table) => ({
    projectUserUnique: uniqueIndex("ProjectMembership_project_user_unique").on(
      table.projectId,
      table.userId
    ),
    userStatusProjectIndex: index(
      "ProjectMembership_user_status_project_idx"
    ).on(table.userId, table.status, table.projectId),
    statusAllowed: check(
      "ProjectMembership_status_check",
      sql`${table.status} in ('pending', 'active', 'revoked')`
    ),
    lifecycleConsistent: check(
      "ProjectMembership_lifecycle_check",
      sql`(${table.status} = 'pending' and ${table.acceptedAt} is null and ${table.revokedAt} is null) or (${table.status} = 'active' and ${table.acceptedAt} is not null and ${table.revokedAt} is null) or (${table.status} = 'revoked' and ${table.revokedAt} is not null)`
    ),
  })
);

export type ProjectMembership = InferSelectModel<typeof projectMembership>;

export const projectConversation = pgTable(
  "ProjectConversation",
  {
    chatId: uuid("chatId")
      .primaryKey()
      .notNull()
      .references(() => immigrationConversation.chatId, {
        onDelete: "restrict",
      }),
    projectId: uuid("projectId")
      .notNull()
      .references(() => studyJourneyProject.id, { onDelete: "restrict" }),
    createdByUserId: uuid("createdByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    chatOwnerForeignKey: foreignKey({
      columns: [table.chatId, table.createdByUserId],
      foreignColumns: [chat.id, chat.userId],
      name: "ProjectConversation_chat_owner_fk",
    }).onDelete("restrict"),
    projectCreatedIndex: index("ProjectConversation_project_created_idx").on(
      table.projectId,
      table.createdAt,
      table.chatId
    ),
  })
);

export type ProjectConversation = InferSelectModel<typeof projectConversation>;

export const projectOperation = pgTable(
  "ProjectOperation",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    actorUserId: uuid("actorUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    operationType: varchar("operationType", {
      enum: [
        "project_create",
        "project_close",
        "membership_invite",
        "membership_accept",
        "membership_revoke",
        "project_chat_create",
      ],
    }).notNull(),
    operationId: varchar("operationId", { length: 128 }).notNull(),
    requestHash: varchar("requestHash", { length: 64 }).notNull(),
    resultKind: varchar("resultKind", {
      enum: ["project", "membership", "chat"],
    }).notNull(),
    resultId: uuid("resultId").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    actorTypeOperationUnique: uniqueIndex(
      "ProjectOperation_actor_type_operation_unique"
    ).on(table.actorUserId, table.operationType, table.operationId),
    actorCreatedIndex: index("ProjectOperation_actor_created_idx").on(
      table.actorUserId,
      table.createdAt
    ),
    outcomeIndex: index("ProjectOperation_outcome_idx").on(
      table.resultKind,
      table.resultId
    ),
    operationIdValid: check(
      "ProjectOperation_operation_id_check",
      sql`${table.operationId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'`
    ),
    requestHashValid: check(
      "ProjectOperation_request_hash_check",
      sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`
    ),
    operationTypeAllowed: check(
      "ProjectOperation_type_check",
      sql`${table.operationType} in ('project_create', 'project_close', 'membership_invite', 'membership_accept', 'membership_revoke', 'project_chat_create')`
    ),
    resultKindAllowed: check(
      "ProjectOperation_result_kind_check",
      sql`${table.resultKind} in ('project', 'membership', 'chat')`
    ),
  })
);

export type ProjectOperation = InferSelectModel<typeof projectOperation>;

export const projectEvent = pgTable(
  "ProjectEvent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => studyJourneyProject.id, { onDelete: "restrict" }),
    actorUserId: uuid("actorUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    projectRevision: integer("projectRevision").notNull(),
    eventType: varchar("eventType", {
      enum: [
        "project_created",
        "membership_state_changed",
        "project_chat_created",
        "project_closed",
      ],
    }).notNull(),
    subjectKind: varchar("subjectKind", {
      enum: ["project", "membership", "chat"],
    }),
    subjectId: uuid("subjectId"),
    operationRecordId: uuid("operationRecordId")
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    projectRevisionUnique: uniqueIndex(
      "ProjectEvent_project_revision_unique"
    ).on(table.projectId, table.projectRevision),
    projectCreatedIndex: index("ProjectEvent_project_created_idx").on(
      table.projectId,
      table.createdAt
    ),
    revisionPositive: check(
      "ProjectEvent_revision_positive_check",
      sql`${table.projectRevision} > 0`
    ),
    eventTypeAllowed: check(
      "ProjectEvent_type_check",
      sql`${table.eventType} in ('project_created', 'membership_state_changed', 'project_chat_created', 'project_closed')`
    ),
    subjectConsistent: check(
      "ProjectEvent_subject_check",
      sql`(${table.subjectKind} is null and ${table.subjectId} is null) or (${table.subjectKind} is not null and ${table.subjectId} is not null)`
    ),
  })
);

export type ProjectEvent = InferSelectModel<typeof projectEvent>;

export type ConsultationStatus =
  | "requested"
  | "proposed"
  | "confirmed"
  | "completed"
  | "cancelled";

export const consultationRequest = pgTable(
  "ConsultationRequest",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    chatId: uuid("chatId").references(() => chat.id, { onDelete: "set null" }),
    legalMatterId: varchar("legalMatterId", { length: 255 }),
    lawyerClarificationRequestId: uuid(
      "lawyerClarificationRequestId"
    ).references(() => lawyerClarificationRequest.id, { onDelete: "set null" }),
    status: varchar("status", {
      enum: ["requested", "proposed", "confirmed", "completed", "cancelled"],
    })
      .notNull()
      .default("requested"),
    revision: integer("revision").notNull().default(1),
    customerTimezone: varchar("customerTimezone", { length: 128 }).notNull(),
    preferredWindows: json("preferredWindows").notNull(),
    methodPreference: varchar("methodPreference", {
      enum: ["video", "phone", "in_person", "no_preference"],
    }).notNull(),
    customerNote: varchar("customerNote", { length: 2000 }),
    assignedLawyerUserId: uuid("assignedLawyerUserId").references(
      () => user.id,
      { onDelete: "set null" }
    ),
    assignedAt: timestamp("assignedAt"),
    scheduledStartAt: timestamp("scheduledStartAt"),
    scheduledEndAt: timestamp("scheduledEndAt"),
    scheduledMethod: varchar("scheduledMethod", {
      enum: ["video", "phone", "in_person", "other"],
    }),
    meetingInstructions: varchar("meetingInstructions", { length: 2000 }),
    proposedAt: timestamp("proposedAt"),
    confirmedAt: timestamp("confirmedAt"),
    completedAt: timestamp("completedAt"),
    cancelledAt: timestamp("cancelledAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    ownerStatusUpdatedIndex: index(
      "ConsultationRequest_owner_status_updated_idx"
    ).on(table.userId, table.status, table.updatedAt),
    statusUpdatedIndex: index("ConsultationRequest_status_updated_idx").on(
      table.status,
      table.updatedAt
    ),
    lawyerStatusUpdatedIndex: index(
      "ConsultationRequest_lawyer_status_updated_idx"
    ).on(table.assignedLawyerUserId, table.status, table.updatedAt),
    lawyerIntervalStatusIndex: index(
      "ConsultationRequest_lawyer_interval_status_idx"
    ).on(
      table.assignedLawyerUserId,
      table.scheduledStartAt,
      table.scheduledEndAt,
      table.status
    ),
  })
);

export type ConsultationRequest = InferSelectModel<typeof consultationRequest>;

export const consultationEvent = pgTable(
  "ConsultationEvent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    consultationRequestId: uuid("consultationRequestId")
      .notNull()
      .references(() => consultationRequest.id, { onDelete: "cascade" }),
    actorUserId: uuid("actorUserId").references(() => user.id, {
      onDelete: "set null",
    }),
    actorRole: varchar("actorRole", {
      enum: ["customer", "lawyer", "admin", "system"],
    }).notNull(),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    fromStatus: varchar("fromStatus", {
      enum: ["requested", "proposed", "confirmed", "completed", "cancelled"],
    }),
    toStatus: varchar("toStatus", {
      enum: ["requested", "proposed", "confirmed", "completed", "cancelled"],
    }),
    metadata: json("metadata").notNull().default({}),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    requestCreatedIndex: index("ConsultationEvent_request_created_idx").on(
      table.consultationRequestId,
      table.createdAt
    ),
  })
);

export type ConsultationEvent = InferSelectModel<typeof consultationEvent>;

// Customer-provided matter files are private, untrusted evidence. Stage 1
// stores only their original bytes and lifecycle metadata; it does not process
// them or make them available to AI/lawyer workflows.
export const matterDocument = pgTable(
  "MatterDocument",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    chatId: uuid("chatId")
      .notNull()
      .references(() => immigrationConversation.chatId, {
        onDelete: "restrict",
      }),
    legalMatterId: varchar("legalMatterId", { length: 255 }),
    originalFilename: varchar("originalFilename", { length: 255 }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    mimeType: varchar("mimeType", {
      enum: MATTER_DOCUMENT_MIME_TYPES,
    }).notNull(),
    byteSize: integer("byteSize").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    processingStatus: varchar("processingStatus", {
      enum: ["not_started", "processing", "complete", "failed"],
    })
      .notNull()
      .default("not_started"),
    securityStatus: varchar("securityStatus", {
      enum: ["pending", "clean", "rejected", "failed"],
    })
      .notNull()
      .default("pending"),
    storageStatus: varchar("storageStatus", {
      enum: ["uploading", "stored", "cleanup_pending", "storage_failed"],
    })
      .notNull()
      .default("uploading"),
    deletedAt: timestamp("deletedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    storageKeyUnique: uniqueIndex("MatterDocument_storage_key_unique").on(
      table.storageKey
    ),
    ownerConversationIndex: index("MatterDocument_owner_conversation_idx").on(
      table.userId,
      table.chatId,
      table.createdAt
    ),
    ownerLookupIndex: index("MatterDocument_owner_lookup_idx").on(
      table.userId,
      table.id
    ),
    ownerCreatedIndex: index("MatterDocument_owner_created_idx").on(
      table.userId,
      table.createdAt,
      table.id
    ),
  })
);

export type MatterDocument = InferSelectModel<typeof matterDocument>;

export const matterDocumentProcessingRun = pgTable(
  "MatterDocumentProcessingRun",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    documentId: uuid("documentId")
      .notNull()
      .references(() => matterDocument.id, { onDelete: "cascade" }),
    extractorVersion: varchar("extractorVersion", { length: 80 }).notNull(),
    status: varchar("status", {
      enum: ["processing", "complete", "partial", "needs_review", "failed"],
    }).notNull(),
    extractionMethod: varchar("extractionMethod", {
      enum: ["native", "vision_fallback", "mixed"],
    }),
    startedAt: timestamp("startedAt").notNull().defaultNow(),
    completedAt: timestamp("completedAt"),
    unitCount: integer("unitCount").notNull().default(0),
    totalTextChars: integer("totalTextChars").notNull().default(0),
    truncated: boolean("truncated").notNull().default(false),
    errorCode: varchar("errorCode", { length: 64 }),
  },
  (table) => ({
    documentStartedIndex: index(
      "MatterDocumentProcessingRun_document_started_idx"
    ).on(table.documentId, table.startedAt),
  })
);

export const matterDocumentEvidenceUnit = pgTable(
  "MatterDocumentEvidenceUnit",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    documentId: uuid("documentId")
      .notNull()
      .references(() => matterDocument.id, { onDelete: "cascade" }),
    runId: uuid("runId")
      .notNull()
      .references(() => matterDocumentProcessingRun.id, {
        onDelete: "cascade",
      }),
    ordinal: integer("ordinal").notNull(),
    sourceClass: varchar("sourceClass", { enum: ["customer_document"] })
      .notNull()
      .default("customer_document"),
    locator: json("locator").$type<Record<string, string | number>>().notNull(),
    provenance: json("provenance")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    extractionMethod: varchar("extractionMethod", {
      enum: ["native", "vision_fallback"],
    }).notNull(),
    extractedText: text("extractedText").notNull(),
  },
  (table) => ({
    runOrdinalUnique: uniqueIndex(
      "MatterDocumentEvidenceUnit_run_ordinal_unique"
    ).on(table.runId, table.ordinal),
    documentRunIndex: index("MatterDocumentEvidenceUnit_document_run_idx").on(
      table.documentId,
      table.runId
    ),
  })
);

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chatbot.dev/docs/migration-guides/message-parts
export const messageDeprecated = pgTable("Message", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  content: json("content").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const message = pgTable(
  "Message_v2",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    role: varchar("role").notNull(),
    parts: json("parts").notNull(),
    attachments: json("attachments").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    chatHistoryIndex: index("Message_v2_chat_history_idx").on(
      table.chatId,
      table.createdAt,
      table.id
    ),
  })
);

export type DBMessage = InferSelectModel<typeof message>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chatbot.dev/docs/migration-guides/message-parts
export const voteDeprecated = pgTable(
  "Vote",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  }
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

// P11-009 Stage 1: durable, source-grounded Policy Intelligence revisions.
// Snapshot evidence and analysis payloads are append-only; only publication
// lifecycle pointers/status fields advance as newer verified revisions publish.
//
// Phase 12 Stage 3 adds the human editorial dimension: `origin` distinguishes
// crawler-discovered items from lawyer-authored ones, and the official source
// identity columns are nullable because a lawyer-authored commentary entry has
// no authoritative official source (nothing may be fabricated for it).
export const policyIntelligenceItem = pgTable(
  "PolicyIntelligenceItem",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    slug: varchar("slug", { length: 180 }).notNull(),
    origin: varchar("origin", { enum: ["automated", "manual"] })
      .notNull()
      .default("automated"),
    primarySourceConfigId: varchar("primarySourceConfigId", {
      length: 100,
    }),
    primarySourceId: varchar("primarySourceId", { length: 255 }),
    canonicalOfficialUrl: text("canonicalOfficialUrl"),
    sourceStatus: varchar("sourceStatus", {
      enum: [
        "in_force",
        "published_guidance",
        "announced",
        "proposed",
        "consultation",
        "enacted_not_commenced",
        "superseded",
        "withdrawn",
        // Phase 12 Stage 3 D-072: honest "not established" status. It never
        // asserts legal force.
        "unknown",
      ],
    })
      .notNull()
      .default("announced"),
    editorialStatus: varchar("editorialStatus", {
      enum: ["draft", "review_required", "published", "archived"],
    })
      .notNull()
      .default("draft"),
    latestSnapshotId: uuid("latestSnapshotId"),
    latestPublishedRevisionId: uuid("latestPublishedRevisionId"),
    /**
     * The staff member who created the item. Automated items leave this null;
     * a manually authored item always has an accountable human creator.
     */
    createdByUserId: uuid("createdByUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    /**
     * Phase 12 Stage 3 R1 — durable human-publication protection.
     *
     * `automatic` (default): an eligible newer source revision may supersede the
     * current public revision without human approval, exactly as before.
     * `human_protected`: an authorized Policy Editor has approved/published the
     * current revision, so automatic publication must never replace or unpublish
     * it. Newer eligible revisions are captured, analyzed and held as pending
     * review instead. Only an authorized Policy Editor may publish a newer
     * revision or explicitly release the item back to `automatic`.
     */
    publicationMode: varchar("publicationMode", {
      enum: ["automatic", "human_protected"],
    })
      .notNull()
      .default("automatic"),
    protectionSetAt: timestamp("protectionSetAt"),
    protectionSetByUserId: uuid("protectionSetByUserId").references(
      () => user.id,
      { onDelete: "restrict" }
    ),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex("PolicyIntelligenceItem_slug_unique").on(
      table.slug
    ),
    sourceIdentityUnique: uniqueIndex(
      "PolicyIntelligenceItem_source_identity_unique"
    ).on(
      table.primarySourceConfigId,
      table.primarySourceId,
      table.canonicalOfficialUrl
    ),
    statusIndex: index("PolicyIntelligenceItem_publication_status_idx").on(
      table.editorialStatus,
      table.updatedAt
    ),
  })
);

export const policyIntelligenceSourceSnapshot = pgTable(
  "PolicyIntelligenceSourceSnapshot",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    itemId: uuid("itemId")
      .notNull()
      .references(() => policyIntelligenceItem.id, { onDelete: "restrict" }),
    sourceConfigId: varchar("sourceConfigId", { length: 100 }).notNull(),
    sourceId: varchar("sourceId", { length: 255 }).notNull(),
    authority: varchar("authority", { length: 255 }).notNull(),
    canonicalUrl: text("canonicalUrl").notNull(),
    officialTitle: text("officialTitle").notNull(),
    retrievedAt: timestamp("retrievedAt").notNull(),
    contentType: varchar("contentType", { length: 100 }).notNull(),
    httpStatus: integer("httpStatus").notNull(),
    sourceDate: varchar("sourceDate", { length: 10 }),
    effectiveDate: varchar("effectiveDate", { length: 10 }),
    normalizedEvidence: text("normalizedEvidence").notNull(),
    contentHash: varchar("contentHash", { length: 64 }).notNull(),
    evidenceTruncated: boolean("evidenceTruncated").notNull().default(false),
    sourceMetadata: json("sourceMetadata").notNull(),
    previousSnapshotId: uuid("previousSnapshotId"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    itemHashIndex: index("PolicyIntelligenceSourceSnapshot_item_hash_idx").on(
      table.itemId,
      table.contentHash
    ),
    itemRetrievedIndex: index(
      "PolicyIntelligenceSourceSnapshot_item_retrieved_idx"
    ).on(table.itemId, table.retrievedAt),
  })
);

/**
 * Policy Intelligence revision store (P11-009 Stage 1 + Phase 12 Stage 3).
 *
 * `contentKind` discriminates three revision origins:
 * - `ai_analysis`: the automated pipeline's analyzed + verified revision of an
 *   official source snapshot (`analysis`, `verification`, `modelMetadata` and
 *   `snapshotId` are all present).
 * - `lawyer_override`: a lawyer-corrected revision of an AI revision. It keeps
 *   the base revision's snapshot only as provenance; there is no AI analysis
 *   metadata and no AI verification covering the corrected wording.
 * - `lawyer_authored`: fully manual, first-class lawyer-authored content with no
 *   source snapshot at all.
 *
 * Human revisions never fabricate snapshot/analysis/verification/model metadata:
 * those columns are simply NULL, and the durable human content lives in
 * `humanContent` (validated by `policyHumanRevisionContentSchema`).
 */
export const policyIntelligenceAnalysisRevision = pgTable(
  "PolicyIntelligenceAnalysisRevision",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    itemId: uuid("itemId")
      .notNull()
      .references(() => policyIntelligenceItem.id, { onDelete: "restrict" }),
    snapshotId: uuid("snapshotId").references(
      () => policyIntelligenceSourceSnapshot.id,
      {
        onDelete: "restrict",
      }
    ),
    contentKind: varchar("contentKind", {
      enum: [
        "ai_analysis",
        "lawyer_override",
        "lawyer_authored",
        // Phase 12 Stage 3 D-072: a published source-first notice with no
        // fabricated analysis (analysis/verification/modelMetadata are NULL).
        "source_first",
      ],
    })
      .notNull()
      .default("ai_analysis"),
    analysisFingerprint: varchar("analysisFingerprint", {
      length: 64,
    }).notNull(),
    revisionNumber: integer("revisionNumber").notNull(),
    schemaVersion: varchar("schemaVersion", { length: 100 }).notNull(),
    analysis: json("analysis"),
    verification: json("verification"),
    modelMetadata: json("modelMetadata"),
    /** Validated human editorial content for the two human content kinds. */
    humanContent: json("humanContent"),
    /** The AI revision a lawyer_override corrected, for audit lineage. */
    baseRevisionId: uuid("baseRevisionId").references(
      (): AnyPgColumn => policyIntelligenceAnalysisRevision.id,
      { onDelete: "restrict" }
    ),
    /** Snapshot of the AI decision the lawyer overrode (audit only). */
    aiDecision: json("aiDecision"),
    overrideReason: text("overrideReason"),
    /** Client-provided idempotency key, unique per item when present. */
    idempotencyKey: varchar("idempotencyKey", { length: 80 }),
    /** The accountable human editor for human-authored/override revisions. */
    createdByUserId: uuid("createdByUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    editorialStatus: varchar("editorialStatus", {
      enum: ["draft", "review_required", "published", "superseded", "archived"],
    }).notNull(),
    generatedAt: timestamp("generatedAt").notNull(),
    publishedAt: timestamp("publishedAt"),
    supersededAt: timestamp("supersededAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    itemRevisionUnique: uniqueIndex(
      "PolicyIntelligenceAnalysisRevision_item_revision_unique"
    ).on(table.itemId, table.revisionNumber),
    snapshotIndex: index("PolicyIntelligenceAnalysisRevision_snapshot_idx").on(
      table.snapshotId
    ),
    snapshotAnalysisFingerprintUnique: uniqueIndex(
      "PolicyIntelligenceAnalysisRevision_snapshot_analysis_fingerprint_unique"
    ).on(table.snapshotId, table.analysisFingerprint),
    publicationIndex: index(
      "PolicyIntelligenceAnalysisRevision_publication_idx"
    ).on(table.editorialStatus, table.publishedAt),
    itemIdempotencyUnique: uniqueIndex(
      "PolicyIntelligenceAnalysisRevision_item_idempotency_unique"
    ).on(table.itemId, table.idempotencyKey),
    contentKindIndex: index(
      "PolicyIntelligenceAnalysisRevision_content_kind_idx"
    ).on(table.itemId, table.contentKind, table.revisionNumber),
  })
);

/**
 * Phase 12 Stage 3 — explicit, administratively assignable/revocable Policy
 * Editor capability. Being a lawyer does NOT imply publication rights: the
 * capability is a deliberate grant recorded here (and in the immutable
 * editorial event log), enforced server-side on every editorial mutation.
 */
export const policyEditorGrant = pgTable(
  "PolicyEditorGrant",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    grantedByUserId: uuid("grantedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    grantedAt: timestamp("grantedAt").notNull().defaultNow(),
    revokedByUserId: uuid("revokedByUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    revokedAt: timestamp("revokedAt"),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    userUnique: uniqueIndex("PolicyEditorGrant_user_unique").on(table.userId),
    activeIndex: index("PolicyEditorGrant_active_idx").on(
      table.revokedAt,
      table.updatedAt
    ),
  })
);

/**
 * Phase 12 Stage 3 — immutable editorial audit log. Every publication,
 * override, archive, restore and capability change appends one durable row:
 * actor, timestamp, affected records and old/new values. Rows are never
 * updated or deleted by application code.
 */
export const policyIntelligenceEditorialEvent = pgTable(
  "PolicyIntelligenceEditorialEvent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    actorUserId: uuid("actorUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    action: varchar("action", {
      enum: [
        "grant_policy_editor",
        "revoke_policy_editor",
        "create_manual_policy",
        "save_manual_draft",
        "create_revision_draft",
        "publish_manual_policy",
        "force_publish_revision",
        "release_publication_protection",
        "archive_policy_item",
        "restore_policy_item",
        "submit_official_url",
      ],
    }).notNull(),
    itemId: uuid("itemId").references(() => policyIntelligenceItem.id, {
      onDelete: "restrict",
    }),
    revisionId: uuid("revisionId").references(
      () => policyIntelligenceAnalysisRevision.id,
      { onDelete: "restrict" }
    ),
    overrideReason: text("overrideReason"),
    detail: json("detail").notNull().default({}),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    itemCreatedIndex: index(
      "PolicyIntelligenceEditorialEvent_item_created_idx"
    ).on(table.itemId, table.createdAt),
    actorCreatedIndex: index(
      "PolicyIntelligenceEditorialEvent_actor_created_idx"
    ).on(table.actorUserId, table.createdAt),
  })
);

/**
 * Phase 12 Stage 3 R2 — immutable, lossless history of human draft saves.
 *
 * Every `createManualDraft` / `saveManualDraft` appends the *complete* draft
 * document here (not only a hash or a truncated preview), so an authorized
 * editor can retrieve exactly what a previous save contained — long bilingual
 * body text, amended citations, removed narrative items and removed references.
 * Rows are append-only: no application code updates them, and the only deletion
 * is the bounded retention prune executed in the same transaction as the save,
 * which removes nothing but this revision's own oldest snapshots beyond the
 * configured count/byte budget. Published revisions are never touched by it.
 */
export const policyIntelligenceDraftSnapshot = pgTable(
  "PolicyIntelligenceDraftSnapshot",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    itemId: uuid("itemId")
      .notNull()
      .references(() => policyIntelligenceItem.id, { onDelete: "restrict" }),
    revisionId: uuid("revisionId")
      .notNull()
      .references(() => policyIntelligenceAnalysisRevision.id, {
        onDelete: "restrict",
      }),
    /** Monotonic per-revision save number (1 = the create). */
    saveNumber: integer("saveNumber").notNull(),
    /** Fingerprint of the saved content (the value the revision also carries). */
    contentVersion: varchar("contentVersion", { length: 64 }).notNull(),
    /** sha256 of the canonical stored JSON, so stored content is verifiable. */
    contentDigest: varchar("contentDigest", { length: 64 }).notNull(),
    /** The complete validated human revision content at that save. */
    humanContent: json("humanContent").notNull(),
    /** Serialized size, used by the bounded retention policy. */
    contentBytes: integer("contentBytes").notNull(),
    /** Server-authoritative author of the save. */
    savedByUserId: uuid("savedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    revisionSaveUnique: uniqueIndex(
      "PolicyIntelligenceDraftSnapshot_revision_save_unique"
    ).on(table.revisionId, table.saveNumber),
    revisionCreatedIndex: index(
      "PolicyIntelligenceDraftSnapshot_revision_created_idx"
    ).on(table.revisionId, table.createdAt),
  })
);

/**
 * Phase 12 Stage 3 — authorized submission of an official URL into the
 * existing controlled discovery pipeline. The row is durable operator intent;
 * the next `operator-submitted-official-url` sync run fetches it through the
 * same allowlist/SSRF/redirect/byte/timeout protections as every other source.
 */
export const policyIntelligenceOperatorSubmission = pgTable(
  "PolicyIntelligenceOperatorSubmission",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    sourceConfigId: varchar("sourceConfigId", { length: 100 })
      .notNull()
      .default("operator-submitted-official-url"),
    submittedUrl: text("submittedUrl").notNull(),
    submittedByUserId: uuid("submittedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    note: varchar("note", { length: 500 }),
    status: varchar("status", {
      enum: ["pending", "consumed", "failed", "rejected"],
    })
      .notNull()
      .default("pending"),
    errorCode: varchar("errorCode", { length: 100 }),
    attemptedAt: timestamp("attemptedAt"),
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    statusCreatedIndex: index(
      "PolicyIntelligenceOperatorSubmission_status_created_idx"
    ).on(table.status, table.createdAt),
    urlIndex: index("PolicyIntelligenceOperatorSubmission_url_idx").on(
      table.submittedUrl
    ),
  })
);

/**
 * Phase 12 Stage 2 durable policy-to-conversation binding.
 *
 * A policy launch used to live only in transient client state, so a reload, a
 * second device or a history reopening lost the visible topic. The binding is
 * the authoritative server-side record of "this conversation was started from
 * this published policy topic".
 *
 * The stored title/source snapshot is a *topic reference* captured at binding
 * time. It intentionally survives later policy revisions, publication changes
 * or source unavailability so historical continuity is preserved without ever
 * claiming the snapshot is currently effective law.
 */
export const conversationPolicyBinding = pgTable(
  "ConversationPolicyBinding",
  {
    chatId: uuid("chatId")
      .primaryKey()
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    policySlug: varchar("policySlug", { length: 120 }).notNull(),
    policyOrigin: varchar("policyOrigin", { enum: ["automated", "manual"] })
      .notNull()
      .default("automated"),
    policyItemId: varchar("policyItemId", { length: 64 }),
    policyRevisionNumber: integer("policyRevisionNumber"),
    policyPublishedAt: timestamp("policyPublishedAt"),
    policySourceStatus: varchar("policySourceStatus", { length: 64 }),
    /** Canonical identity of the published revision captured at bind time. */
    policyRevisionToken: varchar("policyRevisionToken", { length: 160 }),
    titleZh: text("titleZh").notNull(),
    titleEn: text("titleEn").notNull(),
    officialTitle: text("officialTitle").notNull(),
    officialUrl: text("officialUrl").notNull(),
    /**
     * Client-provided idempotency key for one launch attempt. A retried or
     * racing launch with the same key resolves to the same conversation
     * instead of creating a second empty one. A genuinely new launch uses a
     * new key, so the user keeps the explicit ability to start a separate
     * conversation.
     */
    launchId: varchar("launchId", { length: 64 }),
    boundAt: timestamp("boundAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    launchIdUnique: uniqueIndex(
      "ConversationPolicyBinding_user_launch_unique"
    ).on(table.userId, table.launchId),
    userBoundIndex: index("ConversationPolicyBinding_user_bound_idx").on(
      table.userId,
      table.boundAt
    ),
    policySlugIndex: index("ConversationPolicyBinding_policy_slug_idx").on(
      table.policySlug
    ),
  })
);

export type ConversationPolicyBinding = InferSelectModel<
  typeof conversationPolicyBinding
>;

export const policyIntelligenceSyncRun = pgTable(
  "PolicyIntelligenceSyncRun",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    sourceConfigId: varchar("sourceConfigId", { length: 100 }).notNull(),
    mode: varchar("mode", { enum: ["live", "fixture"] }).notNull(),
    status: varchar("status", {
      enum: ["running", "complete", "partial", "failed"],
    }).notNull(),
    startedAt: timestamp("startedAt").notNull(),
    completedAt: timestamp("completedAt"),
    discoveredCount: integer("discoveredCount").notNull().default(0),
    snapshottedCount: integer("snapshottedCount").notNull().default(0),
    unchangedCount: integer("unchangedCount").notNull().default(0),
    analyzedCount: integer("analyzedCount").notNull().default(0),
    publishedCount: integer("publishedCount").notNull().default(0),
    heldCount: integer("heldCount").notNull().default(0),
    failureCount: integer("failureCount").notNull().default(0),
    safeErrorCode: varchar("safeErrorCode", { length: 100 }),
    metadata: json("metadata").notNull().default({}),
  },
  (table) => ({
    sourceStartedIndex: index(
      "PolicyIntelligenceSyncRun_source_started_idx"
    ).on(table.sourceConfigId, table.startedAt),
    statusStartedIndex: index(
      "PolicyIntelligenceSyncRun_status_started_idx"
    ).on(table.status, table.startedAt),
  })
);
