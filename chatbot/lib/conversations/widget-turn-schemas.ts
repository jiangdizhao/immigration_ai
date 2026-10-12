import { z } from "zod";
import { requestPolicySlugSchema } from "../policy-intelligence/request-policy-slug";

/**
 * Phase 12 Stage 2 hotfix — the real request contract shared by the three widget
 * routes (Fast, Legal Check and Premium).
 *
 * These schemas live in a plain module instead of inside the Next.js route files
 * so the contract can be exercised directly by tests (`node --test` deliberately
 * never imports the route modules). The routes import their schema from here, so
 * the tests parse exactly the schema the routes use.
 *
 * Behaviour is unchanged from the per-route declarations, apart from the shared
 * `policySlug` rule: absent and explicit `null` both mean "no client policy hint"
 * (an ordinary conversation must never fail validation), while a present non-null
 * value must still be a well-formed policy slug.
 */

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(4000),
});

const filePartSchema = z.object({
  type: z.literal("file"),
  mediaType: z.enum(["image/jpeg", "image/png"]),
  name: z.string().min(1).max(100),
  url: z.string().url(),
});

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.union([textPartSchema, filePartSchema, z.any()])),
});

export type WidgetRequestMessage = z.infer<typeof messageSchema>;

const clientTurnIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/u)
  .optional();

const answerPreferenceSchema = z
  .enum(["auto", "answer_first", "continue_intake", "final_recommendation"])
  .optional()
  .default("answer_first");

/** Fast — quick answer. */
export const fastWidgetRequestSchema = z.object({
  id: z.string().uuid(),
  frontendChatId: z.string().uuid().optional(),
  clientTurnId: clientTurnIdSchema,
  policySlug: requestPolicySlugSchema,
  messages: z.array(messageSchema).min(1),
  selectedChatModel: z.string().optional(),
  assistantMode: z.enum(["fast"]).default("fast"),
  intakeFacts: z.record(z.string(), z.any()).optional().default({}),
  currentIntakeFacts: z.record(z.string(), z.any()).optional(),
  responseLanguage: z.enum(["en", "zh"]).optional(),
  answerPreference: answerPreferenceSchema,
});

/** Legal Check — the bounded Default AgentRuntime path. */
export const legalCheckWidgetRequestSchema = z.object({
  id: z.string().uuid(),
  frontendChatId: z.string().uuid().optional(),
  clientTurnId: clientTurnIdSchema,
  policySlug: requestPolicySlugSchema,
  matterId: z.string().uuid().nullable().optional(),
  messages: z.array(messageSchema).min(1),
  selectedChatModel: z.string(),
  assistantMode: z
    .enum(["default", "default_legal_pipeline"])
    .optional()
    .default("default"),
  intakeFacts: z.record(z.string(), z.any()).optional().default({}),
  currentIntakeFacts: z.record(z.string(), z.any()).optional(),
  responseLanguage: z.enum(["en", "zh"]).optional(),
  answerPreference: answerPreferenceSchema,
});

/** Premium — direct web answer. */
export const premiumWidgetRequestSchema = z.object({
  id: z.string().uuid(),
  frontendChatId: z.string().uuid().optional(),
  clientTurnId: clientTurnIdSchema,
  policySlug: requestPolicySlugSchema,
  matterId: z.string().uuid().nullable().optional(),
  messages: z.array(messageSchema).min(1),
  selectedChatModel: z.string().optional(),
  assistantMode: z
    .enum(["premium", "premium_direct_gpt55_high"])
    .optional()
    .default("premium"),
  intakeFacts: z.record(z.string(), z.any()).optional().default({}),
  currentIntakeFacts: z.record(z.string(), z.any()).optional(),
  responseLanguage: z.enum(["en", "zh"]).optional(),
  answerPreference: answerPreferenceSchema,
});
