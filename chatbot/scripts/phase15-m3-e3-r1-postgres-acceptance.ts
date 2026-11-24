/**
 * Phase 15 M3-E3 R1 acceptance.
 *
 * Default invocation is read-only preflight. Synthetic writes require the exact
 * opt-in flag and this runner's full shared-runtime identity/schema/ledger/scope
 * guard. Fixtures are intentionally retained; this script has no cleanup path.
 */
// biome-ignore-all lint/suspicious/noExplicitAny: the guarded acceptance runner exercises typed Drizzle and M1 contracts through small runtime adapters.
// biome-ignore-all lint/performance/noNamespaceImport: Node 24 registerHooks is missing from the installed Node type surface.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone fail-closed acceptance script assertions guard every database operation.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as nodeModule from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type BoundCourseResearchResultV1,
  boundCourseResearchResultSchema,
} from "../lib/workspace/course-research";
import {
  buildProjectWorkflowProjection,
  type WorkflowTaskProjectionV1,
} from "../lib/workspace/project-workflows";

const SOCKET_DIR = "/home/rico/.local/state/immigration-ai/phase15-m1-socket";
const SOCKET_PATH = `${SOCKET_DIR}/.s.PGSQL.55432`;
const DATABASE = "immigration_ai_phase15_m1_test";
const ROLE = "phase15_m1_runner";
const PORT = 55_432;
const MARKER = "P15 M3 E3 R1 acceptance:";
const WRITE_AUTHORIZATION = "--authorize-synthetic-writes=phase15-m3-e3-r1";
const R3_MARKER = "P15 M3 E3 R3 course-selection acceptance:";
const R3_MODE = "--r3-course-selection";
const R3_WRITE_AUTHORIZATION =
  "--authorize-synthetic-writes=phase15-m3-e3-r3-course-selection";
const R3_INSPECT_MODE = "--inspect-r3-course-selection";
const R3_RESUME_MODE = "--resume-r3-course-selection";
const R3_RESUME_AUTHORIZATION =
  "--authorize-synthetic-resume=phase15-m3-e3-r3-course-selection";
const MIGRATION_HEAD = "0054_phase14_project_display_name.sql";

type DbRuntime = {
  getLazyDatabase(): unknown;
  closeLazyDatabase(): Promise<void>;
};
type SqlClient = {
  options: Record<string, unknown>;
  unsafe(
    query: string,
    parameters?: readonly unknown[]
  ): Promise<Record<string, any>[]>;
};
type RuntimeApi = {
  createActionProposal(request: Request, projectId: string): Promise<Response>;
  confirmActionProposal(request: Request, projectId: string): Promise<Response>;
};
type WorkflowTask = WorkflowTaskProjectionV1;
type ProjectStateResult = {
  kind: string;
  state?: Record<string, any>;
};
type AcceptanceManifest = {
  projectId: string;
  ownerId: string;
  chatId: string;
  schoolAId: string;
  schoolBId: string;
  student500Id: string;
  memberId: string;
  memberSchoolId: string;
};
type R3AcceptanceManifest = {
  projectId: string;
  ownerId: string;
  schoolAId: string;
  schoolBId: string;
  expectedInstitution: string;
  expectedCourse: string;
  expectedIntake: string | null;
  expectedRevision: number;
  schoolBInstitution: string;
  schoolBCourse: string;
  schoolBIntake: string | null;
};
type R3ResumeScope = {
  projectId: string;
  ownerId: string;
  chatId: string;
  schoolAId: string;
  schoolBId: string;
  expectedRevision: number;
};

const f = globalThis as typeof globalThis & {
  __phase15M3E3R1Session?: { user: { id: string; type: "regular" } } | null;
};
let removeAuthMockFile: (() => void) | undefined;

function registerHarnessHooks() {
  const authMockDirectory = mkdtempSync(
    join(tmpdir(), "phase15-m3-e3-r1-auth-")
  );
  const authMockPath = join(authMockDirectory, "auth.mjs");
  writeFileSync(
    authMockPath,
    "export const auth = async () => globalThis.__phase15M3E3R1Session;",
    { mode: 0o600 }
  );
  const authUrl = pathToFileURL(authMockPath).href;
  removeAuthMockFile = () => {
    rmSync(authMockDirectory, { recursive: true, force: true });
    removeAuthMockFile = undefined;
  };
  const { registerHooks } = nodeModule as unknown as {
    registerHooks(input: Record<string, unknown>): unknown;
  };
  registerHooks({
    resolve(
      specifier: string,
      context: Record<string, unknown>,
      nextResolve: (
        specifier: string,
        context: Record<string, unknown>
      ) => {
        url: string;
        shortCircuit?: boolean;
      }
    ) {
      if (specifier === "server-only") {
        return {
          url: pathToFileURL(resolve("node_modules/server-only/empty.js")).href,
          shortCircuit: true,
        };
      }
      if (specifier === "@/app/(auth)/auth") {
        return { url: authUrl, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}

function verifyEnvironment() {
  assert.equal(process.env.NODE_ENV, "test", "NODE_ENV must be exactly test");
  assert.equal(
    process.env.POSTGRES_URL,
    `postgres:///${DATABASE}`,
    "POSTGRES_URL must be the hostless isolated database URL"
  );
  assert.equal(process.env.PGHOST, SOCKET_DIR);
  assert.equal(process.env.PGPORT, String(PORT));
  assert.equal(process.env.PGUSER, ROLE);
  assert.equal(process.env.DATABASE_URL, undefined);
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("PG") && !["PGHOST", "PGPORT", "PGUSER"].includes(key)) {
      throw new Error(`Unexpected database environment key ${key}`);
    }
  }
}

async function verifiedDatabase() {
  verifyEnvironment();
  registerHarnessHooks();
  const runtime = (await import("../lib/db/runtime-client")) as DbRuntime;
  const database = runtime.getLazyDatabase() as {
    _: { session: { client: SqlClient } };
  };
  const client = database._.session.client;
  assert.equal(client.options.path, SOCKET_PATH);
  assert.equal(client.options.database, DATABASE);
  assert.equal(client.options.user, ROLE);

  // This is the first database query in the process. It validates the actual
  // shared-runtime connection, not a separate probe connection.
  const identityRows = await client.unsafe(
    "select current_database() as database_name, current_user as role_name, " +
      "current_setting('server_version_num')::integer as version_num, " +
      "current_setting('port')::integer as port, inet_client_addr()::text as client_address, " +
      "(select rolsuper from pg_roles where rolname = current_user) as is_superuser, " +
      "current_schema() as current_schema"
  );
  const identity = identityRows[0] as Record<string, unknown>;
  assert.equal(identity.database_name, DATABASE);
  assert.equal(identity.role_name, ROLE);
  assert.ok(
    Number(identity.version_num) >= 170_000 &&
      Number(identity.version_num) < 180_000
  );
  assert.equal(Number(identity.port), PORT);
  assert.equal(
    identity.client_address,
    null,
    "must use the private Unix socket"
  );
  assert.equal(identity.is_superuser, false);
  assert.equal(identity.current_schema, "public");

  const ledgerRows = await client.unsafe(
    "select count(*)::integer as count, max(created_at)::text as latest " +
      "from drizzle.__drizzle_migrations"
  );
  const ledger = ledgerRows[0] as { count: number; latest: string };
  assert.equal(ledger.count, 55);
  assert.equal(ledger.latest, "1794378305209");
  const headRows = await client.unsafe(
    "select hash from drizzle.__drizzle_migrations where created_at = 1794378305209"
  );
  const expectedHash = createHash("sha256")
    .update(await readFile(resolve(`lib/db/migrations/${MIGRATION_HEAD}`)))
    .digest("hex");
  assert.equal(
    (headRows[0] as { hash: string } | undefined)?.hash,
    expectedHash
  );

  const schemas = await client.unsafe(
    "select schema_name from information_schema.schemata " +
      "where schema_name not in ('information_schema') " +
      "and schema_name not like 'pg\\_%' order by schema_name"
  );
  assert.deepEqual(
    schemas.map((row) => String(row.schema_name)),
    ["drizzle", "public"]
  );
  const tableRows = await client.unsafe(
    "select tablename from pg_catalog.pg_tables where schemaname = 'public'"
  );
  assert.equal(tableRows.length, 111);
  const tableNames = new Set(tableRows.map((row) => String(row.tablename)));
  for (const table of [
    "User",
    "StudyJourneyProject",
    "ProjectMembership",
    "ProjectOperation",
    "ProjectEvent",
    "ProjectConversation",
    "Message_v2",
    "SchoolApplication",
    "SchoolApplicationEvent",
    "SchoolApplicationPackage",
    "SchoolAdmissionCase",
    "Student500Application",
    "Student500ApplicationEvent",
  ]) {
    assert.ok(tableNames.has(table), `Missing required table ${table}`);
  }
  return { client, runtime, identity, ledger };
}

async function assertFreshSyntheticScope(client: SqlClient) {
  const rows = await client.unsafe(
    'select count(*)::integer as count from public."StudyJourneyProject" ' +
      'where "displayName" like $1',
    [`${MARKER}%`]
  );
  assert.equal(
    Number((rows[0] as { count: number }).count),
    0,
    "A prior E3 R1 fixture marker exists; refuse duplicate synthetic writes"
  );
}

async function assertFreshR3SyntheticScope(client: SqlClient) {
  const rows = await client.unsafe(
    'select count(*)::integer as count from public."StudyJourneyProject" ' +
      'where "displayName" like $1',
    [`${R3_MARKER}%`]
  );
  assert.equal(
    Number((rows[0] as { count: number }).count),
    0,
    "A prior R3 course-selection fixture exists; refuse duplicate synthetic writes"
  );
}

function canonicalR3ObservationTimestamp(observedAt: Date): string {
  return observedAt
    .toISOString()
    .replace(
      /\.(\d{3})Z$/u,
      (_match, milliseconds: string) => `.${milliseconds}000Z`
    );
}

export function buildR3CourseCandidateEnvelope(input: {
  chatId: string;
  task: WorkflowTask;
  courseTitle: string;
  institutionName: string;
  observedAt?: Date;
  assistantMessageId?: string;
  candidateId?: string;
}): BoundCourseResearchResultV1 {
  const assistantMessageId = input.assistantMessageId ?? randomUUID();
  const envelope = {
    schemaVersion: "phase15.course-research-result.v1",
    projectId: input.task.projectId,
    chatId: input.chatId,
    taskId: input.task.taskId,
    definitionVersion: input.task.definitionVersion,
    workflowKind: "school_application",
    stepKey: "school_discovery",
    targetKind: "school_application",
    targetId: input.task.targetId,
    sourceRevisions: input.task.sourceRevisions.map((item) => ({ ...item })),
    observedAt: canonicalR3ObservationTimestamp(input.observedAt ?? new Date()),
    candidates: [
      {
        candidateId: input.candidateId ?? randomUUID(),
        institutionName: input.institutionName,
        courseTitle: input.courseTitle,
        identityEvidenceLevel: "model_research_lead",
        identitySourceIds: [],
        fields: [
          {
            key: "intake",
            value: null,
            evidenceLevel: "model_research_lead",
            sourceIds: [],
            applicabilityNote: "Intake is unknown.",
            independentObservation: null,
          },
        ],
        sources: [],
        limitations: [
          "Synthetic acceptance candidate; not an official course record.",
        ],
        verificationState: "not_requested",
      },
    ],
    limitations: ["Synthetic PostgreSQL acceptance fixture."],
    diagnostics: { invalidCandidateCount: 0 },
    assistantMessageId,
  };
  const parsed = boundCourseResearchResultSchema.safeParse(envelope);
  if (!parsed.success) {
    const issuePaths = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean);
    throw new Error(
      `R3 synthetic candidate rejected by boundCourseResearchResultSchema${issuePaths.length ? ` at ${[...new Set(issuePaths)].join(",")}` : ""}`
    );
  }
  return parsed.data;
}

function sanitizedApplicationErrorCode(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "unavailable";
  }
  const body = payload as Record<string, unknown>;
  const code = body.error ?? body.code ?? body.errorCode;
  return typeof code === "string" && /^[a-z][a-z0-9_]{0,63}$/u.test(code)
    ? code
    : "unavailable";
}

export async function assertR3HttpStatus(
  response: Response,
  expectedStatus: number,
  scenario: string,
  stage: string
): Promise<void> {
  if (response.status === expectedStatus) {
    return;
  }
  let applicationErrorCode = "unavailable";
  try {
    applicationErrorCode = sanitizedApplicationErrorCode(
      await response.clone().json()
    );
  } catch {
    // Report only a safe code for non-JSON responses; never include the body.
  }
  throw new Error(
    `PG-E3 scenario=${scenario} stage=${stage} expected_http=${expectedStatus} actual_http=${response.status} application_error_code=${applicationErrorCode}`
  );
}

function requestFor(projectId: string, path: string, body: unknown): Request {
  return new Request(`http://localhost/api/projects/${projectId}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}

function taskSelection(task: WorkflowTask) {
  return {
    schemaVersion: "phase15.active-step-selection.v1",
    projectId: task.projectId,
    taskId: task.taskId,
    workflowKind: task.workflowKind,
    definitionVersion: task.definitionVersion,
    stepKey: task.stepKey,
    targetKind: task.targetKind,
    targetId: task.targetId,
    sourceRevisions: task.sourceRevisions.map((item) => ({ ...item })),
  };
}

async function readProjectState(
  actorUserId: string,
  projectId: string
): Promise<Record<string, any>> {
  const { loadProjectStateForActor } = await import(
    "../lib/workspace/project-state-server"
  );
  const loaded = (await loadProjectStateForActor({
    actorUserId,
    actorType: "regular",
    projectId,
  })) as ProjectStateResult;
  if (loaded.kind !== "ok" || !loaded.state) {
    throw new Error("Project State must be authoritatively available");
  }
  return loaded.state;
}

function findTask(
  state: Record<string, any>,
  workflowKind: string,
  stepKey: string,
  targetId: string
): WorkflowTask {
  const task = buildProjectWorkflowProjection(state as any).tasks.find(
    (item) =>
      item.workflowKind === workflowKind &&
      item.stepKey === stepKey &&
      item.targetId === targetId
  );
  assert.ok(task, "Expected workflow task was not produced");
  return task;
}

function callCreate(
  api: RuntimeApi,
  actorId: string,
  projectId: string,
  chatId: string,
  task: WorkflowTask,
  fieldPath: string,
  proposedValue: unknown
) {
  f.__phase15M3E3R1Session = {
    user: { id: actorId, type: "regular" },
  };
  return api.createActionProposal(
    requestFor(projectId, "action-proposals", {
      chatId,
      selection: taskSelection(task),
      fieldPath,
      proposedValue,
    }),
    projectId
  );
}

function callConfirm(
  api: RuntimeApi,
  actorId: string,
  projectId: string,
  token: string
) {
  f.__phase15M3E3R1Session = {
    user: { id: actorId, type: "regular" },
  };
  return api.confirmActionProposal(
    requestFor(projectId, "action-proposals/confirm", {
      confirmationToken: token,
    }),
    projectId
  );
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function createUser(
  database: any,
  userTable: any,
  id: string,
  label: string
) {
  await database.insert(userTable).values({
    id,
    email: `p15.e3r1.${label}.${id.slice(0, 8)}@acceptance.invalid`,
    role: "user",
  });
}

function verifyReadbackChild(manifest: AcceptanceManifest) {
  const args = [
    "--conditions=react-server",
    "--import",
    "tsx",
    resolve(process.argv[1]),
    "--readback",
    JSON.stringify(manifest),
  ];
  const child = spawnSync(process.execPath, args, {
    env: process.env,
    stdio: "inherit",
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, "Fresh-process readback must pass");
}

async function readbackOnly(manifest: AcceptanceManifest, client: SqlClient) {
  const state = await readProjectState(manifest.ownerId, manifest.projectId);
  assert.equal(state.project.id, manifest.projectId);
  assert.equal(state.project.status, "closed");
  const [{ schoolApplicationService }, { student500Service }] =
    await Promise.all([
      import("../lib/school-applications/runtime"),
      import("../lib/student-500/runtime"),
    ]);
  const [schoolA, student] = await Promise.all([
    schoolApplicationService.get({
      actorUserId: manifest.ownerId,
      projectId: manifest.projectId,
      applicationId: manifest.schoolAId,
    }),
    student500Service.get({
      actorUserId: manifest.ownerId,
      projectId: manifest.projectId,
      applicationId: manifest.student500Id,
    }),
  ]);
  assert.equal(schoolA.intake.label, "July 2027 (confirmed E3 R1)");
  assert.equal(student.context.applicationPlace, "onshore");
  const rows = await client.unsafe(
    'select (select count(*)::integer from public."SchoolApplicationEvent" ' +
      'where "applicationId" = $1) as school_events, ' +
      '(select count(*)::integer from public."Student500ApplicationEvent" ' +
      'where "applicationId" = $2) as student_events',
    [manifest.schoolAId, manifest.student500Id]
  );
  assert.ok(Number((rows[0] as any).school_events) >= 2);
  assert.ok(Number((rows[0] as any).student_events) >= 2);
  process.stdout.write("PG-E3 fresh-process business readback PASS.\n");
}

function verifyR3ReadbackChild(manifest: R3AcceptanceManifest) {
  const args = [
    "--conditions=react-server",
    "--import",
    "tsx",
    resolve(process.argv[1]),
    `--readback-r3-course-selection=${JSON.stringify(manifest)}`,
  ];
  const child = spawnSync(process.execPath, args, {
    env: process.env,
    stdio: "inherit",
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, "Fresh-process R3 readback must pass");
}

async function readbackR3Only(manifest: R3AcceptanceManifest) {
  const state = await readProjectState(manifest.ownerId, manifest.projectId);
  assert.equal(state.project.id, manifest.projectId);
  assert.equal(state.project.status, "active");
  const { schoolApplicationService } = await import(
    "../lib/school-applications/runtime"
  );
  const [schoolA, schoolB] = await Promise.all([
    schoolApplicationService.get({
      actorUserId: manifest.ownerId,
      projectId: manifest.projectId,
      applicationId: manifest.schoolAId,
    }),
    schoolApplicationService.get({
      actorUserId: manifest.ownerId,
      projectId: manifest.projectId,
      applicationId: manifest.schoolBId,
    }),
  ]);
  assert.equal(schoolA.institution.name, manifest.expectedInstitution);
  assert.equal(schoolA.course.title, manifest.expectedCourse);
  assert.equal(schoolA.intake.label, manifest.expectedIntake);
  assert.equal(schoolA.revision, manifest.expectedRevision);
  assert.equal(schoolA.currentPackage, null);
  assert.equal(
    schoolA.packages.some(
      (item: Record<string, any>) => item.status === "stale"
    ),
    true
  );
  assert.equal(schoolB.institution.name, manifest.schoolBInstitution);
  assert.equal(schoolB.course.title, manifest.schoolBCourse);
  assert.equal(schoolB.intake.label, manifest.schoolBIntake);
  const task = findTask(
    state,
    "school_application",
    "school_discovery",
    manifest.schoolAId
  );
  assert.equal(
    task.sourceRevisions.some(
      (item) =>
        item.targetKind === "school_application" &&
        item.targetId === manifest.schoolAId &&
        item.revision === manifest.expectedRevision
    ),
    true
  );
  process.stdout.write(
    "PG-E3-R3 fresh-process School A readback, School B isolation, package invalidation and M1/E2 projection PASS.\n"
  );
}

function callCourseSelectionCreate(
  api: RuntimeApi,
  actorId: string,
  projectId: string,
  chatId: string,
  task: WorkflowTask,
  assistantMessageId: string,
  candidateId: string
) {
  f.__phase15M3E3R1Session = {
    user: { id: actorId, type: "regular" },
  };
  return api.createActionProposal(
    requestFor(projectId, "action-proposals", {
      operation: "select_school_course_candidate",
      chatId,
      selection: taskSelection(task),
      assistantMessageId,
      candidateId,
      verificationAttestations: [],
    }),
    projectId
  );
}

async function persistR3CourseCandidate(input: {
  chatId: string;
  task: WorkflowTask;
  courseTitle: string;
  institutionName: string;
}) {
  const { saveMessages } = await import("../lib/db/queries");
  const result = buildR3CourseCandidateEnvelope(input);
  const assistantMessageId = result.assistantMessageId;
  const candidateId = result.candidates[0]?.candidateId;
  assert.ok(candidateId, "Validated R3 candidate must include one candidate");
  await saveMessages({
    messages: [
      {
        id: assistantMessageId,
        chatId: input.chatId,
        role: "assistant",
        parts: [{ type: "metadata", courseResearchResult: result }],
        attachments: [],
        createdAt: new Date(),
      },
    ],
  });
  return { assistantMessageId, candidateId };
}

async function inspectR3RetainedSyntheticScope(
  client: SqlClient
): Promise<R3ResumeScope> {
  const projects = await client.unsafe(
    'select id, "ownerUserId" as owner_id, status, revision, "displayName" as display_name ' +
      'from public."StudyJourneyProject" where "displayName" like $1 order by "createdAt"',
    [`${R3_MARKER}%`]
  );
  assert.equal(
    projects.length,
    1,
    `R3 resume requires exactly one retained marker Project; found ${projects.length}`
  );
  const project = projects[0] as Record<string, any>;
  const projectId = String(project.id);
  const ownerId = String(project.owner_id);
  assert.ok(
    typeof project.display_name === "string" &&
      project.display_name.startsWith(R3_MARKER),
    "R3 Project must use the exact synthetic marker"
  );
  assert.match(
    String(project.display_name).slice(R3_MARKER.length),
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    "R3 Project must retain its generated run identity"
  );
  assert.equal(project.status, "active", "R3 retained Project must be active");

  const owners = await client.unsafe(
    'select id, email, role from public."User" where id = $1',
    [ownerId]
  );
  assert.equal(owners.length, 1, "R3 synthetic owner must exist exactly once");
  assert.equal(
    (owners[0] as Record<string, any>).email,
    `p15.e3r1.r3-course-owner.${ownerId.slice(0, 8)}@acceptance.invalid`
  );
  assert.equal((owners[0] as Record<string, any>).role, "user");

  const conversations = await client.unsafe(
    'select pc."chatId" as chat_id, pc."createdByUserId" as creator_id, ' +
      'c."userId" as chat_owner_id, c.title, c.visibility ' +
      'from public."ProjectConversation" pc inner join public."Chat" c on c.id = pc."chatId" ' +
      'where pc."projectId" = $1 order by pc."createdAt"',
    [projectId]
  );
  assert.equal(
    conversations.length,
    1,
    "R3 resume requires exactly one Project Chat"
  );
  const conversation = conversations[0] as Record<string, any>;
  const chatId = String(conversation.chat_id);
  assert.equal(String(conversation.creator_id), ownerId);
  assert.equal(String(conversation.chat_owner_id), ownerId);
  assert.equal(
    conversation.title,
    "E3 R3 course-selection synthetic acceptance"
  );
  assert.equal(conversation.visibility, "private");

  const memberships = await client.unsafe(
    'select id from public."ProjectMembership" where "projectId" = $1',
    [projectId]
  );
  assert.equal(memberships.length, 0, "R3 fixture must have no extra members");

  const applications = await client.unsafe(
    'select id, "ownerUserId" as owner_id, status, revision, "institutionName" as institution_name, ' +
      '"institutionId" as institution_id, "courseTitle" as course_title, "courseId" as course_id, ' +
      '"deliveryId" as delivery_id, "intakeId" as intake_id, "intakeLabel" as intake_label, ' +
      '"sourceStatus" as source_status from public."SchoolApplication" where "projectId" = $1',
    [projectId]
  );
  assert.equal(
    applications.length,
    2,
    "R3 fixture must contain exactly School A and B"
  );
  const schoolA = applications.find(
    (row) => row.institution_name === "Synthetic University R3 A"
  ) as Record<string, any> | undefined;
  const schoolB = applications.find(
    (row) => row.institution_name === "Synthetic University R3 B"
  ) as Record<string, any> | undefined;
  assert.ok(schoolA, "Expected retained School A identity");
  assert.ok(schoolB, "Expected retained School B identity");
  for (const application of [schoolA, schoolB]) {
    assert.equal(String(application.owner_id), ownerId);
    assert.equal(application.institution_id, null);
    assert.equal(application.course_id, null);
    assert.equal(application.delivery_id, null);
    assert.equal(application.intake_id, null);
    assert.equal(application.source_status, "unverified_customer_declared");
  }
  assert.equal(schoolA.status, "package_prepared");
  assert.equal(Number(schoolA.revision), 2);
  assert.equal(schoolA.course_title, "Recorded Synthetic Course R3 A");
  assert.equal(schoolA.intake_label, "January 2028");
  assert.equal(schoolB.status, "draft");
  assert.equal(Number(schoolB.revision), 1);
  assert.equal(schoolB.course_title, "Recorded Synthetic Course R3 B");
  assert.equal(schoolB.intake_label, "July 2028");

  const packages = await client.unsafe(
    'select id, "applicationId" as application_id, "createdByUserId" as creator_id, ' +
      'status, version, "targetId" as target_id, "targetVersion" as target_version ' +
      'from public."SchoolApplicationPackage" where "projectId" = $1',
    [projectId]
  );
  assert.equal(
    packages.length,
    1,
    "R3 fixture must retain exactly one package"
  );
  const preparationPackage = packages[0] as Record<string, any>;
  assert.equal(String(preparationPackage.application_id), String(schoolA.id));
  assert.equal(String(preparationPackage.creator_id), ownerId);
  assert.equal(preparationPackage.status, "current");
  assert.equal(Number(preparationPackage.version), 1);
  assert.equal(preparationPackage.target_id, String(schoolA.id));
  assert.equal(Number(preparationPackage.target_version), 1);

  const relatedMatterCounts = await client.unsafe(
    'select (select count(*)::integer from public."SchoolAdmissionCase" where "projectId" = $1) as admissions, ' +
      '(select count(*)::integer from public."Student500Application" where "projectId" = $1) as student500',
    [projectId]
  );
  assert.equal(Number(relatedMatterCounts[0]?.admissions), 0);
  assert.equal(Number(relatedMatterCounts[0]?.student500), 0);
  const schoolReferences = await client.unsafe(
    'select id from public."SchoolApplicationReference" where "projectId" = $1',
    [projectId]
  );
  assert.equal(
    schoolReferences.length,
    0,
    "R3 fixture must not have reference history that changes package inputs"
  );

  const messages = await client.unsafe(
    'select id, role, parts from public."Message_v2" where "chatId" = $1 order by "createdAt", id',
    [chatId]
  );
  const candidates: Array<{
    message: Record<string, any>;
    result: Record<string, any>;
  }> = [];
  for (const message of messages) {
    const parts = Array.isArray(message.parts)
      ? message.parts
      : typeof message.parts === "string"
        ? JSON.parse(message.parts)
        : [];
    if (!Array.isArray(parts)) {
      continue;
    }
    for (const part of parts) {
      if (
        part &&
        typeof part === "object" &&
        !Array.isArray(part) &&
        (part as Record<string, any>).type === "metadata"
      ) {
        const result = (part as Record<string, any>).courseResearchResult;
        if (
          result &&
          typeof result === "object" &&
          result.schemaVersion === "phase15.course-research-result.v1"
        ) {
          candidates.push({ message, result });
        }
      }
    }
  }
  assert.equal(
    candidates.length,
    1,
    "R3 resume requires the single original invalid candidate message and no prior retry"
  );
  const historical = candidates[0];
  assert.ok(historical);
  const historicalResult = historical.result;
  assert.equal(historical.message.role, "assistant");
  assert.equal(historicalResult.assistantMessageId, historical.message.id);
  assert.equal(historicalResult.projectId, projectId);
  assert.equal(historicalResult.chatId, chatId);
  assert.equal(historicalResult.targetId, String(schoolA.id));
  assert.equal(historicalResult.candidates?.length, 1);
  assert.equal(
    historicalResult.candidates[0]?.institutionName,
    "Synthetic University R3 New"
  );
  assert.equal(
    historicalResult.candidates[0]?.courseTitle,
    "Synthetic Selected Course R3"
  );
  assert.match(
    String(historicalResult.observedAt),
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u,
    "Retained historical fixture should preserve the original three-digit timestamp"
  );
  const historicalValidation =
    boundCourseResearchResultSchema.safeParse(historicalResult);
  assert.equal(historicalValidation.success, false);
  if (historicalValidation.success) {
    throw new Error(
      "Expected the retained original candidate to remain invalid"
    );
  }
  const invalidPaths = [
    ...new Set(
      historicalValidation.error.issues.map((issue) => issue.path.join("."))
    ),
  ];
  assert.deepEqual(
    invalidPaths,
    ["observedAt"],
    "The retained fixture's only schema defect must be its timestamp precision"
  );

  const state = await readProjectState(ownerId, projectId);
  assert.equal(state.project.id, projectId);
  assert.equal(state.project.status, "active");
  const task = findTask(
    state,
    "school_application",
    "school_discovery",
    String(schoolA.id)
  );
  assert.equal(historicalResult.taskId, task.taskId);
  assert.equal(historicalResult.definitionVersion, task.definitionVersion);
  assert.deepEqual(historicalResult.sourceRevisions, task.sourceRevisions);
  assert.equal(task.targetKind, "school_application");
  assert.equal(task.targetId, String(schoolA.id));

  const scope: R3ResumeScope = {
    projectId,
    ownerId,
    chatId,
    schoolAId: String(schoolA.id),
    schoolBId: String(schoolB.id),
    expectedRevision: Number(schoolA.revision),
  };
  process.stdout.write(
    `${JSON.stringify({
      readOnlyR3ScopeInspection: true,
      resumeAuthorized: false,
      resumable: true,
      project: {
        id: projectId,
        ownerId,
        displayName: project.display_name,
        status: project.status,
      },
      chat: { id: chatId, ownerId, title: conversation.title },
      schools: [
        {
          id: scope.schoolAId,
          status: schoolA.status,
          revision: Number(schoolA.revision),
          institution: schoolA.institution_name,
          course: schoolA.course_title,
          intake: schoolA.intake_label,
        },
        {
          id: scope.schoolBId,
          status: schoolB.status,
          revision: Number(schoolB.revision),
          institution: schoolB.institution_name,
          course: schoolB.course_title,
          intake: schoolB.intake_label,
        },
      ],
      package: {
        id: preparationPackage.id,
        applicationId: preparationPackage.application_id,
        status: preparationPackage.status,
        version: Number(preparationPackage.version),
        targetVersion: Number(preparationPackage.target_version),
      },
      relatedAdmissions: 0,
      relatedStudent500: 0,
      schoolReferences: 0,
      priorCourseSelectionMutation: false,
      retainedInvalidMessage: String(historical.message.id),
      retainedInvalidPaths: invalidPaths,
    })}\n`
  );
  return scope;
}

async function runR3CourseSelectionIntegration(
  database: any,
  client: SqlClient,
  resumeScope?: R3ResumeScope
) {
  if (!resumeScope && !process.argv.includes(R3_WRITE_AUTHORIZATION)) {
    process.stdout.write(
      "R3 identity/schema/ledger preflight PASS; course-selection synthetic writes were not authorized, so PG-E3-R3 is NOT RUN.\n"
    );
    return;
  }
  if (!resumeScope) {
    await assertFreshR3SyntheticScope(client);
  }
  process.env.AUTH_SECRET = randomUUID() + randomUUID();
  const schema = await import("../lib/db/schema");
  const { user } = schema;
  const { projectFoundationRepository } = await import(
    "../lib/db/project-foundation"
  );
  const { schoolApplicationService } = await import(
    "../lib/school-applications/runtime"
  );
  const api = (await import(
    "../lib/workspace/project-action-proposal-runtime"
  )) as RuntimeApi;
  let ownerId: string;
  let projectId: string;
  let chatId: string;
  let schoolAId: string;
  let schoolBId: string;
  if (resumeScope) {
    ({ ownerId, projectId, chatId, schoolAId, schoolBId } = resumeScope);
  } else {
    const runId = randomUUID();
    ownerId = randomUUID();
    const displayName = `${R3_MARKER}${runId}`;
    await createUser(database, user, ownerId, "r3-course-owner");
    const projectResult = await projectFoundationRepository.createProject({
      actorUserId: ownerId,
      operationId: randomUUID(),
      displayName,
    });
    projectId = projectResult.project.id;
    const chatResult = await projectFoundationRepository.createProjectChat({
      actorUserId: ownerId,
      projectId,
      operationId: randomUUID(),
      title: "E3 R3 course-selection synthetic acceptance",
    });
    chatId = chatResult.chatId;
    const schoolA = await schoolApplicationService.create({
      actorUserId: ownerId,
      projectId,
      operationId: randomUUID(),
      institutionName: "Synthetic University R3 A",
      courseTitle: "Recorded Synthetic Course R3 A",
      intakeLabel: "January 2028",
    });
    const schoolB = await schoolApplicationService.create({
      actorUserId: ownerId,
      projectId,
      operationId: randomUUID(),
      institutionName: "Synthetic University R3 B",
      courseTitle: "Recorded Synthetic Course R3 B",
      intakeLabel: "July 2028",
    });
    schoolAId = schoolA.application.applicationId;
    schoolBId = schoolB.application.applicationId;
    const packageBuild = await schoolApplicationService.buildPackage({
      actorUserId: ownerId,
      projectId,
      applicationId: schoolAId,
      expectedRevision: schoolA.application.revision,
      operationId: randomUUID(),
    });
    assert.ok(packageBuild.package.packageId);
  }
  const beforeA = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolAId,
  });
  const beforeB = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolBId,
  });
  assert.equal(beforeA.institution.name, "Synthetic University R3 A");
  assert.equal(beforeA.course.title, "Recorded Synthetic Course R3 A");
  assert.equal(beforeA.intake.label, "January 2028");
  assert.equal(beforeA.revision, resumeScope?.expectedRevision ?? 2);
  assert.equal(beforeA.status, "package_prepared");
  assert.ok(beforeA.currentPackage?.packageId);
  const originalPackageId = beforeA.currentPackage.packageId;
  assert.equal(beforeB.institution.name, "Synthetic University R3 B");
  assert.equal(beforeB.course.title, "Recorded Synthetic Course R3 B");
  assert.equal(beforeB.intake.label, "July 2028");
  assert.equal(beforeB.revision, 1);
  const stateBefore = await readProjectState(ownerId, projectId);
  assert.equal(stateBefore.project.id, projectId);
  assert.equal(stateBefore.project.status, "active");
  const task = findTask(
    stateBefore,
    "school_application",
    "school_discovery",
    schoolAId
  );
  assert.equal(task.projectId, projectId);
  assert.equal(task.targetId, schoolAId);
  assert.ok(
    task.sourceRevisions.some(
      (item) =>
        item.targetKind === "school_application" &&
        item.targetId === schoolAId &&
        item.revision === beforeA.revision
    ),
    "R3 candidate scope must match the current School A revision"
  );
  const persisted = await persistR3CourseCandidate({
    chatId,
    task,
    institutionName: "Synthetic University R3 New",
    courseTitle: "Synthetic Selected Course R3",
  });
  const preview = await callCourseSelectionCreate(
    api,
    ownerId,
    projectId,
    chatId,
    task,
    persisted.assistantMessageId,
    persisted.candidateId
  );
  await assertR3HttpStatus(preview, 200, "course_selection", "preview");
  const previewBody = await body<{
    display: {
      changes: Array<{
        field: string;
        oldValue: string | null;
        proposedValue: string | null;
      }>;
    };
    confirmationToken: string;
  }>(preview);
  assert.ok(previewBody.confirmationToken);
  assert.deepEqual(previewBody.display.changes, [
    {
      field: "Institution",
      oldValue: beforeA.institution.name,
      proposedValue: "Synthetic University R3 New",
    },
    {
      field: "Course",
      oldValue: beforeA.course.title,
      proposedValue: "Synthetic Selected Course R3",
    },
    {
      field: "Intake",
      oldValue: beforeA.intake.label,
      proposedValue: null,
    },
  ]);
  const afterPreview = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolAId,
  });
  assert.equal(afterPreview.revision, beforeA.revision);
  assert.equal(afterPreview.status, beforeA.status);
  assert.equal(afterPreview.institution.name, beforeA.institution.name);
  assert.equal(
    afterPreview.institution.catalogId,
    beforeA.institution.catalogId
  );
  assert.equal(afterPreview.course.title, beforeA.course.title);
  assert.equal(afterPreview.course.catalogId, beforeA.course.catalogId);
  assert.equal(afterPreview.deliveryId, beforeA.deliveryId);
  assert.equal(afterPreview.intake.id, beforeA.intake.id);
  assert.equal(afterPreview.intake.label, beforeA.intake.label);
  assert.equal(afterPreview.currentPackage?.packageId, originalPackageId);
  assert.equal(afterPreview.currentPackage?.status, "current");

  const firstConfirm = await callConfirm(
    api,
    ownerId,
    projectId,
    previewBody.confirmationToken
  );
  await assertR3HttpStatus(
    firstConfirm,
    200,
    "course_selection",
    "confirmation"
  );
  const firstConfirmBody = await body<{
    readback: string;
    replayed: boolean;
    revision: number;
  }>(firstConfirm);
  assert.equal(firstConfirmBody.readback, "verified");
  assert.equal(firstConfirmBody.replayed, false);
  assert.equal(firstConfirmBody.revision, beforeA.revision + 1);
  const replay = await callConfirm(
    api,
    ownerId,
    projectId,
    previewBody.confirmationToken
  );
  await assertR3HttpStatus(replay, 200, "course_selection", "replay");
  const replayBody = await body<{
    readback: string;
    replayed: boolean;
    revision: number;
  }>(replay);
  assert.equal(replayBody.readback, "verified");
  assert.equal(replayBody.replayed, true);
  assert.equal(replayBody.revision, beforeA.revision + 1);
  const afterA = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolAId,
  });
  const afterB = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolBId,
  });
  assert.equal(afterA.revision, beforeA.revision + 1);
  assert.equal(afterA.institution.name, "Synthetic University R3 New");
  assert.equal(afterA.course.title, "Synthetic Selected Course R3");
  assert.equal(afterA.intake.label, null);
  assert.equal(afterA.institution.catalogId, null);
  assert.equal(afterA.course.catalogId, null);
  assert.equal(afterA.deliveryId, null);
  assert.equal(afterA.intake.id, null);
  assert.equal(afterA.currentPackage, null);
  assert.equal(
    afterA.packages.some(
      (item: Record<string, any>) =>
        item.packageId === originalPackageId && item.status === "stale"
    ),
    true
  );
  assert.equal(afterB.revision, beforeB.revision);
  assert.equal(afterB.institution.name, beforeB.institution.name);
  assert.equal(afterB.course.title, beforeB.course.title);
  assert.equal(afterB.intake.label, beforeB.intake.label);
  const stateAfter = await readProjectState(ownerId, projectId);
  assert.equal(stateAfter.project.id, projectId);
  assert.equal(
    buildProjectWorkflowProjection(stateAfter as any).tasks.some(
      (item) =>
        item.targetId === schoolAId && item.targetKind === "school_application"
    ),
    true
  );
  const readbackManifest: R3AcceptanceManifest = {
    projectId,
    ownerId,
    schoolAId,
    schoolBId,
    expectedInstitution: afterA.institution.name,
    expectedCourse: afterA.course.title,
    expectedIntake: afterA.intake.label,
    expectedRevision: afterA.revision,
    schoolBInstitution: beforeB.institution.name,
    schoolBCourse: beforeB.course.title,
    schoolBIntake: beforeB.intake.label,
  };
  verifyR3ReadbackChild(readbackManifest);

  const taskAfter = findTask(
    stateAfter,
    "school_application",
    "school_discovery",
    schoolAId
  );
  const staleCandidate = await persistR3CourseCandidate({
    chatId,
    task: taskAfter,
    institutionName: "Synthetic University R3 Later",
    courseTitle: "Synthetic Later Course R3",
  });
  const stalePreview = await callCourseSelectionCreate(
    api,
    ownerId,
    projectId,
    chatId,
    taskAfter,
    staleCandidate.assistantMessageId,
    staleCandidate.candidateId
  );
  await assertR3HttpStatus(
    stalePreview,
    200,
    "course_selection",
    "stale_preview"
  );
  const staleBody = await body<{ confirmationToken: string }>(stalePreview);
  const beforeConcurrentWrite = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolAId,
  });
  await schoolApplicationService.update({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolAId,
    expectedRevision: beforeConcurrentWrite.revision,
    operationId: randomUUID(),
    institutionName: beforeConcurrentWrite.institution.name,
    institutionId: beforeConcurrentWrite.institution.catalogId,
    courseTitle: beforeConcurrentWrite.course.title,
    courseId: beforeConcurrentWrite.course.catalogId,
    deliveryId: beforeConcurrentWrite.deliveryId,
    intakeId: beforeConcurrentWrite.intake.id,
    intakeLabel: "Concurrent R3 change",
  });
  const staleConfirm = await callConfirm(
    api,
    ownerId,
    projectId,
    staleBody.confirmationToken
  );
  await assertR3HttpStatus(
    staleConfirm,
    409,
    "course_selection",
    "stale_confirmation"
  );
  const afterConflict = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolAId,
  });
  assert.equal(afterConflict.intake.label, "Concurrent R3 change");
  assert.equal(
    afterConflict.institution.name,
    beforeConcurrentWrite.institution.name
  );
  assert.equal(afterConflict.course.title, beforeConcurrentWrite.course.title);
  process.stdout.write(
    `${JSON.stringify({
      scenario: "PG-E3-R3 course selection",
      resumeExistingScope: Boolean(resumeScope),
      retainedInvalidMessagePreserved: Boolean(resumeScope),
      previewNoWriteBeforeConfirmation: "PASS",
      confirmedReadback: "PASS",
      replayNoDuplicateMutation: "PASS",
      staleRevisionConflict: "PASS",
      packageInvalidation: "PASS",
      schoolBIsolation: "PASS",
      freshProcessM1E2Readback: "PASS",
      fixturesRetained: true,
    })}\n`
  );
}

async function inspectExistingScope(client: SqlClient) {
  const projects = await client.unsafe(
    'select id, "ownerUserId" as owner_id, status, revision, "displayName" as display_name ' +
      'from public."StudyJourneyProject" where "displayName" like $1 order by "createdAt"',
    [`${MARKER}%`]
  );
  const scopes: Record<string, unknown>[] = [];
  for (const project of projects) {
    const chats = await client.unsafe(
      'select "chatId" as chat_id from public."ProjectConversation" ' +
        'where "projectId" = $1 and "createdByUserId" = $2 order by "createdAt"',
      [project.id, project.owner_id]
    );
    const applications = await client.unsafe(
      'select id, "ownerUserId" as owner_id, status, revision, "intakeLabel" as intake_label ' +
        'from public."SchoolApplication" where "projectId" = $1 order by "createdAt"',
      [project.id]
    );
    const packages = await client.unsafe(
      'select p."applicationId" as application_id, p.status, p.version ' +
        'from public."SchoolApplicationPackage" p inner join public."SchoolApplication" a ' +
        'on a.id = p."applicationId" where a."projectId" = $1 order by p."createdAt"',
      [project.id]
    );
    const studentApplications = await client.unsafe(
      'select id, "ownerUserId" as owner_id, status, revision, "applicationPlace" as application_place, "coeStatus" as coe_status ' +
        'from public."Student500Application" where "projectId" = $1 order by "createdAt"',
      [project.id]
    );
    const memberships = await client.unsafe(
      'select id, "userId" as user_id, status from public."ProjectMembership" ' +
        'where "projectId" = $1 order by "createdAt"',
      [project.id]
    );
    scopes.push({
      project: {
        id: project.id,
        ownerId: project.owner_id,
        status: project.status,
        revision: project.revision,
        displayName: project.display_name,
      },
      chatIds: chats.map((row) => row.chat_id),
      applications,
      packages,
      studentApplications,
      memberships,
    });
  }
  process.stdout.write(
    `${JSON.stringify({ readOnlyScopeInspection: true, scopes })}\n`
  );
}

async function runIntegration(
  database: any,
  client: SqlClient,
  runtime: DbRuntime
) {
  if (!process.argv.includes(WRITE_AUTHORIZATION)) {
    process.stdout.write(
      "Read-only identity/schema/ledger preflight PASS; synthetic writes were not authorized, so PG-E3 scenarios are NOT RUN.\n"
    );
    return;
  }
  await assertFreshSyntheticScope(client);
  process.env.AUTH_SECRET = randomUUID() + randomUUID();

  const schema = await import("../lib/db/schema");
  const { user, projectMembership } = schema;
  const { projectFoundationRepository } = await import(
    "../lib/db/project-foundation"
  );
  const [{ schoolApplicationService }, { student500Service }] =
    await Promise.all([
      import("../lib/school-applications/runtime"),
      import("../lib/student-500/runtime"),
    ]);
  const { EMPTY_STUDENT_500_CONTEXT } = await import(
    "../lib/student-500/contracts"
  );
  const api = (await import(
    "../lib/workspace/project-action-proposal-runtime"
  )) as RuntimeApi;
  const { eq, and } = await import("drizzle-orm");
  const runId = randomUUID();
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const displayName = MARKER + runId;

  const markerCheck = await client.unsafe(
    'select count(*)::integer as count from public."StudyJourneyProject" ' +
      'where "displayName" like $1',
    [`${MARKER}%`]
  );
  assert.equal(Number((markerCheck[0] as any).count), 0);

  // The marker Project is the durable scope lock. If a run stops halfway, this
  // runner refuses a second synthetic write run instead of silently duplicating.
  await createUser(database, user, ownerId, "owner");
  const createdProject = await projectFoundationRepository.createProject({
    actorUserId: ownerId,
    operationId: randomUUID(),
    displayName,
  });
  assert.equal(createdProject.replayed, false);
  const projectId = createdProject.project.id;
  await createUser(database, user, memberId, "member");
  const chatOutcome = await projectFoundationRepository.createProjectChat({
    actorUserId: ownerId,
    projectId,
    operationId: randomUUID(),
    title: "E3 R1 synthetic acceptance",
  });
  const chatId = chatOutcome.chatId;

  const schoolA = await schoolApplicationService.create({
    actorUserId: ownerId,
    projectId,
    operationId: randomUUID(),
    institutionName: "Synthetic University A",
    courseTitle: "Synthetic Course A",
    intakeLabel: "March 2027",
  });
  const schoolB = await schoolApplicationService.create({
    actorUserId: ownerId,
    projectId,
    operationId: randomUUID(),
    institutionName: "Synthetic University B",
    courseTitle: "Synthetic Course B",
    intakeLabel: "October 2027",
  });
  const schoolAId = schoolA.application.applicationId;
  const schoolBId = schoolB.application.applicationId;
  const schoolBBefore = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolBId,
  });
  const packageBuild = await schoolApplicationService.buildPackage({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolAId,
    expectedRevision: schoolA.application.revision,
    operationId: randomUUID(),
  });
  assert.ok(packageBuild.package.packageId);
  const schoolABefore = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolAId,
  });

  // PG-E3-A: real state read, route preview/cancel observation, confirmation,
  // package invalidation, replay/concurrency and target isolation.
  let state = await readProjectState(ownerId, projectId);
  const taskA = findTask(
    state,
    "school_application",
    "school_discovery",
    schoolAId
  );
  assert.equal(
    taskA.reasonCodes.includes("school_course_source_unverified"),
    true
  );
  const previewA = await callCreate(
    api,
    ownerId,
    projectId,
    chatId,
    taskA,
    "schoolApplication.intakeLabel",
    "July 2027 (confirmed E3 R1)"
  );
  assert.equal(previewA.status, 200, "School A preview should be authorized");
  const previewBodyA = await body<{
    proposal: unknown;
    confirmationToken: string;
  }>(previewA);
  assert.ok(previewBodyA.proposal);
  assert.ok(previewBodyA.confirmationToken);
  const afterCancel = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolAId,
  });
  assert.equal(afterCancel.revision, schoolABefore.revision);
  assert.equal(afterCancel.intake.label, schoolABefore.intake.label);

  const confirmations = await Promise.all([
    callConfirm(api, ownerId, projectId, previewBodyA.confirmationToken),
    callConfirm(api, ownerId, projectId, previewBodyA.confirmationToken),
  ]);
  for (const response of confirmations) {
    assert.equal(response.status, 200);
    assert.equal(
      (await body<{ readback: string }>(response)).readback,
      "verified"
    );
  }
  const exactReplay = await callConfirm(
    api,
    ownerId,
    projectId,
    previewBodyA.confirmationToken
  );
  assert.equal(exactReplay.status, 200);
  const schoolAAfter = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolAId,
  });
  assert.equal(schoolAAfter.revision, schoolABefore.revision + 1);
  assert.equal(schoolAAfter.intake.label, "July 2027 (confirmed E3 R1)");
  assert.equal(schoolAAfter.currentPackage, null);
  assert.equal(
    schoolAAfter.packages.some(
      (entry) =>
        entry.packageId === packageBuild.package.packageId &&
        entry.status === "stale"
    ),
    true
  );
  const schoolBAfterA = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolBId,
  });
  assert.equal(schoolBAfterA.revision, schoolBBefore.revision);
  assert.equal(schoolBAfterA.intake.label, schoolBBefore.intake.label);

  // Revision conflict: a proposal for B cannot overwrite a later owning-service
  // update. Then archive B and verify its pending proposal remains non-actionable.
  state = await readProjectState(ownerId, projectId);
  const taskB = findTask(
    state,
    "school_application",
    "school_discovery",
    schoolBId
  );
  const stalePreview = await callCreate(
    api,
    ownerId,
    projectId,
    chatId,
    taskB,
    "schoolApplication.intakeLabel",
    "January 2028"
  );
  assert.equal(stalePreview.status, 200);
  const staleBody = await body<{ confirmationToken: string }>(stalePreview);
  const bBeforeDirectUpdate = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolBId,
  });
  await schoolApplicationService.update({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolBId,
    expectedRevision: bBeforeDirectUpdate.revision,
    operationId: randomUUID(),
    institutionName: bBeforeDirectUpdate.institution.name,
    institutionId: bBeforeDirectUpdate.institution.catalogId,
    courseTitle: bBeforeDirectUpdate.course.title,
    courseId: bBeforeDirectUpdate.course.catalogId,
    deliveryId: bBeforeDirectUpdate.deliveryId,
    intakeId: bBeforeDirectUpdate.intake.id,
    intakeLabel: "November 2027",
  });
  const conflict = await callConfirm(
    api,
    ownerId,
    projectId,
    staleBody.confirmationToken
  );
  assert.equal(conflict.status, 409);
  const bAfterConflict = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolBId,
  });
  assert.equal(bAfterConflict.intake.label, "November 2027");
  const archivePending = await callCreate(
    api,
    ownerId,
    projectId,
    chatId,
    findTask(
      await readProjectState(ownerId, projectId),
      "school_application",
      "school_discovery",
      schoolBId
    ),
    "schoolApplication.intakeLabel",
    "December 2027"
  );
  assert.equal(archivePending.status, 200);
  const archiveToken = (
    await body<{ confirmationToken: string }>(archivePending)
  ).confirmationToken;
  await schoolApplicationService.archive({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolBId,
    expectedRevision: bAfterConflict.revision,
    operationId: randomUUID(),
  });
  const archivedConfirm = await callConfirm(
    api,
    ownerId,
    projectId,
    archiveToken
  );
  assert.notEqual(archivedConfirm.status, 200);

  // PG-E3-B: only the selected reported context field changes. CAS rejects a
  // stale second proposal; repeated valid confirmation is idempotent.
  const initialContext = {
    ...EMPTY_STUDENT_500_CONTEXT,
    entryRoute: "offer_only" as const,
    coeStatus: "reported_not_held" as const,
    applicationPlace: "unknown" as const,
    asOfDate: "2026-11-24",
    historyDeclaration: "declared_none" as const,
    applicantAgeBand: "adult" as const,
    dependants: "none" as const,
    englishEvidence: "reported_not_held" as const,
    financialEvidence: "reported_held" as const,
    oshcEvidence: "unknown" as const,
  };
  const studentCreated = await student500Service.create({
    actorUserId: ownerId,
    projectId,
    operationId: randomUUID(),
    context: initialContext,
  });
  const student500Id = studentCreated.application.applicationId;
  const studentBefore = await student500Service.get({
    actorUserId: ownerId,
    projectId,
    applicationId: student500Id,
  });
  state = await readProjectState(ownerId, projectId);
  const studentTask = findTask(
    state,
    "student_500",
    "visa_planning",
    student500Id
  );
  assert.equal(studentTask.applicability, "applicable");
  const studentProposal = await callCreate(
    api,
    ownerId,
    projectId,
    chatId,
    studentTask,
    "student500.applicationPlace",
    "onshore"
  );
  assert.equal(studentProposal.status, 200);
  const studentToken = (
    await body<{ confirmationToken: string }>(studentProposal)
  ).confirmationToken;
  const studentConfirmed = await callConfirm(
    api,
    ownerId,
    projectId,
    studentToken
  );
  assert.equal(studentConfirmed.status, 200);
  const studentReplay = await callConfirm(
    api,
    ownerId,
    projectId,
    studentToken
  );
  assert.equal(studentReplay.status, 200);
  const studentAfter = await student500Service.get({
    actorUserId: ownerId,
    projectId,
    applicationId: student500Id,
  });
  assert.deepEqual(studentAfter.context, {
    ...studentBefore.context,
    applicationPlace: "onshore",
  });
  assert.equal(studentAfter.context.coeStatus, studentBefore.context.coeStatus);
  assert.equal(studentAfter.status, "in_progress");
  assert.equal(
    studentAfter.screening.studyEvidence.coeVerification,
    studentBefore.screening.studyEvidence.coeVerification
  );
  assert.equal(studentAfter.revision, studentBefore.revision + 1);

  state = await readProjectState(ownerId, projectId);
  const currentStudentTask = findTask(
    state,
    "student_500",
    "visa_planning",
    student500Id
  );
  const staleStudentProposal = await callCreate(
    api,
    ownerId,
    projectId,
    chatId,
    currentStudentTask,
    "student500.applicationPlace",
    "offshore"
  );
  assert.equal(staleStudentProposal.status, 200);
  const staleStudentToken = (
    await body<{ confirmationToken: string }>(staleStudentProposal)
  ).confirmationToken;
  await student500Service.update({
    actorUserId: ownerId,
    projectId,
    applicationId: student500Id,
    expectedRevision: studentAfter.revision,
    operationId: randomUUID(),
    context: {
      ...studentAfter.context,
      financialEvidence: "unknown",
    },
  });
  const studentCasConflict = await callConfirm(
    api,
    ownerId,
    projectId,
    staleStudentToken
  );
  assert.equal(studentCasConflict.status, 409);
  const studentCasRead = await student500Service.get({
    actorUserId: ownerId,
    projectId,
    applicationId: student500Id,
  });
  assert.equal(studentCasRead.context.applicationPlace, "onshore");
  assert.equal(studentCasRead.context.coeStatus, initialContext.coeStatus);
  assert.equal(studentCasRead.context.financialEvidence, "unknown");

  // PG-E3-C: workflow projection re-reads authoritative source revisions and
  // keeps reported/unverified facts from becoming verified business outcomes.
  state = await readProjectState(ownerId, projectId);
  const refreshedSchoolTask = findTask(
    state,
    "school_application",
    "school_discovery",
    schoolAId
  );
  const refreshedStudentTask = findTask(
    state,
    "student_500",
    "study_evidence_coe",
    student500Id
  );
  assert.ok(
    refreshedSchoolTask.sourceRevisions.some(
      (item) =>
        item.targetId === schoolAId && item.revision === schoolAAfter.revision
    )
  );
  assert.equal(
    refreshedSchoolTask.reasonCodes.includes("school_course_source_unverified"),
    true
  );
  assert.notEqual(refreshedStudentTask.progress, "completed");
  const archivedSchoolB = state.matters.schoolApplications.find(
    (item: any) => item.applicationId === schoolBId
  );
  if (archivedSchoolB) {
    assert.equal(archivedSchoolB.status, "archived");
  }
  assert.equal(
    state.matters.student500Applications.find(
      (item: any) => item.applicationId === student500Id
    )?.context.coeStatus,
    studentBefore.context.coeStatus
  );

  const membershipInvite =
    await projectFoundationRepository.inviteProjectMember({
      actorUserId: ownerId,
      projectId,
      targetUserId: memberId,
      expectedRevision: (
        await projectFoundationRepository.authorizeProjectRead({
          actorUserId: ownerId,
          projectId,
        })
      ).revision,
      operationId: randomUUID(),
    });
  assert.equal(membershipInvite.replayed, false);
  const memberships = await database
    .select({ id: projectMembership.id })
    .from(projectMembership)
    .where(
      and(
        eq(projectMembership.projectId, projectId),
        eq(projectMembership.userId, memberId)
      )
    );
  const membershipId = memberships[0]?.id;
  assert.ok(membershipId);
  const afterInvite = await projectFoundationRepository.authorizeProjectRead({
    actorUserId: ownerId,
    projectId,
  });
  const membershipAccepted =
    await projectFoundationRepository.acceptProjectMembership({
      actorUserId: memberId,
      projectId,
      membershipId,
      expectedRevision: afterInvite.revision,
      operationId: randomUUID(),
    });
  assert.equal(membershipAccepted.replayed, false);
  const memberChat = await projectFoundationRepository.createProjectChat({
    actorUserId: memberId,
    projectId,
    operationId: randomUUID(),
    title: "E3 R1 member isolation",
  });
  const memberSchool = await schoolApplicationService.create({
    actorUserId: memberId,
    projectId,
    operationId: randomUUID(),
    institutionName: "Synthetic Member School",
    courseTitle: "Synthetic Member Course",
    intakeLabel: "Member Reported",
  });
  const memberSchoolId = memberSchool.application.applicationId;
  const memberState = await readProjectState(memberId, projectId);
  assert.equal(
    memberState.matters.schoolApplications.some(
      (item: any) => item.applicationId === schoolAId
    ),
    false
  );
  const memberTask = findTask(
    memberState,
    "school_application",
    "school_discovery",
    memberSchoolId
  );
  const memberProposal = await callCreate(
    api,
    memberId,
    projectId,
    memberChat.chatId,
    memberTask,
    "schoolApplication.intakeLabel",
    "After Revocation"
  );
  assert.equal(memberProposal.status, 200);
  const memberToken = (
    await body<{ confirmationToken: string }>(memberProposal)
  ).confirmationToken;
  const ownerAfterMemberCreate =
    await projectFoundationRepository.authorizeProjectRead({
      actorUserId: ownerId,
      projectId,
    });
  await projectFoundationRepository.revokeProjectMembership({
    actorUserId: ownerId,
    projectId,
    membershipId,
    expectedRevision: ownerAfterMemberCreate.revision,
    operationId: randomUUID(),
  });
  const revokedConfirmation = await callConfirm(
    api,
    memberId,
    projectId,
    memberToken
  );
  assert.notEqual(revokedConfirmation.status, 200);
  const memberRow = await client.unsafe(
    'select revision, "intakeLabel" from public."SchoolApplication" where id = $1',
    [memberSchoolId]
  );
  assert.equal(
    Number((memberRow[0] as any).revision),
    memberSchool.application.revision
  );
  assert.equal((memberRow[0] as any).intakeLabel, "Member Reported");
  const revokedLoad = await import(
    "../lib/workspace/project-state-server"
  ).then(({ loadProjectStateForActor }) =>
    loadProjectStateForActor({
      actorUserId: memberId,
      actorType: "regular",
      projectId,
    })
  );
  assert.equal(revokedLoad.kind, "not_found");

  // A token issued before Project closure cannot perform a later business write.
  state = await readProjectState(ownerId, projectId);
  const closePreview = await callCreate(
    api,
    ownerId,
    projectId,
    chatId,
    findTask(state, "school_application", "school_discovery", schoolAId),
    "schoolApplication.intakeLabel",
    "Must Not Apply"
  );
  assert.equal(closePreview.status, 200);
  const closeToken = (await body<{ confirmationToken: string }>(closePreview))
    .confirmationToken;
  const beforeCloseSchool = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolAId,
  });
  const beforeCloseProject =
    await projectFoundationRepository.authorizeProjectRead({
      actorUserId: ownerId,
      projectId,
    });
  await projectFoundationRepository.closeProject({
    actorUserId: ownerId,
    projectId,
    expectedRevision: beforeCloseProject.revision,
    operationId: randomUUID(),
  });
  const closedConfirmation = await callConfirm(
    api,
    ownerId,
    projectId,
    closeToken
  );
  assert.notEqual(closedConfirmation.status, 200);
  const afterClosedSchool = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolAId,
  });
  assert.equal(afterClosedSchool.revision, beforeCloseSchool.revision);
  assert.equal(afterClosedSchool.intake.label, beforeCloseSchool.intake.label);

  const manifest: AcceptanceManifest = {
    projectId,
    ownerId,
    chatId,
    schoolAId,
    schoolBId,
    student500Id,
    memberId,
    memberSchoolId,
  };
  await verifyReadbackChild(manifest);
  process.stdout.write(
    `${JSON.stringify({
      "PG-E3-A": "PASS",
      "PG-E3-B": "PASS",
      "PG-E3-C": "PASS",
      concurrentConfirmation: "PASS",
      revokedMembership: "PASS",
      closedProject: "PASS",
      archivedTarget: "PASS",
      fixturesRetained: true,
    })}\n`
  );
  await runtime.closeLazyDatabase();
}

async function resumeExistingPartialScope(
  client: SqlClient,
  runtime: DbRuntime
) {
  assert.ok(
    process.argv.includes(WRITE_AUTHORIZATION),
    "Resume requires the exact synthetic-write authorization flag"
  );
  process.env.AUTH_SECRET = randomUUID() + randomUUID();
  const { projectFoundationRepository } = await import(
    "../lib/db/project-foundation"
  );
  const [{ schoolApplicationService }, { student500Service }] =
    await Promise.all([
      import("../lib/school-applications/runtime"),
      import("../lib/student-500/runtime"),
    ]);
  const { EMPTY_STUDENT_500_CONTEXT } = await import(
    "../lib/student-500/contracts"
  );
  const api = (await import(
    "../lib/workspace/project-action-proposal-runtime"
  )) as RuntimeApi;
  // The initial guarded run completed School A confirmation before stopping on
  // a faulty assertion about the current-package pointer. Resume only that exact
  // partial shape; never add a second Project or try to repair/clean the records.
  const projects = await client.unsafe(
    'select id, "ownerUserId" as owner_id, status, revision, "displayName" as display_name ' +
      'from public."StudyJourneyProject" where "displayName" like $1',
    [`${MARKER}%`]
  );
  assert.equal(
    projects.length,
    1,
    "Resume requires exactly one marked Project"
  );
  const project = projects[0];
  assert.equal(project.status, "active");
  assert.equal(String(project.display_name).startsWith(MARKER), true);
  const projectId = String(project.id);
  const ownerId = String(project.owner_id);
  const chats = await client.unsafe(
    'select "chatId" as chat_id from public."ProjectConversation" ' +
      'where "projectId" = $1 and "createdByUserId" = $2',
    [projectId, ownerId]
  );
  assert.equal(
    chats.length,
    1,
    "Resume scope must contain exactly one owner Chat"
  );
  const chatId = String(chats[0].chat_id);
  const applicationRows = await client.unsafe(
    'select id, "ownerUserId" as owner_id, revision, status, "intakeLabel" as intake_label ' +
      'from public."SchoolApplication" where "projectId" = $1 order by "createdAt"',
    [projectId]
  );
  assert.equal(applicationRows.length, 2);
  assert.ok(applicationRows.every((row) => row.owner_id === ownerId));
  const schoolARow = applicationRows.find(
    (row) => row.intake_label === "July 2027 (confirmed E3 R1)"
  );
  const schoolBInitialRow = applicationRows.find(
    (row) => row.intake_label === "October 2027"
  );
  const schoolBArchivedRow = applicationRows.find(
    (row) =>
      row.intake_label === "November 2027" &&
      row.status === "archived" &&
      Number(row.revision) === 3
  );
  assert.ok(schoolARow, "School A must already contain the confirmed value");
  assert.equal(Number(schoolARow.revision), 3);
  assert.equal(schoolARow.status, "stale");
  assert.equal(
    Boolean(schoolBInitialRow) !== Boolean(schoolBArchivedRow),
    true,
    "Resume accepts only the exact pre-B-test or post-archive stage"
  );
  const schoolBAlreadyArchived = Boolean(schoolBArchivedRow);
  const schoolBRow = schoolBInitialRow ?? schoolBArchivedRow;
  assert.ok(schoolBRow, "Expected exactly the known School B acceptance state");
  const membershipsBefore = await client.unsafe(
    'select count(*)::integer as count from public."ProjectMembership" where "projectId" = $1',
    [projectId]
  );
  const studentRowsBefore = await client.unsafe(
    'select id, "ownerUserId" as owner_id, status, revision, "applicationPlace" as application_place, ' +
      '"coeStatus" as coe_status, "entryRoute" as entry_route, "financialEvidence" as financial_evidence ' +
      'from public."Student500Application" where "projectId" = $1',
    [projectId]
  );
  assert.equal(Number(membershipsBefore[0].count), 0);
  assert.ok(studentRowsBefore.length <= 1);

  const schoolAId = String(schoolARow.id);
  const schoolBId = String(schoolBRow.id);
  const schoolA = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolAId,
  });
  assert.equal(schoolA.currentPackage, null);
  assert.equal(
    schoolA.packages.some((entry) => entry.status === "stale"),
    true,
    "Material update must retain the historical package as stale and clear the current pointer"
  );
  const schoolBBefore = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolBId,
  });
  assert.equal(
    schoolBBefore.intake.label,
    schoolBAlreadyArchived ? "November 2027" : "October 2027"
  );
  assert.equal(schoolBBefore.revision, schoolBAlreadyArchived ? 3 : 1);
  if (studentRowsBefore[0]) {
    assert.equal(studentRowsBefore[0].owner_id, ownerId);
    assert.equal(studentRowsBefore[0].status, "in_progress");
    assert.equal(Number(studentRowsBefore[0].revision), 2);
    assert.equal(studentRowsBefore[0].application_place, "onshore");
    assert.equal(studentRowsBefore[0].coe_status, "reported_not_held");
    assert.equal(studentRowsBefore[0].entry_route, "offer_only");
    assert.equal(studentRowsBefore[0].financial_evidence, "reported_held");
  }

  // PG-E3-A remainder: stale B proposal CAS, archived target rejection. The
  // prior guarded process already proved A preview/cancel, concurrent confirm,
  // exact replay, and fresh database read after A's successful write.
  let state = await readProjectState(ownerId, projectId);
  if (!schoolBAlreadyArchived) {
    const taskB = findTask(
      state,
      "school_application",
      "school_discovery",
      schoolBId
    );
    const stalePreview = await callCreate(
      api,
      ownerId,
      projectId,
      chatId,
      taskB,
      "schoolApplication.intakeLabel",
      "January 2028"
    );
    assert.equal(stalePreview.status, 200);
    const staleBody = await body<{ confirmationToken: string }>(stalePreview);
    await schoolApplicationService.update({
      actorUserId: ownerId,
      projectId,
      applicationId: schoolBId,
      expectedRevision: schoolBBefore.revision,
      operationId: randomUUID(),
      institutionName: schoolBBefore.institution.name,
      institutionId: schoolBBefore.institution.catalogId,
      courseTitle: schoolBBefore.course.title,
      courseId: schoolBBefore.course.catalogId,
      deliveryId: schoolBBefore.deliveryId,
      intakeId: schoolBBefore.intake.id,
      intakeLabel: "November 2027",
    });
    const conflict = await callConfirm(
      api,
      ownerId,
      projectId,
      staleBody.confirmationToken
    );
    assert.equal(conflict.status, 409);
    const bAfterConflict = await schoolApplicationService.get({
      actorUserId: ownerId,
      projectId,
      applicationId: schoolBId,
    });
    assert.equal(bAfterConflict.intake.label, "November 2027");
    const archivePending = await callCreate(
      api,
      ownerId,
      projectId,
      chatId,
      findTask(
        await readProjectState(ownerId, projectId),
        "school_application",
        "school_discovery",
        schoolBId
      ),
      "schoolApplication.intakeLabel",
      "December 2027"
    );
    assert.equal(archivePending.status, 200);
    const archiveToken = (
      await body<{ confirmationToken: string }>(archivePending)
    ).confirmationToken;
    await schoolApplicationService.archive({
      actorUserId: ownerId,
      projectId,
      applicationId: schoolBId,
      expectedRevision: bAfterConflict.revision,
      operationId: randomUUID(),
    });
    const bAfterArchive = await schoolApplicationService.get({
      actorUserId: ownerId,
      projectId,
      applicationId: schoolBId,
    });
    const archivedConfirm = await callConfirm(
      api,
      ownerId,
      projectId,
      archiveToken
    );
    assert.notEqual(archivedConfirm.status, 200);
    assert.equal(
      (
        await schoolApplicationService.get({
          actorUserId: ownerId,
          projectId,
          applicationId: schoolBId,
        })
      ).revision,
      bAfterArchive.revision
    );
  }

  // PG-E3-B: customer-reported context only; all non-selected fields remain
  // unchanged and neither CoE verification nor visa outcome is inferred.
  const initialContext = {
    ...EMPTY_STUDENT_500_CONTEXT,
    entryRoute: "offer_only" as const,
    coeStatus: "reported_not_held" as const,
    applicationPlace: "unknown" as const,
    asOfDate: "2026-11-24",
    historyDeclaration: "declared_none" as const,
    applicantAgeBand: "adult" as const,
    dependants: "none" as const,
    englishEvidence: "reported_not_held" as const,
    financialEvidence: "reported_held" as const,
    oshcEvidence: "unknown" as const,
  };
  let student500Id: string;
  let studentAfter: any;
  if (studentRowsBefore[0]) {
    // Prior guarded execution already created, proposed and confirmed the
    // applicationPlace change. Verify its exact current state before continuing.
    student500Id = String(studentRowsBefore[0].id);
    studentAfter = await student500Service.get({
      actorUserId: ownerId,
      projectId,
      applicationId: student500Id,
    });
    assert.deepEqual(studentAfter.context, {
      ...initialContext,
      applicationPlace: "onshore",
    });
    assert.equal(studentAfter.status, "in_progress");
    assert.equal(studentAfter.revision, 2);
    assert.equal(
      studentAfter.screening.studyEvidence.coeVerification,
      "none_reported"
    );
    assert.equal(
      studentAfter.screening.submissionStatus,
      "not_submission_ready"
    );
  } else {
    const studentCreated = await student500Service.create({
      actorUserId: ownerId,
      projectId,
      operationId: randomUUID(),
      context: initialContext,
    });
    student500Id = studentCreated.application.applicationId;
    const studentBefore = await student500Service.get({
      actorUserId: ownerId,
      projectId,
      applicationId: student500Id,
    });
    state = await readProjectState(ownerId, projectId);
    const studentTask = findTask(
      state,
      "student_500",
      "visa_planning",
      student500Id
    );
    assert.equal(studentTask.applicability, "applicable");
    const studentProposal = await callCreate(
      api,
      ownerId,
      projectId,
      chatId,
      studentTask,
      "student500.applicationPlace",
      "onshore"
    );
    assert.equal(studentProposal.status, 200);
    const studentToken = (
      await body<{ confirmationToken: string }>(studentProposal)
    ).confirmationToken;
    assert.equal(
      (await callConfirm(api, ownerId, projectId, studentToken)).status,
      200
    );
    assert.equal(
      (await callConfirm(api, ownerId, projectId, studentToken)).status,
      200
    );
    studentAfter = await student500Service.get({
      actorUserId: ownerId,
      projectId,
      applicationId: student500Id,
    });
    assert.deepEqual(studentAfter.context, {
      ...studentBefore.context,
      applicationPlace: "onshore",
    });
    assert.equal(studentAfter.status, "in_progress");
    assert.equal(
      studentAfter.screening.studyEvidence.coeVerification,
      studentBefore.screening.studyEvidence.coeVerification
    );
    assert.equal(
      studentAfter.screening.submissionStatus,
      studentBefore.screening.submissionStatus
    );
    assert.equal(studentAfter.revision, studentBefore.revision + 1);
  }
  state = await readProjectState(ownerId, projectId);
  const staleStudentProposal = await callCreate(
    api,
    ownerId,
    projectId,
    chatId,
    findTask(state, "student_500", "visa_planning", student500Id),
    "student500.applicationPlace",
    "offshore"
  );
  assert.equal(staleStudentProposal.status, 200);
  const staleStudentToken = (
    await body<{ confirmationToken: string }>(staleStudentProposal)
  ).confirmationToken;
  await student500Service.update({
    actorUserId: ownerId,
    projectId,
    applicationId: student500Id,
    expectedRevision: studentAfter.revision,
    operationId: randomUUID(),
    context: { ...studentAfter.context, financialEvidence: "unknown" },
  });
  assert.equal(
    (await callConfirm(api, ownerId, projectId, staleStudentToken)).status,
    409
  );
  const studentCasRead = await student500Service.get({
    actorUserId: ownerId,
    projectId,
    applicationId: student500Id,
  });
  assert.equal(studentCasRead.context.applicationPlace, "onshore");
  assert.equal(studentCasRead.context.coeStatus, initialContext.coeStatus);
  assert.equal(studentCasRead.context.financialEvidence, "unknown");

  // Re-read M1, recompute E2, verify exact revision/reason and honest partial
  // coverage. The selected CoE evidence step must not become completed.
  state = await readProjectState(ownerId, projectId);
  const refreshedSchoolTask = findTask(
    state,
    "school_application",
    "school_discovery",
    schoolAId
  );
  const refreshedStudentTask = findTask(
    state,
    "student_500",
    "study_evidence_coe",
    student500Id
  );
  const workflowProjection = buildProjectWorkflowProjection(state as any);
  assert.equal(workflowProjection.progress.coverage, "partial");
  assert.equal(workflowProjection.progress.percent, null);
  assert.ok(
    refreshedSchoolTask.sourceRevisions.some(
      (item) =>
        item.targetId === schoolAId && item.revision === schoolA.revision
    )
  );
  assert.equal(
    refreshedSchoolTask.reasonCodes.includes("school_course_source_unverified"),
    true
  );
  assert.notEqual(refreshedStudentTask.progress, "completed");

  // Persisted active membership grants member-specific access only. A pending
  // confirmation becomes unusable immediately after membership revocation.
  const priorMemberUsers = await client.unsafe(
    'select id from public."User" where email like $1',
    ["p15.e3r1.member.%@acceptance.invalid"]
  );
  assert.equal(
    priorMemberUsers.length,
    1,
    "Resume must use the single synthetic member created by the initial guarded run"
  );
  const memberId = String(priorMemberUsers[0].id);
  const beforeInvite = await projectFoundationRepository.authorizeProjectRead({
    actorUserId: ownerId,
    projectId,
  });
  const invite = await projectFoundationRepository.inviteProjectMember({
    actorUserId: ownerId,
    projectId,
    targetUserId: memberId,
    expectedRevision: beforeInvite.revision,
    operationId: randomUUID(),
  });
  assert.equal(invite.replayed, false);
  const membershipRows = await client.unsafe(
    'select id from public."ProjectMembership" where "projectId" = $1 and "userId" = $2',
    [projectId, memberId]
  );
  const membershipId = String(membershipRows[0]?.id ?? "");
  assert.ok(membershipId);
  const afterInvite = await projectFoundationRepository.authorizeProjectRead({
    actorUserId: ownerId,
    projectId,
  });
  await projectFoundationRepository.acceptProjectMembership({
    actorUserId: memberId,
    projectId,
    membershipId,
    expectedRevision: afterInvite.revision,
    operationId: randomUUID(),
  });
  const memberChat = await projectFoundationRepository.createProjectChat({
    actorUserId: memberId,
    projectId,
    operationId: randomUUID(),
    title: "E3 R1 resumed member isolation",
  });
  const memberSchool = await schoolApplicationService.create({
    actorUserId: memberId,
    projectId,
    operationId: randomUUID(),
    institutionName: "Synthetic Member School",
    courseTitle: "Synthetic Member Course",
    intakeLabel: "Member Reported",
  });
  const memberSchoolId = memberSchool.application.applicationId;
  const memberState = await readProjectState(memberId, projectId);
  assert.equal(
    memberState.matters.schoolApplications.some(
      (item: any) => item.applicationId === schoolAId
    ),
    false
  );
  const memberTask = findTask(
    memberState,
    "school_application",
    "school_discovery",
    memberSchoolId
  );
  const memberProposal = await callCreate(
    api,
    memberId,
    projectId,
    memberChat.chatId,
    memberTask,
    "schoolApplication.intakeLabel",
    "Must Not Apply"
  );
  assert.equal(memberProposal.status, 200);
  const memberToken = (
    await body<{ confirmationToken: string }>(memberProposal)
  ).confirmationToken;
  const beforeRevoke = await projectFoundationRepository.authorizeProjectRead({
    actorUserId: ownerId,
    projectId,
  });
  await projectFoundationRepository.revokeProjectMembership({
    actorUserId: ownerId,
    projectId,
    membershipId,
    expectedRevision: beforeRevoke.revision,
    operationId: randomUUID(),
  });
  assert.notEqual(
    (await callConfirm(api, memberId, projectId, memberToken)).status,
    200
  );
  const memberRow = await client.unsafe(
    'select revision, "intakeLabel" from public."SchoolApplication" where id = $1',
    [memberSchoolId]
  );
  assert.equal(
    Number(memberRow[0].revision),
    memberSchool.application.revision
  );
  assert.equal(memberRow[0].intakeLabel, "Member Reported");
  const revokedLoad = await import(
    "../lib/workspace/project-state-server"
  ).then(({ loadProjectStateForActor }) =>
    loadProjectStateForActor({
      actorUserId: memberId,
      actorType: "regular",
      projectId,
    })
  );
  assert.equal(revokedLoad.kind, "not_found");

  // Close the Project after issuing a valid preview. Confirmation must fail
  // through the same persisted authorization/business boundary.
  state = await readProjectState(ownerId, projectId);
  const closePreview = await callCreate(
    api,
    ownerId,
    projectId,
    chatId,
    findTask(state, "school_application", "school_discovery", schoolAId),
    "schoolApplication.intakeLabel",
    "Must Not Apply"
  );
  assert.equal(closePreview.status, 200);
  const closeToken = (await body<{ confirmationToken: string }>(closePreview))
    .confirmationToken;
  const beforeCloseSchool = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolAId,
  });
  const beforeCloseProject =
    await projectFoundationRepository.authorizeProjectRead({
      actorUserId: ownerId,
      projectId,
    });
  await projectFoundationRepository.closeProject({
    actorUserId: ownerId,
    projectId,
    expectedRevision: beforeCloseProject.revision,
    operationId: randomUUID(),
  });
  assert.notEqual(
    (await callConfirm(api, ownerId, projectId, closeToken)).status,
    200
  );
  const afterCloseSchool = await schoolApplicationService.get({
    actorUserId: ownerId,
    projectId,
    applicationId: schoolAId,
  });
  assert.equal(afterCloseSchool.revision, beforeCloseSchool.revision);
  assert.equal(afterCloseSchool.intake.label, beforeCloseSchool.intake.label);

  await verifyReadbackChild({
    projectId,
    ownerId,
    chatId,
    schoolAId,
    schoolBId,
    student500Id,
    memberId,
    memberSchoolId,
  });
  process.stdout.write(
    `${JSON.stringify({
      resumeOfExistingSyntheticScope: true,
      "PG-E3-A": "PASS",
      "PG-E3-B": "PASS",
      "PG-E3-C": "PASS",
      E2Coverage: workflowProjection.progress.coverage,
      concurrentSchoolAConfirmation: "PASS",
      schoolPackageInvalidation: "PASS",
      revokedMembership: "PASS",
      closedProject: "PASS",
      fixturesRetained: true,
    })}\n`
  );
  await runtime.closeLazyDatabase();
}

async function run() {
  let runtime: DbRuntime | undefined;
  try {
    const {
      client,
      runtime: openedRuntime,
      identity,
      ledger,
    } = await verifiedDatabase();
    runtime = openedRuntime;
    process.stdout.write(
      `${JSON.stringify({
        identityVerified: true,
        database: identity.database_name,
        role: identity.role_name,
        port: identity.port,
        serverVersionNum: identity.version_num,
        migrationCount: ledger.count,
        migrationHeadTimestamp: ledger.latest,
      })}\n`
    );
    const r3ReadbackArg = process.argv.find((arg) =>
      arg.startsWith("--readback-r3-course-selection=")
    );
    if (r3ReadbackArg) {
      const manifest = JSON.parse(
        r3ReadbackArg.slice("--readback-r3-course-selection=".length)
      ) as R3AcceptanceManifest;
      await readbackR3Only(manifest);
      await runtime.closeLazyDatabase();
      return;
    }
    const readbackArg = process.argv.find((arg) =>
      arg.startsWith("--readback=")
    );
    const separateReadbackIndex = process.argv.indexOf("--readback");
    if (readbackArg || separateReadbackIndex >= 0) {
      const value = readbackArg
        ? readbackArg.slice("--readback=".length)
        : process.argv[separateReadbackIndex + 1];
      assert.ok(value, "readback manifest argument is required");
      const manifest = JSON.parse(value) as AcceptanceManifest;
      await readbackOnly(manifest, client);
      await runtime.closeLazyDatabase();
      return;
    }
    if (process.argv.includes("--inspect-scope")) {
      await inspectExistingScope(client);
      await runtime.closeLazyDatabase();
      return;
    }
    if (process.argv.includes(R3_INSPECT_MODE)) {
      for (const authorization of [
        WRITE_AUTHORIZATION,
        R3_WRITE_AUTHORIZATION,
        R3_RESUME_AUTHORIZATION,
      ]) {
        assert.equal(
          process.argv.includes(authorization),
          false,
          "R3 inspection is read-only and rejects synthetic-write authorization"
        );
      }
      assert.equal(process.argv.includes(R3_MODE), false);
      assert.equal(process.argv.includes(R3_RESUME_MODE), false);
      await inspectR3RetainedSyntheticScope(client);
      await runtime.closeLazyDatabase();
      return;
    }
    if (process.argv.includes(R3_RESUME_MODE)) {
      assert.equal(
        process.argv.includes(R3_RESUME_AUTHORIZATION),
        true,
        "Retained R3 writes require the explicit resume authorization"
      );
      assert.equal(process.argv.includes(R3_MODE), false);
      assert.equal(process.argv.includes(R3_INSPECT_MODE), false);
      for (const authorization of [
        WRITE_AUTHORIZATION,
        R3_WRITE_AUTHORIZATION,
      ]) {
        assert.equal(
          process.argv.includes(authorization),
          false,
          "Resume cannot reuse fresh-scope authorization"
        );
      }
      const resumeScope = await inspectR3RetainedSyntheticScope(client);
      await runR3CourseSelectionIntegration(
        (await import("../lib/db/runtime-client")).getLazyDatabase(),
        client,
        resumeScope
      );
      await runtime.closeLazyDatabase();
      return;
    }
    if (process.argv.includes(R3_MODE)) {
      assert.equal(
        process.argv.includes(WRITE_AUTHORIZATION),
        false,
        "R3 runner cannot reuse the R1 write authorization"
      );
      assert.equal(process.argv.includes(R3_RESUME_AUTHORIZATION), false);
      await runR3CourseSelectionIntegration(
        (await import("../lib/db/runtime-client")).getLazyDatabase(),
        client
      );
      await runtime.closeLazyDatabase();
      return;
    }
    assert.equal(
      process.argv.includes(R3_WRITE_AUTHORIZATION),
      false,
      "R3 synthetic-write authorization requires the R3 mode"
    );
    assert.equal(
      process.argv.includes(R3_RESUME_AUTHORIZATION),
      false,
      "R3 resume authorization requires the R3 resume mode"
    );
    if (
      process.argv.includes("--resume-existing-partial-scope=phase15-m3-e3-r1")
    ) {
      await resumeExistingPartialScope(client, runtime);
      await runtime.closeLazyDatabase();
      return;
    }
    if (!process.argv.includes(WRITE_AUTHORIZATION)) {
      process.stdout.write(
        "No synthetic-write authorization flag: runner remains read-only.\n"
      );
    }
    await runIntegration(
      (await import("../lib/db/runtime-client")).getLazyDatabase(),
      client,
      runtime
    );
  } catch (error) {
    process.stderr.write(
      "PG-E3 R1 acceptance failed closed: " +
        (error instanceof Error ? error.message : "unknown error") +
        "\n"
    );
    const location =
      error instanceof Error
        ? error.stack?.match(
            /phase15-m3-e3-r1-postgres-acceptance\.ts:\d+:\d+/
          )?.[0]
        : undefined;
    if (location) {
      process.stderr.write(`Failure location: ${location}\n`);
    }
    process.exitCode = 1;
  } finally {
    f.__phase15M3E3R1Session = null;
    removeAuthMockFile?.();
    if (runtime) {
      await runtime.closeLazyDatabase();
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  run().catch((error: unknown) => {
    process.stderr.write(
      "PG-E3 R1 acceptance failed closed: " +
        (error instanceof Error ? error.message : "unknown error") +
        "\n"
    );
    process.exitCode = 1;
  });
}
