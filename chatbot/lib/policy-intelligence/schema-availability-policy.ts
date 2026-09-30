export type PolicySchemaCatalogRow = {
  itemRelation: string | null;
  snapshotRelation: string | null;
  revisionRelation: string | null;
  syncRunRelation: string | null;
};

export function policySchemaAvailableFromCatalogRows(
  rows: readonly PolicySchemaCatalogRow[]
): boolean {
  if (rows.length !== 1) {
    throw new Error(
      "Unable to determine Policy Intelligence schema availability"
    );
  }
  const row = rows[0];
  const values = [
    row.itemRelation,
    row.snapshotRelation,
    row.revisionRelation,
    row.syncRunRelation,
  ];
  if (values.some((value) => value === undefined)) {
    throw new Error(
      "Unable to determine Policy Intelligence schema availability"
    );
  }
  const present = values.filter((value) => value !== null).length;
  if (present === 0) {
    return false;
  }
  if (present !== values.length) {
    throw new Error("policy_intelligence_schema_incomplete");
  }
  return true;
}
