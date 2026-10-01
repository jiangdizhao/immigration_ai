import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { POLICY_DISCOVERY_SOURCES } from "./policy-intelligence-discovery";

export type PolicySyncAllSourceResult = {
  sourceId: string;
  status: "succeeded" | "failed";
};

export type PolicySyncAllResult = {
  status: "succeeded" | "partial_failure";
  sources: PolicySyncAllSourceResult[];
  exitCode: 0 | 1;
};

export async function runPolicySyncAll(
  runSource: (sourceId: string) => Promise<void>,
  sourceIds: readonly string[] = POLICY_DISCOVERY_SOURCES.map(
    (source) => source.id
  )
): Promise<PolicySyncAllResult> {
  const sources: PolicySyncAllSourceResult[] = [];

  for (const sourceId of sourceIds) {
    try {
      await runSource(sourceId);
      sources.push({ sourceId, status: "succeeded" });
    } catch {
      sources.push({ sourceId, status: "failed" });
    }
  }

  const status = sources.every((source) => source.status === "succeeded")
    ? "succeeded"
    : "partial_failure";
  return { status, sources, exitCode: status === "succeeded" ? 0 : 1 };
}

function runSingleSource(sourceId: string): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        resolve(process.cwd(), "scripts/policy-sync.ts"),
        "--source",
        sourceId,
      ],
      { stdio: "ignore" }
    );

    child.once("error", () => rejectRun(new Error("source_process_failed")));
    child.once("close", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error("source_sync_failed"));
      }
    });
  });
}

async function main() {
  const result = await runPolicySyncAll(runSingleSource);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.exitCode;
}

const invokedPath = process.argv[1]
  ? fileURLToPath(pathToFileURL(resolve(process.argv[1])))
  : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main();
}
