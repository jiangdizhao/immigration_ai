function errorRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function isMatterDocumentSchemaUnavailable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    const record = errorRecord(current);
    if (!record) {
      return false;
    }
    if (record.code === "42P01") {
      return true;
    }
    if (record.code === "42703") {
      const column = record.column_name ?? record.column;
      const messageNamesExpectedColumn =
        typeof record.message === "string" &&
        /\bstorageStatus\b/.test(record.message);
      if (column === "storageStatus" || messageNamesExpectedColumn) {
        return true;
      }
    }
    current = record.cause;
  }
  return false;
}
