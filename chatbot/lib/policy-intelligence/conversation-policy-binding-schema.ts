import "server-only";

import postgres from "postgres";
import {
  type ConversationPolicyBindingCatalogRow,
  conversationPolicyBindingSchemaAvailableFromCatalogRows,
} from "./conversation-policy-binding";

/**
 * Phase 12 Stage 2 rollout compatibility.
 *
 * `ConversationPolicyBinding` arrives with migration `0026`, which is not
 * applied to the running application database by this task. Every read/write
 * path therefore probes the catalog once and falls back to an explicit
 * unavailable state instead of failing the conversation API.
 */
let catalogClient: ReturnType<typeof postgres> | null = null;

export async function conversationPolicyBindingSchemaAvailable(): Promise<boolean> {
  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    throw new Error("POSTGRES_URL is not configured");
  }
  catalogClient ??= postgres(postgresUrl, {
    max: 1,
    idle_timeout: 20,
    connection: { TimeZone: "UTC" },
  });
  const rows = await catalogClient<ConversationPolicyBindingCatalogRow[]>`
    SELECT
      to_regclass('public."ConversationPolicyBinding"')::text AS "bindingRelation"
  `;
  return conversationPolicyBindingSchemaAvailableFromCatalogRows(rows);
}

/**
 * Closes the catalog connection. The serving process keeps it open for the
 * lifetime of the app; scripts and tests call this so a probe connection cannot
 * keep the event loop alive after their work is done.
 */
export async function closeConversationBindingSchemaClient(): Promise<void> {
  const client = catalogClient;
  catalogClient = null;
  if (client) {
    await client.end({ timeout: 5 });
  }
}
