import "server-only";

import { sql } from "drizzle-orm";
import { getLazyDatabase } from "@/lib/db/runtime-client";

/**
 * Phase 13 M8.1 schema gate.
 *
 * Migration 0051 adds three tables. Until they exist in this environment the whole
 * M8 surface reports itself unavailable (503) instead of failing mid-write. Nothing
 * here creates or migrates anything, and the probe fails closed.
 */

let cached: Promise<boolean> | null = null;

async function probe(): Promise<boolean> {
  const rows = (await getLazyDatabase().execute(sql`
    select to_regclass('"SubmissionPackage"') as package,
           to_regclass('"SubmissionPackageConfirmation"') as confirmation,
           to_regclass('"SubmissionPackageInvalidation"') as invalidation
  `)) as unknown as {
    package: string | null;
    confirmation: string | null;
    invalidation: string | null;
  }[];
  const row = rows[0];
  return (
    Boolean(row?.package) &&
    Boolean(row?.confirmation) &&
    Boolean(row?.invalidation)
  );
}

export function submissionPackageSchemaAvailable(): Promise<boolean> {
  if (cached === null) {
    cached = probe().catch(() => {
      cached = null;
      return false;
    });
  }
  return cached;
}

export function resetSubmissionPackageSchemaAvailability(): void {
  cached = null;
}
