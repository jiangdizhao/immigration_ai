import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Phase 14-B wiring and non-regression guard.
 *
 * Locks the customer surface boundaries: the basic-information panel is only mounted in
 * the documents section and only when the capability is open, the API cannot be driven by
 * client-supplied authority, and the Phase 14-A mobile navigation is unchanged.
 */

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const home = readSource("../../components/project-workspace-home.tsx");
const panel = readSource("../../components/project-facts-panel.tsx");
const route = readSource("../../app/api/projects/[projectId]/facts/route.ts");
const runtime = readSource("../../lib/project-facts/runtime.ts");
const workspace = readSource("../../components/immigration-ai-workspace.tsx");
const page = readSource("../../app/(chat)/ai-workspace/page.tsx");
const premium = readSource(
  "../../components/premium-answer-mode-workspace.tsx"
);
const documentsRuntime = readSource("../../lib/project-documents/runtime.ts");
const evidenceRoute = readSource(
  "../../app/api/projects/[projectId]/documents/[assetId]/evidence/route.ts"
);

test("the basic-information panel is gated, mounted once and reuses Workspace copy", () => {
  assert.match(home, /projectFactsEnabled = false/u);
  assert.match(home, /<ProjectFactsPanel[\s\S]*?copy=\{copy\.facts\}/u);
  assert.match(home, /projectFactsEnabled \? \(\s*<ProjectFactsPanel/u);
  // Mounted inside the documents section, not as a new navigation destination.
  const documentsBlock = home.slice(home.indexOf('view === "documents"'));
  assert.ok(documentsBlock.includes("<ProjectFactsPanel"));
  assert.equal(home.match(/<ProjectFactsPanel/gu)?.length, 1);
});

test("the panel only reads and writes through the Project facts API", () => {
  assert.match(panel, /\/api\/projects\/\$\{projectId\}\/facts/u);
  assert.doesNotMatch(panel, /actorUserId/u);
  assert.doesNotMatch(panel, /expectedProjectRevision/u);
  assert.doesNotMatch(panel, /evidenceRef:\s*[`"']/u);
  // Every write is built from server rows by the shared view model.
  assert.match(panel, /buildFactActionBody/u);
  // No optimistic "verified" claim: the customer-facing label is fixed copy.
  assert.match(panel, /copy\.verificationLabel/u);
});

test("the facts route delegates to the authenticated handler composition", () => {
  assert.match(route, /projectFactHandlers\.list/u);
  assert.match(route, /projectFactHandlers\.apply/u);
  assert.match(runtime, /PHASE14_PROJECT_FACTS_ENABLED/u);
  assert.match(runtime, /authorizeProjectAccess/u);
  // The feature stays closed unless explicitly switched on.
  assert.match(runtime, /=== "true"/u);
});

test("Phase 14-A mobile navigation and the single Sheet are unchanged by Phase 14-B", () => {
  assert.match(workspace, /<MobileWorkspaceNavigation/u);
  assert.match(workspace, /<Sheet onOpenChange=\{setMobileSheetOpen\}/u);
  assert.equal(workspace.match(/<Sheet onOpenChange/gu)?.length, 1);
  assert.doesNotMatch(workspace, /ProjectFactsPanel/u);
});

test("the capability is supplied by the server page, so the panel is reachable but off by default", () => {
  assert.match(page, /projectFactsEnabled=\{/u);
  assert.match(page, /PHASE14_PROJECT_FACTS_ENABLED/u);
  assert.match(page, /\.trim\(\)\.toLowerCase\(\) ===\s*"true"/u);
  // The capability is threaded through the real component chain.
  assert.match(premium, /projectFactsEnabled\?: boolean;/u);
  assert.match(premium, /projectFactsEnabled=\{projectFactsEnabled\}/u);
  assert.match(workspace, /projectFactsEnabled=\{projectFactsEnabled\}/u);
  assert.match(home, /projectFactsEnabled \? \(\s*<ProjectFactsPanel/u);
  // Defaults stay closed.
  assert.match(premium, /projectFactsEnabled = false/u);
  assert.match(workspace, /projectFactsEnabled = false/u);
});

test("evidence verification is composed deterministically in every runtime that needs it", () => {
  const factsRuntime = readSource("../../lib/project-facts/runtime.ts");
  const resolver = readSource("../../lib/projects/context-resolver.ts");
  // One proof-checked capability factory, imported directly by both runtimes.
  assert.match(factsRuntime, /createDatabaseProjectFactEvidenceVerifier/u);
  assert.match(resolver, /createDatabaseProjectFactEvidenceVerifier/u);
  // Both layers receive it: the service gate and the SQL repository gate.
  assert.match(
    factsRuntime,
    /new PostgresProjectFactRepository\(database, verifyFactEvidence\)/u
  );
  assert.match(factsRuntime, /verifyEvidence: verifyFactEvidence/u);
  assert.match(
    resolver,
    /new PostgresProjectFactRepository\(database, verifyEvidence\)/u
  );
  assert.match(resolver, /verifyEvidenceRef: verifyEvidence/u);
  // No process-wide registry remains.
  assert.doesNotMatch(factsRuntime, /registerProjectEvidenceRefValidator/u);
  assert.doesNotMatch(resolver, /getProjectEvidenceRefValidator/u);
  assert.doesNotMatch(documentsRuntime, /registerProjectEvidenceRefValidator/u);
  // The documents runtime still owns the extraction completion hook and stays closed.
  assert.match(documentsRuntime, /createEvidenceRunCompletedHook\(/u);
  assert.match(documentsRuntime, /onEvidenceRunCompleted/u);
  assert.match(
    documentsRuntime,
    /trustedLiveReadiness:\s*async\s*\(\)\s*=>\s*false/u
  );
  assert.match(documentsRuntime, /application:\s*null/u);
});

test("the extraction action is a real, gated route", () => {
  assert.match(evidenceRoute, /projectDocumentHandlers\.extractEvidence/u);
  assert.match(evidenceRoute, /export async function POST/u);
});
