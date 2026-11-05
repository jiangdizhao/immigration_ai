import "server-only";

import { sql } from "drizzle-orm";
import { getLazyDatabase } from "@/lib/db/runtime-client";

/**
 * Phase 13 M8.2 schema gate.
 *
 * Migration 0052 adds four tables. Until they exist in this environment the whole
 * M8.2 surface reports itself unavailable (503) instead of failing mid-write. Nothing
 * here creates or migrates anything, and the probe fails closed. The M8.1 probe stays
 * separate so packages can remain readable while authorizations are not yet deployed.
 */

let cached: Promise<boolean> | null = null;

async function probe(): Promise<boolean> {
  const rows = (await getLazyDatabase().execute(sql`
    select to_regclass('"SubmissionAuthorization"') as authorization,
           to_regclass('"SubmissionHandoff"') as handoff,
           to_regclass('"SubmissionHandoffEvent"') as handoff_event,
           to_regclass('"SubmissionExternalRecord"') as external_record
  `)) as unknown as {
    authorization: string | null;
    handoff: string | null;
    handoff_event: string | null;
    external_record: string | null;
  }[];
  const row = rows[0];
  return (
    Boolean(row?.authorization) &&
    Boolean(row?.handoff) &&
    Boolean(row?.handoff_event) &&
    Boolean(row?.external_record)
  );
}

export function submissionAuthorizationSchemaAvailable(): Promise<boolean> {
  if (cached === null) {
    cached = probe().catch(() => {
      cached = null;
      return false;
    });
  }
  return cached;
}

export function resetSubmissionAuthorizationSchemaAvailability(): void {
  cached = null;
}
