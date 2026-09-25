export type ConsultationSchemaAvailability = "available" | "unavailable";

export function consultationAvailabilityFromCatalogRows(
  rows: Array<{ relation: string | null }>
): ConsultationSchemaAvailability {
  if (rows.length !== 1 || !("relation" in rows[0])) {
    throw new Error("Unable to determine consultation schema availability");
  }
  return rows[0].relation === null ? "unavailable" : "available";
}
