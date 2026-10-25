import "server-only";

import { readFileSync } from "node:fs";
import { createB2ReadOnlyPlan } from "./b2-plan";

export type B2CliOutput = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const HELP = [
  "Phase 13 B2 AWS security readiness (offline only)",
  "Usage: phase13-b2-aws-security-readiness.ts [plan] [--config <scope.json>]",
  "       phase13-b2-aws-security-readiness.ts --help",
  "",
  "Plan is the default and performs no AWS or database calls.",
  "collect-read-only is disabled in B2-0; B2-1 needs separate owner authorization and source review.",
].join("\n");

function parseArgs(args: string[]) {
  let mode = "plan";
  let configPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      return { mode: "help", configPath };
    }
    if (arg === "plan") {
      if (mode !== "plan") {
        throw new Error("CLI_MODE_INVALID");
      }
      continue;
    }
    if (arg === "--collect-read-only" || arg === "collect-read-only") {
      mode = "collect-read-only";
      continue;
    }
    if (arg === "--config") {
      const next = args[index + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("CLI_CONFIG_PATH_REQUIRED");
      }
      configPath = next;
      index += 1;
      continue;
    }
    throw new Error("CLI_ARGUMENT_NOT_ALLOWLISTED");
  }
  return { mode, configPath };
}

/** Pure CLI dispatcher with local file reads limited to explicit --config. */
export function runB2Cli(args: string[]): B2CliOutput {
  try {
    const parsed = parseArgs(args);
    if (parsed.mode === "help") {
      return { stdout: `${HELP}\n`, stderr: "", exitCode: 0 };
    }
    if (parsed.mode === "collect-read-only") {
      return {
        stdout: "",
        stderr:
          "B2_1_SEPARATE_AUTHORIZATION_REQUIRED: live collection is disabled in B2-0. No API calls were attempted.\n",
        exitCode: 2,
      };
    }
    let input: unknown;
    if (parsed.configPath) {
      try {
        input = JSON.parse(readFileSync(parsed.configPath, "utf8"));
      } catch {
        return {
          stdout: "",
          stderr: "B2_SCOPE_CONFIG_UNREADABLE_OR_INVALID_JSON\n",
          exitCode: 2,
        };
      }
    }
    return {
      stdout: `${JSON.stringify(createB2ReadOnlyPlan(input), null, 2)}\n`,
      stderr: "",
      exitCode: 0,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "CLI_INVALID";
    return { stdout: "", stderr: `${code}\n`, exitCode: 2 };
  }
}
