import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Regression guard for the S3 preflight CLI.
 *
 * This package compiles `.ts` scripts to CommonJS, so a top-level `await` in a
 * script aborts before any of the script runs with esbuild's
 * "Top-level await is currently not supported with the cjs output format".
 * The check below therefore fails if the CLI regresses to top-level await, and
 * it also proves the command is executable end to end. No AWS call is made: the
 * script exits on its own configuration guard first, which is also the required
 * fail-fast behaviour.
 */

const scriptPath = new URL(
  "../../scripts/s3-security-preflight.ts",
  import.meta.url
);

function runPreflight(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", "tsx", scriptPath.pathname], {
    cwd: new URL("../../", import.meta.url).pathname,
    env,
    encoding: "utf8",
    timeout: 120_000,
  });
}

test("the s3 preflight script has no top-level await", () => {
  const source = readFileSync(scriptPath, "utf8");
  // Everything at module scope must be declarations; the async work happens in
  // main(), which is invoked at the bottom of the file.
  assert.match(source, /async function main\(\)/u);
  assert.match(source, /main\(\)\.catch\(/u);
  const moduleScopeTopLevelAwait = source
    .split(/\r?\n/u)
    .filter((line) => /^(?:const|let|var|console\.|await )/u.test(line))
    .filter((line) => line.includes("await "));
  assert.deepEqual(moduleScopeTopLevelAwait, []);
});

test("the s3 preflight command fails fast without configuration", () => {
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.MATTER_DOCUMENTS_S3_BUCKET = undefined;
  env.AWS_REGION = undefined;
  const result = runPreflight(env);
  const stderr = result.stderr ?? "";
  assert.doesNotMatch(stderr, /Top-level await/u);
  assert.doesNotMatch(stderr, /TransformError/u);
  assert.match(
    stderr,
    /MATTER_DOCUMENTS_S3_BUCKET and AWS_REGION are required/u
  );
  assert.equal(result.status, 2);
});
