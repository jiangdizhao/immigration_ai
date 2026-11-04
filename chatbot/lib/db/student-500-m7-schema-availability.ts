import "server-only";

import { sql } from "drizzle-orm";
import { getLazyDatabase } from "@/lib/db/runtime-client";

/**
 * Phase 13 M7 schema gate.
 *
 * Migration 0050 adds two tables. Until they exist in this environment the M7
 * surface reports itself unavailable (503) instead of failing mid-write. Nothing
 * here creates or migrates anything.
 */

let cached: Promise<boolean> | null = null;

async function probe(): Promise<boolean> {
  const rows = (await getLazyDatabase().execute(sql`
    select to_regclass('"Student500GsRevisionProposal"') as proposal,
           to_regclass('"Student500EditorialReview"') as review
  `)) as unknown as { proposal: string | null; review: string | null }[];
  const row = rows[0];
  return Boolean(row?.proposal) && Boolean(row?.review);
}

export function student500DeepPreparationSchemaAvailable(): Promise<boolean> {
  if (cached === null) {
    cached = probe().catch(() => {
      cached = null;
      return false;
    });
  }
  return cached;
}

export function resetStudent500DeepPreparationSchemaAvailability(): void {
  cached = null;
}
