import { type InferSelectModel, type SQLWrapper, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  json,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type {
  ClaimDomain,
  EducationFieldValue,
} from "@/lib/education-intelligence/contracts";
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

export const PROJECT_AUDIT_ACTOR_KINDS = ["user", "service"] as const;
export type ProjectAuditActorKind = (typeof PROJECT_AUDIT_ACTOR_KINDS)[number];

export const PROJECT_DOCUMENT_SERVICE_PRINCIPALS = [
  "project_document_storage_worker",
  "project_document_scan_worker",
] as const;

export const PROJECT_OPERATION_TYPES = [
  "project_create",
  "project_close",
  "membership_invite",
  "membership_accept",
  "membership_revoke",
  "project_chat_create",
  "project_document_upload_intent",
  "project_document_import_intent",
  "project_document_storage_finalize",
  "project_document_storage_fail",
  "project_document_scan_finalize",
  "project_document_grant_create",
  "project_document_grant_revoke",
  "project_document_withdraw",
  "project_requirement_state_change",
  "project_evidence_extract",
  "project_fact_mutation",
] as const;

export const PROJECT_OPERATION_RESULT_KINDS = [
  "project",
  "membership",
  "chat",
  "document_asset",
  "document_version",
  "document_scan_run",
  "document_grant",
  "project_requirement_state",
  "document_extraction_run",
  "project_fact_assertion",
] as const;

export const PROJECT_EVENT_TYPES = [
  "project_created",
  "membership_state_changed",
  "project_chat_created",
  "project_closed",
  "project_document_intent_created",
  "project_document_storage_changed",
  "project_document_security_changed",
  "project_document_grant_changed",
  "project_document_withdrawn",
  "project_requirement_state_changed",
  "project_evidence_extraction_completed",
  "project_fact_changed",
] as const;

export const PROJECT_EVENT_SUBJECT_KINDS = [
  "project",
  "membership",
  "chat",
  "document_asset",
  "document_version",
  "document_scan_run",
  "document_grant",
  "requirement_state",
  "document_extraction_run",
  "project_fact_assertion",
] as const;
export type ProjectOperationType = (typeof PROJECT_OPERATION_TYPES)[number];
export type ProjectOperationResultKind =
  (typeof PROJECT_OPERATION_RESULT_KINDS)[number];
export type ProjectEventType = (typeof PROJECT_EVENT_TYPES)[number];
export type ProjectEventSubjectKind =
  (typeof PROJECT_EVENT_SUBJECT_KINDS)[number];

export const projectOperation = pgTable(
  "ProjectOperation",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    actorUserId: uuid("actorUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    actorKind: varchar("actorKind", { enum: PROJECT_AUDIT_ACTOR_KINDS })
      .notNull()
      .default("user"),
    servicePrincipalCode: varchar("servicePrincipalCode", { length: 64 }),
    operationType: varchar("operationType", {
      enum: PROJECT_OPERATION_TYPES,
    }).notNull(),
    operationId: varchar("operationId", { length: 128 }).notNull(),
    requestHash: varchar("requestHash", { length: 64 }).notNull(),
    resultKind: varchar("resultKind", {
      enum: PROJECT_OPERATION_RESULT_KINDS,
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
      sql`${table.operationType} in ('project_create', 'project_close', 'membership_invite', 'membership_accept', 'membership_revoke', 'project_chat_create', 'project_document_upload_intent', 'project_document_import_intent', 'project_document_storage_finalize', 'project_document_storage_fail', 'project_document_scan_finalize', 'project_document_grant_create', 'project_document_grant_revoke', 'project_document_withdraw', 'project_requirement_state_change', 'project_evidence_extract', 'project_fact_mutation')`
    ),
    resultKindAllowed: check(
      "ProjectOperation_result_kind_check",
      sql`${table.resultKind} in ('project', 'membership', 'chat', 'document_asset', 'document_version', 'document_scan_run', 'document_grant', 'project_requirement_state', 'document_extraction_run', 'project_fact_assertion')`
    ),
    actorShapeValid: check(
      "ProjectOperation_actor_shape_check",
      sql`(${table.actorKind} = 'user' and ${table.actorUserId} is not null and ${table.servicePrincipalCode} is null) or (${table.actorKind} = 'service' and ${table.actorUserId} is null and ${table.servicePrincipalCode} in ('project_document_storage_worker', 'project_document_scan_worker'))`
    ),
    actorTypeValid: check(
      "ProjectOperation_actor_type_check",
      sql`(${table.operationType} in ('project_create', 'project_close', 'membership_invite', 'membership_accept', 'membership_revoke', 'project_chat_create', 'project_document_upload_intent', 'project_document_import_intent', 'project_document_grant_create', 'project_document_grant_revoke', 'project_document_withdraw', 'project_requirement_state_change', 'project_evidence_extract', 'project_fact_mutation') and ${table.actorKind} = 'user') or (${table.operationType} in ('project_document_storage_finalize', 'project_document_storage_fail') and ${table.actorKind} = 'service' and ${table.servicePrincipalCode} = 'project_document_storage_worker' and ${table.operationId} ~ '^[0-9a-f]{64}$') or (${table.operationType} = 'project_document_scan_finalize' and ${table.actorKind} = 'service' and ${table.servicePrincipalCode} = 'project_document_scan_worker' and ${table.operationId} ~ '^[0-9a-f]{64}$')`
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
    actorUserId: uuid("actorUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    actorKind: varchar("actorKind", { enum: PROJECT_AUDIT_ACTOR_KINDS })
      .notNull()
      .default("user"),
    servicePrincipalCode: varchar("servicePrincipalCode", { length: 64 }),
    projectRevision: integer("projectRevision").notNull(),
    eventType: varchar("eventType", {
      enum: PROJECT_EVENT_TYPES,
    }).notNull(),
    subjectKind: varchar("subjectKind", {
      enum: PROJECT_EVENT_SUBJECT_KINDS,
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
      sql`${table.eventType} in ('project_created', 'membership_state_changed', 'project_chat_created', 'project_closed', 'project_document_intent_created', 'project_document_storage_changed', 'project_document_security_changed', 'project_document_grant_changed', 'project_document_withdrawn', 'project_requirement_state_changed', 'project_evidence_extraction_completed', 'project_fact_changed')`
    ),
    subjectConsistent: check(
      "ProjectEvent_subject_check",
      sql`(${table.subjectKind} is null and ${table.subjectId} is null) or (${table.subjectKind} is not null and ${table.subjectKind} in ('project', 'membership', 'chat', 'document_asset', 'document_version', 'document_scan_run', 'document_grant', 'requirement_state', 'document_extraction_run', 'project_fact_assertion') and ${table.subjectId} is not null)`
    ),
    actorShapeValid: check(
      "ProjectEvent_actor_shape_check",
      sql`(${table.actorKind} = 'user' and ${table.actorUserId} is not null and ${table.servicePrincipalCode} is null) or (${table.actorKind} = 'service' and ${table.actorUserId} is null and ${table.servicePrincipalCode} in ('project_document_storage_worker', 'project_document_scan_worker'))`
    ),
    documentEventSubjectValid: check(
      "ProjectEvent_document_subject_check",
      sql`(${table.eventType} not in ('project_document_intent_created', 'project_document_storage_changed', 'project_document_security_changed', 'project_document_grant_changed', 'project_document_withdrawn')) or (${table.eventType} = 'project_document_intent_created' and ${table.subjectKind} = 'document_asset') or (${table.eventType} = 'project_document_storage_changed' and ${table.subjectKind} = 'document_version') or (${table.eventType} = 'project_document_security_changed' and ${table.subjectKind} = 'document_scan_run') or (${table.eventType} = 'project_document_grant_changed' and ${table.subjectKind} = 'document_grant') or (${table.eventType} = 'project_document_withdrawn' and ${table.subjectKind} = 'document_asset')`
    ),
  })
);

export type ProjectEvent = InferSelectModel<typeof projectEvent>;

export const PROJECT_DOCUMENT_ASSET_LIFECYCLES = [
  "active",
  "withdrawn",
  "deletion_pending",
  "deleted",
] as const;
export type ProjectDocumentAssetLifecycle =
  (typeof PROJECT_DOCUMENT_ASSET_LIFECYCLES)[number];

export const PROJECT_DOCUMENT_ORIGIN_KINDS = [
  "direct_upload",
  "explicit_chat_import",
] as const;
export type ProjectDocumentOriginKind =
  (typeof PROJECT_DOCUMENT_ORIGIN_KINDS)[number];

export const PROJECT_DOCUMENT_STORAGE_STATUSES = [
  "pending",
  "stored",
  "failed",
  "cleanup_pending",
] as const;
export type ProjectDocumentStorageStatus =
  (typeof PROJECT_DOCUMENT_STORAGE_STATUSES)[number];

export const PROJECT_DOCUMENT_SECURITY_STATUSES = [
  "pending",
  "clean",
  "rejected",
  "failed",
] as const;
export type ProjectDocumentSecurityStatus =
  (typeof PROJECT_DOCUMENT_SECURITY_STATUSES)[number];

export const PROJECT_DOCUMENT_GRANT_RECIPIENT_KINDS = [
  "user",
  "project",
] as const;
export type ProjectDocumentGrantRecipientKind =
  (typeof PROJECT_DOCUMENT_GRANT_RECIPIENT_KINDS)[number];

export const PROJECT_DOCUMENT_GRANT_PURPOSES = [
  "metadata_read",
  "content_read",
  "download",
  "extract",
  "ai_context",
  "future_package",
] as const;
export type ProjectDocumentGrantPurpose =
  (typeof PROJECT_DOCUMENT_GRANT_PURPOSES)[number];

export const PROJECT_DOCUMENT_RUN_KINDS = ["scan", "extract"] as const;
export type ProjectDocumentRunKind =
  (typeof PROJECT_DOCUMENT_RUN_KINDS)[number];

export const PROJECT_DOCUMENT_RUN_STATUSES = [
  "started",
  "completed",
  "failed",
] as const;
export type ProjectDocumentRunStatus =
  (typeof PROJECT_DOCUMENT_RUN_STATUSES)[number];

// These tables are an inert M2-A0 data foundation. No customer request path
// reads or writes them until a later, separately authorized service exists.
export const projectDocumentAsset = pgTable(
  "ProjectDocumentAsset",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => studyJourneyProject.id, { onDelete: "restrict" }),
    createdByUserId: uuid("createdByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    lifecycle: varchar("lifecycle", {
      enum: PROJECT_DOCUMENT_ASSET_LIFECYCLES,
    })
      .notNull()
      .default("active"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    projectIdIdUnique: uniqueIndex("ProjectDocumentAsset_project_id_unique").on(
      table.projectId,
      table.id
    ),
    projectLifecycleCreatedIndex: index(
      "ProjectDocumentAsset_project_lifecycle_created_idx"
    ).on(table.projectId, table.lifecycle, table.createdAt),
    lifecycleAllowed: check(
      "ProjectDocumentAsset_lifecycle_check",
      sql`${table.lifecycle} in ('active', 'withdrawn', 'deletion_pending', 'deleted')`
    ),
  })
);

export type ProjectDocumentAsset = InferSelectModel<
  typeof projectDocumentAsset
>;

export const projectDocumentVersion = pgTable(
  "ProjectDocumentVersion",
  {
    projectId: uuid("projectId").notNull(),
    assetId: uuid("assetId").notNull(),
    versionId: uuid("versionId").primaryKey().notNull().defaultRandom(),
    versionNumber: integer("versionNumber").notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    byteSize: integer("byteSize").notNull(),
    canonicalMime: varchar("canonicalMime", { length: 255 }).notNull(),
    originKind: varchar("originKind", {
      enum: PROJECT_DOCUMENT_ORIGIN_KINDS,
    }).notNull(),
    // Optional provenance identifiers only. These are deliberately not FKs to
    // Chat or MatterDocument and grant no authority over either source.
    sourceChatId: uuid("sourceChatId"),
    sourceDocumentId: uuid("sourceDocumentId"),
    sourceSha256: varchar("sourceSha256", { length: 64 }),
    uploadedByUserId: uuid("uploadedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    storageStatus: varchar("storageStatus", {
      enum: PROJECT_DOCUMENT_STORAGE_STATUSES,
    })
      .notNull()
      .default("pending"),
    securityStatus: varchar("securityStatus", {
      enum: PROJECT_DOCUMENT_SECURITY_STATUSES,
    })
      .notNull()
      .default("pending"),
    processingGeneration: integer("processingGeneration").notNull().default(1),
    storageObjectVersionId: varchar("storageObjectVersionId", {
      length: 256,
    }),
    storageVerifiedAt: timestamp("storageVerifiedAt"),
  },
  (table) => ({
    projectIdVersionUnique: uniqueIndex(
      "ProjectDocumentVersion_project_version_unique"
    ).on(table.projectId, table.versionId),
    projectAssetVersionUnique: uniqueIndex(
      "ProjectDocumentVersion_project_asset_version_unique"
    ).on(table.projectId, table.assetId, table.versionId),
    projectVersionDigestUnique: uniqueIndex(
      "ProjectDocumentVersion_project_version_sha256_unique"
    ).on(table.projectId, table.versionId, table.sha256),
    projectAssetNumberUnique: uniqueIndex(
      "ProjectDocumentVersion_project_asset_number_unique"
    ).on(table.projectId, table.assetId, table.versionNumber),
    storageKeyUnique: uniqueIndex(
      "ProjectDocumentVersion_storage_key_unique"
    ).on(table.storageKey),
    projectAssetForeignKey: foreignKey({
      columns: [table.projectId, table.assetId],
      foreignColumns: [projectDocumentAsset.projectId, projectDocumentAsset.id],
      name: "ProjectDocumentVersion_project_asset_fk",
    }).onDelete("restrict"),
    versionNumberPositive: check(
      "ProjectDocumentVersion_version_number_check",
      sql`${table.versionNumber} > 0`
    ),
    sizePositive: check(
      "ProjectDocumentVersion_byte_size_check",
      sql`${table.byteSize} > 0`
    ),
    generationPositive: check(
      "ProjectDocumentVersion_generation_check",
      sql`${table.processingGeneration} > 0`
    ),
    storageKeyPresent: check(
      "ProjectDocumentVersion_storage_key_check",
      sql`length(trim(${table.storageKey})) > 0`
    ),
    digestValid: check(
      "ProjectDocumentVersion_sha256_check",
      sql`${table.sha256} ~ '^[0-9a-f]{64}$'`
    ),
    sourceDigestValid: check(
      "ProjectDocumentVersion_source_sha256_check",
      sql`${table.sourceSha256} is null or ${table.sourceSha256} ~ '^[0-9a-f]{64}$'`
    ),
    canonicalMimeValid: check(
      "ProjectDocumentVersion_canonical_mime_check",
      sql`${table.canonicalMime} ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'`
    ),
    originKindAllowed: check(
      "ProjectDocumentVersion_origin_kind_check",
      sql`${table.originKind} in ('direct_upload', 'explicit_chat_import')`
    ),
    storageStatusAllowed: check(
      "ProjectDocumentVersion_storage_status_check",
      sql`${table.storageStatus} in ('pending', 'stored', 'failed', 'cleanup_pending')`
    ),
    securityStatusAllowed: check(
      "ProjectDocumentVersion_security_status_check",
      sql`${table.securityStatus} in ('pending', 'clean', 'rejected', 'failed')`
    ),
    storageObjectVersionShape: check(
      "ProjectDocumentVersion_storage_object_version_shape_check",
      sql`(${table.storageObjectVersionId} is null and ${table.storageVerifiedAt} is null) or (${table.storageObjectVersionId} is not null and length(trim(${table.storageObjectVersionId})) between 1 and 256 and ${table.storageVerifiedAt} is not null)`
    ),
  })
);

export type ProjectDocumentVersion = InferSelectModel<
  typeof projectDocumentVersion
>;

export const projectDocumentGrant = pgTable(
  "ProjectDocumentGrant",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    assetId: uuid("assetId").notNull(),
    versionId: uuid("versionId").notNull(),
    grantorUserId: uuid("grantorUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    grantorAuthorityBasis: varchar("grantorAuthorityBasis", {
      length: 64,
    }).notNull(),
    granteeKind: varchar("granteeKind", {
      enum: PROJECT_DOCUMENT_GRANT_RECIPIENT_KINDS,
    }).notNull(),
    granteeUserId: uuid("granteeUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    purpose: varchar("purpose", {
      enum: PROJECT_DOCUMENT_GRANT_PURPOSES,
    }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    revokedAt: timestamp("revokedAt"),
    revision: integer("revision").notNull().default(1),
  },
  (table) => ({
    projectAssetForeignKey: foreignKey({
      columns: [table.projectId, table.assetId],
      foreignColumns: [projectDocumentAsset.projectId, projectDocumentAsset.id],
      name: "ProjectDocumentGrant_project_asset_fk",
    }).onDelete("restrict"),
    projectAssetVersionForeignKey: foreignKey({
      columns: [table.projectId, table.assetId, table.versionId],
      foreignColumns: [
        projectDocumentVersion.projectId,
        projectDocumentVersion.assetId,
        projectDocumentVersion.versionId,
      ],
      name: "ProjectDocumentGrant_project_asset_version_fk",
    }).onDelete("restrict"),
    activeScopeUnique: uniqueIndex(
      "ProjectDocumentGrant_active_scope_purpose_unique"
    )
      .on(
        table.projectId,
        table.assetId,
        table.versionId,
        table.granteeKind,
        sql`coalesce(${table.granteeUserId}, ${table.projectId})`,
        table.purpose
      )
      .where(sql`${table.revokedAt} is null`),
    grantorAuthorityBasisPresent: check(
      "ProjectDocumentGrant_authority_basis_check",
      sql`length(trim(${table.grantorAuthorityBasis})) between 1 and 64`
    ),
    recipientShapeValid: check(
      "ProjectDocumentGrant_recipient_shape_check",
      sql`(${table.granteeKind} = 'user' and ${table.granteeUserId} is not null) or (${table.granteeKind} = 'project' and ${table.granteeUserId} is null)`
    ),
    purposeAllowed: check(
      "ProjectDocumentGrant_purpose_check",
      sql`${table.purpose} in ('metadata_read', 'content_read', 'download', 'extract', 'ai_context', 'future_package')`
    ),
    revisionPositive: check(
      "ProjectDocumentGrant_revision_check",
      sql`${table.revision} > 0`
    ),
  })
);

export type ProjectDocumentGrant = InferSelectModel<
  typeof projectDocumentGrant
>;

export const projectDocumentProcessingRun = pgTable(
  "ProjectDocumentProcessingRun",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    versionId: uuid("versionId").notNull(),
    generation: integer("generation").notNull(),
    operationKind: varchar("operationKind", {
      enum: PROJECT_DOCUMENT_RUN_KINDS,
    }).notNull(),
    providerCode: varchar("providerCode", { length: 64 }).notNull(),
    providerEventId: varchar("providerEventId", { length: 128 }),
    initiatedByUserId: uuid("initiatedByUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    servicePrincipalCode: varchar("servicePrincipalCode", { length: 64 }),
    objectSha256: varchar("objectSha256", { length: 64 }).notNull(),
    eventFingerprint: varchar("eventFingerprint", { length: 64 }),
    status: varchar("status", {
      enum: PROJECT_DOCUMENT_RUN_STATUSES,
    })
      .notNull()
      .default("started"),
    verdict: varchar("verdict", { length: 64 }),
    startedAt: timestamp("startedAt").notNull().defaultNow(),
    completedAt: timestamp("completedAt"),
    errorCode: varchar("errorCode", { length: 128 }),
  },
  (table) => ({
    projectVersionDigestForeignKey: foreignKey({
      columns: [table.projectId, table.versionId, table.objectSha256],
      foreignColumns: [
        projectDocumentVersion.projectId,
        projectDocumentVersion.versionId,
        projectDocumentVersion.sha256,
      ],
      name: "ProjectDocumentProcessingRun_project_version_sha256_fk",
    }).onDelete("restrict"),
    scanGenerationUnique: uniqueIndex("ProjectDocRun_scan_generation_unique")
      .on(table.projectId, table.versionId, table.generation)
      .where(sql`${table.operationKind} = 'scan'`),
    extractionParserUnique: uniqueIndex(
      "ProjectDocRun_extract_parser_generation_unique"
    )
      .on(
        table.projectId,
        table.versionId,
        table.generation,
        table.providerCode
      )
      .where(sql`${table.operationKind} = 'extract'`),
    runIdentityUnique: uniqueIndex(
      "ProjectDocRun_project_version_generation_id_unique"
    ).on(table.projectId, table.versionId, table.generation, table.id),
    providerEventUnique: uniqueIndex(
      "ProjectDocumentProcessingRun_provider_event_unique"
    )
      .on(table.providerCode, table.providerEventId)
      .where(sql`${table.providerEventId} is not null`),
    providerCodePresent: check(
      "ProjectDocumentProcessingRun_provider_check",
      sql`length(trim(${table.providerCode})) between 1 and 64`
    ),
    providerEventIdPresent: check(
      "ProjectDocumentProcessingRun_provider_event_check",
      sql`${table.providerEventId} is null or length(trim(${table.providerEventId})) between 1 and 128`
    ),
    actorShapeValid: check(
      "ProjectDocumentProcessingRun_actor_shape_check",
      sql`(${table.initiatedByUserId} is not null and ${table.servicePrincipalCode} is null) or (${table.initiatedByUserId} is null and ${table.servicePrincipalCode} is not null and length(trim(${table.servicePrincipalCode})) between 1 and 64)`
    ),
    objectDigestValid: check(
      "ProjectDocumentProcessingRun_object_sha256_check",
      sql`${table.objectSha256} ~ '^[0-9a-f]{64}$'`
    ),
    eventFingerprintValid: check(
      "ProjectDocumentProcessingRun_event_fingerprint_check",
      sql`${table.eventFingerprint} is null or ${table.eventFingerprint} ~ '^[0-9a-f]{64}$'`
    ),
    generationPositive: check(
      "ProjectDocumentProcessingRun_generation_check",
      sql`${table.generation} > 0`
    ),
    operationKindAllowed: check(
      "ProjectDocumentProcessingRun_kind_check",
      sql`${table.operationKind} in ('scan', 'extract')`
    ),
    statusAllowed: check(
      "ProjectDocumentProcessingRun_status_check",
      sql`${table.status} in ('started', 'completed', 'failed')`
    ),
    verdictCodeValid: check(
      "ProjectDocumentProcessingRun_verdict_check",
      sql`${table.verdict} is null or ${table.verdict} ~ '^[a-z][a-z0-9_.-]{0,63}$'`
    ),
    outcomeConsistent: check(
      "ProjectDocumentProcessingRun_outcome_check",
      sql`(${table.status} = 'started' and ${table.completedAt} is null and ${table.verdict} is null and ${table.errorCode} is null) or (${table.status} = 'completed' and ${table.completedAt} is not null and ${table.completedAt} >= ${table.startedAt} and ${table.verdict} is not null and ${table.errorCode} is null) or (${table.status} = 'failed' and ${table.completedAt} is not null and ${table.completedAt} >= ${table.startedAt} and ${table.verdict} is null and ${table.errorCode} is not null and length(trim(${table.errorCode})) between 1 and 128)`
    ),
  })
);

export type ProjectDocumentProcessingRun = InferSelectModel<
  typeof projectDocumentProcessingRun
>;

export const PROJECT_DOCUMENT_INTENT_KINDS = [
  "direct_upload",
  "chat_document_import",
] as const;
export type ProjectDocumentIntentKind =
  (typeof PROJECT_DOCUMENT_INTENT_KINDS)[number];

export const PROJECT_DOCUMENT_INTENT_STATUSES = [
  "intent_created",
  "stored",
  "failed",
  "cleanup_pending",
] as const;
export type ProjectDocumentIntentStatus =
  (typeof PROJECT_DOCUMENT_INTENT_STATUSES)[number];

export const projectDocumentIntent = pgTable(
  "ProjectDocumentIntent",
  {
    operationRecordId: uuid("operationRecordId")
      .primaryKey()
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    projectId: uuid("projectId")
      .notNull()
      .references(() => studyJourneyProject.id, { onDelete: "restrict" }),
    assetId: uuid("assetId").notNull(),
    versionId: uuid("versionId").notNull(),
    intentKind: varchar("intentKind", {
      enum: PROJECT_DOCUMENT_INTENT_KINDS,
    }).notNull(),
    status: varchar("status", {
      enum: PROJECT_DOCUMENT_INTENT_STATUSES,
    })
      .notNull()
      .default("intent_created"),
    generation: integer("generation").notNull(),
    errorCode: varchar("errorCode", { length: 64 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    projectOperationUnique: uniqueIndex(
      "ProjectDocumentIntent_project_operation_unique"
    ).on(table.projectId, table.operationRecordId),
    projectVersionUnique: uniqueIndex(
      "ProjectDocumentIntent_project_version_unique"
    ).on(table.projectId, table.versionId),
    exactVersionForeignKey: foreignKey({
      columns: [table.projectId, table.assetId, table.versionId],
      foreignColumns: [
        projectDocumentVersion.projectId,
        projectDocumentVersion.assetId,
        projectDocumentVersion.versionId,
      ],
      name: "ProjectDocumentIntent_project_asset_version_fk",
    }).onDelete("restrict"),
    generationPositive: check(
      "ProjectDocumentIntent_generation_check",
      sql`${table.generation} > 0`
    ),
    statusAllowed: check(
      "ProjectDocumentIntent_status_check",
      sql`${table.status} in ('intent_created', 'stored', 'failed', 'cleanup_pending')`
    ),
    kindAllowed: check(
      "ProjectDocumentIntent_kind_check",
      sql`${table.intentKind} in ('direct_upload', 'chat_document_import')`
    ),
    outcomeConsistent: check(
      "ProjectDocumentIntent_outcome_check",
      sql`(${table.status} in ('intent_created', 'stored') and ${table.errorCode} is null) or (${table.status} in ('failed', 'cleanup_pending') and ${table.errorCode} is not null and length(trim(${table.errorCode})) between 1 and 64)`
    ),
    timestampsOrdered: check(
      "ProjectDocumentIntent_timestamps_check",
      sql`${table.updatedAt} >= ${table.createdAt}`
    ),
  })
);

export type ProjectDocumentIntent = InferSelectModel<
  typeof projectDocumentIntent
>;

export const projectDocumentImportConsent = pgTable(
  "ProjectDocumentImportConsent",
  {
    operationRecordId: uuid("operationRecordId")
      .primaryKey()
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    projectId: uuid("projectId").notNull(),
    actorUserId: uuid("actorUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    sourceChatId: uuid("sourceChatId").notNull(),
    sourceDocumentId: uuid("sourceDocumentId").notNull(),
    sourceSha256: varchar("sourceSha256", { length: 64 }).notNull(),
    noticeVersion: varchar("noticeVersion", { length: 128 }).notNull(),
    acceptedAt: timestamp("acceptedAt").notNull(),
    accepted: boolean("accepted").notNull().default(true),
  },
  (table) => ({
    intentForeignKey: foreignKey({
      columns: [table.projectId, table.operationRecordId],
      foreignColumns: [
        projectDocumentIntent.projectId,
        projectDocumentIntent.operationRecordId,
      ],
      name: "ProjectDocumentImportConsent_project_intent_fk",
    }).onDelete("restrict"),
    sourceDigestValid: check(
      "ProjectDocumentImportConsent_source_sha256_check",
      sql`${table.sourceSha256} ~ '^[0-9a-f]{64}$'`
    ),
    noticeVersionPresent: check(
      "ProjectDocumentImportConsent_notice_version_check",
      sql`length(trim(${table.noticeVersion})) between 1 and 128`
    ),
    acceptedTrue: check(
      "ProjectDocumentImportConsent_accepted_check",
      sql`${table.accepted} is true`
    ),
  })
);

export type ProjectDocumentImportConsent = InferSelectModel<
  typeof projectDocumentImportConsent
>;

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

export const PROJECT_REQUIREMENT_FAMILIES = [
  "school_facts",
  "school_evidence",
  "student500_facts",
  "student500_evidence",
] as const;
export type ProjectRequirementFamily =
  (typeof PROJECT_REQUIREMENT_FAMILIES)[number];

export const REQUIREMENT_TEMPLATE_REVIEW_STATES = [
  "draft",
  "provisional",
] as const;
export type RequirementTemplateReviewState =
  (typeof REQUIREMENT_TEMPLATE_REVIEW_STATES)[number];

export const PROJECT_REQUIREMENT_APPLICABILITY = [
  "unknown",
  "true",
  "false",
] as const;
export type ProjectRequirementApplicability =
  (typeof PROJECT_REQUIREMENT_APPLICABILITY)[number];

export const PROJECT_REQUIREMENT_COLLECTION_STATES = [
  "not_started",
  "in_progress",
  "evidence_attached",
  "needs_review",
  "blocked",
  "complete",
] as const;
export type ProjectRequirementCollectionState =
  (typeof PROJECT_REQUIREMENT_COLLECTION_STATES)[number];

export const requirementTemplate = pgTable(
  "RequirementTemplate",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    family: varchar("family", { enum: PROJECT_REQUIREMENT_FAMILIES }).notNull(),
    templateKey: varchar("templateKey", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    familyKeyUnique: uniqueIndex("RequirementTemplate_family_key_unique").on(
      table.family,
      table.templateKey
    ),
    familyAllowed: check(
      "RequirementTemplate_family_check",
      sql`${table.family} in ('school_facts', 'school_evidence', 'student500_facts', 'student500_evidence')`
    ),
    keyPresent: check(
      "RequirementTemplate_key_check",
      sql`length(trim(${table.templateKey})) between 1 and 128`
    ),
  })
);
export type RequirementTemplate = InferSelectModel<typeof requirementTemplate>;

export const requirementTemplateVersion = pgTable(
  "RequirementTemplateVersion",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    templateId: uuid("templateId")
      .notNull()
      .references(() => requirementTemplate.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    contentHash: varchar("contentHash", { length: 64 }).notNull(),
    schemaVersion: varchar("schemaVersion", { length: 64 }).notNull(),
    items: json("items")
      .$type<Array<{ key: string; label: string; kind: "fact" | "evidence" }>>()
      .notNull(),
    sourceProvenance: json("sourceProvenance")
      .$type<{
        sourceIdentity: string | null;
        observedAt: string | null;
        effectiveAt: string | null;
        note: string;
      }>()
      .notNull(),
    reviewState: varchar("reviewState", {
      enum: REQUIREMENT_TEMPLATE_REVIEW_STATES,
    })
      .notNull()
      .default("draft"),
    authoredByUserId: uuid("authoredByUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    reviewedByUserId: uuid("reviewedByUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    templateVersionUnique: uniqueIndex(
      "RequirementTemplateVersion_template_version_unique"
    ).on(table.templateId, table.version),
    idTemplateUnique: uniqueIndex(
      "RequirementTemplateVersion_id_template_unique"
    ).on(table.id, table.templateId),
    templateForeignKey: foreignKey({
      columns: [table.templateId],
      foreignColumns: [requirementTemplate.id],
      name: "RequirementTemplateVersion_template_fk",
    }).onDelete("restrict"),
    versionPositive: check(
      "RequirementTemplateVersion_version_check",
      sql`${table.version} > 0`
    ),
    contentHashValid: check(
      "RequirementTemplateVersion_content_hash_check",
      sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`
    ),
    schemaVersionPresent: check(
      "RequirementTemplateVersion_schema_version_check",
      sql`length(trim(${table.schemaVersion})) between 1 and 64`
    ),
    reviewStateAllowed: check(
      "RequirementTemplateVersion_review_state_check",
      sql`${table.reviewState} in ('draft', 'provisional')`
    ),
    reviewerUnknown: check(
      "RequirementTemplateVersion_reviewer_unknown_check",
      sql`${table.reviewedByUserId} is null`
    ),
  })
);
export type RequirementTemplateVersion = InferSelectModel<
  typeof requirementTemplateVersion
>;

export const PROJECT_REQUIREMENT_COLLECTION_ACTOR_BASES = [
  "customer_collection_update",
  "template_version_invalidation",
  "reconciliation",
] as const;
export type ProjectRequirementCollectionActorBasis =
  (typeof PROJECT_REQUIREMENT_COLLECTION_ACTOR_BASES)[number];

export const projectRequirementState = pgTable(
  "ProjectRequirementState",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => studyJourneyProject.id, { onDelete: "restrict" }),
    templateId: uuid("templateId")
      .notNull()
      .references(() => requirementTemplate.id, { onDelete: "restrict" }),
    templateVersionId: uuid("templateVersionId").notNull(),
    itemKey: varchar("itemKey", { length: 128 }).notNull(),
    applicability: varchar("applicability", {
      enum: PROJECT_REQUIREMENT_APPLICABILITY,
    })
      .notNull()
      .default("unknown"),
    collectionState: varchar("collectionState", {
      enum: PROJECT_REQUIREMENT_COLLECTION_STATES,
    })
      .notNull()
      .default("not_started"),
    factLocator: json("factLocator").$type<{
      projectId: string;
      assertionId: string;
      version: number;
    } | null>(),
    evidenceLocator: json("evidenceLocator").$type<{
      projectId: string;
      evidenceRef: string;
      version: number;
    } | null>(),
    revision: integer("revision").notNull().default(1),
    staleAt: timestamp("staleAt"),
    createdByUserId: uuid("createdByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    projectIdIdUnique: uniqueIndex(
      "ProjectRequirementState_project_id_unique"
    ).on(table.projectId, table.id),
    projectTemplateItemUnique: uniqueIndex(
      "ProjectRequirementState_project_template_item_unique"
    ).on(table.projectId, table.templateVersionId, table.itemKey),
    templateVersionForeignKey: foreignKey({
      columns: [table.templateVersionId, table.templateId],
      foreignColumns: [
        requirementTemplateVersion.id,
        requirementTemplateVersion.templateId,
      ],
      name: "ProjectRequirementState_template_version_fk",
    }).onDelete("restrict"),
    itemKeyPresent: check(
      "ProjectRequirementState_item_key_check",
      sql`length(trim(${table.itemKey})) between 1 and 128`
    ),
    applicabilityAllowed: check(
      "ProjectRequirementState_applicability_check",
      sql`${table.applicability} in ('unknown', 'true', 'false')`
    ),
    collectionStateAllowed: check(
      "ProjectRequirementState_collection_state_check",
      sql`${table.collectionState} in ('not_started', 'in_progress', 'evidence_attached', 'needs_review', 'blocked', 'complete')`
    ),
    revisionPositive: check(
      "ProjectRequirementState_revision_check",
      sql`${table.revision} > 0`
    ),
    factLocatorProjectMatch: check(
      "ProjectRequirementState_fact_locator_project_check",
      sql`${table.factLocator} is null or ${table.factLocator}->>'projectId' = ${table.projectId}::text`
    ),
    evidenceLocatorProjectMatch: check(
      "ProjectRequirementState_evidence_locator_project_check",
      sql`${table.evidenceLocator} is null or ${table.evidenceLocator}->>'projectId' = ${table.projectId}::text`
    ),
  })
);
export type ProjectRequirementState = InferSelectModel<
  typeof projectRequirementState
>;

export const projectRequirementStateEvent = pgTable(
  "ProjectRequirementStateEvent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    stateId: uuid("stateId").notNull(),
    actorUserId: uuid("actorUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    actorBasis: varchar("actorBasis", {
      enum: PROJECT_REQUIREMENT_COLLECTION_ACTOR_BASES,
    }).notNull(),
    operationRecordId: uuid("operationRecordId")
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    oldValue: json("oldValue").$type<Record<string, unknown> | null>(),
    newValue: json("newValue").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    stateForeignKey: foreignKey({
      columns: [table.projectId, table.stateId],
      foreignColumns: [
        projectRequirementState.projectId,
        projectRequirementState.id,
      ],
      name: "ProjectRequirementStateEvent_state_fk",
    }).onDelete("restrict"),
    operationStateUnique: uniqueIndex(
      "ProjectRequirementStateEvent_operation_state_unique"
    ).on(table.operationRecordId, table.stateId),
    projectCreatedIndex: index(
      "ProjectRequirementStateEvent_project_created_idx"
    ).on(table.projectId, table.createdAt),
    actorShapeValid: check(
      "ProjectRequirementStateEvent_actor_shape_check",
      sql`(${table.actorBasis} = 'customer_collection_update' and ${table.actorUserId} is not null) or (${table.actorBasis} = 'template_version_invalidation' and ${table.actorUserId} is not null) or (${table.actorBasis} = 'reconciliation' and ${table.actorUserId} is not null)`
    ),
  })
);
export type ProjectRequirementStateEvent = InferSelectModel<
  typeof projectRequirementStateEvent
>;

// Round 2 candidate evidence is exact-run scoped and never itself an AI grant.
export const projectDocumentEvidenceUnit = pgTable(
  "ProjectDocumentEvidenceUnit",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    assetId: uuid("assetId").notNull(),
    versionId: uuid("versionId").notNull(),
    processingRunId: uuid("processingRunId").notNull(),
    generation: integer("generation").notNull(),
    ordinal: integer("ordinal").notNull(),
    parserVersion: varchar("parserVersion", { length: 64 }).notNull(),
    locator: json("locator").$type<Record<string, unknown>>().notNull(),
    excerpt: text("excerpt").notNull(),
    excerptSha256: varchar("excerptSha256", { length: 64 }).notNull(),
    provenance: json("provenance").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    projectRunOrdinalUnique: uniqueIndex(
      "ProjectDocumentEvidenceUnit_project_run_ordinal_unique"
    ).on(table.projectId, table.processingRunId, table.ordinal),
    projectRunUnitUnique: uniqueIndex(
      "ProjectDocumentEvidenceUnit_project_run_id_unique"
    ).on(table.projectId, table.processingRunId, table.id),
    projectAssetVersionForeignKey: foreignKey({
      columns: [table.projectId, table.assetId, table.versionId],
      foreignColumns: [
        projectDocumentVersion.projectId,
        projectDocumentVersion.assetId,
        projectDocumentVersion.versionId,
      ],
      name: "ProjectDocumentEvidenceUnit_project_asset_version_fk",
    }).onDelete("restrict"),
    runForeignKey: foreignKey({
      columns: [
        table.projectId,
        table.versionId,
        table.generation,
        table.processingRunId,
      ],
      foreignColumns: [
        projectDocumentProcessingRun.projectId,
        projectDocumentProcessingRun.versionId,
        projectDocumentProcessingRun.generation,
        projectDocumentProcessingRun.id,
      ],
      name: "ProjectDocumentEvidenceUnit_run_fk",
    }).onDelete("restrict"),
    ordinalPositive: check(
      "ProjectDocumentEvidenceUnit_ordinal_check",
      sql`${table.ordinal} > 0`
    ),
    excerptBounded: check(
      "ProjectDocumentEvidenceUnit_excerpt_check",
      sql`length(${table.excerpt}) between 1 and 2000`
    ),
    excerptDigestValid: check(
      "ProjectDocumentEvidenceUnit_excerpt_sha256_check",
      sql`${table.excerptSha256} ~ '^[0-9a-f]{64}$'`
    ),
  })
);
export type ProjectDocumentEvidenceUnit = InferSelectModel<
  typeof projectDocumentEvidenceUnit
>;

export const projectEvidenceRef = pgTable(
  "ProjectEvidenceRef",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    processingRunId: uuid("processingRunId").notNull(),
    unitId: uuid("unitId").notNull(),
    createdByUserId: uuid("createdByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    revokedAt: timestamp("revokedAt"),
  },
  (table) => ({
    projectIdUnique: uniqueIndex("ProjectEvidenceRef_project_id_unique").on(
      table.projectId,
      table.id
    ),
    activeUnitUnique: uniqueIndex("ProjectEvidenceRef_active_unit_unique")
      .on(table.projectId, table.unitId)
      .where(sql`${table.revokedAt} is null`),
    projectUnitRunForeignKey: foreignKey({
      columns: [table.projectId, table.processingRunId, table.unitId],
      foreignColumns: [
        projectDocumentEvidenceUnit.projectId,
        projectDocumentEvidenceUnit.processingRunId,
        projectDocumentEvidenceUnit.id,
      ],
      name: "ProjectEvidenceRef_unit_fk",
    }).onDelete("restrict"),
    projectCreatedIndex: index("ProjectEvidenceRef_project_created_idx").on(
      table.projectId,
      table.createdAt
    ),
  })
);
export type ProjectEvidenceRef = InferSelectModel<typeof projectEvidenceRef>;

export const PROJECT_FACT_ORIGINS = [
  "customer_stated",
  "document_extracted",
  "ai_inferred",
  "professional_determination",
] as const;
export const PROJECT_FACT_STATES = [
  "proposed",
  "customer_confirmed",
  "rejected",
  "disputed",
  "stale",
  "superseded",
] as const;
export const PROJECT_FACT_CONFLICT_KINDS = [
  "conflict",
  "possible_conflict",
] as const;
export const PROJECT_FACT_AUDIENCES = ["actor_only", "project"] as const;

export const projectFactAssertion = pgTable(
  "ProjectFactAssertion",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    key: varchar("key", { length: 128 }).notNull(),
    valueType: varchar("valueType", { length: 16 }).notNull(),
    value: json("value").$type<unknown>().notNull(),
    normalizedComparison: varchar("normalizedComparison", {
      length: 64,
    }).notNull(),
    originKind: varchar("originKind", { enum: PROJECT_FACT_ORIGINS }).notNull(),
    state: varchar("state", { enum: PROJECT_FACT_STATES })
      .notNull()
      .default("proposed"),
    createdByUserId: uuid("createdByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    confirmedByUserId: uuid("confirmedByUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    effectiveFrom: timestamp("effectiveFrom"),
    effectiveTo: timestamp("effectiveTo"),
    observedAt: timestamp("observedAt"),
    supersedesAssertionId: uuid("supersedesAssertionId"),
    version: integer("version").notNull().default(1),
    stale: boolean("stale").notNull().default(false),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    projectIdIdUnique: uniqueIndex("ProjectFactAssertion_project_id_unique").on(
      table.projectId,
      table.id
    ),
    projectAssertionVersionUnique: uniqueIndex(
      "ProjectFactAssertion_project_id_version_unique"
    ).on(table.projectId, table.id, table.version),
    projectKeyCreatedIndex: index(
      "ProjectFactAssertion_project_key_created_idx"
    ).on(table.projectId, table.key, table.createdAt),
    keyValid: check(
      "ProjectFactAssertion_key_check",
      sql`${table.key} ~ '^[a-z][a-z0-9_.-]{0,127}$'`
    ),
    valueTypeValid: check(
      "ProjectFactAssertion_value_type_check",
      sql`${table.valueType} in ('string','number','boolean','date','json')`
    ),
    stateValid: check(
      "ProjectFactAssertion_state_check",
      sql`${table.state} in ('proposed','customer_confirmed','rejected','disputed','stale','superseded')`
    ),
    versionPositive: check(
      "ProjectFactAssertion_version_check",
      sql`${table.version} > 0`
    ),
  })
);
export type ProjectFactAssertion = InferSelectModel<
  typeof projectFactAssertion
>;

export const projectFactAssertionEvidence = pgTable(
  "ProjectFactAssertionEvidence",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    assertionId: uuid("assertionId").notNull(),
    assertionVersion: integer("assertionVersion").notNull(),
    evidenceRefId: uuid("evidenceRefId").notNull(),
    linkedByUserId: uuid("linkedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    assertionForeignKey: foreignKey({
      columns: [table.projectId, table.assertionId, table.assertionVersion],
      foreignColumns: [
        projectFactAssertion.projectId,
        projectFactAssertion.id,
        projectFactAssertion.version,
      ],
      name: "ProjectFactAssertionEvidence_assertion_fk",
    }).onDelete("restrict"),
    evidenceForeignKey: foreignKey({
      columns: [table.projectId, table.evidenceRefId],
      foreignColumns: [projectEvidenceRef.projectId, projectEvidenceRef.id],
      name: "ProjectFactAssertionEvidence_evidence_fk",
    }).onDelete("restrict"),
    assertionEvidenceUnique: uniqueIndex(
      "ProjectFactAssertionEvidence_assertion_ref_unique"
    ).on(table.assertionId, table.assertionVersion, table.evidenceRefId),
  })
);

export const projectFactAssertionEvent = pgTable(
  "ProjectFactAssertionEvent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    assertionId: uuid("assertionId").notNull(),
    actorUserId: uuid("actorUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    operationRecordId: uuid("operationRecordId")
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    eventKind: varchar("eventKind", { length: 32 }).notNull(),
    oldValue: json("oldValue").$type<Record<string, unknown> | null>(),
    newValue: json("newValue").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    assertionForeignKey: foreignKey({
      columns: [table.projectId, table.assertionId],
      foreignColumns: [projectFactAssertion.projectId, projectFactAssertion.id],
      name: "ProjectFactAssertionEvent_assertion_fk",
    }).onDelete("restrict"),
    operationUnique: uniqueIndex(
      "ProjectFactAssertionEvent_operation_unique"
    ).on(table.operationRecordId),
    eventKindValid: check(
      "ProjectFactAssertionEvent_kind_check",
      sql`${table.eventKind} in ('proposed','confirmed','rejected','disputed','published','grant_created','grant_revoked','superseded','stale')`
    ),
  })
);

export const projectFactPublication = pgTable(
  "ProjectFactPublication",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    assertionId: uuid("assertionId").notNull(),
    assertionVersion: integer("assertionVersion").notNull(),
    actorUserId: uuid("actorUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    audience: varchar("audience", { enum: PROJECT_FACT_AUDIENCES }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    revokedAt: timestamp("revokedAt"),
  },
  (table) => ({
    assertionForeignKey: foreignKey({
      columns: [table.projectId, table.assertionId, table.assertionVersion],
      foreignColumns: [
        projectFactAssertion.projectId,
        projectFactAssertion.id,
        projectFactAssertion.version,
      ],
      name: "ProjectFactPublication_assertion_fk",
    }).onDelete("restrict"),
    activeVersionUnique: uniqueIndex(
      "ProjectFactPublication_active_version_unique"
    )
      .on(table.projectId, table.assertionId, table.assertionVersion)
      .where(sql`${table.active}`),
  })
);

export const projectFactUseGrant = pgTable(
  "ProjectFactUseGrant",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    assertionId: uuid("assertionId").notNull(),
    assertionVersion: integer("assertionVersion").notNull(),
    actorUserId: uuid("actorUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    purpose: varchar("purpose", { length: 32 }).notNull(),
    audience: varchar("audience", { enum: PROJECT_FACT_AUDIENCES }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    revokedAt: timestamp("revokedAt"),
  },
  (table) => ({
    assertionForeignKey: foreignKey({
      columns: [table.projectId, table.assertionId, table.assertionVersion],
      foreignColumns: [
        projectFactAssertion.projectId,
        projectFactAssertion.id,
        projectFactAssertion.version,
      ],
      name: "ProjectFactUseGrant_assertion_fk",
    }).onDelete("restrict"),
    activeScopeUnique: uniqueIndex("ProjectFactUseGrant_active_scope_unique")
      .on(
        table.projectId,
        table.assertionId,
        table.assertionVersion,
        table.actorUserId,
        table.purpose
      )
      .where(sql`${table.revokedAt} is null`),
    purposeValid: check(
      "ProjectFactUseGrant_purpose_check",
      sql`${table.purpose} = 'ai_context'`
    ),
  })
);

export const projectFactConflict = pgTable(
  "ProjectFactConflict",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    leftAssertionId: uuid("leftAssertionId").notNull(),
    rightAssertionId: uuid("rightAssertionId").notNull(),
    kind: varchar("kind", { enum: PROJECT_FACT_CONFLICT_KINDS }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    resolvedAt: timestamp("resolvedAt"),
    resolvedByUserId: uuid("resolvedByUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
  },
  (table) => ({
    leftForeignKey: foreignKey({
      columns: [table.projectId, table.leftAssertionId],
      foreignColumns: [projectFactAssertion.projectId, projectFactAssertion.id],
      name: "ProjectFactConflict_left_assertion_fk",
    }).onDelete("restrict"),
    rightForeignKey: foreignKey({
      columns: [table.projectId, table.rightAssertionId],
      foreignColumns: [projectFactAssertion.projectId, projectFactAssertion.id],
      name: "ProjectFactConflict_right_assertion_fk",
    }).onDelete("restrict"),
    pairUnique: uniqueIndex("ProjectFactConflict_pair_unique").on(
      table.projectId,
      table.leftAssertionId,
      table.rightAssertionId
    ),
  })
);

// Phase 13 M3-002 public/general catalog. These relations deliberately have
// no FK or data dependency on Projects, private documents, or Policy Intelligence.
export const EDUCATION_RECORD_CLASSES = ["SYNTHETIC", "UNVERIFIED"] as const;
export const EDUCATION_SOURCE_FAMILIES = [
  "CRICOS",
  "STUDY_AUSTRALIA",
  "INSTITUTION",
] as const;
export const EDUCATION_ENTITY_TYPES = [
  "PROVIDER",
  "COURSE",
  "DELIVERY",
  "INTAKE",
] as const;
export const EDUCATION_SOURCE_SCOPE_KINDS = ["CATALOG", "PROVIDER"] as const;
export const EDUCATION_SOURCE_ACCESS_MODES = [
  "SYNTHETIC_FIXTURE",
  "CURATED_REFERENCE",
] as const;
export const EDUCATION_ACQUISITION_OUTCOMES = [
  "CAPTURED",
  "FAILED_FETCH",
  "FAILED_PARSE",
] as const;
export const EDUCATION_OBSERVATION_DISPOSITIONS = [
  "ASSERTION",
  "WITHDRAWAL",
  "NOT_APPLICABLE",
] as const;
export const EDUCATION_CLAIM_DOMAINS = [
  "CRICOS_REGISTRATION",
  "INSTITUTION_COURSE",
  "INSTITUTION_ADMISSIONS",
  "INSTITUTION_AVAILABILITY",
  "INSTITUTION_FEE",
  "INSTITUTION_DELIVERY",
  "INSTITUTION_INTAKE",
  "DISCOVERY",
] as const satisfies readonly ClaimDomain[];
export const EDUCATION_FIELD_KEYS = [
  "PROVIDER_LEGAL_NAME",
  "CRICOS_PROVIDER_STATUS",
  "COURSE_TITLE",
  "COURSE_QUALIFICATION_LEVEL",
  "CRICOS_COURSE_STATUS",
  "INSTITUTION_COURSE_CODE",
  "COURSE_ADMISSIONS_CRITERIA",
  "COURSE_AVAILABILITY",
  "TUITION_FEE",
  "CAMPUS_NAME",
  "DELIVERY_MODE",
  "DELIVERY_AVAILABILITY",
  "INTAKE_PERIOD",
  "INTAKE_START_DATE",
  "APPLICATION_DEADLINE",
  "INTAKE_AVAILABILITY",
  "DISCOVERY_REFERENCE",
] as const;

const educationOpaqueId = (column: AnyPgColumn) =>
  sql`${column} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'`;
const educationNormalizedToken = (column: SQLWrapper) =>
  sql`regexp_replace(trim(normalize(${column}, NFKC)), '[[:space:]]+', ' ', 'g')`;
const educationNormalizedCode = (column: SQLWrapper) =>
  sql`upper(${educationNormalizedToken(column)})`;
const educationNormalizedLabel = (column: SQLWrapper) =>
  sql`lower(${educationNormalizedToken(column)})`;
const educationUrlHostname = (column: SQLWrapper) =>
  sql`case when substring(${column} from '^https://[^/?#]+') ~ '^https://[^/@:?#]+$' then lower(substring(${column} from '^https://([^/@:?#]+)')) else null end`;

export const educationProvider = pgTable(
  "EducationProvider",
  {
    providerId: varchar("providerId", { length: 128 }).primaryKey().notNull(),
    recordClass: varchar("recordClass", {
      enum: EDUCATION_RECORD_CLASSES,
    }).notNull(),
    displayName: varchar("displayName", { length: 512 }).notNull(),
    legalName: varchar("legalName", { length: 512 }),
    aliases: jsonb("aliases").$type<readonly string[]>(),
    cricosProviderCode: varchar("cricosProviderCode", { length: 128 }),
    category: varchar("category", { length: 128 }),
  },
  (table) => ({
    idRecordClassUnique: unique("EducationProvider_id_record_class_unique").on(
      table.providerId,
      table.recordClass
    ),
    cricosProviderCodeUnique: uniqueIndex(
      "EducationProvider_cricos_code_unique"
    )
      .on(educationNormalizedCode(table.cricosProviderCode))
      .where(sql`${table.cricosProviderCode} is not null`),
    idValid: check(
      "EducationProvider_id_check",
      educationOpaqueId(table.providerId)
    ),
    recordClassValid: check(
      "EducationProvider_record_class_check",
      sql`${table.recordClass} in ('SYNTHETIC', 'UNVERIFIED')`
    ),
    displayNameValid: check(
      "EducationProvider_display_name_check",
      sql`length(trim(${table.displayName})) between 1 and 512`
    ),
    legalNameValid: check(
      "EducationProvider_legal_name_check",
      sql`${table.legalName} is null or length(trim(${table.legalName})) between 1 and 512`
    ),
    aliasesArray: check(
      "EducationProvider_aliases_check",
      sql`${table.aliases} is null or jsonb_typeof(${table.aliases}) = 'array'`
    ),
  })
);
export type EducationProviderRow = InferSelectModel<typeof educationProvider>;

export const educationCourse = pgTable(
  "EducationCourse",
  {
    courseId: varchar("courseId", { length: 128 }).primaryKey().notNull(),
    providerId: varchar("providerId", { length: 128 }).notNull(),
    recordClass: varchar("recordClass", {
      enum: EDUCATION_RECORD_CLASSES,
    }).notNull(),
    title: varchar("title", { length: 512 }).notNull(),
    qualificationLevel: varchar("qualificationLevel", { length: 128 }),
    sector: varchar("sector", { length: 128 }),
    cricosCourseCode: varchar("cricosCourseCode", { length: 128 }),
    institutionCourseCode: varchar("institutionCourseCode", { length: 128 }),
    studyField: varchar("studyField", { length: 256 }),
  },
  (table) => ({
    providerForeignKey: foreignKey({
      columns: [table.providerId, table.recordClass],
      foreignColumns: [
        educationProvider.providerId,
        educationProvider.recordClass,
      ],
      name: "EducationCourse_provider_record_class_fk",
    }).onDelete("restrict"),
    idRecordClassUnique: unique("EducationCourse_id_record_class_unique").on(
      table.courseId,
      table.recordClass
    ),
    idProviderClassUnique: unique(
      "EducationCourse_id_provider_class_unique"
    ).on(table.courseId, table.providerId, table.recordClass),
    cricosCourseIdentityUnique: uniqueIndex(
      "EducationCourse_provider_cricos_code_unique"
    )
      .on(table.providerId, educationNormalizedCode(table.cricosCourseCode))
      .where(sql`${table.cricosCourseCode} is not null`),
    institutionCourseIdentityUnique: uniqueIndex(
      "EducationCourse_provider_institution_code_unique"
    )
      .on(
        table.providerId,
        educationNormalizedCode(table.institutionCourseCode)
      )
      .where(sql`${table.institutionCourseCode} is not null`),
    idValid: check(
      "EducationCourse_id_check",
      educationOpaqueId(table.courseId)
    ),
    recordClassValid: check(
      "EducationCourse_record_class_check",
      sql`${table.recordClass} in ('SYNTHETIC', 'UNVERIFIED')`
    ),
    titleValid: check(
      "EducationCourse_title_check",
      sql`length(trim(${table.title})) between 1 and 512`
    ),
  })
);
export type EducationCourseRow = InferSelectModel<typeof educationCourse>;

export const educationDelivery = pgTable(
  "EducationDelivery",
  {
    deliveryId: varchar("deliveryId", { length: 128 }).primaryKey().notNull(),
    courseId: varchar("courseId", { length: 128 }).notNull(),
    // Denormalized solely for composite provider-scope evidence constraints.
    providerId: varchar("providerId", { length: 128 }).notNull(),
    recordClass: varchar("recordClass", {
      enum: EDUCATION_RECORD_CLASSES,
    }).notNull(),
    campusId: varchar("campusId", { length: 128 }),
    siteId: varchar("siteId", { length: 128 }),
    campusName: varchar("campusName", { length: 512 }),
    city: varchar("city", { length: 512 }),
    state: varchar("state", { length: 128 }),
    mode: varchar("mode", { length: 128 }),
  },
  (table) => ({
    courseProviderClassForeignKey: foreignKey({
      columns: [table.courseId, table.providerId, table.recordClass],
      foreignColumns: [
        educationCourse.courseId,
        educationCourse.providerId,
        educationCourse.recordClass,
      ],
      name: "EducationDelivery_course_provider_class_fk",
    }).onDelete("restrict"),
    idRecordClassUnique: unique("EducationDelivery_id_record_class_unique").on(
      table.deliveryId,
      table.recordClass
    ),
    idProviderClassUnique: unique(
      "EducationDelivery_id_provider_class_unique"
    ).on(table.deliveryId, table.providerId, table.recordClass),
    externalIdentityUnique: uniqueIndex(
      "EducationDelivery_course_location_mode_unique"
    )
      .on(
        table.courseId,
        educationNormalizedToken(
          sql`coalesce(${table.siteId}, ${table.campusId})`
        ),
        educationNormalizedLabel(table.mode)
      )
      .where(
        sql`coalesce(${table.siteId}, ${table.campusId}) is not null and ${table.mode} is not null and length(trim(${table.mode})) > 0`
      ),
    idValid: check(
      "EducationDelivery_id_check",
      educationOpaqueId(table.deliveryId)
    ),
    recordClassValid: check(
      "EducationDelivery_record_class_check",
      sql`${table.recordClass} in ('SYNTHETIC', 'UNVERIFIED')`
    ),
  })
);
export type EducationDeliveryRow = InferSelectModel<typeof educationDelivery>;

export const educationIntake = pgTable(
  "EducationIntake",
  {
    intakeId: varchar("intakeId", { length: 128 }).primaryKey().notNull(),
    deliveryId: varchar("deliveryId", { length: 128 }).notNull(),
    // Denormalized solely for composite provider-scope evidence constraints.
    providerId: varchar("providerId", { length: 128 }).notNull(),
    recordClass: varchar("recordClass", {
      enum: EDUCATION_RECORD_CLASSES,
    }).notNull(),
    intakeCode: varchar("intakeCode", { length: 128 }),
    term: varchar("term", { length: 512 }),
    year: integer("year"),
    startDate: varchar("startDate", { length: 10 }),
    applicationDeadline: varchar("applicationDeadline", { length: 10 }),
  },
  (table) => ({
    deliveryProviderClassForeignKey: foreignKey({
      columns: [table.deliveryId, table.providerId, table.recordClass],
      foreignColumns: [
        educationDelivery.deliveryId,
        educationDelivery.providerId,
        educationDelivery.recordClass,
      ],
      name: "EducationIntake_delivery_provider_class_fk",
    }).onDelete("restrict"),
    idRecordClassUnique: unique("EducationIntake_id_record_class_unique").on(
      table.intakeId,
      table.recordClass
    ),
    idProviderClassUnique: unique(
      "EducationIntake_id_provider_class_unique"
    ).on(table.intakeId, table.providerId, table.recordClass),
    codedIdentityUnique: uniqueIndex(
      "EducationIntake_delivery_code_period_unique"
    )
      .on(
        table.deliveryId,
        educationNormalizedCode(table.intakeCode),
        educationNormalizedToken(sql`coalesce(${table.term}, '')`),
        sql`coalesce(${table.year}, -1)`,
        sql`coalesce(${table.startDate}, '')`
      )
      .where(
        sql`${table.intakeCode} is not null and (${table.year} is not null or ${table.startDate} is not null)`
      ),
    datedIdentityUnique: uniqueIndex(
      "EducationIntake_delivery_date_period_unique"
    )
      .on(
        table.deliveryId,
        table.startDate,
        educationNormalizedToken(sql`coalesce(${table.term}, '')`),
        sql`coalesce(${table.year}, -1)`
      )
      .where(
        sql`${table.intakeCode} is null and ${table.startDate} is not null`
      ),
    idValid: check(
      "EducationIntake_id_check",
      educationOpaqueId(table.intakeId)
    ),
    recordClassValid: check(
      "EducationIntake_record_class_check",
      sql`${table.recordClass} in ('SYNTHETIC', 'UNVERIFIED')`
    ),
    yearValid: check(
      "EducationIntake_year_check",
      sql`${table.year} is null or ${table.year} between 1900 and 2200`
    ),
    datesValid: check(
      "EducationIntake_dates_check",
      sql`(${table.startDate} is null or ${table.startDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') and (${table.applicationDeadline} is null or ${table.applicationDeadline} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')`
    ),
  })
);
export type EducationIntakeRow = InferSelectModel<typeof educationIntake>;

export const educationSource = pgTable(
  "EducationSource",
  {
    sourceId: varchar("sourceId", { length: 128 }).primaryKey().notNull(),
    sourceFamily: varchar("sourceFamily", {
      enum: EDUCATION_SOURCE_FAMILIES,
    }).notNull(),
    recordClass: varchar("recordClass", {
      enum: EDUCATION_RECORD_CLASSES,
    }).notNull(),
    authorityName: varchar("authorityName", { length: 256 }).notNull(),
    originalUrl: varchar("originalUrl", { length: 2048 }).notNull(),
    canonicalUrl: varchar("canonicalUrl", { length: 2048 }).notNull(),
    scopeKind: varchar("scopeKind", {
      enum: EDUCATION_SOURCE_SCOPE_KINDS,
    }).notNull(),
    providerId: varchar("providerId", { length: 128 }),
    // Empty for CATALOG; equal to providerId for PROVIDER. Non-null so scope FKs are exact.
    scopeKey: varchar("scopeKey", { length: 128 }).notNull(),
    language: varchar("language", { length: 35 }).notNull(),
    accessMode: varchar("accessMode", {
      enum: EDUCATION_SOURCE_ACCESS_MODES,
    }).notNull(),
  },
  (table) => ({
    providerRecordClassForeignKey: foreignKey({
      columns: [table.providerId, table.recordClass],
      foreignColumns: [
        educationProvider.providerId,
        educationProvider.recordClass,
      ],
      name: "EducationSource_provider_record_class_fk",
    }).onDelete("restrict"),
    idFamilyClassUnique: unique("EducationSource_id_family_class_unique").on(
      table.sourceId,
      table.sourceFamily,
      table.recordClass
    ),
    idClassCanonicalUrlUnique: unique("EducationSource_id_class_url_unique").on(
      table.sourceId,
      table.recordClass,
      table.canonicalUrl
    ),
    scopeIdentityUnique: unique("EducationSource_scope_identity_unique").on(
      table.sourceId,
      table.sourceFamily,
      table.recordClass,
      table.scopeKind,
      table.scopeKey
    ),
    catalogIdentityUnique: uniqueIndex(
      "EducationSource_catalog_family_url_unique"
    )
      .on(table.sourceFamily, table.canonicalUrl)
      .where(sql`${table.scopeKind} = 'CATALOG'`),
    providerIdentityUnique: uniqueIndex(
      "EducationSource_provider_family_url_unique"
    )
      .on(table.sourceFamily, table.canonicalUrl, table.providerId)
      .where(sql`${table.scopeKind} = 'PROVIDER'`),
    idValid: check(
      "EducationSource_id_check",
      educationOpaqueId(table.sourceId)
    ),
    familyValid: check(
      "EducationSource_family_check",
      sql`${table.sourceFamily} in ('CRICOS', 'STUDY_AUSTRALIA', 'INSTITUTION')`
    ),
    recordClassValid: check(
      "EducationSource_record_class_check",
      sql`${table.recordClass} in ('SYNTHETIC', 'UNVERIFIED')`
    ),
    scopeValid: check(
      "EducationSource_scope_check",
      sql`((${table.scopeKind} = 'CATALOG' and ${table.providerId} is null and ${table.scopeKey} = '' and ${table.sourceFamily} <> 'INSTITUTION') or (${table.scopeKind} = 'PROVIDER' and ${table.providerId} is not null and ${table.scopeKey} = ${table.providerId} and ${table.sourceFamily} = 'INSTITUTION'))`
    ),
    accessClassValid: check(
      "EducationSource_access_class_check",
      sql`(${table.recordClass} = 'SYNTHETIC' and ${table.accessMode} = 'SYNTHETIC_FIXTURE') or (${table.recordClass} = 'UNVERIFIED' and ${table.accessMode} = 'CURATED_REFERENCE')`
    ),
    authorityValid: check(
      "EducationSource_authority_check",
      sql`length(trim(${table.authorityName})) between 1 and 256`
    ),
    urlsValid: check(
      "EducationSource_urls_check",
      sql`${table.originalUrl} like 'https://%' and ${table.canonicalUrl} like 'https://%' and position('#' in ${table.canonicalUrl}) = 0`
    ),
    classHostValid: check(
      "EducationSource_class_host_check",
      sql`${educationUrlHostname(table.canonicalUrl)} is not null and ((${table.recordClass} = 'SYNTHETIC' and ((${table.sourceFamily} = 'CRICOS' and ${educationUrlHostname(table.canonicalUrl)} ~ '[.]cricos[.]example$') or (${table.sourceFamily} = 'STUDY_AUSTRALIA' and ${educationUrlHostname(table.canonicalUrl)} ~ '[.]study-australia[.]example$') or (${table.sourceFamily} = 'INSTITUTION' and ${educationUrlHostname(table.canonicalUrl)} ~ '[.]institution[.]example$'))) or (${table.recordClass} = 'UNVERIFIED' and ${educationUrlHostname(table.canonicalUrl)} !~ '[.]example$'))`
    ),
    languageValid: check(
      "EducationSource_language_check",
      sql`length(trim(${table.language})) between 1 and 35`
    ),
  })
);
export type EducationSourceRow = InferSelectModel<typeof educationSource>;

export const educationSnapshot = pgTable(
  "EducationSnapshot",
  {
    snapshotId: varchar("snapshotId", { length: 128 }).primaryKey().notNull(),
    sourceId: varchar("sourceId", { length: 128 }).notNull(),
    recordClass: varchar("recordClass", {
      enum: EDUCATION_RECORD_CLASSES,
    }).notNull(),
    sourceUrl: varchar("sourceUrl", { length: 2048 }).notNull(),
    // Text preserves date-only versus offset-bearing source boundaries verbatim.
    retrievedAt: varchar("retrievedAt", { length: 64 }).notNull(),
    observedAt: varchar("observedAt", { length: 64 }).notNull(),
    publishedAt: varchar("publishedAt", { length: 64 }),
    effectiveFrom: varchar("effectiveFrom", { length: 64 }),
    effectiveTo: varchar("effectiveTo", { length: 64 }),
    contentSha256: varchar("contentSha256", { length: 64 }),
    parserVersion: varchar("parserVersion", { length: 128 }),
    contentExcerpt: varchar("contentExcerpt", { length: 4096 }),
    locator: varchar("locator", { length: 512 }),
    acquisitionOutcome: varchar("acquisitionOutcome", {
      enum: EDUCATION_ACQUISITION_OUTCOMES,
    }).notNull(),
  },
  (table) => ({
    sourceClassUrlForeignKey: foreignKey({
      columns: [table.sourceId, table.recordClass, table.sourceUrl],
      foreignColumns: [
        educationSource.sourceId,
        educationSource.recordClass,
        educationSource.canonicalUrl,
      ],
      name: "EducationSnapshot_source_class_url_fk",
    }).onDelete("restrict"),
    idSourceEvidenceUnique: unique(
      "EducationSnapshot_id_source_evidence_unique"
    ).on(
      table.snapshotId,
      table.sourceId,
      table.recordClass,
      table.sourceUrl,
      table.contentSha256,
      table.acquisitionOutcome
    ),
    sourceRetrievedIndex: index("EducationSnapshot_source_retrieved_idx").on(
      table.sourceId,
      table.retrievedAt,
      table.snapshotId
    ),
    idValid: check(
      "EducationSnapshot_id_check",
      educationOpaqueId(table.snapshotId)
    ),
    recordClassValid: check(
      "EducationSnapshot_record_class_check",
      sql`${table.recordClass} in ('SYNTHETIC', 'UNVERIFIED')`
    ),
    outcomeValid: check(
      "EducationSnapshot_outcome_check",
      sql`${table.acquisitionOutcome} in ('CAPTURED', 'FAILED_FETCH', 'FAILED_PARSE')`
    ),
    sourceTimesValid: check(
      "EducationSnapshot_times_check",
      sql`${table.retrievedAt} ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.+(Z|[+-][0-9]{2}:[0-9]{2})$' and ${table.observedAt} ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.+(Z|[+-][0-9]{2}:[0-9]{2})$'`
    ),
    sourceDatesValid: check(
      "EducationSnapshot_source_dates_check",
      sql`(${table.publishedAt} is null or ${table.publishedAt} ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T.+(Z|[+-][0-9]{2}:[0-9]{2}))?$') and (${table.effectiveFrom} is null or ${table.effectiveFrom} ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T.+(Z|[+-][0-9]{2}:[0-9]{2}))?$') and (${table.effectiveTo} is null or ${table.effectiveTo} ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T.+(Z|[+-][0-9]{2}:[0-9]{2}))?$')`
    ),
    contentHashValid: check(
      "EducationSnapshot_hash_check",
      sql`(${table.contentSha256} is null or ${table.contentSha256} ~ '^[a-fA-F0-9]{64}$') and (${table.acquisitionOutcome} = 'FAILED_FETCH' or ${table.contentSha256} is not null)`
    ),
  })
);
export type EducationSnapshotRow = InferSelectModel<typeof educationSnapshot>;

export const educationFieldObservation = pgTable(
  "EducationFieldObservation",
  {
    observationId: varchar("observationId", { length: 128 })
      .primaryKey()
      .notNull(),
    targetType: varchar("targetType", {
      enum: EDUCATION_ENTITY_TYPES,
    }).notNull(),
    targetProviderId: varchar("targetProviderId", { length: 128 }).notNull(),
    providerTargetId: varchar("providerTargetId", { length: 128 }),
    courseTargetId: varchar("courseTargetId", { length: 128 }),
    deliveryTargetId: varchar("deliveryTargetId", { length: 128 }),
    intakeTargetId: varchar("intakeTargetId", { length: 128 }),
    fieldKey: varchar("fieldKey", { enum: EDUCATION_FIELD_KEYS }).notNull(),
    claimDomain: varchar("claimDomain", {
      enum: EDUCATION_CLAIM_DOMAINS,
    }).notNull(),
    recordClass: varchar("recordClass", {
      enum: EDUCATION_RECORD_CLASSES,
    }).notNull(),
    disposition: varchar("disposition", {
      enum: EDUCATION_OBSERVATION_DISPOSITIONS,
    }).notNull(),
    value: jsonb("value").$type<EducationFieldValue | null>(),
    sourceId: varchar("sourceId", { length: 128 }).notNull(),
    sourceFamily: varchar("sourceFamily", {
      enum: EDUCATION_SOURCE_FAMILIES,
    }).notNull(),
    sourceScopeKind: varchar("sourceScopeKind", {
      enum: EDUCATION_SOURCE_SCOPE_KINDS,
    }).notNull(),
    sourceScopeKey: varchar("sourceScopeKey", { length: 128 }).notNull(),
    snapshotId: varchar("snapshotId", { length: 128 }).notNull(),
    // A fixed value participates in the evidence FK so failed snapshots cannot support fields.
    snapshotOutcome: varchar("snapshotOutcome", {
      enum: EDUCATION_ACQUISITION_OUTCOMES,
    })
      .notNull()
      .default("CAPTURED"),
    sourceUrl: varchar("sourceUrl", { length: 2048 }).notNull(),
    contentSha256: varchar("contentSha256", { length: 64 }).notNull(),
    locator: varchar("locator", { length: 512 }).notNull(),
    excerpt: varchar("excerpt", { length: 4096 }),
    observedAt: varchar("observedAt", { length: 64 }).notNull(),
    effectiveFrom: varchar("effectiveFrom", { length: 64 }),
    effectiveTo: varchar("effectiveTo", { length: 64 }),
  },
  (table) => ({
    targetProviderForeignKey: foreignKey({
      columns: [table.targetProviderId, table.recordClass],
      foreignColumns: [
        educationProvider.providerId,
        educationProvider.recordClass,
      ],
      name: "EducationFieldObservation_target_provider_class_fk",
    }).onDelete("restrict"),
    providerTargetForeignKey: foreignKey({
      columns: [table.providerTargetId, table.recordClass],
      foreignColumns: [
        educationProvider.providerId,
        educationProvider.recordClass,
      ],
      name: "EducationFieldObservation_provider_target_fk",
    }).onDelete("restrict"),
    courseTargetForeignKey: foreignKey({
      columns: [
        table.courseTargetId,
        table.targetProviderId,
        table.recordClass,
      ],
      foreignColumns: [
        educationCourse.courseId,
        educationCourse.providerId,
        educationCourse.recordClass,
      ],
      name: "EducationFieldObservation_course_target_fk",
    }).onDelete("restrict"),
    deliveryTargetForeignKey: foreignKey({
      columns: [
        table.deliveryTargetId,
        table.targetProviderId,
        table.recordClass,
      ],
      foreignColumns: [
        educationDelivery.deliveryId,
        educationDelivery.providerId,
        educationDelivery.recordClass,
      ],
      name: "EducationFieldObservation_delivery_target_fk",
    }).onDelete("restrict"),
    intakeTargetForeignKey: foreignKey({
      columns: [
        table.intakeTargetId,
        table.targetProviderId,
        table.recordClass,
      ],
      foreignColumns: [
        educationIntake.intakeId,
        educationIntake.providerId,
        educationIntake.recordClass,
      ],
      name: "EducationFieldObservation_intake_target_fk",
    }).onDelete("restrict"),
    sourceScopeForeignKey: foreignKey({
      columns: [
        table.sourceId,
        table.sourceFamily,
        table.recordClass,
        table.sourceScopeKind,
        table.sourceScopeKey,
      ],
      foreignColumns: [
        educationSource.sourceId,
        educationSource.sourceFamily,
        educationSource.recordClass,
        educationSource.scopeKind,
        educationSource.scopeKey,
      ],
      name: "EducationFieldObservation_source_scope_fk",
    }).onDelete("restrict"),
    snapshotEvidenceForeignKey: foreignKey({
      columns: [
        table.snapshotId,
        table.sourceId,
        table.recordClass,
        table.sourceUrl,
        table.contentSha256,
        table.snapshotOutcome,
      ],
      foreignColumns: [
        educationSnapshot.snapshotId,
        educationSnapshot.sourceId,
        educationSnapshot.recordClass,
        educationSnapshot.sourceUrl,
        educationSnapshot.contentSha256,
        educationSnapshot.acquisitionOutcome,
      ],
      name: "EducationFieldObservation_snapshot_evidence_fk",
    }).onDelete("restrict"),
    targetShapeValid: check(
      "EducationFieldObservation_target_shape_check",
      sql`(${table.targetType} = 'PROVIDER' and ${table.providerTargetId} is not null and ${table.providerTargetId} = ${table.targetProviderId} and ${table.courseTargetId} is null and ${table.deliveryTargetId} is null and ${table.intakeTargetId} is null) or (${table.targetType} = 'COURSE' and ${table.providerTargetId} is null and ${table.courseTargetId} is not null and ${table.deliveryTargetId} is null and ${table.intakeTargetId} is null) or (${table.targetType} = 'DELIVERY' and ${table.providerTargetId} is null and ${table.courseTargetId} is null and ${table.deliveryTargetId} is not null and ${table.intakeTargetId} is null) or (${table.targetType} = 'INTAKE' and ${table.providerTargetId} is null and ${table.courseTargetId} is null and ${table.deliveryTargetId} is null and ${table.intakeTargetId} is not null)`
    ),
    sourceScopeMatchesTarget: check(
      "EducationFieldObservation_source_scope_target_check",
      sql`(${table.sourceScopeKind} = 'CATALOG' and ${table.sourceScopeKey} = '') or (${table.sourceScopeKind} = 'PROVIDER' and ${table.sourceScopeKey} = ${table.targetProviderId})`
    ),
    valueDispositionValid: check(
      "EducationFieldObservation_value_disposition_check",
      sql`(${table.disposition} = 'ASSERTION' and ${table.value} is not null and jsonb_typeof(${table.value}) = 'object' and (${table.value}->>'kind') in ('text', 'enum', 'boolean', 'date', 'money')) or (${table.disposition} in ('WITHDRAWAL', 'NOT_APPLICABLE') and ${table.value} is null)`
    ),
    fieldTypeValid: check(
      "EducationFieldObservation_field_type_check",
      sql`(${table.disposition} <> 'ASSERTION') or (${table.fieldKey} in ('PROVIDER_LEGAL_NAME', 'COURSE_TITLE', 'INSTITUTION_COURSE_CODE', 'COURSE_ADMISSIONS_CRITERIA', 'CAMPUS_NAME', 'INTAKE_PERIOD', 'DISCOVERY_REFERENCE') and ${table.value}->>'kind' = 'text') or (${table.fieldKey} in ('CRICOS_PROVIDER_STATUS', 'COURSE_QUALIFICATION_LEVEL', 'CRICOS_COURSE_STATUS', 'COURSE_AVAILABILITY', 'DELIVERY_MODE', 'DELIVERY_AVAILABILITY', 'INTAKE_AVAILABILITY') and ${table.value}->>'kind' = 'enum') or (${table.fieldKey} = 'TUITION_FEE' and ${table.value}->>'kind' = 'money') or (${table.fieldKey} in ('INTAKE_START_DATE', 'APPLICATION_DEADLINE') and ${table.value}->>'kind' = 'date')`
    ),
    fieldClaimDomainValid: check(
      "EducationFieldObservation_field_domain_check",
      sql`(${table.fieldKey} in ('PROVIDER_LEGAL_NAME', 'COURSE_TITLE', 'COURSE_QUALIFICATION_LEVEL', 'INSTITUTION_COURSE_CODE') and ${table.claimDomain} = 'INSTITUTION_COURSE') or (${table.fieldKey} in ('CRICOS_PROVIDER_STATUS', 'CRICOS_COURSE_STATUS') and ${table.claimDomain} = 'CRICOS_REGISTRATION') or (${table.fieldKey} = 'COURSE_ADMISSIONS_CRITERIA' and ${table.claimDomain} = 'INSTITUTION_ADMISSIONS') or (${table.fieldKey} in ('COURSE_AVAILABILITY', 'DELIVERY_AVAILABILITY') and ${table.claimDomain} = 'INSTITUTION_AVAILABILITY') or (${table.fieldKey} = 'TUITION_FEE' and ${table.claimDomain} = 'INSTITUTION_FEE') or (${table.fieldKey} in ('CAMPUS_NAME', 'DELIVERY_MODE') and ${table.claimDomain} = 'INSTITUTION_DELIVERY') or (${table.fieldKey} in ('INTAKE_PERIOD', 'INTAKE_START_DATE', 'APPLICATION_DEADLINE', 'INTAKE_AVAILABILITY') and ${table.claimDomain} = 'INSTITUTION_INTAKE') or (${table.fieldKey} = 'DISCOVERY_REFERENCE' and ${table.claimDomain} = 'DISCOVERY')`
    ),
    fieldTargetTypeValid: check(
      "EducationFieldObservation_field_target_check",
      sql`(${table.fieldKey} in ('PROVIDER_LEGAL_NAME', 'CRICOS_PROVIDER_STATUS') and ${table.targetType} = 'PROVIDER') or (${table.fieldKey} in ('COURSE_TITLE', 'COURSE_QUALIFICATION_LEVEL', 'CRICOS_COURSE_STATUS', 'INSTITUTION_COURSE_CODE', 'COURSE_ADMISSIONS_CRITERIA', 'COURSE_AVAILABILITY', 'DISCOVERY_REFERENCE') and ${table.targetType} = 'COURSE') or (${table.fieldKey} in ('CAMPUS_NAME', 'DELIVERY_MODE', 'DELIVERY_AVAILABILITY') and ${table.targetType} = 'DELIVERY') or (${table.fieldKey} in ('INTAKE_PERIOD', 'INTAKE_START_DATE', 'APPLICATION_DEADLINE', 'INTAKE_AVAILABILITY') and ${table.targetType} = 'INTAKE') or (${table.fieldKey} = 'TUITION_FEE' and ${table.targetType} in ('COURSE', 'DELIVERY', 'INTAKE'))`
    ),
    sourceDomainValid: check(
      "EducationFieldObservation_source_domain_check",
      sql`(${table.claimDomain} = 'CRICOS_REGISTRATION' and ${table.sourceFamily} = 'CRICOS') or (${table.claimDomain} = 'DISCOVERY' and ${table.sourceFamily} = 'STUDY_AUSTRALIA') or (${table.claimDomain} like 'INSTITUTION_%' and ${table.sourceFamily} = 'INSTITUTION')`
    ),
    capturedSnapshotOnly: check(
      "EducationFieldObservation_snapshot_outcome_check",
      sql`${table.snapshotOutcome} = 'CAPTURED'`
    ),
    idValid: check(
      "EducationFieldObservation_id_check",
      educationOpaqueId(table.observationId)
    ),
    recordClassValid: check(
      "EducationFieldObservation_record_class_check",
      sql`${table.recordClass} in ('SYNTHETIC', 'UNVERIFIED')`
    ),
    sourceTimesValid: check(
      "EducationFieldObservation_source_dates_check",
      sql`${table.observedAt} ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.+(Z|[+-][0-9]{2}:[0-9]{2})$' and (${table.effectiveFrom} is null or ${table.effectiveFrom} ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T.+(Z|[+-][0-9]{2}:[0-9]{2}))?$') and (${table.effectiveTo} is null or ${table.effectiveTo} ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T.+(Z|[+-][0-9]{2}:[0-9]{2}))?$')`
    ),
    hashValid: check(
      "EducationFieldObservation_hash_check",
      sql`${table.contentSha256} ~ '^[a-fA-F0-9]{64}$'`
    ),
    locatorValid: check(
      "EducationFieldObservation_locator_check",
      sql`length(trim(${table.locator})) between 1 and 512`
    ),
  })
);
export type EducationFieldObservationRow = InferSelectModel<
  typeof educationFieldObservation
>;
