import "server-only";

import postgres from "postgres";
import {
  type ConsultationSchemaAvailability,
  consultationAvailabilityFromCatalogRows,
} from "./schema-availability-policy";

export { consultationAvailabilityFromCatalogRows } from "./schema-availability-policy";

let catalogClient: ReturnType<typeof postgres> | null = null;

export async function consultationSchemaAvailability(): Promise<ConsultationSchemaAvailability> {
  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    throw new Error("POSTGRES_URL is not configured");
  }
  catalogClient ??= postgres(postgresUrl, {
    max: 1,
    idle_timeout: 20,
    connection: { TimeZone: "UTC" },
  });
  const rows = await catalogClient<{ relation: string | null }[]>`
    SELECT to_regclass('public."ConsultationRequest"')::text AS relation
  `;
  return consultationAvailabilityFromCatalogRows(rows);
}

export function consultationSchemaUnavailableResponse() {
  return Response.json(
    {
      code: "consultation_schema_unavailable",
      error: "Consultation workflow is not available in this environment.",
    },
    { status: 503, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function requireConsultationSchema() {
  return (await consultationSchemaAvailability()) === "available"
    ? null
    : consultationSchemaUnavailableResponse();
}
