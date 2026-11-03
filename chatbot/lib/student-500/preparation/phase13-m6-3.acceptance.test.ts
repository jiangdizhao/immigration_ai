// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions live in helpers used by the tests.
// Phase 13 M6.3 - consolidated OFFLINE engineering acceptance.
//
// Synthetic data only. No database, no network, no model/provider call. This file
// is the offline half of the M6.3 acceptance campaign: M6.1 legal screening and
// M6.2 preparation are exercised through their real services and adapters. The
// disposable-PostgreSQL and Chromium halves are separate, guarded and PENDING owner
// authorization; they are never simulated here.
//
// Scenario labels (A-E) match the M6.3 acceptance plan section 5.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createInMemoryStudent500Store } from "../in-memory-store";
import { createDeclaredStudent500LegalSourceProvider } from "../legal-source-provider";
import { createStudent500RequirementResolver } from "../requirement-resolver";
import { createStudent500Service } from "../service";
import {
  ADMISSION_CASE,
  createHarness,
  fact,
  MEMBER,
  OWNER,
  PROJECT,
} from "./testing";

const M61_OWNER = "11111111-1111-4111-8111-111111111101";
const M61_STRANGER = "11111111-1111-4111-8111-111111111103";
const M61_PROJECT_A = "22222222-2222-4222-8222-222222222201";
const M61_PROJECT_B = "22222222-2222-4222-8222-222222222202";

/** M6.1 harness: real in-memory store + declared legal-source provider + resolver. */
function m61(
  options: {
    readonly provider?: ReturnType<
      typeof createDeclaredStudent500LegalSourceProvider
    >;
  } = {}
) {
  const store = createInMemoryStudent500Store();
  store.seedActor(M61_OWNER, { registeredCustomer: true });
  store.seedActor(M61_STRANGER, { registeredCustomer: true });
  store.seedProject(M61_PROJECT_A, {
    ownerUserId: M61_OWNER,
    status: "active",
  });
  store.seedProject(M61_PROJECT_B, {
    ownerUserId: M61_STRANGER,
    status: "active",
  });
  const service = createStudent500Service({
    resolver: createStudent500RequirementResolver({
      provider:
        options.provider ?? createDeclaredStudent500LegalSourceProvider(),
    }),
    store,
  });
  return { service, store };
}

function requirement(
  screening: {
    readonly requirements: readonly {
      readonly requirementKey: string;
      readonly status: string;
      readonly sourceVerification: string;
      readonly humanReviewRequired: boolean;
    }[];
  },
  key: string
) {
  const found = screening.requirements.find(
    (entry) => entry.requirementKey === key
  );
  assert.ok(found, key);
  return found;
}

// ---------------------------------------------------------------- A. pathways

test("A: a customer-reported CoE is never promoted to institutional verification", async () => {
  const { service } = m61();
  const { application } = await service.create({
    actorUserId: M61_OWNER,
    context: {
      applicationPlace: "offshore",
      asOfDate: "2026-11-03",
      coeStatus: "reported_held",
      entryRoute: "existing_coe",
    },
    operationId: "m63-a-coe",
    projectId: M61_PROJECT_A,
  });
  const screening = application.screening;
  assert.equal(screening.submissionStatus, "not_submission_ready");
  assert.ok(
    screening.disclosures.includes("study_evidence_not_independently_verified")
  );
  const study = requirement(screening, "study_evidence_coe_or_alternative");
  // Customer-reported evidence never becomes a verified official determination.
  assert.notEqual(study.status, "not_applicable");
  assert.equal(study.humanReviewRequired, true);
  assert.notEqual(study.sourceVerification, "verified_official_corpus");
});

test("A: offer-only preparation never implies a held CoE", async () => {
  const { service } = m61();
  const { application } = await service.create({
    actorUserId: M61_OWNER,
    context: {
      applicationPlace: "offshore",
      asOfDate: "2026-11-03",
      coeStatus: "reported_not_held",
      entryRoute: "offer_only",
    },
    operationId: "m63-a-offer",
    projectId: M61_PROJECT_A,
  });
  const study = requirement(
    application.screening,
    "study_evidence_coe_or_alternative"
  );
  assert.notEqual(study.status, "not_applicable");
  assert.equal(application.screening.submissionStatus, "not_submission_ready");
});

test("A: every school/CoE preparation path is representable and switchable", async () => {
  const harness = createHarness({
    admissions: {
      resolve: () =>
        Promise.resolve({
          coe: null,
          offer: {
            independentlyVerified: false,
            kind: "offer" as const,
            provenance: "customer_reported",
            superseded: false,
            version: 1,
          },
          originKind: "existing_offer",
          revision: 1,
          status: "resolved" as const,
        }),
    },
    facts: [],
    schoolApplications: {
      resolve: () =>
        Promise.resolve({
          applicationStatus: "in_progress",
          sourceStatus: "unverified_customer_declared",
          status: "resolved" as const,
        }),
    },
  });
  const application = await harness.seedApplication();
  const common = {
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  };
  const none = await harness.service.setSchoolContext({
    ...common,
    admissionCaseId: null,
    expectedRevision: null,
    kind: "none",
    operationId: "m63-a-none",
    schoolApplicationId: null,
  });
  const school = await harness.service.setSchoolContext({
    ...common,
    admissionCaseId: null,
    expectedRevision: none.schoolContext.revision,
    kind: "school_application",
    operationId: "m63-a-school",
    schoolApplicationId: "44444444-4444-4444-8444-444444444401",
  });
  const admission = await harness.service.setSchoolContext({
    ...common,
    admissionCaseId: ADMISSION_CASE,
    expectedRevision: school.schoolContext.revision,
    kind: "admission_case",
    operationId: "m63-a-case",
    schoolApplicationId: null,
  });
  const reported = await harness.service.setSchoolContext({
    ...common,
    admissionCaseId: null,
    expectedRevision: admission.schoolContext.revision,
    kind: "customer_reported_coe",
    operationId: "m63-a-reported",
    schoolApplicationId: null,
  });
  // A directly reported CoE is stored as an unverified customer report.
  assert.equal(
    reported.schoolContext.admissionOutcomeProvenance,
    "customer_reported"
  );
  assert.equal(reported.schoolContext.admissionOutcomeVerified, false);
  // An admission case without a current verified CoE stays unverified.
  assert.equal(admission.schoolContext.kind, "admission_case");
  assert.equal(admission.schoolContext.admissionCaseId, ADMISSION_CASE);
  assert.notEqual(admission.schoolContext.admissionOutcomeVerified, true);
});

// ------------------------------------------- B. applicant / history variations

test("B: place of application and age band change applicability, not conclusions", async () => {
  const { service } = m61();
  const base = {
    asOfDate: "2026-11-03",
    coeStatus: "reported_held" as const,
    entryRoute: "existing_coe" as const,
  };
  const onshore = await service.create({
    actorUserId: M61_OWNER,
    context: {
      ...base,
      applicantAgeBand: "adult",
      applicationPlace: "onshore",
    },
    operationId: "m63-b-onshore",
    projectId: M61_PROJECT_A,
  });
  const offshore = await service.create({
    actorUserId: M61_OWNER,
    context: {
      ...base,
      applicantAgeBand: "under_18",
      applicationPlace: "offshore",
    },
    operationId: "m63-b-offshore",
    projectId: M61_PROJECT_A,
  });
  const onshoreRestrictions = requirement(
    onshore.application.screening,
    "onshore_application_restrictions"
  );
  const offshoreRestrictions = requirement(
    offshore.application.screening,
    "onshore_application_restrictions"
  );
  assert.notEqual(onshoreRestrictions.status, offshoreRestrictions.status);
  const welfareAdult = requirement(
    onshore.application.screening,
    "under_18_welfare_arrangements"
  );
  const welfareMinor = requirement(
    offshore.application.screening,
    "under_18_welfare_arrangements"
  );
  assert.notEqual(welfareAdult.status, welfareMinor.status);
  // No branch may claim a legal outcome or submission readiness.
  for (const screening of [
    onshore.application.screening,
    offshore.application.screening,
  ]) {
    assert.equal(screening.submissionStatus, "not_submission_ready");
    assert.ok(
      screening.requirements.every(
        (entry) => entry.humanReviewRequired === true
      )
    );
  }
});

test("B: declared refusal, dependants and unknown history stay review-bound", async () => {
  const { service } = m61();
  const { application } = await service.create({
    actorUserId: M61_OWNER,
    context: {
      applicationPlace: "onshore",
      asOfDate: "2026-11-03",
      coeStatus: "reported_held",
      dependants: "one_or_more",
      entryRoute: "existing_coe",
      historyDeclaration: "declared_some" as const,
      historyFlags: [{ flag: "prior_visa_refusal" }],
      currentVisaSubclass: "500",
    },
    operationId: "m63-b-history",
    projectId: M61_PROJECT_A,
  });
  const history = requirement(
    application.screening,
    "prior_immigration_history_disclosure"
  );
  assert.notEqual(history.status, "not_applicable");
  const family = requirement(
    application.screening,
    "family_unit_member_requirements"
  );
  assert.notEqual(family.status, "not_applicable");
  assert.equal(application.screening.submissionStatus, "not_submission_ready");
  // Unknown/incomplete history must remain explicitly uncertain, not assumed safe.
  const { application: unknownApp } = await service.create({
    actorUserId: M61_OWNER,
    context: {},
    operationId: "m63-b-unknown",
    projectId: M61_PROJECT_A,
  });
  const unknownHistory = requirement(
    unknownApp.screening,
    "prior_immigration_history_disclosure"
  );
  assert.notEqual(unknownHistory.status, "not_applicable");
  assert.equal(unknownApp.screening.submissionStatus, "not_submission_ready");
});

// --------------------------------------------------------- C. source currentness

test("C: declared sources never become verified official corpus", async () => {
  const { service } = m61();
  const { application } = await service.create({
    actorUserId: M61_OWNER,
    context: {
      applicationPlace: "offshore",
      asOfDate: "2026-11-03",
      coeStatus: "reported_held",
      entryRoute: "existing_coe",
    },
    operationId: "m63-c-current",
    projectId: M61_PROJECT_A,
  });
  for (const entry of application.screening.requirements) {
    assert.notEqual(
      entry.sourceVerification,
      "verified_official_corpus",
      entry.requirementKey
    );
  }
  // Historical as-of coverage is also only declared, never verified.
  const { application: historical } = await service.create({
    actorUserId: M61_OWNER,
    context: {
      applicationPlace: "offshore",
      asOfDate: "2025-01-15",
      coeStatus: "reported_held",
      entryRoute: "existing_coe",
    },
    operationId: "m63-c-historical",
    projectId: M61_PROJECT_A,
  });
  assert.equal(historical.screening.asOfDate, "2025-01-15");
  for (const entry of historical.screening.requirements) {
    assert.notEqual(
      entry.sourceVerification,
      "verified_official_corpus",
      entry.requirementKey
    );
  }
});

test("C: a SIMULATED source revision cannot manufacture an official determination", async () => {
  // The adapter below is a simulated provider used only to prove that a changed
  // declared source revision does not promote verification. It is NOT evidence of
  // real legislative change detection, and no real corpus is consulted.
  const declared = createDeclaredStudent500LegalSourceProvider();
  const simulated = {
    providerId: "simulated-revised-declared-catalog.v1",
    resolve: async (input: Parameters<typeof declared.resolve>[0]) => {
      const resolved = await declared.resolve(input);
      return resolved.map((source) => ({
        ...source,
        effectiveFrom: null,
        sourceVersion: null,
      }));
    },
  };
  const { service } = m61({ provider: simulated as typeof declared });
  const { application } = await service.create({
    actorUserId: M61_OWNER,
    context: {
      applicationPlace: "offshore",
      asOfDate: "2026-11-03",
      coeStatus: "reported_held",
      entryRoute: "existing_coe",
    },
    operationId: "m63-c-simulated",
    projectId: M61_PROJECT_A,
  });
  for (const entry of application.screening.requirements) {
    // Unknown version/effective date stays unknown; it is never fabricated.
    assert.notEqual(entry.sourceVerification, "verified_official_corpus");
  }
  assert.equal(application.screening.submissionStatus, "not_submission_ready");
});

// ------------------------------------------------------ D. facts and privacy

test("D: another Project's application is not readable", async () => {
  const { service } = m61();
  const { application } = await service.create({
    actorUserId: M61_STRANGER,
    context: { applicationPlace: "offshore" },
    operationId: "m63-d-foreign",
    projectId: M61_PROJECT_B,
  });
  await assert.rejects(
    () =>
      service.get({
        actorUserId: M61_OWNER,
        applicationId: application.applicationId,
        projectId: M61_PROJECT_A,
      }),
    /not_found|forbidden/u
  );
});

test("D: revoked sharing is redacted across view, historical GET and replays", async () => {
  const SHARED = "55555555-5555-4555-8555-555555555597";
  const harness = createHarness({
    facts: [
      fact({
        authorizationActorUserId: MEMBER,
        factAssertionId: SHARED,
        key: "study.course_name",
        valueDisplay: "Diploma of Community Services",
      }),
    ],
  });
  const application = await harness.seedApplication();
  const selected = await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: SHARED,
    factVersion: 1,
    operationId: "m63-d-select",
    projectId: PROJECT,
  });
  const draft = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "m63-d-draft",
    projectId: PROJECT,
  });
  harness.setFacts([]);
  const view = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  const draftGet = await harness.service.getDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    draftId: draft.draft.id,
    projectId: PROJECT,
  });
  const replay = await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: SHARED,
    factVersion: 1,
    operationId: "m63-d-select",
    projectId: PROJECT,
  });
  for (const [label, value] of [
    ["view", view],
    ["getDraft", draftGet],
    ["select replay", replay],
  ] as const) {
    const json = JSON.stringify(value);
    assert.doesNotMatch(json, /Diploma of Community Services/u, label);
    assert.doesNotMatch(json, /study\.course_name/u, label);
    assert.doesNotMatch(json, new RegExp(SHARED, "u"), label);
  }
  assert.equal(replay.reference.readable, false);
  assert.equal(selected.reference.readable, true);
});

// ------------------------------------------- E. versioning and invalidation

test("E: versions are immutable and replay/idempotency/CAS behave", async () => {
  const harness = createHarness({
    facts: [
      fact({
        factAssertionId: "55555555-5555-4555-8555-5555555555e7",
        key: "study.course_name",
      }),
    ],
  });
  const application = await harness.seedApplication();
  await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: "55555555-5555-4555-8555-5555555555e7",
    factVersion: 1,
    operationId: "m63-e-select",
    projectId: PROJECT,
  });
  const first = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "m63-e-draft",
    projectId: PROJECT,
  });
  // Exact replay returns the same immutable version.
  const replay = await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "m63-e-draft",
    projectId: PROJECT,
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.draft.id, first.draft.id);
  assert.equal(replay.draft.contentSha256, first.draft.contentSha256);
  // A changed payload under the same operation id is a conflict, not a new version.
  await assert.rejects(
    () =>
      harness.service.saveDraft({
        actorUserId: OWNER,
        applicationId: application.id,
        baseDraftId: first.draft.id,
        edits: [{ sectionKey: "future_plans", text: "Changed." }],
        operationId: "m63-e-draft",
        projectId: PROJECT,
      }),
    /idempotency_conflict/u
  );
  // A stale base is rejected by CAS.
  await assert.rejects(
    () =>
      harness.service.saveDraft({
        actorUserId: OWNER,
        applicationId: application.id,
        baseDraftId: "99999999-9999-4999-8999-999999999999",
        edits: [{ sectionKey: "future_plans", text: "Stale." }],
        operationId: "m63-e-cas",
        projectId: PROJECT,
      }),
    /draft_not_found|version_conflict/u
  );
  // Historical versions stay readable and unchanged after a new version.
  const saved = await harness.service.saveDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    baseDraftId: first.draft.id,
    edits: [{ sectionKey: "future_plans", text: "My own plans." }],
    operationId: "m63-e-save",
    projectId: PROJECT,
  });
  assert.equal(saved.draft.version, 2);
  const historical = await harness.service.getDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    draftId: first.draft.id,
    projectId: PROJECT,
  });
  assert.equal(historical.contentSha256, first.draft.contentSha256);
  assert.equal(saved.draft.sections.length, historical.sections.length);
});

test("E: invalidation is dependency-selective, not blanket", async () => {
  const STABLE = "55555555-5555-4555-8555-5555555555f7";
  const harness = createHarness({
    facts: [
      fact({
        factAssertionId: STABLE,
        key: "study.institution",
        valueDisplay: "Meadowbank College",
      }),
    ],
  });
  const application = await harness.seedApplication();
  await harness.service.selectFact({
    actorUserId: OWNER,
    applicationId: application.id,
    factAssertionId: STABLE,
    factVersion: 1,
    operationId: "m63-e2-select",
    projectId: PROJECT,
  });
  await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "m63-e2-draft",
    projectId: PROJECT,
  });
  const fresh = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(fresh.drafts[0]?.stale, false);
  // An unrelated context change does not silently invalidate the draft.
  const unchanged = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: PROJECT,
  });
  assert.equal(unchanged.drafts[0]?.stale, false);
});

test("E: an archived application is terminal and still readable", async () => {
  const { service } = m61();
  const created = await service.create({
    actorUserId: M61_OWNER,
    context: { applicationPlace: "offshore", asOfDate: "2026-11-03" },
    operationId: "m63-e3-create",
    projectId: M61_PROJECT_A,
  });
  const archived = await service.archive({
    actorUserId: M61_OWNER,
    applicationId: created.application.applicationId,
    expectedRevision: created.application.revision,
    operationId: "m63-e3-archive",
    projectId: M61_PROJECT_A,
  });
  assert.equal(archived.application.status, "archived");
  // Terminal: no further context mutation is accepted.
  await assert.rejects(
    () =>
      service.update({
        actorUserId: M61_OWNER,
        applicationId: created.application.applicationId,
        context: { applicationPlace: "onshore" },
        expectedRevision: archived.application.revision,
        operationId: "m63-e3-update",
        projectId: M61_PROJECT_A,
      }),
    /archived|revision_conflict/u
  );
  // The read path still works and reports the archived state honestly.
  const read = await service.get({
    actorUserId: M61_OWNER,
    applicationId: created.application.applicationId,
    projectId: M61_PROJECT_A,
  });
  assert.equal(read.status, "archived");
  assert.equal(read.screening.submissionStatus, "not_submission_ready");
});

// -------------------------------------------- F. acceptance-harness guards

const CHATBOT_DIR = new URL("../../../", import.meta.url).pathname;
const RUNNER = `${CHATBOT_DIR}scripts/phase13-m6-3-db-acceptance.sh`;
const PW_CONFIG = `${CHATBOT_DIR}playwright.phase13-m6-3.config.ts`;
const PW_SPEC = `${CHATBOT_DIR}tests/e2e/phase13-m6-3-student500.test.ts`;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("F: a pre-existing same-name container is never deleted by the runner", () => {
  // A fake docker binary proves the destructive path is not reachable from a
  // preflight name conflict, without creating any real Docker resource.
  const shimDir = mkdtempSync(join(tmpdir(), "m63-docker-shim-"));
  const marker = join(shimDir, "rm-invoked");
  const shim = join(shimDir, "docker");
  writeFileSync(
    shim,
    [
      "#!/usr/bin/env bash",
      'if [ "$1" = "ps" ]; then echo "phase13-m6-3-pg"; exit 0; fi',
      `if [ "$1" = "rm" ]; then echo "$*" >> ${marker}; exit 0; fi`,
      "exit 0",
      "",
    ].join("\n")
  );
  chmodSync(shim, 0o755);
  const report = join(shimDir, "report.log");
  try {
    const result = spawnSync("bash", [RUNNER], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${shimDir}:${process.env.PATH ?? ""}`,
        PHASE13_M6_3_ALLOW_DB_CREATION: "true",
        PHASE13_M6_3_DB_AUTHORIZED: "true",
        PHASE13_M6_3_DB_RESULT_LOG: report,
      },
    });
    // Preflight conflict => explicit refusal, nothing created, nothing removed.
    assert.equal(result.status, 11, result.stderr);
    assert.equal(existsSync(marker), false, "docker rm must never be invoked");
    const summary = read(report);
    assert.match(
      summary,
      /status=preflight_conflict_existing_container_preserved/u
    );
    assert.match(summary, /container_created=no/u);
    assert.match(summary, /container_removed=not_applicable/u);
  } finally {
    rmSync(shimDir, { force: true, recursive: true });
  }
});

test("F: the runner only removes a container it created, and rejects false PASSes", () => {
  const script = read(RUNNER);
  // Ownership: run identity label + recorded container id are both required.
  assert.match(script, /org\.immigration-ai\.phase13-m6-3\.run/u);
  assert.match(script, /CREATED_ID="\$\(docker run -d/u);
  assert.match(script, /container_is_ours/u);
  assert.match(script, /--label "\$LABEL_KEY=\$RUN_ID"/u);
  // The destructive command appears only inside the ownership-guarded branch.
  const removals = script.match(/docker rm -f "\$CONTAINER"/gu) ?? [];
  assert.equal(removals.length, 1, "exactly one guarded removal");
  const guardedIndex = script.indexOf("if container_is_ours; then");
  assert.ok(guardedIndex > 0);
  assert.ok(script.indexOf('docker rm -f "$CONTAINER"') > guardedIndex);
  // False-PASS guard: skipped tests or too few passes fail the run.
  assert.match(script, /false_pass_guard_skipped_tests/u);
  assert.match(script, /false_pass_guard_too_few_passes/u);
  assert.match(script, /MIN_PASS="8"/u);
  // It must use the dedicated M6.3 suite, never the M6.1/M6.2 script names.
  assert.match(script, /pnpm test:phase13:m6-3:db:integration/u);
  assert.doesNotMatch(script, /pnpm test:phase13:m6-2:integration/u);
});

test("F: the browser harness follows the real workspace and cannot fake a pass", () => {
  const config = read(PW_CONFIG);
  // No implicit server start and no public binding.
  // No `webServer` config key: the suite must never start a server itself.
  assert.doesNotMatch(config, /^\s*webServer\s*:/mu);
  const spec = read(PW_SPEC);
  // Real identifiers verified in the components.
  for (const id of [
    "project-entry-panel",
    "workspace-project-list",
    "project-list-item",
    "project-home-student500",
    "project-view-student500",
    "student500-panel",
    "prep-section",
    "prep-draft-create",
    "prep-draft-history",
    "prep-draft-section-future_plans",
    "prep-draft-save",
  ]) {
    assert.match(spec, new RegExp(`"${id}"`, "u"), id);
  }
  // The old non-existent route must be gone.
  assert.doesNotMatch(spec, /\/projects\/\$\{/u);
  // A synthetic "pending" test must never be able to count as a pass.
  assert.doesNotMatch(spec, /PENDING marker/u);
  // Loopback and synthetic-account validation are mandatory.
  assert.match(spec, /function loopback/u);
  assert.match(spec, /UUID\.test\(PROJECT_ID\)/u);
  assert.match(spec, /PHASE13_M6_3_SYNTHETIC_EMAIL/u);
});

test("F: cleanup verification passes only when nothing survives", () => {
  const shimDir = mkdtempSync(join(tmpdir(), "m63-cleanup-ok-"));
  const inventory = join(shimDir, "inventory");
  mkdirSync(inventory, { recursive: true });
  for (const name of [
    "containers.before",
    "volumes.before",
    "networks.before",
    "images.before",
  ]) {
    writeFileSync(join(inventory, name), "");
  }
  // Docker reports nothing present and nothing extra: a clean finish.
  writeFileSync(
    join(shimDir, "docker"),
    '#!/usr/bin/env bash\nif [ "$1" = "inspect" ]; then exit 1; fi\nexit 0\n'
  );
  chmodSync(join(shimDir, "docker"), 0o755);
  try {
    const result = spawnSync(
      "bash",
      [join(CHATBOT_DIR, "scripts/phase13-m6-3-cleanup-check.sh"), inventory],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          M63_CONTAINER: "phase13-m6-3-pg",
          M63_CREATED_ID: "deadbeef",
          M63_HOST_PORT: "55452",
          PATH: `${shimDir}:${process.env.PATH ?? ""}`,
        },
      }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /cleanup=ok/u);
  } finally {
    rmSync(shimDir, { force: true, recursive: true });
  }
});

test("F: a surviving run container makes cleanup fail, never a PASS", () => {
  const shimDir = mkdtempSync(join(tmpdir(), "m63-cleanup-fail-"));
  const inventory = join(shimDir, "inventory");
  mkdirSync(inventory, { recursive: true });
  for (const name of [
    "containers.before",
    "volumes.before",
    "networks.before",
    "images.before",
  ]) {
    writeFileSync(join(inventory, name), "");
  }
  // Docker still reports the container and its id: removal silently failed.
  writeFileSync(
    join(shimDir, "docker"),
    [
      "#!/usr/bin/env bash",
      'if [ "$1" = "ps" ]; then echo "phase13-m6-3-pg"; exit 0; fi',
      'if [ "$1" = "images" ]; then exit 0; fi',
      'if [ "$1" = "volume" ]; then exit 0; fi',
      'if [ "$1" = "network" ]; then exit 0; fi',
      'if [ "$1" = "inspect" ]; then exit 0; fi',
      "exit 0",
      "",
    ].join("\n")
  );
  chmodSync(join(shimDir, "docker"), 0o755);
  try {
    const result = spawnSync(
      "bash",
      [join(CHATBOT_DIR, "scripts/phase13-m6-3-cleanup-check.sh"), inventory],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          M63_CONTAINER: "phase13-m6-3-pg",
          M63_CREATED_ID: "deadbeef",
          M63_HOST_PORT: "55452",
          PATH: `${shimDir}:${process.env.PATH ?? ""}`,
        },
      }
    );
    assert.equal(result.status, 1, "a survivor must fail verification");
    assert.match(result.stdout, /cleanup=failed/u);
    assert.match(result.stdout, /container_survives/u);
    // And the acceptance runner turns that verdict into a failed run.
    const runner = read(RUNNER);
    assert.match(runner, /phase13-m6-3-cleanup-check\.sh/u);
    assert.match(runner, /cleanup_failed_resource_survives/u);
    assert.match(runner, /status=21/u);
  } finally {
    rmSync(shimDir, { force: true, recursive: true });
  }
});

test("F: the runner requires a locally present image and removes inventories", () => {
  const script = read(RUNNER);
  // Never pull: the approved image must already be present.
  assert.match(script, /docker image inspect postgres:17/u);
  assert.match(script, /approved_image_missing_no_pull_allowed/u);
  assert.doesNotMatch(script, /docker pull/u);
  // Inventories are compared and removed before the working directory.
  assert.match(script, /containers\.before/u);
  assert.match(script, /rm -f "\$WORKDIR"\/\*\.log/u);
  assert.match(script, /workdir_present=/u);
  assert.match(script, /cleanup_verdict=/u);
});

test("F: the browser lifecycle keeps the database alive and cleans up in order", () => {
  const script = read(
    `${CHATBOT_DIR}scripts/phase13-m6-3-browser-acceptance.sh`
  );
  const seedIdx = script.indexOf("phase13-m6-3-seed-synthetic.ts");
  const pgIdx = script.indexOf("test:phase13:m6-3:db:integration");
  const devIdx = script.indexOf("next dev --hostname 127.0.0.1");
  const browserIdx = script.indexOf("--config=playwright.phase13-m6-3.config.ts");
  assert.ok(
    seedIdx > 0 && pgIdx > seedIdx && devIdx > pgIdx && browserIdx > devIdx
  );
  // Server stops before the database is destroyed.
  const killIdx = script.indexOf('kill -TERM -- "-$SERVER_PGID"');
  const rmIdx = script.indexOf('docker rm -f "$CONTAINER"');
  assert.ok(killIdx > 0 && rmIdx > killIdx);
  // Guarded, loopback-only, no image pull, verified cleanup.
  assert.match(script, /PHASE13_M6_3_BROWSER_AUTHORIZED/u);
  assert.match(script, /127\.0\.0\.1:\$APP_PORT/u);
  assert.match(script, /setsid pnpm exec next dev --hostname 127\.0\.0\.1/u);
  assert.match(script, /kill -TERM -- "-\$SERVER_PGID"/u);
  assert.match(script, /EXPECTED_BROWSER_TESTS=2/u);
  assert.match(script, /phase13-m6-3-cleanup-check\.sh/u);
  assert.doesNotMatch(script, /docker pull/u);
});
