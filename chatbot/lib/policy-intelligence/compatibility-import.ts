import "server-only";

import { MANUAL_POLICY_ENTRIES } from "@/content/policy-intelligence/registry";
import type { PolicyEntry } from "../policy-intelligence";
import type { AdminCompatibilitySourceEntry } from "./admin-api";
import {
  type CompatibilityImportOutcome,
  compatibilityEntryNotFoundError,
  importCompatibilityEntryForEntry,
  toAdminCompatibilitySourceEntry,
} from "./compatibility-entry";
import type {
  EditorialError,
  PolicyEditorialRepository,
} from "./editorial-core";
import type { PolicyEditorialService } from "./editorial-service";

/**
 * Phase 12 Stage 3 owner-host correction — a controlled, idempotent bridge from
 * the bundled compatibility registry into normal Policy Editor management.
 *
 * Importing an entry creates a *draft* manual revision through the audited
 * editorial service. Nothing is published automatically: a Policy Editor (or the
 * principal-lawyer Admin) reviews and publishes it like any other manual policy,
 * at which point the durable revision supersedes the compatibility card.
 * Editorial attribution and source identity are preserved honestly — the draft
 * states that it is a platform-compiled compatibility summary, never that it is
 * official or verified government text.
 */

export function findCompatibilityEntry(slug: string): PolicyEntry | null {
  return MANUAL_POLICY_ENTRIES.find((entry) => entry.slug === slug) ?? null;
}

/** The bundled registry, shaped for the read-only Admin compatibility view. */
export function listCompatibilitySourceEntries(): AdminCompatibilitySourceEntry[] {
  return MANUAL_POLICY_ENTRIES.map(toAdminCompatibilitySourceEntry);
}

export async function importCompatibilityEntry(input: {
  actorUserId: string;
  slug: string;
  service: PolicyEditorialService;
  repository: PolicyEditorialRepository;
}): Promise<CompatibilityImportOutcome | EditorialError> {
  const entry = findCompatibilityEntry(input.slug);
  if (!entry) {
    return compatibilityEntryNotFoundError();
  }
  return await importCompatibilityEntryForEntry({
    entry,
    actorUserId: input.actorUserId,
    service: input.service,
    repository: input.repository,
  });
}
