import { type InferSelectModel, type SQLWrapper, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
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
    ownerIdentityUnique: uniqueIndex("StudyJourneyProject_id_owner_unique").on(
      table.id,
      table.ownerUserId
    ),
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
  "project_staff_assignment_propose",
  "project_staff_assignment_owner_approve",
  "project_staff_assignment_owner_decline",
  "project_staff_assignment_lawyer_accept",
  "project_staff_assignment_lawyer_decline",
  "project_staff_assignment_owner_revoke",
  "project_staff_assignment_lawyer_resign",
  "project_staff_assignment_admin_withdraw",
  "project_staff_assignment_admin_revoke",
  "project_thread_participation_consent_create",
  "project_thread_participation_consent_withdraw",
  "project_human_message_send",
  "service_engagement_create",
  "service_engagement_agreement_draft",
  "service_engagement_agreement_issue",
  "service_engagement_agreement_accept",
  "service_engagement_signature_submit",
  "service_engagement_signature_verify",
  "service_engagement_activate",
  "service_engagement_suspend",
  "service_engagement_resume",
  "service_engagement_terminate",
  "project_resource_disclosure_grant_create",
  "project_resource_disclosure_grant_revoke",
  "service_payment_condition_record",
  "service_payment_evidence_submit",
  "service_payment_evidence_verify",
  "service_payment_resolution_record",
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
  "project_staff_assignment",
  "project_thread_participation_consent",
  "project_human_message",
  "service_engagement",
  "service_agreement_version",
  "service_agreement_acceptance",
  "service_signature_evidence",
  "project_resource_disclosure_grant",
  "service_payment_condition",
  "service_payment_evidence",
  "service_payment_resolution",
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
  "project_staff_assignment_proposed",
  "project_staff_assignment_owner_approved",
  "project_staff_assignment_owner_declined",
  "project_staff_assignment_lawyer_accepted",
  "project_staff_assignment_lawyer_declined",
  "project_staff_assignment_owner_revoked",
  "project_staff_assignment_lawyer_resigned",
  "project_staff_assignment_admin_withdrawn",
  "project_staff_assignment_admin_revoked",
  "project_thread_participation_consent_created",
  "project_thread_participation_consent_withdrawn",
  "service_engagement_created",
  "service_engagement_agreement_version_drafted",
  "service_engagement_agreement_version_issued",
  "service_engagement_agreement_accepted",
  "service_engagement_signature_evidence_recorded",
  "service_engagement_signature_evidence_verified",
  "service_engagement_signature_evidence_rejected",
  "service_engagement_activated",
  "service_engagement_suspended",
  "service_engagement_resumed",
  "service_engagement_terminated",
  "project_resource_disclosure_granted",
  "project_resource_disclosure_revoked",
  "service_payment_condition_recorded",
  "service_payment_evidence_recorded",
  "service_payment_evidence_verified",
  "service_payment_evidence_rejected",
  "service_payment_resolution_recorded",
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
  "project_staff_assignment",
  "project_thread_participation_consent",
  "service_engagement",
  "service_agreement_version",
  "service_agreement_acceptance",
  "service_signature_evidence",
  "project_resource_disclosure_grant",
  "service_payment_condition",
  "service_payment_evidence",
  "service_payment_resolution",
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
      sql`${table.operationType} in ('project_create', 'project_close', 'membership_invite', 'membership_accept', 'membership_revoke', 'project_chat_create', 'project_document_upload_intent', 'project_document_import_intent', 'project_document_storage_finalize', 'project_document_storage_fail', 'project_document_scan_finalize', 'project_document_grant_create', 'project_document_grant_revoke', 'project_document_withdraw', 'project_requirement_state_change', 'project_evidence_extract', 'project_fact_mutation', 'project_staff_assignment_propose', 'project_staff_assignment_owner_approve', 'project_staff_assignment_owner_decline', 'project_staff_assignment_lawyer_accept', 'project_staff_assignment_lawyer_decline', 'project_staff_assignment_owner_revoke', 'project_staff_assignment_lawyer_resign', 'project_staff_assignment_admin_withdraw', 'project_staff_assignment_admin_revoke', 'project_thread_participation_consent_create', 'project_thread_participation_consent_withdraw', 'project_human_message_send', 'service_engagement_create', 'service_engagement_agreement_draft', 'service_engagement_agreement_issue', 'service_engagement_agreement_accept', 'service_engagement_signature_submit', 'service_engagement_signature_verify', 'service_engagement_activate', 'service_engagement_suspend', 'service_engagement_resume', 'service_engagement_terminate', 'project_resource_disclosure_grant_create', 'project_resource_disclosure_grant_revoke',
      'service_payment_condition_record', 'service_payment_evidence_submit', 'service_payment_evidence_verify', 'service_payment_resolution_record')`
    ),
    resultKindAllowed: check(
      "ProjectOperation_result_kind_check",
      sql`${table.resultKind} in ('project', 'membership', 'chat', 'document_asset', 'document_version', 'document_scan_run', 'document_grant', 'project_requirement_state', 'document_extraction_run', 'project_fact_assertion', 'project_staff_assignment', 'project_thread_participation_consent', 'project_human_message', 'service_engagement', 'service_agreement_version', 'service_agreement_acceptance', 'service_signature_evidence', 'project_resource_disclosure_grant',
      'service_payment_condition', 'service_payment_evidence', 'service_payment_resolution')`
    ),
    actorShapeValid: check(
      "ProjectOperation_actor_shape_check",
      sql`(${table.actorKind} = 'user' and ${table.actorUserId} is not null and ${table.servicePrincipalCode} is null) or (${table.actorKind} = 'service' and ${table.actorUserId} is null and ${table.servicePrincipalCode} in ('project_document_storage_worker', 'project_document_scan_worker'))`
    ),
    actorTypeValid: check(
      "ProjectOperation_actor_type_check",
      sql`(${table.operationType} in ('project_create', 'project_close', 'membership_invite', 'membership_accept', 'membership_revoke', 'project_chat_create', 'project_document_upload_intent', 'project_document_import_intent', 'project_document_grant_create', 'project_document_grant_revoke', 'project_document_withdraw', 'project_requirement_state_change', 'project_evidence_extract', 'project_fact_mutation', 'project_staff_assignment_propose', 'project_staff_assignment_owner_approve', 'project_staff_assignment_owner_decline', 'project_staff_assignment_lawyer_accept', 'project_staff_assignment_lawyer_decline', 'project_staff_assignment_owner_revoke', 'project_staff_assignment_lawyer_resign', 'project_staff_assignment_admin_withdraw', 'project_staff_assignment_admin_revoke', 'project_thread_participation_consent_create', 'project_thread_participation_consent_withdraw', 'project_human_message_send', 'service_engagement_create', 'service_engagement_agreement_draft', 'service_engagement_agreement_issue', 'service_engagement_agreement_accept', 'service_engagement_signature_submit', 'service_engagement_signature_verify', 'service_engagement_activate', 'service_engagement_suspend', 'service_engagement_resume', 'service_engagement_terminate', 'project_resource_disclosure_grant_create', 'project_resource_disclosure_grant_revoke', 'service_payment_condition_record', 'service_payment_evidence_submit', 'service_payment_evidence_verify', 'service_payment_resolution_record') and ${table.actorKind} = 'user') or (${table.operationType} in ('project_document_storage_finalize', 'project_document_storage_fail') and ${table.actorKind} = 'service' and ${table.servicePrincipalCode} = 'project_document_storage_worker' and ${table.operationId} ~ '^[0-9a-f]{64}$') or (${table.operationType} = 'project_document_scan_finalize' and ${table.actorKind} = 'service' and ${table.servicePrincipalCode} = 'project_document_scan_worker' and ${table.operationId} ~ '^[0-9a-f]{64}$')`
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
      sql`${table.eventType} in ('project_created', 'membership_state_changed', 'project_chat_created', 'project_closed', 'project_document_intent_created', 'project_document_storage_changed', 'project_document_security_changed', 'project_document_grant_changed', 'project_document_withdrawn', 'project_requirement_state_changed', 'project_evidence_extraction_completed', 'project_fact_changed', 'project_staff_assignment_proposed', 'project_staff_assignment_owner_approved', 'project_staff_assignment_owner_declined', 'project_staff_assignment_lawyer_accepted', 'project_staff_assignment_lawyer_declined', 'project_staff_assignment_owner_revoked', 'project_staff_assignment_lawyer_resigned', 'project_staff_assignment_admin_withdrawn', 'project_staff_assignment_admin_revoked', 'project_thread_participation_consent_created', 'project_thread_participation_consent_withdrawn', 'service_engagement_created', 'service_engagement_agreement_version_drafted', 'service_engagement_agreement_version_issued', 'service_engagement_agreement_accepted', 'service_engagement_signature_evidence_recorded', 'service_engagement_signature_evidence_verified', 'service_engagement_signature_evidence_rejected', 'service_engagement_activated', 'service_engagement_suspended', 'service_engagement_resumed', 'service_engagement_terminated', 'project_resource_disclosure_granted', 'project_resource_disclosure_revoked',
      'service_payment_condition_recorded', 'service_payment_evidence_recorded', 'service_payment_evidence_verified', 'service_payment_evidence_rejected', 'service_payment_resolution_recorded')`
    ),
    subjectConsistent: check(
      "ProjectEvent_subject_check",
      sql`(${table.subjectKind} is null and ${table.subjectId} is null) or (${table.subjectKind} is not null and ${table.subjectKind} in ('project', 'membership', 'chat', 'document_asset', 'document_version', 'document_scan_run', 'document_grant', 'requirement_state', 'document_extraction_run', 'project_fact_assertion', 'project_staff_assignment', 'project_thread_participation_consent', 'service_engagement', 'service_agreement_version', 'service_agreement_acceptance', 'service_signature_evidence', 'project_resource_disclosure_grant', 'service_payment_condition', 'service_payment_evidence', 'service_payment_resolution') and ${table.subjectId} is not null)`
    ),
    actorShapeValid: check(
      "ProjectEvent_actor_shape_check",
      sql`(${table.actorKind} = 'user' and ${table.actorUserId} is not null and ${table.servicePrincipalCode} is null) or (${table.actorKind} = 'service' and ${table.actorUserId} is null and ${table.servicePrincipalCode} in ('project_document_storage_worker', 'project_document_scan_worker'))`
    ),
    documentEventSubjectValid: check(
      "ProjectEvent_document_subject_check",
      sql`(${table.eventType} not in ('project_document_intent_created', 'project_document_storage_changed', 'project_document_security_changed', 'project_document_grant_changed', 'project_document_withdrawn')) or (${table.eventType} = 'project_document_intent_created' and ${table.subjectKind} = 'document_asset') or (${table.eventType} = 'project_document_storage_changed' and ${table.subjectKind} = 'document_version') or (${table.eventType} = 'project_document_security_changed' and ${table.subjectKind} = 'document_scan_run') or (${table.eventType} = 'project_document_grant_changed' and ${table.subjectKind} = 'document_grant') or (${table.eventType} = 'project_document_withdrawn' and ${table.subjectKind} = 'document_asset')`
    ),
    humanConsentEventSubjectValid: check(
      "ProjectEvent_human_consent_subject_check",
      sql`${table.eventType} not in ('project_thread_participation_consent_created', 'project_thread_participation_consent_withdrawn') or ${table.subjectKind} = 'project_thread_participation_consent'`
    ),
    serviceEngagementEventSubjectValid: check(
      "ProjectEvent_service_engagement_subject_check",
      sql`${table.eventType} not in ('service_engagement_created', 'service_engagement_agreement_version_drafted', 'service_engagement_agreement_version_issued', 'service_engagement_agreement_accepted', 'service_engagement_signature_evidence_recorded', 'service_engagement_signature_evidence_verified', 'service_engagement_signature_evidence_rejected', 'service_engagement_activated', 'service_engagement_suspended', 'service_engagement_resumed', 'service_engagement_terminated', 'project_resource_disclosure_granted', 'project_resource_disclosure_revoked') or (${table.eventType} in ('service_engagement_created', 'service_engagement_activated', 'service_engagement_suspended', 'service_engagement_resumed', 'service_engagement_terminated') and ${table.subjectKind} = 'service_engagement') or (${table.eventType} in ('service_engagement_agreement_version_drafted', 'service_engagement_agreement_version_issued') and ${table.subjectKind} = 'service_agreement_version') or (${table.eventType} = 'service_engagement_agreement_accepted' and ${table.subjectKind} = 'service_agreement_acceptance') or (${table.eventType} in ('service_engagement_signature_evidence_recorded', 'service_engagement_signature_evidence_verified', 'service_engagement_signature_evidence_rejected') and ${table.subjectKind} = 'service_signature_evidence') or (${table.eventType} in ('project_resource_disclosure_granted', 'project_resource_disclosure_revoked') and ${table.subjectKind} = 'project_resource_disclosure_grant')`
    ),
  })
);

export type ProjectEvent = InferSelectModel<typeof projectEvent>;

export const PROJECT_STAFF_ASSIGNMENT_PURPOSES = [
  "project_staff_collaboration",
] as const;
export const PROJECT_STAFF_ASSIGNMENT_ROLES = ["lawyer"] as const;
export const PROJECT_STAFF_ASSIGNMENT_STATUSES = [
  "proposed",
  "owner_approved",
  "active",
  "declined",
  "withdrawn",
  "revoked",
] as const;
export const PROJECT_STAFF_ASSIGNMENT_TERMINAL_REASONS = [
  "owner_declined",
  "lawyer_declined",
  "admin_withdrawn",
  "owner_revoked",
  "admin_revoked",
  "lawyer_resigned",
] as const;

export const projectStaffAssignment = pgTable(
  "ProjectStaffAssignment",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => studyJourneyProject.id, { onDelete: "restrict" }),
    staffUserId: uuid("staffUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    proposedByAdminUserId: uuid("proposedByAdminUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    purpose: varchar("purpose", {
      enum: PROJECT_STAFF_ASSIGNMENT_PURPOSES,
      length: 64,
    }).notNull(),
    assignmentRole: varchar("assignmentRole", {
      enum: PROJECT_STAFF_ASSIGNMENT_ROLES,
      length: 32,
    }).notNull(),
    status: varchar("status", {
      enum: PROJECT_STAFF_ASSIGNMENT_STATUSES,
      length: 32,
    })
      .notNull()
      .default("proposed"),
    staffEmailSha256: varchar("staffEmailSha256", { length: 64 }).notNull(),
    noticeVersion: varchar("noticeVersion", { length: 128 }).notNull(),
    noticeSha256: varchar("noticeSha256", { length: 64 }).notNull(),
    proposalSha256: varchar("proposalSha256", { length: 64 }).notNull(),
    ownerApprovedByUserId: uuid("ownerApprovedByUserId").references(
      () => user.id,
      { onDelete: "restrict" }
    ),
    ownerApprovedAt: timestamp("ownerApprovedAt"),
    ownerApprovalSha256: varchar("ownerApprovalSha256", { length: 64 }),
    lawyerAcceptedAt: timestamp("lawyerAcceptedAt"),
    terminalActorUserId: uuid("terminalActorUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    terminalReasonCode: varchar("terminalReasonCode", {
      enum: PROJECT_STAFF_ASSIGNMENT_TERMINAL_REASONS,
      length: 32,
    }),
    terminalAt: timestamp("terminalAt"),
    lastProjectRevision: integer("lastProjectRevision").notNull(),
    lastOperationRecordId: uuid("lastOperationRecordId")
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    identityUnique: uniqueIndex(
      "ProjectStaffAssignment_id_project_staff_unique"
    ).on(table.id, table.projectId, table.staffUserId),
    projectStaffPurposeLiveUnique: uniqueIndex(
      "ProjectStaffAssignment_project_staff_purpose_live_unique"
    )
      .on(table.projectId, table.staffUserId, table.purpose)
      .where(sql`${table.status} in ('proposed', 'owner_approved', 'active')`),
    projectStatusIndex: index("ProjectStaffAssignment_project_status_idx").on(
      table.projectId,
      table.status
    ),
    adminProjectStatusIndex: index(
      "ProjectStaffAssignment_admin_project_status_idx"
    ).on(table.proposedByAdminUserId, table.projectId, table.status),
    staffStatusIndex: index("ProjectStaffAssignment_staff_status_idx").on(
      table.staffUserId,
      table.status
    ),
    purposeAllowed: check(
      "ProjectStaffAssignment_purpose_check",
      sql`${table.purpose} = 'project_staff_collaboration'`
    ),
    roleAllowed: check(
      "ProjectStaffAssignment_role_check",
      sql`${table.assignmentRole} = 'lawyer'`
    ),
    statusAllowed: check(
      "ProjectStaffAssignment_status_check",
      sql`${table.status} in ('proposed', 'owner_approved', 'active', 'declined', 'withdrawn', 'revoked')`
    ),
    hashShape: check(
      "ProjectStaffAssignment_hash_check",
      sql`${table.staffEmailSha256} ~ '^[0-9a-f]{64}$' and ${table.noticeSha256} ~ '^[0-9a-f]{64}$' and ${table.proposalSha256} ~ '^[0-9a-f]{64}$' and (${table.ownerApprovalSha256} is null or ${table.ownerApprovalSha256} ~ '^[0-9a-f]{64}$')`
    ),
    noticeVersionShape: check(
      "ProjectStaffAssignment_notice_version_check",
      sql`length(trim(${table.noticeVersion})) between 1 and 128`
    ),
    revisionPositive: check(
      "ProjectStaffAssignment_revision_positive_check",
      sql`${table.lastProjectRevision} > 0`
    ),
    timestampsConsistent: check(
      "ProjectStaffAssignment_timestamps_check",
      sql`${table.updatedAt} >= ${table.createdAt}`
    ),
    lifecycleConsistent: check(
      "ProjectStaffAssignment_lifecycle_check",
      sql`(
        (${table.status} = 'proposed' and ${table.ownerApprovedByUserId} is null and ${table.ownerApprovedAt} is null and ${table.ownerApprovalSha256} is null and ${table.lawyerAcceptedAt} is null and ${table.terminalActorUserId} is null and ${table.terminalReasonCode} is null and ${table.terminalAt} is null)
        or (${table.status} = 'owner_approved' and ${table.ownerApprovedByUserId} is not null and ${table.ownerApprovedAt} is not null and ${table.ownerApprovalSha256} = ${table.proposalSha256} and ${table.lawyerAcceptedAt} is null and ${table.terminalActorUserId} is null and ${table.terminalReasonCode} is null and ${table.terminalAt} is null)
        or (${table.status} = 'active' and ${table.ownerApprovedByUserId} is not null and ${table.ownerApprovedAt} is not null and ${table.ownerApprovalSha256} = ${table.proposalSha256} and ${table.lawyerAcceptedAt} is not null and ${table.terminalActorUserId} is null and ${table.terminalReasonCode} is null and ${table.terminalAt} is null)
        or (${table.status} = 'declined' and ${table.terminalActorUserId} is not null and ${table.terminalAt} is not null and ${table.terminalReasonCode} in ('owner_declined', 'lawyer_declined') and ${table.lawyerAcceptedAt} is null and ((${table.terminalReasonCode} = 'owner_declined' and ${table.ownerApprovedByUserId} is null and ${table.ownerApprovedAt} is null and ${table.ownerApprovalSha256} is null) or (${table.terminalReasonCode} = 'lawyer_declined' and ${table.ownerApprovedByUserId} is not null and ${table.ownerApprovedAt} is not null and ${table.ownerApprovalSha256} = ${table.proposalSha256})))
        or (${table.status} = 'withdrawn' and ${table.terminalActorUserId} is not null and ${table.terminalAt} is not null and ${table.terminalReasonCode} = 'admin_withdrawn' and ${table.lawyerAcceptedAt} is null)
        or (${table.status} = 'revoked' and ${table.terminalActorUserId} is not null and ${table.terminalAt} is not null and ${table.terminalReasonCode} in ('owner_revoked', 'admin_revoked', 'lawyer_resigned') and (${table.terminalReasonCode} <> 'lawyer_resigned' or ${table.lawyerAcceptedAt} is not null))
      )`
    ),
  })
);

export type ProjectStaffAssignment = InferSelectModel<
  typeof projectStaffAssignment
>;

export const PROJECT_HUMAN_THREAD_PURPOSES = [
  "one_to_one_plain_text_project_collaboration",
] as const;
export const PROJECT_HUMAN_THREAD_STATUSES = ["active", "closed"] as const;
export const PROJECT_THREAD_CONSENT_STATUSES = ["active", "withdrawn"] as const;

export const projectHumanThread = pgTable(
  "ProjectHumanThread",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    ownerUserId: uuid("ownerUserId").notNull(),
    assignmentId: uuid("assignmentId").notNull(),
    lawyerUserId: uuid("lawyerUserId").notNull(),
    purpose: varchar("purpose", { length: 64 }).notNull(),
    noticeVersion: varchar("noticeVersion", { length: 128 }).notNull(),
    noticeSha256: varchar("noticeSha256", { length: 64 }).notNull(),
    status: varchar("status", { enum: PROJECT_HUMAN_THREAD_STATUSES })
      .notNull()
      .default("active"),
    lastMessageSequence: integer("lastMessageSequence").notNull().default(0),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    identityUnique: uniqueIndex("ProjectHumanThread_identity_unique").on(
      table.id,
      table.projectId,
      table.ownerUserId,
      table.assignmentId,
      table.lawyerUserId
    ),
    projectIdentityUnique: uniqueIndex(
      "ProjectHumanThread_project_identity_unique"
    ).on(table.id, table.projectId),
    projectOwnerForeignKey: foreignKey({
      columns: [table.projectId, table.ownerUserId],
      foreignColumns: [studyJourneyProject.id, studyJourneyProject.ownerUserId],
      name: "ProjectHumanThread_project_owner_fk",
    }).onDelete("restrict"),
    assignmentForeignKey: foreignKey({
      columns: [table.assignmentId, table.projectId, table.lawyerUserId],
      foreignColumns: [
        projectStaffAssignment.id,
        projectStaffAssignment.projectId,
        projectStaffAssignment.staffUserId,
      ],
      name: "ProjectHumanThread_assignment_identity_fk",
    }).onDelete("restrict"),
    projectCreatedIndex: index("ProjectHumanThread_project_created_idx").on(
      table.projectId,
      table.createdAt,
      table.id
    ),
    purposeAllowed: check(
      "ProjectHumanThread_purpose_check",
      sql`${table.purpose} = 'one_to_one_plain_text_project_collaboration'`
    ),
    noticeShape: check(
      "ProjectHumanThread_notice_check",
      sql`length(trim(${table.noticeVersion})) between 1 and 128 and ${table.noticeSha256} ~ '^[0-9a-f]{64}$'`
    ),
    statusAllowed: check(
      "ProjectHumanThread_status_check",
      sql`${table.status} in ('active', 'closed')`
    ),
    sequenceNonnegative: check(
      "ProjectHumanThread_sequence_check",
      sql`${table.lastMessageSequence} >= 0`
    ),
  })
);

export type ProjectHumanThread = InferSelectModel<typeof projectHumanThread>;

export const projectThreadParticipationConsent = pgTable(
  "ProjectThreadParticipationConsent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    threadId: uuid("threadId").notNull(),
    projectId: uuid("projectId").notNull(),
    ownerUserId: uuid("ownerUserId").notNull(),
    assignmentId: uuid("assignmentId").notNull(),
    lawyerUserId: uuid("lawyerUserId").notNull(),
    purpose: varchar("purpose", { length: 64 }).notNull(),
    noticeVersion: varchar("noticeVersion", { length: 128 }).notNull(),
    noticeSha256: varchar("noticeSha256", { length: 64 }).notNull(),
    status: varchar("status", { enum: PROJECT_THREAD_CONSENT_STATUSES })
      .notNull()
      .default("active"),
    acceptedByUserId: uuid("acceptedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    acceptedAt: timestamp("acceptedAt").notNull().defaultNow(),
    createdOperationRecordId: uuid("createdOperationRecordId")
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    createdProjectRevision: integer("createdProjectRevision").notNull(),
    withdrawnByUserId: uuid("withdrawnByUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    withdrawnAt: timestamp("withdrawnAt"),
    withdrawnOperationRecordId: uuid("withdrawnOperationRecordId").references(
      () => projectOperation.id,
      { onDelete: "restrict" }
    ),
    withdrawnProjectRevision: integer("withdrawnProjectRevision"),
  },
  (table) => ({
    identityUnique: uniqueIndex(
      "ProjectThreadParticipationConsent_identity_unique"
    ).on(
      table.id,
      table.threadId,
      table.projectId,
      table.ownerUserId,
      table.assignmentId,
      table.lawyerUserId
    ),
    threadIdentityForeignKey: foreignKey({
      columns: [
        table.threadId,
        table.projectId,
        table.ownerUserId,
        table.assignmentId,
        table.lawyerUserId,
      ],
      foreignColumns: [
        projectHumanThread.id,
        projectHumanThread.projectId,
        projectHumanThread.ownerUserId,
        projectHumanThread.assignmentId,
        projectHumanThread.lawyerUserId,
      ],
      name: "ProjectThreadParticipationConsent_thread_identity_fk",
    }).onDelete("restrict"),
    createdOperationUnique: uniqueIndex(
      "ProjectThreadParticipationConsent_created_operation_unique"
    ).on(table.createdOperationRecordId),
    threadUnique: uniqueIndex(
      "ProjectThreadParticipationConsent_thread_unique"
    ).on(table.threadId),
    withdrawnOperationUnique: uniqueIndex(
      "ProjectThreadParticipationConsent_withdrawn_operation_unique"
    ).on(table.withdrawnOperationRecordId),
    statusIndex: index("ProjectThreadParticipationConsent_status_idx").on(
      table.projectId,
      table.status,
      table.id
    ),
    purposeAllowed: check(
      "ProjectThreadParticipationConsent_purpose_check",
      sql`${table.purpose} = 'one_to_one_plain_text_project_collaboration'`
    ),
    noticeShape: check(
      "ProjectThreadParticipationConsent_notice_check",
      sql`length(trim(${table.noticeVersion})) between 1 and 128 and ${table.noticeSha256} ~ '^[0-9a-f]{64}$'`
    ),
    statusAllowed: check(
      "ProjectThreadParticipationConsent_status_check",
      sql`${table.status} in ('active', 'withdrawn')`
    ),
    lifecycleConsistent: check(
      "ProjectThreadParticipationConsent_lifecycle_check",
      sql`(${table.status} = 'active' and ${table.withdrawnByUserId} is null and ${table.withdrawnAt} is null and ${table.withdrawnOperationRecordId} is null and ${table.withdrawnProjectRevision} is null) or (${table.status} = 'withdrawn' and ${table.withdrawnByUserId} is not null and ${table.withdrawnAt} is not null and ${table.withdrawnOperationRecordId} is not null and ${table.withdrawnProjectRevision} > ${table.createdProjectRevision})`
    ),
    revisionPositive: check(
      "ProjectThreadParticipationConsent_revision_check",
      sql`${table.createdProjectRevision} > 0 and (${table.withdrawnProjectRevision} is null or ${table.withdrawnProjectRevision} > 0)`
    ),
  })
);

export type ProjectThreadParticipationConsent = InferSelectModel<
  typeof projectThreadParticipationConsent
>;

export const projectHumanMessage = pgTable(
  "ProjectHumanMessage",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    threadId: uuid("threadId").notNull(),
    projectId: uuid("projectId").notNull(),
    sequence: integer("sequence").notNull(),
    authorUserId: uuid("authorUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    operationRecordId: uuid("operationRecordId")
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    threadSequenceUnique: uniqueIndex(
      "ProjectHumanMessage_thread_sequence_unique"
    ).on(table.threadId, table.sequence),
    operationUnique: uniqueIndex("ProjectHumanMessage_operation_unique").on(
      table.operationRecordId
    ),
    threadProjectForeignKey: foreignKey({
      columns: [table.threadId, table.projectId],
      foreignColumns: [projectHumanThread.id, projectHumanThread.projectId],
      name: "ProjectHumanMessage_thread_project_fk",
    }).onDelete("restrict"),
    sequencePositive: check(
      "ProjectHumanMessage_sequence_check",
      sql`${table.sequence} > 0`
    ),
    bodyBounded: check(
      "ProjectHumanMessage_body_check",
      sql`${table.body} ~ '[^[:space:]]' and octet_length(${table.body}) <= 8192`
    ),
  })
);

export type ProjectHumanMessage = InferSelectModel<typeof projectHumanMessage>;

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

// ---------------------------------------------------------------------------
// Phase 13 M4-004 service engagement, versioned agreements, signature evidence
// and customer-to-staff protected resource disclosure.
//
// These tables are additive and independent of M4-002 staff assignment consent
// and M4-003 thread participation consent. Drizzle Kit does not serialize
// check() constraints, so Migration 0043 appends the matching named CHECK
// statements, append-only guard triggers and M4-004 operation/event binding
// triggers explicitly.
// ---------------------------------------------------------------------------
export const SERVICE_ENGAGEMENT_SCOPE_CODES = [
  "school_admissions",
  "student_500_visa",
] as const;
export const SERVICE_ENGAGEMENT_MODES = ["self_service", "managed"] as const;
export const SERVICE_ENGAGEMENT_STATUSES = [
  "draft",
  "awaiting_customer_action",
  "active",
  "suspended",
  "terminated",
] as const;
export const SERVICE_ENGAGEMENT_TERMINAL_REASON_CODES = [
  "owner_terminated",
  "owner_requested",
] as const;
export const SERVICE_AGREEMENT_VERSION_STATUSES = [
  "draft",
  "issued",
  "superseded",
] as const;
export const SERVICE_SIGNATURE_EVIDENCE_STATUSES = [
  "pending",
  "verified",
  "rejected",
] as const;
export const SERVICE_SIGNATURE_SIGNER_ROLES = ["customer_owner"] as const;
export const DISCLOSURE_RESOURCE_CATEGORIES = [
  "project_fact",
  "project_document",
  "private_chat",
  "financial_record",
  "engagement_record",
] as const;
export const DISCLOSURE_PURPOSE_CODES = [
  "professional_review",
  "service_delivery",
] as const;
export const DISCLOSURE_GRANT_STATUSES = [
  "granted",
  "revoked",
  "expired",
] as const;

export type ServiceEngagementScopeCode =
  (typeof SERVICE_ENGAGEMENT_SCOPE_CODES)[number];
export type ServiceEngagementMode = (typeof SERVICE_ENGAGEMENT_MODES)[number];
export type ServiceEngagementStatus =
  (typeof SERVICE_ENGAGEMENT_STATUSES)[number];

export const serviceEngagement = pgTable(
  "ServiceEngagement",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    customerOwnerUserId: uuid("customerOwnerUserId").notNull(),
    serviceMode: varchar("serviceMode", { length: 32 }).notNull(),
    scopeCodes: text("scopeCodes").array().notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    // The current-version FK is declared in Migration 0043 rather than here to
    // avoid a circular TypeScript inference between this table and
    // `serviceAgreementVersion`. It is a composite
    // (`currentAgreementVersionId`, `id`) -> (`id`, `engagementId`) foreign key,
    // so the current version can only ever belong to this same engagement.
    currentAgreementVersionId: uuid("currentAgreementVersionId"),

    revision: integer("revision").notNull().default(1),
    createdProjectRevision: integer("createdProjectRevision").notNull(),
    lastProjectRevision: integer("lastProjectRevision").notNull(),
    createdOperationRecordId: uuid("createdOperationRecordId")
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    lastOperationRecordId: uuid("lastOperationRecordId")
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    activatedProjectRevision: integer("activatedProjectRevision"),
    activatedAt: timestamp("activatedAt"),
    suspendedAt: timestamp("suspendedAt"),
    terminatedAt: timestamp("terminatedAt"),
    terminalReasonCode: varchar("terminalReasonCode", { length: 32 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    projectIdentityUnique: uniqueIndex(
      "ServiceEngagement_id_project_unique"
    ).on(table.id, table.projectId),
    ownerIdentityUnique: uniqueIndex(
      "ServiceEngagement_id_project_owner_unique"
    ).on(table.id, table.projectId, table.customerOwnerUserId),
    projectLiveUnique: uniqueIndex("ServiceEngagement_project_live_unique")
      .on(table.projectId)
      .where(sql`${table.status} <> 'terminated'`),
    projectStatusIndex: index("ServiceEngagement_project_status_idx").on(
      table.projectId,
      table.status,
      table.id
    ),
    projectOwnerForeignKey: foreignKey({
      columns: [table.projectId, table.customerOwnerUserId],
      foreignColumns: [studyJourneyProject.id, studyJourneyProject.ownerUserId],
      name: "ServiceEngagement_project_owner_fk",
    }).onDelete("restrict"),
    modeAllowed: check(
      "ServiceEngagement_mode_check",
      sql`${table.serviceMode} in ('self_service', 'managed')`
    ),
    scopeAllowed: check(
      "ServiceEngagement_scope_check",
      // `array_length('{}', 1)` is NULL, so a BETWEEN test alone would accept an
      // empty array (CHECK passes when the expression is NULL). `cardinality`
      // returns 0 for `{}` and keeps the empty-array case rejected.
      sql`${table.scopeCodes} is not null and cardinality(${table.scopeCodes}) between 1 and 2 and ${table.scopeCodes} <@ array['school_admissions', 'student_500_visa']::text[]`
    ),
    statusAllowed: check(
      "ServiceEngagement_status_check",
      sql`${table.status} in ('draft', 'awaiting_customer_action', 'active', 'suspended', 'terminated')`
    ),
    revisionPositive: check(
      "ServiceEngagement_revision_check",
      sql`${table.revision} > 0 and ${table.createdProjectRevision} > 0 and ${table.lastProjectRevision} >= ${table.createdProjectRevision}`
    ),
    timestampsConsistent: check(
      "ServiceEngagement_timestamps_check",
      sql`${table.updatedAt} >= ${table.createdAt}`
    ),
    lifecycleConsistent: check(
      "ServiceEngagement_lifecycle_check",
      sql`(
        (${table.status} = 'draft' and ${table.currentAgreementVersionId} is null and ${table.activatedAt} is null and ${table.activatedProjectRevision} is null and ${table.suspendedAt} is null and ${table.terminatedAt} is null and ${table.terminalReasonCode} is null)
        or (${table.status} = 'awaiting_customer_action' and ${table.currentAgreementVersionId} is not null and ${table.activatedAt} is null and ${table.activatedProjectRevision} is null and ${table.suspendedAt} is null and ${table.terminatedAt} is null and ${table.terminalReasonCode} is null)
        or (${table.status} = 'active' and ${table.currentAgreementVersionId} is not null and ${table.activatedAt} is not null and ${table.activatedProjectRevision} is not null and ${table.terminatedAt} is null and ${table.terminalReasonCode} is null)
        or (${table.status} = 'suspended' and ${table.currentAgreementVersionId} is not null and ${table.activatedAt} is not null and ${table.activatedProjectRevision} is not null and ${table.suspendedAt} is not null and ${table.terminatedAt} is null and ${table.terminalReasonCode} is null)
        or (${table.status} = 'terminated' and ${table.terminatedAt} is not null and ${table.terminalReasonCode} in ('owner_terminated', 'owner_requested'))
      )`
    ),
  })
);

export type ServiceEngagement = InferSelectModel<typeof serviceEngagement>;

// `serviceEngagement` and `serviceAgreementVersion` reference each other; the
// forward declaration above is resolved by hoisting at module evaluation.
export const serviceAgreementVersion = pgTable(
  "ServiceAgreementVersion",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    engagementId: uuid("engagementId").notNull(),
    projectId: uuid("projectId").notNull(),
    versionNumber: integer("versionNumber").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    termsSchemaVersion: varchar("termsSchemaVersion", { length: 64 }).notNull(),
    termsPayload: text("termsPayload").notNull(),
    termsSha256: varchar("termsSha256", { length: 64 }).notNull(),
    scopeCodes: text("scopeCodes").array().notNull(),
    customerNoticeVersion: varchar("customerNoticeVersion", {
      length: 128,
    }).notNull(),
    customerNoticeSha256: varchar("customerNoticeSha256", {
      length: 64,
    }).notNull(),
    authoredByUserId: uuid("authoredByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    authorityCode: varchar("authorityCode", { length: 64 }).notNull(),
    createdProjectRevision: integer("createdProjectRevision").notNull(),
    createdOperationRecordId: uuid("createdOperationRecordId")
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    issuedAt: timestamp("issuedAt"),
    issuedProjectRevision: integer("issuedProjectRevision"),
    issuedOperationRecordId: uuid("issuedOperationRecordId").references(
      () => projectOperation.id,
      { onDelete: "restrict" }
    ),
    supersedesAgreementVersionId: uuid(
      "supersedesAgreementVersionId"
    ).references((): AnyPgColumn => serviceAgreementVersion.id, {
      onDelete: "restrict",
    }),
    supersededByAgreementVersionId: uuid(
      "supersededByAgreementVersionId"
    ).references((): AnyPgColumn => serviceAgreementVersion.id, {
      onDelete: "restrict",
    }),
    supersededAt: timestamp("supersededAt"),
    supersededOperationRecordId: uuid("supersededOperationRecordId").references(
      () => projectOperation.id,
      { onDelete: "restrict" }
    ),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    numberUnique: uniqueIndex("ServiceAgreementVersion_number_unique").on(
      table.engagementId,
      table.versionNumber
    ),
    engagementIdentityUnique: uniqueIndex(
      "ServiceAgreementVersion_engagement_identity_unique"
    ).on(table.id, table.engagementId, table.projectId),
    // Referenced by the composite `ServiceEngagement_current_agreement_fk`
    // declared in Migration 0043 (R1-06): an engagement may only point at an
    // agreement version of that same engagement.
    currentAgreementIdentityUnique: uniqueIndex(
      "ServiceAgreementVersion_id_engagement_unique"
    ).on(table.id, table.engagementId),
    hashIdentityUnique: uniqueIndex(
      "ServiceAgreementVersion_hash_identity_unique"
    ).on(table.id, table.engagementId, table.termsSha256),
    issuedUnique: uniqueIndex("ServiceAgreementVersion_issued_unique")
      .on(table.engagementId)
      .where(sql`${table.status} = 'issued'`),
    engagementStatusIndex: index(
      "ServiceAgreementVersion_engagement_status_idx"
    ).on(table.engagementId, table.status, table.versionNumber),
    engagementForeignKey: foreignKey({
      columns: [table.engagementId, table.projectId],
      foreignColumns: [serviceEngagement.id, serviceEngagement.projectId],
      name: "ServiceAgreementVersion_engagement_fk",
    }).onDelete("restrict"),
    statusAllowed: check(
      "ServiceAgreementVersion_status_check",
      sql`${table.status} in ('draft', 'issued', 'superseded')`
    ),
    versionPositive: check(
      "ServiceAgreementVersion_version_check",
      sql`${table.versionNumber} > 0`
    ),
    hashShape: check(
      "ServiceAgreementVersion_hash_check",
      sql`${table.termsSha256} ~ '^[0-9a-f]{64}$' and ${table.customerNoticeSha256} ~ '^[0-9a-f]{64}$'`
    ),
    termsBounded: check(
      "ServiceAgreementVersion_terms_check",
      sql`length(trim(${table.termsSchemaVersion})) between 1 and 64 and octet_length(${table.termsPayload}) between 2 and 65536`
    ),
    scopeAllowed: check(
      "ServiceAgreementVersion_scope_check",
      // Same empty-array correction as `ServiceEngagement_scope_check`.
      sql`${table.scopeCodes} is not null and cardinality(${table.scopeCodes}) between 1 and 2 and ${table.scopeCodes} <@ array['school_admissions', 'student_500_visa']::text[]`
    ),
    noticeShape: check(
      "ServiceAgreementVersion_notice_check",
      sql`length(trim(${table.customerNoticeVersion})) between 1 and 128`
    ),
    authorityShape: check(
      "ServiceAgreementVersion_authority_check",
      sql`length(trim(${table.authorityCode})) between 1 and 64`
    ),
    lifecycleConsistent: check(
      "ServiceAgreementVersion_lifecycle_check",
      sql`(
        (${table.status} = 'draft' and ${table.issuedAt} is null and ${table.issuedProjectRevision} is null and ${table.issuedOperationRecordId} is null and ${table.supersededAt} is null and ${table.supersededByAgreementVersionId} is null and ${table.supersededOperationRecordId} is null)
        or (${table.status} = 'issued' and ${table.issuedAt} is not null and ${table.issuedProjectRevision} is not null and ${table.issuedOperationRecordId} is not null and ${table.supersededAt} is null and ${table.supersededByAgreementVersionId} is null and ${table.supersededOperationRecordId} is null)
        or (${table.status} = 'superseded' and ${table.issuedAt} is not null and ${table.issuedProjectRevision} is not null and ${table.issuedOperationRecordId} is not null and ${table.supersededAt} is not null and ${table.supersededByAgreementVersionId} is not null and ${table.supersededOperationRecordId} is not null)
      )`
    ),
  })
);

export const serviceAgreementAcceptance = pgTable(
  "ServiceAgreementAcceptance",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    engagementId: uuid("engagementId").notNull(),
    projectId: uuid("projectId").notNull(),
    agreementVersionId: uuid("agreementVersionId").notNull(),
    termsSha256: varchar("termsSha256", { length: 64 }).notNull(),
    acceptedByUserId: uuid("acceptedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    customerNoticeVersion: varchar("customerNoticeVersion", {
      length: 128,
    }).notNull(),
    customerNoticeSha256: varchar("customerNoticeSha256", {
      length: 64,
    }).notNull(),
    acceptedProjectRevision: integer("acceptedProjectRevision").notNull(),
    acceptedAt: timestamp("acceptedAt").notNull(),
    operationRecordId: uuid("operationRecordId")
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
  },
  (table) => ({
    versionUnique: uniqueIndex("ServiceAgreementAcceptance_version_unique").on(
      table.agreementVersionId
    ),
    operationUnique: uniqueIndex(
      "ServiceAgreementAcceptance_operation_unique"
    ).on(table.operationRecordId),
    versionHashForeignKey: foreignKey({
      columns: [
        table.agreementVersionId,
        table.engagementId,
        table.termsSha256,
      ],
      foreignColumns: [
        serviceAgreementVersion.id,
        serviceAgreementVersion.engagementId,
        serviceAgreementVersion.termsSha256,
      ],
      name: "ServiceAgreementAcceptance_version_hash_fk",
    }).onDelete("restrict"),
    engagementForeignKey: foreignKey({
      columns: [table.engagementId, table.projectId],
      foreignColumns: [serviceEngagement.id, serviceEngagement.projectId],
      name: "ServiceAgreementAcceptance_engagement_fk",
    }).onDelete("restrict"),
    hashShape: check(
      "ServiceAgreementAcceptance_hash_check",
      sql`${table.termsSha256} ~ '^[0-9a-f]{64}$' and ${table.customerNoticeSha256} ~ '^[0-9a-f]{64}$'`
    ),
    noticeShape: check(
      "ServiceAgreementAcceptance_notice_check",
      sql`length(trim(${table.customerNoticeVersion})) between 1 and 128`
    ),
    revisionPositive: check(
      "ServiceAgreementAcceptance_revision_check",
      sql`${table.acceptedProjectRevision} > 0`
    ),
  })
);

export const serviceSignatureEvidence = pgTable(
  "ServiceSignatureEvidence",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    engagementId: uuid("engagementId").notNull(),
    projectId: uuid("projectId").notNull(),
    agreementVersionId: uuid("agreementVersionId").notNull(),
    termsSha256: varchar("termsSha256", { length: 64 }).notNull(),
    signerUserId: uuid("signerUserId").notNull(),
    signerRole: varchar("signerRole", { length: 32 })
      .notNull()
      .default("customer_owner"),
    evidenceRef: varchar("evidenceRef", { length: 256 }).notNull(),
    evidenceSha256: varchar("evidenceSha256", { length: 64 }).notNull(),
    signaturePayloadSha256: varchar("signaturePayloadSha256", {
      length: 64,
    }).notNull(),
    declaredSignedAt: timestamp("declaredSignedAt").notNull(),
    verificationStatus: varchar("verificationStatus", { length: 16 })
      .notNull()
      .default("pending"),
    verificationMethod: varchar("verificationMethod", { length: 64 })
      .notNull()
      .default("unverified"),
    verificationProviderCode: varchar("verificationProviderCode", {
      length: 64,
    }),
    verificationProvenance: varchar("verificationProvenance", { length: 256 }),
    submittedByUserId: uuid("submittedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    submittedAt: timestamp("submittedAt").notNull(),
    submittedProjectRevision: integer("submittedProjectRevision").notNull(),
    submittedOperationRecordId: uuid("submittedOperationRecordId")
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    verifiedAt: timestamp("verifiedAt"),
    verificationProjectRevision: integer("verificationProjectRevision"),
    verificationOperationRecordId: uuid(
      "verificationOperationRecordId"
    ).references(() => projectOperation.id, { onDelete: "restrict" }),
    rejectionReasonCode: varchar("rejectionReasonCode", { length: 64 }),
  },
  (table) => ({
    evidenceUnique: uniqueIndex("ServiceSignatureEvidence_evidence_unique").on(
      table.agreementVersionId,
      table.signerUserId,
      table.evidenceSha256
    ),
    verifiedVersionUnique: uniqueIndex(
      "ServiceSignatureEvidence_verified_version_unique"
    )
      .on(table.agreementVersionId)
      .where(sql`${table.verificationStatus} = 'verified'`),
    submittedOperationUnique: uniqueIndex(
      "ServiceSignatureEvidence_submitted_operation_unique"
    ).on(table.submittedOperationRecordId),
    verificationOperationUnique: uniqueIndex(
      "ServiceSignatureEvidence_verification_operation_unique"
    ).on(table.verificationOperationRecordId),
    engagementStatusIndex: index(
      "ServiceSignatureEvidence_engagement_status_idx"
    ).on(table.engagementId, table.verificationStatus, table.id),
    versionHashForeignKey: foreignKey({
      columns: [
        table.agreementVersionId,
        table.engagementId,
        table.termsSha256,
      ],
      foreignColumns: [
        serviceAgreementVersion.id,
        serviceAgreementVersion.engagementId,
        serviceAgreementVersion.termsSha256,
      ],
      name: "ServiceSignatureEvidence_version_hash_fk",
    }).onDelete("restrict"),
    engagementOwnerForeignKey: foreignKey({
      columns: [table.engagementId, table.projectId, table.signerUserId],
      foreignColumns: [
        serviceEngagement.id,
        serviceEngagement.projectId,
        serviceEngagement.customerOwnerUserId,
      ],
      name: "ServiceSignatureEvidence_engagement_owner_fk",
    }).onDelete("restrict"),
    statusAllowed: check(
      "ServiceSignatureEvidence_status_check",
      sql`${table.verificationStatus} in ('pending', 'verified', 'rejected')`
    ),
    signerRoleAllowed: check(
      "ServiceSignatureEvidence_signer_role_check",
      sql`${table.signerRole} = 'customer_owner'`
    ),
    hashShape: check(
      "ServiceSignatureEvidence_hash_check",
      sql`${table.termsSha256} ~ '^[0-9a-f]{64}$' and ${table.evidenceSha256} ~ '^[0-9a-f]{64}$' and ${table.signaturePayloadSha256} ~ '^[0-9a-f]{64}$'`
    ),
    evidenceRefShape: check(
      "ServiceSignatureEvidence_evidence_ref_check",
      sql`length(trim(${table.evidenceRef})) between 1 and 256 and ${table.evidenceRef} ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'`
    ),
    verificationMethodShape: check(
      "ServiceSignatureEvidence_method_check",
      sql`length(trim(${table.verificationMethod})) between 1 and 64`
    ),
    lifecycleConsistent: check(
      "ServiceSignatureEvidence_lifecycle_check",
      sql`(
        (${table.verificationStatus} = 'pending' and ${table.verificationMethod} = 'unverified' and ${table.verificationProviderCode} is null and ${table.verificationProvenance} is null and ${table.verifiedAt} is null and ${table.verificationProjectRevision} is null and ${table.verificationOperationRecordId} is null and ${table.rejectionReasonCode} is null)
        or (${table.verificationStatus} in ('verified', 'rejected') and ${table.verificationMethod} <> 'unverified' and ${table.verificationProviderCode} is not null and ${table.verificationProvenance} is not null and ${table.verifiedAt} is not null and ${table.verificationProjectRevision} is not null and ${table.verificationOperationRecordId} is not null and ((${table.verificationStatus} = 'verified' and ${table.rejectionReasonCode} is null) or (${table.verificationStatus} = 'rejected' and ${table.rejectionReasonCode} is not null)))
      )`
    ),
    revisionPositive: check(
      "ServiceSignatureEvidence_revision_check",
      sql`${table.submittedProjectRevision} > 0 and (${table.verificationProjectRevision} is null or ${table.verificationProjectRevision} > 0)`
    ),
  })
);

export const projectResourceDisclosureGrant = pgTable(
  "ProjectResourceDisclosureGrant",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => studyJourneyProject.id, { onDelete: "restrict" }),
    resourceOwnerUserId: uuid("resourceOwnerUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    recipientAssignmentId: uuid("recipientAssignmentId").notNull(),
    recipientUserId: uuid("recipientUserId").notNull(),
    resourceCategory: varchar("resourceCategory", { length: 32 }).notNull(),
    resourceId: uuid("resourceId").notNull(),
    resourceVersion: integer("resourceVersion").notNull(),
    /**
     * Opaque adapter fingerprint of the exact bytes/metadata observed when the
     * grant was created (R1-05). A disclosure is valid only while the adapter
     * still observes the same fingerprint for the same version.
     */
    resourceFingerprint: varchar("resourceFingerprint", {
      length: 128,
    }).notNull(),
    purposeCode: varchar("purposeCode", { length: 64 }).notNull(),
    noticeVersion: varchar("noticeVersion", { length: 128 }).notNull(),
    noticeSha256: varchar("noticeSha256", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("granted"),
    grantedByUserId: uuid("grantedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    grantedAt: timestamp("grantedAt").notNull(),
    grantedProjectRevision: integer("grantedProjectRevision").notNull(),
    createdOperationRecordId: uuid("createdOperationRecordId")
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expiresAt"),
    revokedByUserId: uuid("revokedByUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    revokedAt: timestamp("revokedAt"),
    revokedProjectRevision: integer("revokedProjectRevision"),
    revokedOperationRecordId: uuid("revokedOperationRecordId").references(
      () => projectOperation.id,
      { onDelete: "restrict" }
    ),
    revocationReasonCode: varchar("revocationReasonCode", { length: 32 }),
  },
  (table) => ({
    projectIdentityUnique: uniqueIndex(
      "ProjectResourceDisclosureGrant_id_project_unique"
    ).on(table.id, table.projectId),
    liveUnique: uniqueIndex("ProjectResourceDisclosureGrant_live_unique")
      .on(
        table.projectId,
        table.resourceCategory,
        table.resourceId,
        table.resourceVersion,
        table.recipientAssignmentId,
        table.purposeCode
      )
      .where(sql`${table.status} = 'granted'`),
    createdOperationUnique: uniqueIndex(
      "ProjectResourceDisclosureGrant_created_operation_unique"
    ).on(table.createdOperationRecordId),
    revokedOperationUnique: uniqueIndex(
      "ProjectResourceDisclosureGrant_revoked_operation_unique"
    ).on(table.revokedOperationRecordId),
    recipientStatusIndex: index(
      "ProjectResourceDisclosureGrant_recipient_status_idx"
    ).on(table.projectId, table.recipientUserId, table.status, table.id),
    ownerStatusIndex: index(
      "ProjectResourceDisclosureGrant_owner_status_idx"
    ).on(table.projectId, table.resourceOwnerUserId, table.status, table.id),
    assignmentForeignKey: foreignKey({
      columns: [
        table.recipientAssignmentId,
        table.projectId,
        table.recipientUserId,
      ],
      foreignColumns: [
        projectStaffAssignment.id,
        projectStaffAssignment.projectId,
        projectStaffAssignment.staffUserId,
      ],
      name: "ProjectResourceDisclosureGrant_assignment_fk",
    }).onDelete("restrict"),
    categoryAllowed: check(
      "ProjectResourceDisclosureGrant_category_check",
      sql`${table.resourceCategory} in ('project_fact', 'project_document', 'private_chat', 'financial_record', 'engagement_record')`
    ),
    purposeAllowed: check(
      "ProjectResourceDisclosureGrant_purpose_check",
      sql`${table.purposeCode} in ('professional_review', 'service_delivery')`
    ),
    statusAllowed: check(
      "ProjectResourceDisclosureGrant_status_check",
      sql`${table.status} in ('granted', 'revoked', 'expired')`
    ),
    hashShape: check(
      "ProjectResourceDisclosureGrant_hash_check",
      sql`${table.noticeSha256} ~ '^[0-9a-f]{64}$'`
    ),
    noticeShape: check(
      "ProjectResourceDisclosureGrant_notice_check",
      sql`length(trim(${table.noticeVersion})) between 1 and 128`
    ),
    versionPositive: check(
      "ProjectResourceDisclosureGrant_version_check",
      sql`${table.resourceVersion} > 0 and ${table.grantedProjectRevision} > 0 and (${table.revokedProjectRevision} is null or ${table.revokedProjectRevision} > ${table.grantedProjectRevision})`
    ),
    resourceFingerprintShape: check(
      "ProjectResourceDisclosureGrant_fingerprint_check",
      sql`${table.resourceFingerprint} ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$'`
    ),
    ownerGrantedByCheck: check(
      "ProjectResourceDisclosureGrant_owner_granted_by_check",
      sql`${table.grantedByUserId} = ${table.resourceOwnerUserId}`
    ),
    lifecycleConsistent: check(
      "ProjectResourceDisclosureGrant_lifecycle_check",
      sql`(
        (${table.status} = 'granted' and ${table.revokedByUserId} is null and ${table.revokedAt} is null and ${table.revokedProjectRevision} is null and ${table.revokedOperationRecordId} is null and ${table.revocationReasonCode} is null)
        or (${table.status} in ('revoked', 'expired') and ${table.revokedByUserId} is not null and ${table.revokedAt} is not null and ${table.revokedProjectRevision} is not null and ${table.revokedOperationRecordId} is not null and ${table.revocationReasonCode} in ('owner_revoked', 'owner_expired'))
      )`
    ),
  })
);

export type ServiceAgreementVersionRow = InferSelectModel<
  typeof serviceAgreementVersion
>;
export type ServiceAgreementAcceptanceRow = InferSelectModel<
  typeof serviceAgreementAcceptance
>;
export type ServiceSignatureEvidenceRow = InferSelectModel<
  typeof serviceSignatureEvidence
>;
export type ProjectResourceDisclosureGrantRow = InferSelectModel<
  typeof projectResourceDisclosureGrant
>;

/* ------------------------------------------------------------------------- *
 * Phase 13 M4-005 — staff-attested off-platform service payment conditions
 *
 * Three additive tables, deliberately separate from ServiceEngagement's
 * service-contract tables, from M4-003 messaging, from M4-004 disclosure
 * grants and from Stripe/VIP billing. There is no mutable "paid" column
 * anywhere: the effective status is always derived by
 * `evaluateServicePaymentState` from immutable rows.
 * ------------------------------------------------------------------------- */

export const servicePaymentCondition = pgTable(
  "ServicePaymentCondition",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    engagementId: uuid("engagementId").notNull(),
    agreementVersionId: uuid("agreementVersionId").notNull(),
    agreementTermsSha256: varchar("agreementTermsSha256", {
      length: 64,
    }).notNull(),
    requirement: varchar("requirement", { length: 16 }).notNull(),
    amountMinor: bigint("amountMinor", { mode: "number" }),
    currency: varchar("currency", { length: 3 }),
    contractualBasisCode: varchar("contractualBasisCode", {
      length: 32,
    }).notNull(),
    contractualBasisRef: varchar("contractualBasisRef", { length: 256 }),
    contractObservationSha256: varchar("contractObservationSha256", {
      length: 64,
    }).notNull(),
    contractAuthorityCode: varchar("contractAuthorityCode", {
      length: 64,
    }).notNull(),
    contractAuthorityRequestSha256: varchar("contractAuthorityRequestSha256", {
      length: 64,
    }).notNull(),
    policyVersion: varchar("policyVersion", { length: 64 }).notNull(),
    createdByUserId: uuid("createdByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdProjectRevision: integer("createdProjectRevision").notNull(),
    createdOperationRecordId: uuid("createdOperationRecordId")
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    supersedesConditionId: uuid("supersedesConditionId"),
    supersededByConditionId: uuid("supersededByConditionId"),
    supersededAt: timestamp("supersededAt"),
    supersededProjectRevision: integer("supersededProjectRevision"),
    supersededOperationRecordId: uuid("supersededOperationRecordId").references(
      () => projectOperation.id,
      { onDelete: "restrict" }
    ),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    projectIdentityUnique: uniqueIndex(
      "ServicePaymentCondition_id_project_unique"
    ).on(table.id, table.projectId),
    engagementIdentityUnique: uniqueIndex(
      "ServicePaymentCondition_id_engagement_unique"
    ).on(table.id, table.engagementId),
    // Binds the exact contract, amount and currency, so an evidence row for
    // another amount can never point at this condition.
    // Composite target for ServicePaymentResolution_condition_fk: PostgreSQL requires
    // a non-partial unique index on exactly this column set before the FK is added.
    idProjectEngagementUnique: uniqueIndex(
      "ServicePaymentCondition_id_project_engagement_unique"
    ).on(table.id, table.projectId, table.engagementId),
    scopeIdentityUnique: uniqueIndex(
      "ServicePaymentCondition_scope_identity_unique"
    ).on(
      table.id,
      table.projectId,
      table.engagementId,
      table.agreementVersionId,
      table.agreementTermsSha256,
      table.amountMinor,
      table.currency
    ),
    // At most one live condition per engagement: no ambiguous payable/void pair.
    liveUnique: uniqueIndex("ServicePaymentCondition_live_unique")
      .on(table.projectId, table.engagementId)
      .where(sql`${table.supersededAt} is null`),
    projectCreatedIndex: index(
      "ServicePaymentCondition_project_created_idx"
    ).on(table.projectId, table.createdAt, table.id),
    engagementVersionIndex: index(
      "ServicePaymentCondition_engagement_version_idx"
    ).on(table.engagementId, table.agreementVersionId),
    engagementForeignKey: foreignKey({
      columns: [table.engagementId, table.projectId],
      foreignColumns: [serviceEngagement.id, serviceEngagement.projectId],
      name: "ServicePaymentCondition_engagement_fk",
    }).onDelete("restrict"),
    agreementForeignKey: foreignKey({
      columns: [
        table.agreementVersionId,
        table.engagementId,
        table.agreementTermsSha256,
      ],
      foreignColumns: [
        serviceAgreementVersion.id,
        serviceAgreementVersion.engagementId,
        serviceAgreementVersion.termsSha256,
      ],
      name: "ServicePaymentCondition_agreement_fk",
    }).onDelete("restrict"),
    requirementAllowed: check(
      "ServicePaymentCondition_requirement_check",
      sql`${table.requirement} in ('required', 'not_required', 'unknown')`
    ),
    basisCodeAllowed: check(
      "ServicePaymentCondition_basis_code_check",
      sql`${table.contractualBasisCode} in ('agreement_clause', 'payment_schedule', 'explicit_no_advance_fee')`
    ),
    // `required` must carry a real positive amount and currency; `not_required`
    // and `unknown` must carry none, so a zero-value fiction is impossible.
    amountShape: check(
      "ServicePaymentCondition_amount_check",
      sql`(
        (${table.requirement} = 'required' and ${table.amountMinor} is not null and ${table.amountMinor} > 0 and ${table.amountMinor} <= 999999999999 and ${table.currency} ~ '^[A-Z]{3}$' and ${table.contractualBasisRef} is not null)
        or (${table.requirement} = 'not_required' and ${table.amountMinor} is null and ${table.currency} is null and ${table.contractualBasisRef} is not null)
        or (${table.requirement} = 'unknown' and ${table.amountMinor} is null and ${table.currency} is null)
      )`
    ),
    basisRefShape: check(
      "ServicePaymentCondition_basis_ref_check",
      sql`${table.contractualBasisRef} is null or ${table.contractualBasisRef} ~ '^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$'`
    ),
    hashShape: check(
      "ServicePaymentCondition_hash_check",
      sql`${table.agreementTermsSha256} ~ '^[0-9a-f]{64}$' and ${table.contractObservationSha256} ~ '^[0-9a-f]{64}$' and ${table.contractAuthorityRequestSha256} ~ '^[0-9a-f]{64}$'`
    ),
    authorityShape: check(
      "ServicePaymentCondition_authority_check",
      sql`${table.contractAuthorityCode} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' and length(${table.policyVersion}) > 0 and ${table.createdProjectRevision} > 0`
    ),
    supersessionConsistent: check(
      "ServicePaymentCondition_supersession_check",
      sql`(
        (${table.supersededAt} is null and ${table.supersededByConditionId} is null and ${table.supersededProjectRevision} is null and ${table.supersededOperationRecordId} is null)
        or (${table.supersededAt} is not null and ${table.supersededByConditionId} is not null and ${table.supersededByConditionId} <> ${table.id} and ${table.supersededProjectRevision} is not null and ${table.supersededOperationRecordId} is not null)
      )`
    ),
  })
);

export type ServicePaymentConditionRow = InferSelectModel<
  typeof servicePaymentCondition
>;

export const servicePaymentEvidence = pgTable(
  "ServicePaymentEvidence",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    engagementId: uuid("engagementId").notNull(),
    conditionId: uuid("conditionId").notNull(),
    agreementVersionId: uuid("agreementVersionId").notNull(),
    agreementTermsSha256: varchar("agreementTermsSha256", {
      length: 64,
    }).notNull(),
    evidenceCategory: varchar("evidenceCategory", { length: 32 }).notNull(),
    // Only digests are persisted: never raw receipt text, card data or a bank
    // account number.
    referenceSha256: varchar("referenceSha256", { length: 64 }).notNull(),
    observationSha256: varchar("observationSha256", { length: 64 }).notNull(),
    declaredAmountMinor: bigint("declaredAmountMinor", {
      mode: "number",
    }).notNull(),
    declaredCurrency: varchar("declaredCurrency", { length: 3 }).notNull(),
    paidAt: timestamp("paidAt").notNull(),
    submittedByUserId: uuid("submittedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    submittedAt: timestamp("submittedAt").notNull(),
    submittedProjectRevision: integer("submittedProjectRevision").notNull(),
    submittedOperationRecordId: uuid("submittedOperationRecordId")
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    verificationStatus: varchar("verificationStatus", { length: 16 })
      .notNull()
      .default("pending"),
    verificationMethod: varchar("verificationMethod", { length: 64 }),
    verificationProviderCode: varchar("verificationProviderCode", {
      length: 64,
    }),
    verificationProvenance: varchar("verificationProvenance", {
      length: 256,
    }),
    verifiedByUserId: uuid("verifiedByUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    verifiedAt: timestamp("verifiedAt"),
    verificationProjectRevision: integer("verificationProjectRevision"),
    verificationOperationRecordId: uuid(
      "verificationOperationRecordId"
    ).references(() => projectOperation.id, { onDelete: "restrict" }),
    rejectionReasonCode: varchar("rejectionReasonCode", { length: 64 }),
  },
  (table) => ({
    projectIdentityUnique: uniqueIndex(
      "ServicePaymentEvidence_id_project_unique"
    ).on(table.id, table.projectId),
    engagementIdentityUnique: uniqueIndex(
      "ServicePaymentEvidence_id_engagement_unique"
    ).on(table.id, table.engagementId),
    conditionIdentityUnique: uniqueIndex(
      "ServicePaymentEvidence_id_condition_unique"
    ).on(table.id, table.conditionId),
    submittedOperationUnique: uniqueIndex(
      "ServicePaymentEvidence_submitted_operation_unique"
    ).on(table.submittedOperationRecordId),
    verificationOperationUnique: uniqueIndex(
      "ServicePaymentEvidence_verification_operation_unique"
    ).on(table.verificationOperationRecordId),
    // A receipt digest is submitted at most once per condition, so a duplicate
    // replay cannot accumulate two live attestations of the same transfer.
    conditionReferenceUnique: uniqueIndex(
      "ServicePaymentEvidence_condition_reference_unique"
    ).on(table.conditionId, table.referenceSha256),
    // At most one verified settlement may exist for one condition.
    verifiedUnique: uniqueIndex("ServicePaymentEvidence_verified_unique")
      .on(table.conditionId)
      .where(sql`${table.verificationStatus} = 'verified'`),
    conditionStatusIndex: index(
      "ServicePaymentEvidence_condition_status_idx"
    ).on(table.conditionId, table.verificationStatus, table.submittedAt),
    engagementStatusIndex: index(
      "ServicePaymentEvidence_engagement_status_idx"
    ).on(table.engagementId, table.verificationStatus, table.submittedAt),
    // The composite target binds project, engagement, exact agreement version,
    // terms hash, amount and currency, so evidence can only exist for the exact
    // condition it claims to satisfy.
    conditionScopeForeignKey: foreignKey({
      columns: [
        table.conditionId,
        table.projectId,
        table.engagementId,
        table.agreementVersionId,
        table.agreementTermsSha256,
        table.declaredAmountMinor,
        table.declaredCurrency,
      ],
      foreignColumns: [
        servicePaymentCondition.id,
        servicePaymentCondition.projectId,
        servicePaymentCondition.engagementId,
        servicePaymentCondition.agreementVersionId,
        servicePaymentCondition.agreementTermsSha256,
        servicePaymentCondition.amountMinor,
        servicePaymentCondition.currency,
      ],
      name: "ServicePaymentEvidence_condition_scope_fk",
    }).onDelete("restrict"),
    categoryAllowed: check(
      "ServicePaymentEvidence_category_check",
      sql`${table.evidenceCategory} in ('external_transfer_receipt', 'provider_settlement_observation')`
    ),
    statusAllowed: check(
      "ServicePaymentEvidence_status_check",
      sql`${table.verificationStatus} in ('pending', 'verified', 'rejected')`
    ),
    amountShape: check(
      "ServicePaymentEvidence_amount_check",
      sql`${table.declaredAmountMinor} > 0 and ${table.declaredAmountMinor} <= 999999999999 and ${table.declaredCurrency} ~ '^[A-Z]{3}$'`
    ),
    hashShape: check(
      "ServicePaymentEvidence_hash_check",
      sql`${table.referenceSha256} ~ '^[0-9a-f]{64}$' and ${table.observationSha256} ~ '^[0-9a-f]{64}$' and ${table.agreementTermsSha256} ~ '^[0-9a-f]{64}$'`
    ),
    revisionShape: check(
      "ServicePaymentEvidence_revision_check",
      sql`${table.submittedProjectRevision} > 0 and ${table.paidAt} <= ${table.submittedAt} + interval '5 minutes'`
    ),
    // A submission is evidence awaiting evaluation, never settlement by itself.
    lifecycleConsistent: check(
      "ServicePaymentEvidence_lifecycle_check",
      sql`(
        (${table.verificationStatus} = 'pending' and ${table.verifiedAt} is null and ${table.verifiedByUserId} is null and ${table.verificationMethod} is null and ${table.verificationProjectRevision} is null and ${table.verificationOperationRecordId} is null and ${table.rejectionReasonCode} is null)
        or (${table.verificationStatus} = 'verified' and ${table.verifiedAt} is not null and ${table.verifiedByUserId} is not null and ${table.verificationMethod} is not null and ${table.verificationProjectRevision} is not null and ${table.verificationOperationRecordId} is not null and ${table.rejectionReasonCode} is null)
        or (${table.verificationStatus} = 'rejected' and ${table.verifiedAt} is not null and ${table.verifiedByUserId} is not null and ${table.verificationMethod} is not null and ${table.verificationProjectRevision} is not null and ${table.verificationOperationRecordId} is not null and ${table.rejectionReasonCode} is not null)
      )`
    ),
  })
);

export type ServicePaymentEvidenceRow = InferSelectModel<
  typeof servicePaymentEvidence
>;

export const servicePaymentResolution = pgTable(
  "ServicePaymentResolution",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId").notNull(),
    engagementId: uuid("engagementId").notNull(),
    conditionId: uuid("conditionId").notNull(),
    evidenceId: uuid("evidenceId"),
    resolutionKind: varchar("resolutionKind", { length: 16 }).notNull(),
    reasonCode: varchar("reasonCode", { length: 64 }).notNull(),
    observationSha256: varchar("observationSha256", { length: 64 }).notNull(),
    observationCode: varchar("observationCode", { length: 64 }),
    financeAuthorityCode: varchar("financeAuthorityCode", {
      length: 64,
    }).notNull(),
    financeAuthorityRequestSha256: varchar("financeAuthorityRequestSha256", {
      length: 64,
    }).notNull(),
    supersedesResolutionId: uuid("supersedesResolutionId"),
    recordedByUserId: uuid("recordedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    resolvedProjectRevision: integer("resolvedProjectRevision").notNull(),
    operationRecordId: uuid("operationRecordId")
      .notNull()
      .references(() => projectOperation.id, { onDelete: "restrict" }),
    resolvedAt: timestamp("resolvedAt").notNull(),
  },
  (table) => ({
    projectIdentityUnique: uniqueIndex(
      "ServicePaymentResolution_id_project_unique"
    ).on(table.id, table.projectId),
    conditionIdentityUnique: uniqueIndex(
      "ServicePaymentResolution_id_condition_unique"
    ).on(table.id, table.conditionId),
    operationUnique: uniqueIndex(
      "ServicePaymentResolution_operation_unique"
    ).on(table.operationRecordId),
    // Correction A: a resolution can be corrected at most once. The partial unique
    // index makes a *concurrent* double correction impossible at the database, not
    // merely unlikely through repository serialization.
    supersededTargetUnique: uniqueIndex(
      "ServicePaymentResolution_superseded_target_unique"
    )
      .on(table.supersedesResolutionId)
      .where(sql`${table.supersedesResolutionId} is not null`),
    conditionIndex: index("ServicePaymentResolution_condition_idx").on(
      table.conditionId,
      table.resolvedAt,
      table.id
    ),
    engagementIndex: index("ServicePaymentResolution_engagement_idx").on(
      table.engagementId,
      table.resolvedAt,
      table.id
    ),
    conditionForeignKey: foreignKey({
      columns: [table.conditionId, table.projectId, table.engagementId],
      foreignColumns: [
        servicePaymentCondition.id,
        servicePaymentCondition.projectId,
        servicePaymentCondition.engagementId,
      ],
      name: "ServicePaymentResolution_condition_fk",
    }).onDelete("restrict"),
    evidenceForeignKey: foreignKey({
      columns: [table.evidenceId, table.conditionId],
      foreignColumns: [
        servicePaymentEvidence.id,
        servicePaymentEvidence.conditionId,
      ],
      name: "ServicePaymentResolution_evidence_fk",
    }).onDelete("restrict"),
    kindAllowed: check(
      "ServicePaymentResolution_kind_check",
      sql`${table.resolutionKind} in ('dispute', 'refund', 'reversal', 'void', 'correction')`
    ),
    reasonShape: check(
      "ServicePaymentResolution_reason_check",
      sql`${table.reasonCode} ~ '^[a-z0-9][a-z0-9._-]{0,63}$'`
    ),
    hashShape: check(
      "ServicePaymentResolution_hash_check",
      sql`${table.observationSha256} ~ '^[0-9a-f]{64}$' and ${table.financeAuthorityRequestSha256} ~ '^[0-9a-f]{64}$'`
    ),
    authorityShape: check(
      "ServicePaymentResolution_authority_check",
      sql`${table.financeAuthorityCode} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' and ${table.resolvedProjectRevision} > 0`
    ),
    // Only a correction supersedes another resolution; every other kind is a
    // self-contained observation. A correction must name its target.
    supersessionShape: check(
      "ServicePaymentResolution_supersession_check",
      sql`(
        (${table.resolutionKind} = 'correction' and ${table.supersedesResolutionId} is not null and ${table.supersedesResolutionId} <> ${table.id})
        or (${table.resolutionKind} <> 'correction' and ${table.supersedesResolutionId} is null)
      )`
    ),
    // Refund/reversal/dispute must name the exact evidence they invalidate; a
    // condition-wide void must not pretend to target a payment row.
    targetShape: check(
      "ServicePaymentResolution_target_check",
      sql`(
        (${table.resolutionKind} in ('refund', 'reversal', 'dispute') and ${table.evidenceId} is not null)
        or (${table.resolutionKind} = 'void' and ${table.evidenceId} is null)
        or (${table.resolutionKind} = 'correction' and ${table.evidenceId} is null)
      )`
    ),
  })
);

export type ServicePaymentResolutionRow = InferSelectModel<
  typeof servicePaymentResolution
>;

/* ------------------------------------------------------------------------- *
 * Phase 13 M4-006 — persistent scoped professional review
 *
 * Two purpose-built tables rather than a generic workflow engine:
 *
 * - `ProfessionalReviewRequest` holds the immutable target binding plus a
 *   controlled current projection (`state`, `revision`).
 * - `ProfessionalReviewRevision` is append-only history; a database trigger
 *   rejects UPDATE/DELETE, and a request trigger rejects revision skips and any
 *   attempt to mutate the target binding.
 *
 * Every review is bound to the exact Project and the exact immutable target
 * version/hash, so an approval can never be transferred to another package.
 * ------------------------------------------------------------------------- */

export const PROFESSIONAL_REVIEW_TARGET_KIND_VALUES = [
  "managed_school_application",
  "student_500_visa_application",
] as const;

export const PROFESSIONAL_REVIEW_STATE_VALUES = [
  "requested",
  "in_review",
  "changes_requested",
  "approved",
  "rejected",
  "invalidated",
] as const;

export const PROFESSIONAL_REVIEW_ACTION_VALUES = [
  "create_request",
  "start_review",
  "request_changes",
  "approve",
  "reject",
  "invalidate",
] as const;

export const PROFESSIONAL_REVIEW_SCOPE_VALUES = [
  "eligibility_review",
  "document_completeness",
  "form_accuracy",
  "legal_advice_alignment",
] as const;

export const professionalReviewRequest = pgTable(
  "ProfessionalReviewRequest",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => studyJourneyProject.id, { onDelete: "restrict" }),
    targetKind: varchar("targetKind", {
      enum: PROFESSIONAL_REVIEW_TARGET_KIND_VALUES,
      length: 64,
    }).notNull(),
    targetId: varchar("targetId", { length: 128 }).notNull(),
    targetVersion: integer("targetVersion").notNull(),
    targetSha256: varchar("targetSha256", { length: 64 }).notNull(),
    targetBindingSha256: varchar("targetBindingSha256", {
      length: 64,
    }).notNull(),
    reviewPurpose: varchar("reviewPurpose", { length: 64 }).notNull(),
    reviewScope: text("reviewScope").array().notNull(),
    state: varchar("state", {
      enum: PROFESSIONAL_REVIEW_STATE_VALUES,
      length: 32,
    })
      .notNull()
      .default("requested"),
    revision: integer("revision").notNull().default(1),
    requestedByUserId: uuid("requestedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    reviewerUserId: uuid("reviewerUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    authorityCode: varchar("authorityCode", { length: 64 }),
    credentialCode: varchar("credentialCode", { length: 64 }),
    operationId: varchar("operationId", { length: 128 }).notNull(),
    requestSha256: varchar("requestSha256", { length: 64 }).notNull(),
    requestedAt: timestamp("requestedAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    invalidatedAt: timestamp("invalidatedAt"),
    invalidationReasonCode: varchar("invalidationReasonCode", { length: 64 }),
  },
  (table) => ({
    projectIdentityUnique: uniqueIndex(
      "ProfessionalReviewRequest_id_project_unique"
    ).on(table.id, table.projectId),
    // One operation id per Project: an id can never be reused across Projects and
    // a duplicate insert is a database-level conflict, not an application check.
    projectOperationUnique: uniqueIndex(
      "ProfessionalReviewRequest_project_operation_unique"
    ).on(table.projectId, table.operationId),
    targetIndex: index("ProfessionalReviewRequest_target_idx").on(
      table.projectId,
      table.targetKind,
      table.targetId,
      table.revision
    ),
    requesterIndex: index("ProfessionalReviewRequest_requester_idx").on(
      table.requestedByUserId,
      table.state,
      table.id
    ),
    revisionPositive: check(
      "ProfessionalReviewRequest_revision_check",
      sql`${table.revision} > 0 and ${table.targetVersion} > 0`
    ),
    hashShape: check(
      "ProfessionalReviewRequest_hash_check",
      sql`${table.targetSha256} ~ '^[0-9a-f]{64}$' and ${table.targetBindingSha256} ~ '^[0-9a-f]{64}$' and ${table.requestSha256} ~ '^[0-9a-f]{64}$'`
    ),
    scopeAllowed: check(
      "ProfessionalReviewRequest_scope_check",
      sql`${table.reviewScope} is not null and cardinality(${table.reviewScope}) between 1 and 4 and ${table.reviewScope} <@ array['eligibility_review', 'document_completeness', 'form_accuracy', 'legal_advice_alignment']::text[]`
    ),
    stateAllowed: check(
      "ProfessionalReviewRequest_state_check",
      sql`${table.state} in ('requested', 'in_review', 'changes_requested', 'approved', 'rejected', 'invalidated')`
    ),
    purposeAllowed: check(
      "ProfessionalReviewRequest_purpose_check",
      sql`${table.reviewPurpose} = 'managed_handoff_authorization'`
    ),
    invalidationConsistent: check(
      "ProfessionalReviewRequest_invalidation_check",
      sql`((${table.state} = 'invalidated' and ${table.invalidatedAt} is not null) or (${table.state} <> 'invalidated' and ${table.invalidatedAt} is null and ${table.invalidationReasonCode} is null))`
    ),
    timestampsConsistent: check(
      "ProfessionalReviewRequest_timestamps_check",
      sql`${table.updatedAt} >= ${table.requestedAt}`
    ),
  })
);

export const professionalReviewRevision = pgTable(
  "ProfessionalReviewRevision",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    reviewRequestId: uuid("reviewRequestId")
      .notNull()
      .references(() => professionalReviewRequest.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    state: varchar("state", {
      enum: PROFESSIONAL_REVIEW_STATE_VALUES,
      length: 32,
    }).notNull(),
    action: varchar("action", {
      enum: PROFESSIONAL_REVIEW_ACTION_VALUES,
      length: 32,
    }).notNull(),
    operationId: varchar("operationId", { length: 128 }).notNull(),
    requestSha256: varchar("requestSha256", { length: 64 }).notNull(),
    decidedByUserId: uuid("decidedByUserId").references(() => user.id, {
      onDelete: "restrict",
    }),
    decidedAt: timestamp("decidedAt").notNull().defaultNow(),
    boundTargetVersion: integer("boundTargetVersion").notNull(),
    boundTargetSha256: varchar("boundTargetSha256", { length: 64 }).notNull(),
    authorityCode: varchar("authorityCode", { length: 64 }),
    credentialCode: varchar("credentialCode", { length: 64 }),
    commentSha256: varchar("commentSha256", { length: 64 }),
    reasonCode: varchar("reasonCode", { length: 64 }),
  },
  (table) => ({
    requestRevisionUnique: uniqueIndex(
      "ProfessionalReviewRevision_request_revision_unique"
    ).on(table.reviewRequestId, table.revision),
    requestOperationUnique: uniqueIndex(
      "ProfessionalReviewRevision_request_operation_unique"
    ).on(table.reviewRequestId, table.operationId),
    requestIndex: index("ProfessionalReviewRevision_request_idx").on(
      table.reviewRequestId,
      table.revision
    ),
    revisionPositive: check(
      "ProfessionalReviewRevision_revision_check",
      sql`${table.revision} > 0 and ${table.boundTargetVersion} > 0`
    ),
    hashShape: check(
      "ProfessionalReviewRevision_hash_check",
      sql`${table.requestSha256} ~ '^[0-9a-f]{64}$' and ${table.boundTargetSha256} ~ '^[0-9a-f]{64}$' and (${table.commentSha256} is null or ${table.commentSha256} ~ '^[0-9a-f]{64}$')`
    ),
    stateAllowed: check(
      "ProfessionalReviewRevision_state_check",
      sql`${table.state} in ('requested', 'in_review', 'changes_requested', 'approved', 'rejected', 'invalidated')`
    ),
    actionAllowed: check(
      "ProfessionalReviewRevision_action_check",
      sql`${table.action} in ('create_request', 'start_review', 'request_changes', 'approve', 'reject', 'invalidate')`
    ),
  })
);

export type ProfessionalReviewRequestRow = InferSelectModel<
  typeof professionalReviewRequest
>;
export type ProfessionalReviewRevisionRow = InferSelectModel<
  typeof professionalReviewRevision
>;

/**
 * Phase 13 M5.1 — Multi-School Application foundation.
 *
 * Additive only. These entities are independent of the frozen M4 authority,
 * payment, signature, credential and readiness contracts: nothing here can
 * create a professional review, a payment condition, a submission receipt, an
 * admission decision, an offer or a CoE.
 *
 * Application content is creator-private. `ownerUserId` is immutable and every
 * read path filters on it; Project membership alone never discloses it.
 */

export const SCHOOL_APPLICATION_STATUS_VALUES = [
  "draft",
  "preparing",
  "package_prepared",
  "stale",
  "archived",
] as const;
export const SCHOOL_APPLICATION_SOURCE_STATUS_VALUES = [
  "unverified_customer_declared",
  "unverified_catalog_match",
  "synthetic_catalog_match",
] as const;
export const SCHOOL_APPLICATION_REFERENCE_KIND_VALUES = [
  "fact",
  "requirement",
  "document",
] as const;
export const SCHOOL_APPLICATION_PACKAGE_STATUS_VALUES = [
  "current",
  "superseded",
  "stale",
] as const;
export const SCHOOL_APPLICATION_OPERATION_TYPE_VALUES = [
  "school_application_create",
  "school_application_update",
  "school_application_archive",
  "school_application_reference_bind",
  "school_application_reference_revoke",
  "school_application_package_build",
] as const;
export const SCHOOL_APPLICATION_OPERATION_RESULT_KIND_VALUES = [
  "school_application",
  "school_application_reference",
  "school_application_package",
] as const;
export const SCHOOL_APPLICATION_EVENT_TYPE_VALUES = [
  "school_application_created",
  "school_application_updated",
  "school_application_archived",
  "school_application_reference_bound",
  "school_application_reference_revoked",
  "school_application_package_built",
  "school_application_package_invalidated",
] as const;
export const SCHOOL_APPLICATION_EVENT_SUBJECT_KIND_VALUES = [
  "school_application",
  "school_application_reference",
  "school_application_package",
] as const;

export const schoolApplication = pgTable(
  "SchoolApplication",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => studyJourneyProject.id, { onDelete: "restrict" }),
    /** Immutable creator/owner. Mutable ownership is not representable. */
    ownerUserId: uuid("ownerUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: varchar("status", {
      enum: SCHOOL_APPLICATION_STATUS_VALUES,
    })
      .notNull()
      .default("draft"),
    revision: integer("revision").notNull().default(1),
    institutionName: varchar("institutionName", { length: 200 }).notNull(),
    institutionId: varchar("institutionId", { length: 128 }),
    courseTitle: varchar("courseTitle", { length: 200 }).notNull(),
    courseId: varchar("courseId", { length: 128 }),
    deliveryId: varchar("deliveryId", { length: 128 }),
    intakeId: varchar("intakeId", { length: 128 }),
    intakeLabel: varchar("intakeLabel", { length: 120 }),
    sourceStatus: varchar("sourceStatus", {
      enum: SCHOOL_APPLICATION_SOURCE_STATUS_VALUES,
    })
      .notNull()
      .default("unverified_customer_declared"),
    catalogRecordClass: varchar("catalogRecordClass", {
      enum: EDUCATION_RECORD_CLASSES,
    }),
    catalogSnapshotToken: varchar("catalogSnapshotToken", { length: 128 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    archivedAt: timestamp("archivedAt"),
  },
  (table) => ({
    projectIdIdUnique: uniqueIndex("SchoolApplication_project_id_unique").on(
      table.projectId,
      table.id
    ),
    projectOwnerCreatedIndex: index(
      "SchoolApplication_project_owner_created_idx"
    ).on(table.projectId, table.ownerUserId, table.createdAt),
    revisionPositive: check(
      "SchoolApplication_revision_check",
      sql`${table.revision} > 0`
    ),
    statusAllowed: check(
      "SchoolApplication_status_check",
      sql`${table.status} in ('draft', 'preparing', 'package_prepared', 'stale', 'archived')`
    ),
    sourceStatusAllowed: check(
      "SchoolApplication_source_status_check",
      sql`${table.sourceStatus} in ('unverified_customer_declared', 'unverified_catalog_match', 'synthetic_catalog_match')`
    ),
    catalogClassAllowed: check(
      "SchoolApplication_catalog_class_check",
      sql`${table.catalogRecordClass} is null or ${table.catalogRecordClass} in ('SYNTHETIC', 'UNVERIFIED')`
    ),
    sourceClassConsistent: check(
      "SchoolApplication_source_class_consistency_check",
      sql`(${table.sourceStatus} = 'unverified_customer_declared' and ${table.catalogRecordClass} is null and ${table.catalogSnapshotToken} is null) or (${table.sourceStatus} = 'unverified_catalog_match' and ${table.catalogRecordClass} = 'UNVERIFIED') or (${table.sourceStatus} = 'synthetic_catalog_match' and ${table.catalogRecordClass} = 'SYNTHETIC')`
    ),
    institutionNameBounded: check(
      "SchoolApplication_institution_name_check",
      sql`length(trim(${table.institutionName})) between 1 and 200`
    ),
    courseTitleBounded: check(
      "SchoolApplication_course_title_check",
      sql`length(trim(${table.courseTitle})) between 1 and 200`
    ),
    intakeLabelBounded: check(
      "SchoolApplication_intake_label_check",
      sql`${table.intakeLabel} is null or length(trim(${table.intakeLabel})) between 1 and 120`
    ),
    catalogIdShape: check(
      "SchoolApplication_catalog_id_shape_check",
      sql`(${table.institutionId} is null or ${table.institutionId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$') and (${table.courseId} is null or ${table.courseId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$') and (${table.deliveryId} is null or ${table.deliveryId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$') and (${table.intakeId} is null or ${table.intakeId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')`
    ),
    archiveLifecycle: check(
      "SchoolApplication_archive_check",
      sql`(${table.status} = 'archived' and ${table.archivedAt} is not null) or (${table.status} <> 'archived' and ${table.archivedAt} is null)`
    ),
    updatedAfterCreated: check(
      "SchoolApplication_updated_at_check",
      sql`${table.updatedAt} >= ${table.createdAt}`
    ),
  })
);
export type SchoolApplicationRow = InferSelectModel<typeof schoolApplication>;

export const schoolApplicationPackage = pgTable(
  "SchoolApplicationPackage",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    applicationId: uuid("applicationId").notNull(),
    projectId: uuid("projectId").notNull(),
    version: integer("version").notNull(),
    status: varchar("status", {
      enum: SCHOOL_APPLICATION_PACKAGE_STATUS_VALUES,
    })
      .notNull()
      .default("current"),
    schemaVersion: varchar("schemaVersion", { length: 64 }).notNull(),
    contentSha256: varchar("contentSha256", { length: 64 }).notNull(),
    inputsSha256: varchar("inputsSha256", { length: 64 }).notNull(),
    targetKind: varchar("targetKind", { length: 64 }).notNull(),
    targetId: varchar("targetId", { length: 128 }).notNull(),
    targetVersion: integer("targetVersion").notNull(),
    targetSha256: varchar("targetSha256", { length: 64 }).notNull(),
    targetBindingSha256: varchar("targetBindingSha256", {
      length: 64,
    }).notNull(),
    snapshot: jsonb("snapshot").$type<unknown>().notNull(),
    createdByUserId: uuid("createdByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    operationId: varchar("operationId", { length: 128 }).notNull(),
    requestSha256: varchar("requestSha256", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    applicationForeignKey: foreignKey({
      columns: [table.projectId, table.applicationId],
      foreignColumns: [schoolApplication.projectId, schoolApplication.id],
      name: "SchoolApplicationPackage_application_fk",
    }).onDelete("restrict"),
    applicationVersionUnique: uniqueIndex(
      "SchoolApplicationPackage_application_version_unique"
    ).on(table.applicationId, table.version),
    /**
     * Exactly one current package per application. Historical versions remain
     * immutable rows with `superseded`/`stale` status.
     */
    currentApplicationUnique: uniqueIndex(
      "SchoolApplicationPackage_current_application_unique"
    )
      .on(table.applicationId)
      .where(sql`${table.status} = 'current'`),
    applicationCreatedIndex: index(
      "SchoolApplicationPackage_application_created_idx"
    ).on(table.applicationId, table.createdAt),
    versionPositive: check(
      "SchoolApplicationPackage_version_check",
      sql`${table.version} > 0 and ${table.targetVersion} = ${table.version}`
    ),
    statusAllowed: check(
      "SchoolApplicationPackage_status_check",
      sql`${table.status} in ('current', 'superseded', 'stale')`
    ),
    targetKindPinned: check(
      "SchoolApplicationPackage_target_kind_check",
      sql`${table.targetKind} = 'managed_school_application'`
    ),
    targetIdentityBound: check(
      "SchoolApplicationPackage_target_identity_check",
      sql`${table.targetId} = ${table.applicationId}::text and ${table.targetSha256} = ${table.contentSha256}`
    ),
    hashShape: check(
      "SchoolApplicationPackage_hash_check",
      sql`${table.contentSha256} ~ '^[0-9a-f]{64}$' and ${table.inputsSha256} ~ '^[0-9a-f]{64}$' and ${table.targetSha256} ~ '^[0-9a-f]{64}$' and ${table.targetBindingSha256} ~ '^[0-9a-f]{64}$' and ${table.requestSha256} ~ '^[0-9a-f]{64}$'`
    ),
    schemaVersionPinned: check(
      "SchoolApplicationPackage_schema_version_check",
      sql`length(trim(${table.schemaVersion})) between 1 and 64`
    ),
    operationIdShape: check(
      "SchoolApplicationPackage_operation_id_check",
      sql`${table.operationId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'`
    ),
    snapshotObject: check(
      "SchoolApplicationPackage_snapshot_check",
      sql`jsonb_typeof(${table.snapshot}) = 'object'`
    ),
  })
);
export type SchoolApplicationPackageRow = InferSelectModel<
  typeof schoolApplicationPackage
>;

export const schoolApplicationReference = pgTable(
  "SchoolApplicationReference",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    applicationId: uuid("applicationId").notNull(),
    projectId: uuid("projectId").notNull(),
    kind: varchar("kind", {
      enum: SCHOOL_APPLICATION_REFERENCE_KIND_VALUES,
    }).notNull(),
    /**
     * M2 identity only (fact assertion, requirement state or document asset).
     * No value, body, excerpt or document bytes are ever stored here.
     */
    referenceId: uuid("referenceId").notNull(),
    referenceVersion: integer("referenceVersion").notNull(),
    referenceSha256: varchar("referenceSha256", { length: 64 }).notNull(),
    createdByUserId: uuid("createdByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    revokedAt: timestamp("revokedAt"),
  },
  (table) => ({
    applicationForeignKey: foreignKey({
      columns: [table.projectId, table.applicationId],
      foreignColumns: [schoolApplication.projectId, schoolApplication.id],
      name: "SchoolApplicationReference_application_fk",
    }).onDelete("restrict"),
    /** One active binding per M2 identity; revoked rows are retained as history. */
    activeReferenceUnique: uniqueIndex(
      "SchoolApplicationReference_active_unique"
    )
      .on(table.applicationId, table.kind, table.referenceId)
      .where(sql`${table.revokedAt} is null`),
    applicationIndex: index("SchoolApplicationReference_application_idx").on(
      table.applicationId,
      table.createdAt
    ),
    kindAllowed: check(
      "SchoolApplicationReference_kind_check",
      sql`${table.kind} in ('fact', 'requirement', 'document')`
    ),
    referenceVersionPositive: check(
      "SchoolApplicationReference_reference_version_check",
      sql`${table.referenceVersion} > 0`
    ),
    referenceHashShape: check(
      "SchoolApplicationReference_reference_hash_check",
      sql`${table.referenceSha256} ~ '^[0-9a-f]{64}$'`
    ),
  })
);
export type SchoolApplicationReferenceRow = InferSelectModel<
  typeof schoolApplicationReference
>;

export const schoolApplicationOperation = pgTable(
  "SchoolApplicationOperation",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    actorUserId: uuid("actorUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    operationId: varchar("operationId", { length: 128 }).notNull(),
    operationType: varchar("operationType", {
      enum: SCHOOL_APPLICATION_OPERATION_TYPE_VALUES,
    }).notNull(),
    requestSha256: varchar("requestSha256", { length: 64 }).notNull(),
    resultKind: varchar("resultKind", {
      enum: SCHOOL_APPLICATION_OPERATION_RESULT_KIND_VALUES,
    }).notNull(),
    resultId: uuid("resultId").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    actorOperationUnique: uniqueIndex(
      "SchoolApplicationOperation_actor_operation_unique"
    ).on(table.actorUserId, table.operationId),
    actorCreatedIndex: index("SchoolApplicationOperation_actor_created_idx").on(
      table.actorUserId,
      table.createdAt
    ),
    operationIdShape: check(
      "SchoolApplicationOperation_operation_id_check",
      sql`${table.operationId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'`
    ),
    requestHashShape: check(
      "SchoolApplicationOperation_request_hash_check",
      sql`${table.requestSha256} ~ '^[0-9a-f]{64}$'`
    ),
    operationTypeAllowed: check(
      "SchoolApplicationOperation_type_check",
      sql`${table.operationType} in ('school_application_create', 'school_application_update', 'school_application_archive', 'school_application_reference_bind', 'school_application_reference_revoke', 'school_application_package_build')`
    ),
    resultKindAllowed: check(
      "SchoolApplicationOperation_result_kind_check",
      sql`${table.resultKind} in ('school_application', 'school_application_reference', 'school_application_package')`
    ),
  })
);
export type SchoolApplicationOperationRow = InferSelectModel<
  typeof schoolApplicationOperation
>;

export const schoolApplicationEvent = pgTable(
  "SchoolApplicationEvent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    applicationId: uuid("applicationId").notNull(),
    projectId: uuid("projectId").notNull(),
    actorUserId: uuid("actorUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    eventType: varchar("eventType", {
      enum: SCHOOL_APPLICATION_EVENT_TYPE_VALUES,
    }).notNull(),
    subjectKind: varchar("subjectKind", {
      enum: SCHOOL_APPLICATION_EVENT_SUBJECT_KIND_VALUES,
    }).notNull(),
    subjectId: uuid("subjectId").notNull(),
    applicationRevision: integer("applicationRevision").notNull(),
    operationRecordId: uuid("operationRecordId")
      .notNull()
      .references(() => schoolApplicationOperation.id, {
        onDelete: "restrict",
      }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    applicationForeignKey: foreignKey({
      columns: [table.projectId, table.applicationId],
      foreignColumns: [schoolApplication.projectId, schoolApplication.id],
      name: "SchoolApplicationEvent_application_fk",
    }).onDelete("restrict"),
    /** A revision records at most one event of each type (update + invalidation). */
    revisionEventUnique: uniqueIndex(
      "SchoolApplicationEvent_revision_event_unique"
    ).on(table.applicationId, table.applicationRevision, table.eventType),
    applicationCreatedIndex: index(
      "SchoolApplicationEvent_application_created_idx"
    ).on(table.applicationId, table.createdAt),
    revisionPositive: check(
      "SchoolApplicationEvent_revision_check",
      sql`${table.applicationRevision} > 0`
    ),
    eventTypeAllowed: check(
      "SchoolApplicationEvent_event_type_check",
      sql`${table.eventType} in ('school_application_created', 'school_application_updated', 'school_application_archived', 'school_application_reference_bound', 'school_application_reference_revoked', 'school_application_package_built', 'school_application_package_invalidated')`
    ),
    subjectKindAllowed: check(
      "SchoolApplicationEvent_subject_kind_check",
      sql`${table.subjectKind} in ('school_application', 'school_application_reference', 'school_application_package')`
    ),
    subjectShape: check(
      "SchoolApplicationEvent_subject_shape_check",
      sql`(${table.eventType} in ('school_application_created', 'school_application_updated', 'school_application_archived') and ${table.subjectKind} = 'school_application' and ${table.subjectId} = ${table.applicationId}) or (${table.eventType} in ('school_application_reference_bound', 'school_application_reference_revoked') and ${table.subjectKind} = 'school_application_reference') or (${table.eventType} in ('school_application_package_built', 'school_application_package_invalidated') and ${table.subjectKind} = 'school_application_package')`
    ),
  })
);
export type SchoolApplicationEventRow = InferSelectModel<
  typeof schoolApplicationEvent
>;
