import "server-only";

import postgres from "postgres";
import {
  type PolicySchemaCatalogRow,
  policySchemaAvailableFromCatalogRows,
} from "./schema-availability-policy";

let catalogClient: ReturnType<typeof postgres> | null = null;

export async function policyIntelligenceSchemaAvailable(): Promise<boolean> {
  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    throw new Error("POSTGRES_URL is not configured");
  }
  catalogClient ??= postgres(postgresUrl, {
    max: 1,
    idle_timeout: 20,
    connection: { TimeZone: "UTC" },
  });
  const rows = await catalogClient<PolicySchemaCatalogRow[]>`
    SELECT
      to_regclass('public."PolicyIntelligenceItem"')::text AS "itemRelation",
      to_regclass('public."PolicyIntelligenceSourceSnapshot"')::text AS "snapshotRelation",
      to_regclass('public."PolicyIntelligenceAnalysisRevision"')::text AS "revisionRelation",
      to_regclass('public."PolicyIntelligenceSyncRun"')::text AS "syncRunRelation"
  `;
  return policySchemaAvailableFromCatalogRows(rows);
}
