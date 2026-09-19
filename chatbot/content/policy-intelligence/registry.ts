import "server-only";

import type { PolicyEntry } from "@/lib/policy-intelligence";

/**
 * Production remains empty until a real source has been manually reviewed and
 * approved for publication. Synthetic fixtures belong in lib/*test.ts only.
 */
export const MANUAL_POLICY_ENTRIES: readonly PolicyEntry[] = [];
