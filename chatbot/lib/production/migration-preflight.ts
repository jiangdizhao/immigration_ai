export type MigrationPreflightSummary = {
  database: string;
  server: string;
  ledgerLatest: string | null;
  ledgerStatus: "missing" | "behind" | "current" | "unknown";
  repositoryHead: string;
};

export type MigrationJournalEntry = { when: number; tag: string };

export function resolveMigrationLedger(input: {
  timestamp: number | null;
  journal: MigrationJournalEntry[];
}): {
  ledgerLatest: string | null;
  ledgerStatus: MigrationPreflightSummary["ledgerStatus"];
} {
  if (input.timestamp === null) {
    return { ledgerLatest: null, ledgerStatus: "missing" };
  }
  const index = input.journal.findIndex(
    (entry) => entry.when === input.timestamp
  );
  if (index < 0) {
    return {
      ledgerLatest: `unknown-ledger-entry:${input.timestamp}`,
      ledgerStatus: "unknown",
    };
  }
  const headIndex = input.journal.length - 1;
  return {
    ledgerLatest: input.journal[index]?.tag ?? null,
    ledgerStatus: index === headIndex ? "current" : "behind",
  };
}

export function assertExpectedDatabase(actual: string, expected: string): void {
  if (!expected.trim() || actual !== expected) {
    throw new Error("migration_database_target_mismatch");
  }
}

export function safeDatabaseIdentity(connectionString: string): {
  database: string;
  server: string;
} {
  const url = new URL(connectionString);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const hostname = url.hostname;
  if (!database || !hostname || /[^a-zA-Z0-9_.:-]/.test(hostname)) {
    throw new Error("unsafe_database_identity");
  }
  return { database, server: `${hostname}${url.port ? `:${url.port}` : ""}` };
}
export async function createMigrationPreflight(adapters: {
  target(): { database: string; server: string };
  ledger(): Promise<{
    ledgerLatest: string | null;
    ledgerStatus: MigrationPreflightSummary["ledgerStatus"];
  }>;
  repositoryHead(): string;
}): Promise<MigrationPreflightSummary> {
  const ledger = await adapters.ledger();
  return {
    ...adapters.target(),
    ...ledger,
    repositoryHead: adapters.repositoryHead(),
  };
}
