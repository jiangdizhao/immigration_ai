import { type InferSelectModel, sql } from "drizzle-orm";
import {
  boolean,
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

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
});

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

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

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
