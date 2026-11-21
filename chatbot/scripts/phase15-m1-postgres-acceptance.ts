// biome-ignore-all lint/suspicious/noMisplacedAssertion: identity checks guard a standalone script.
/** Phase 15 M1: read-only identity gate for the owner-provisioned database.
 * Only the optional --foundation mode writes synthetic fixtures; the production
 * Project State loader is not injectable with this socket-backed client. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

const sql = postgres({
  path: "/home/rico/.local/state/immigration-ai/phase15-m1-socket/.s.PGSQL.55432",
  port: 55_432,
  database: "immigration_ai_phase15_m1_test",
  username: "phase15_m1_runner",
  max: 1,
  connect_timeout: 5,
});

async function main(sql: ReturnType<typeof postgres>) {
  const [identity] = await sql`
    select current_database() as database_name, current_user as role_name,
      current_setting('server_version_num')::integer as version_num,
      current_setting('port')::integer as port,
      inet_client_addr()::text as client_address,
      (select rolsuper from pg_roles where rolname = current_user) as is_superuser
  `;
  assert.equal(identity.database_name, "immigration_ai_phase15_m1_test");
  assert.equal(identity.role_name, "phase15_m1_runner");
  assert.ok(identity.version_num >= 170_000 && identity.version_num < 180_000);
  assert.equal(identity.port, 55_432);
  assert.equal(identity.client_address, null);
  assert.equal(identity.is_superuser, false);
  const [ledger] = await sql`
    select count(*)::integer as count, max(created_at)::text as latest
    from drizzle.__drizzle_migrations
  `;
  assert.equal(ledger.count, 55);
  assert.equal(ledger.latest, "1794378305209");
  const [head] = await sql`
    select hash from drizzle.__drizzle_migrations
    where created_at = 1794378305209
  `;
  const expectedHash = createHash("sha256")
    .update(
      await readFile("lib/db/migrations/0054_phase14_project_display_name.sql")
    )
    .digest("hex");
  assert.equal(head?.hash, expectedHash);
  const essential = [
    "User",
    "StudyJourneyProject",
    "ProjectMembership",
    "ProjectOperation",
    "ProjectEvent",
    "SchoolApplication",
    "SchoolApplicationEvent",
    "SchoolAdmissionCase",
    "SchoolAdmissionEvent",
    "Student500Application",
    "Student500ApplicationEvent",
  ];
  const tables =
    await sql`select tablename from pg_catalog.pg_tables where schemaname = 'public'`;
  const names = new Set(tables.map((row) => row.tablename));
  for (const name of essential) {
    assert.ok(names.has(name), `Missing essential table ${name}`);
  }
  assert.equal(tables.length, 111);
  process.stdout.write(
    `${JSON.stringify({ identity, migrationCount: ledger.count, migrationHeadTimestamp: ledger.latest, migrationHead: "0054_phase14_project_display_name", publicTables: tables.length, essentialTables: essential.length, identityVerified: true })}\n`
  );
  if (process.argv.includes("--foundation")) {
    // This is the sole synthetic setup write. Business mutations use the real
    // Project Foundation repository with the same verified socket client.
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { createProjectFoundationRepository, ProjectFoundationError } =
      await import("../lib/db/project-foundation");
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    await sql`insert into "User" (id, email, role) values (${ownerA}, ${`p15pg.${ownerA.slice(0, 12)}@test.invalid`}, 'user'), (${ownerB}, ${`p15pg.${ownerB.slice(0, 12)}@test.invalid`}, 'user')`;
    const repo = createProjectFoundationRepository({ database: drizzle(sql) });
    const input = {
      actorUserId: ownerA,
      operationId: `p15pg.${randomUUID()}`,
      displayName: "P15 PG Synthetic A",
    };
    const created = await repo.createProject(input);
    const replay = await repo.createProject(input);
    assert.equal(replay.replayed, true);
    assert.equal(created.project.id, replay.project.id);
    const other = await repo.createProject({
      actorUserId: ownerB,
      operationId: `p15pg.${randomUUID()}`,
      displayName: "P15 PG Synthetic B",
    });
    const read = await repo.authorizeProjectRead({
      actorUserId: ownerA,
      projectId: created.project.id,
    });
    assert.equal(read.id, created.project.id);
    await assert.rejects(
      repo.authorizeProjectRead({
        actorUserId: ownerB,
        projectId: created.project.id,
      }),
      (error: unknown) =>
        error instanceof ProjectFoundationError &&
        error.code === "project_forbidden"
    );
    await assert.rejects(
      repo.authorizeProjectRead({
        actorUserId: ownerA,
        projectId: other.project.id,
      }),
      (error: unknown) =>
        error instanceof ProjectFoundationError &&
        error.code === "project_forbidden"
    );
    process.stdout.write(
      `${JSON.stringify({ foundation: "PASS", replay: true, crossProjectDenied: true, syntheticUsers: 2, syntheticProjects: 2 })}\n`
    );
  }
}

const manifestPath = "/tmp/phase15-m1-pg-a2-synthetic-manifest.json";

async function createAcceptanceFixtures(client: ReturnType<typeof postgres>) {
  const existing = await stat(manifestPath).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return false;
      }
      throw error;
    }
  );
  if (existing) {
    throw new Error("Acceptance manifest already exists; refusing new writes");
  }
  const { projectFoundationRepository: projects } = await import(
    "../lib/db/project-foundation"
  );
  const { schoolApplicationService: school } = await import(
    "../lib/school-applications/runtime"
  );
  const { schoolAdmissionsService: admissions } = await import(
    "../lib/school-admissions/runtime"
  );
  const { student500Service: student } = await import(
    "../lib/student-500/runtime"
  );
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const op = () => `p15a2.${randomUUID()}`;
  const owner = randomUUID();
  const other = randomUUID();
  const member = randomUUID();
  await client`insert into "User" (id, email, role) values (${owner}, ${`p15a2.${owner.slice(0, 12)}@test.invalid`}, 'user'), (${other}, ${`p15a2.${other.slice(0, 12)}@test.invalid`}, 'user'), (${member}, ${`p15a2.${member.slice(0, 12)}@test.invalid`}, 'user')`;
  const project = (
    await projects.createProject({
      actorUserId: owner,
      operationId: op(),
      displayName: "P15 A2 Synthetic",
    })
  ).project;
  const otherProject = (
    await projects.createProject({
      actorUserId: other,
      operationId: op(),
      displayName: "P15 A2 Other",
    })
  ).project;
  const createSchool = (name: string) =>
    school.create({
      actorUserId: owner,
      projectId: project.id,
      operationId: op(),
      institutionName: name,
      courseTitle: "Synthetic course",
      intakeLabel: "2027 intake",
    });
  const a = (await createSchool("Synthetic School A")).application;
  const b = (await createSchool("Synthetic School B")).application;
  const pkg = await school.buildPackage({
    actorUserId: owner,
    projectId: project.id,
    applicationId: a.applicationId,
    expectedRevision: a.revision,
    operationId: op(),
  });
  assert.equal(pkg.package.usable, true);
  const linkedA = await admissions.createCase({
    actorUserId: owner,
    projectId: project.id,
    applicationId: a.applicationId,
    originKind: "school_application",
    serviceMode: "managed_service",
    operationId: op(),
  });
  await admissions.createCase({
    actorUserId: owner,
    projectId: project.id,
    applicationId: b.applicationId,
    originKind: "school_application",
    operationId: op(),
  });
  const readiness = await admissions.evaluateManagedReadiness({
    actorUserId: owner,
    projectId: project.id,
    caseId: linkedA.case.caseId,
    expectedRevision: linkedA.case.revision,
    operationId: op(),
  });
  assert.notEqual(readiness.case.managedReadiness.status, "READY");
  for (const kind of ["existing_offer", "existing_coe"] as const) {
    const created = await admissions.createCase({
      actorUserId: owner,
      projectId: project.id,
      originKind: kind,
      institutionName: "Synthetic provider",
      courseTitle: "Synthetic course",
      operationId: op(),
    });
    const recorded = await admissions.recordOutcome({
      actorUserId: owner,
      projectId: project.id,
      caseId: created.case.caseId,
      expectedRevision: created.case.revision,
      kind: kind === "existing_offer" ? "offer" : "coe",
      provenance: "customer_reported",
      operationId: op(),
    });
    assert.equal(
      (kind === "existing_offer" ? recorded.case.offer : recorded.case.coe)
        ?.independentlyVerified,
      false
    );
  }
  const visa = await student.create({
    actorUserId: owner,
    projectId: project.id,
    operationId: op(),
    context: { entryRoute: "no_school_application" },
  });
  const before = await load({
    actorUserId: owner,
    actorType: "regular",
    projectId: project.id,
  });
  assert.equal(before.kind, "ok");
  if (before.kind !== "ok") {
    throw new Error("Owner initial state unavailable");
  }
  assert.equal(before.state.matters.schoolApplications?.length, 2);
  const update = {
    actorUserId: owner,
    projectId: project.id,
    applicationId: a.applicationId,
    expectedRevision: pkg.application.revision,
    operationId: op(),
    institutionName: "Synthetic School A",
    courseTitle: "Synthetic course",
    intakeLabel: "2028 intake",
  };
  const updated = await school.update(update);
  const replay = await school.update(update);
  assert.equal(replay.replayed, true);
  assert.equal(updated.application.revision, replay.application.revision);
  assert.equal(updated.application.status, "stale");
  assert.equal(updated.application.packages[0]?.status, "stale");
  assert.equal(updated.application.packages[0]?.usable, false);
  assert.equal(
    updated.application.events.length,
    replay.application.events.length
  );
  const after = await load({
    actorUserId: owner,
    actorType: "regular",
    projectId: project.id,
  });
  assert.equal(after.kind, "ok");
  if (after.kind !== "ok") {
    throw new Error("Owner updated state unavailable");
  }
  const schoolA = after.state.matters.schoolApplications?.find(
    (entry) => entry.applicationId === a.applicationId
  );
  const schoolB = after.state.matters.schoolApplications?.find(
    (entry) => entry.applicationId === b.applicationId
  );
  assert.equal(schoolA?.intake.label, "2028 intake");
  assert.equal(schoolA?.provenance.revision, updated.application.revision);
  assert.equal(schoolA?.package?.usable, false);
  assert.equal(schoolB?.provenance.revision, b.revision);
  assert.ok(
    after.state.nextActions.some(
      (action) =>
        action.targetId === a.applicationId &&
        action.targetKind === "school_application"
    )
  );
  assert.equal(
    after.state.matters.student500Applications?.find(
      (item) => item.applicationId === visa.application.applicationId
    )?.schoolDependency.state,
    "not_applicable"
  );
  assert.equal(
    (
      await load({
        actorUserId: other,
        actorType: "regular",
        projectId: project.id,
      })
    ).kind,
    "not_found"
  );
  const manifest = {
    owner,
    other,
    member,
    projectId: project.id,
    otherProjectId: otherProject.id,
    a: a.applicationId,
    b: b.applicationId,
    caseA: linkedA.case.caseId,
    revisionA: updated.application.revision,
    revisionB: b.revision,
    intake: "2028 intake",
    visa: visa.application.applicationId,
  };
  await writeFile(manifestPath, JSON.stringify(manifest), {
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(
    `${JSON.stringify({ case: "A", status: "PASS", restartManifest: manifestPath, replay: true, schoolARevision: updated.application.revision, schoolBRevision: b.revision, managedReadiness: readiness.case.managedReadiness.status })}\n`
  );
}

async function readAcceptanceFixtures(_client: ReturnType<typeof postgres>) {
  const data = await readFile(manifestPath, "utf8");
  if (Buffer.byteLength(data) > 4096) {
    throw new Error("Manifest too large");
  }
  const fixture = JSON.parse(data) as {
    owner: string;
    other: string;
    member: string;
    projectId: string;
    otherProjectId: string;
    a: string;
    b: string;
    caseA: string;
    revisionA: number;
    revisionB: number;
    intake: string;
    visa: string;
  };
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const { createProjectStateHttpHandler } = await import(
    "../lib/workspace/project-state-http"
  );
  const actor = {
    actorUserId: fixture.owner,
    actorType: "regular" as const,
    projectId: fixture.projectId,
  };
  const result = await load(actor);
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") {
    throw new Error("Restart read unavailable");
  }
  const a = result.state.matters.schoolApplications?.find(
    (item) => item.applicationId === fixture.a
  );
  const b = result.state.matters.schoolApplications?.find(
    (item) => item.applicationId === fixture.b
  );
  assert.equal(a?.provenance.revision, fixture.revisionA);
  assert.equal(a?.intake.label, fixture.intake);
  assert.equal(a?.package?.usable, false);
  assert.equal(b?.provenance.revision, fixture.revisionB);
  assert.ok((a?.provenance.history.length ?? 0) > 0);
  const ownerHandler = createProjectStateHttpHandler({
    authenticate: async () => ({ userId: fixture.owner, type: "regular" }),
    loadForActor: load,
  });
  const ownerResponse = await ownerHandler(fixture.projectId);
  assert.equal(ownerResponse.status, 200);
  assert.equal(ownerResponse.headers.get("Cache-Control"), "private, no-store");
  const payload = await ownerResponse.json();
  assert.equal(payload.state.schemaVersion, "phase15.project-state.v1");
  const denied = createProjectStateHttpHandler({
    authenticate: async () => ({ userId: fixture.other, type: "regular" }),
    loadForActor: load,
  });
  assert.equal((await denied(fixture.projectId)).status, 404);
  const anonymous = createProjectStateHttpHandler({
    authenticate: async () => null,
    loadForActor: load,
  });
  assert.equal((await anonymous(fixture.projectId)).status, 401);
  process.stdout.write(
    `${JSON.stringify({ case: "B", status: "PASS", separateProcess: true, handlerControlledAuth: "PASS", realSession: "NOT_VERIFIED", payloadBytes: Buffer.byteLength(JSON.stringify(payload)) })}\n`
  );
}

async function checkAuthorization(client: ReturnType<typeof postgres>) {
  const fixture = JSON.parse(await readFile(manifestPath, "utf8")) as {
    owner: string;
    other: string;
    member: string;
    projectId: string;
    a: string;
    b: string;
    caseA: string;
  };
  // A manifest is not authority to mutate: rebind every target to the
  // synthetic namespace in the verified database before any operation.
  const [fixtureGuard] = await client`select
    exists(select 1 from "StudyJourneyProject" p join "User" u on u.id = p."ownerUserId" where p.id = ${fixture.projectId} and p."ownerUserId" = ${fixture.owner} and p."displayName" = 'P15 A2 Synthetic' and u.email like 'p15a2.%@test.invalid') as project_ok,
    exists(select 1 from "User" where id = ${fixture.member} and email like 'p15a2.%@test.invalid') as member_ok,
    exists(select 1 from "SchoolApplication" where id = ${fixture.a} and "projectId" = ${fixture.projectId} and "ownerUserId" = ${fixture.owner}) as school_a_ok,
    exists(select 1 from "SchoolApplication" where id = ${fixture.b} and "projectId" = ${fixture.projectId} and "ownerUserId" = ${fixture.owner}) as school_b_ok`;
  assert.equal(
    fixtureGuard.project_ok &&
      fixtureGuard.member_ok &&
      fixtureGuard.school_a_ok &&
      fixtureGuard.school_b_ok,
    true
  );
  const { projectFoundationRepository: projects } = await import(
    "../lib/db/project-foundation"
  );
  const { schoolApplicationService: school } = await import(
    "../lib/school-applications/runtime"
  );
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const op = () => `p15a2.${randomUUID()}`;
  const project = await projects.authorizeProjectRead({
    actorUserId: fixture.owner,
    projectId: fixture.projectId,
  });
  assert.equal(project.status, "active");
  const invited = await projects.inviteProjectMember({
    actorUserId: fixture.owner,
    projectId: fixture.projectId,
    targetUserId: fixture.member,
    expectedRevision: project.revision,
    operationId: op(),
  });
  const [membership] =
    await client`select id from "ProjectMembership" where "projectId" = ${fixture.projectId} and "userId" = ${fixture.member}`;
  assert.ok(membership?.id);
  const accepted = await projects.acceptProjectMembership({
    actorUserId: fixture.member,
    projectId: fixture.projectId,
    membershipId: membership.id,
    expectedRevision: invited.project.revision,
    operationId: op(),
  });
  const memberSchool = await school.create({
    actorUserId: fixture.member,
    projectId: fixture.projectId,
    institutionName: "Synthetic Member School",
    courseTitle: "Synthetic course",
    intakeLabel: "2029 intake",
    operationId: op(),
  });
  const ownerState = await load({
    actorUserId: fixture.owner,
    actorType: "regular",
    projectId: fixture.projectId,
  });
  const memberState = await load({
    actorUserId: fixture.member,
    actorType: "regular",
    projectId: fixture.projectId,
  });
  assert.equal(ownerState.kind, "ok");
  assert.equal(memberState.kind, "ok");
  if (ownerState.kind !== "ok" || memberState.kind !== "ok") {
    throw new Error("authorized read unavailable");
  }
  assert.ok(
    !JSON.stringify(ownerState.state).includes(
      memberSchool.application.applicationId
    )
  );
  assert.ok(!JSON.stringify(memberState.state).includes(fixture.a));
  assert.ok(
    memberState.state.matters.schoolApplications?.some(
      (entry) => entry.applicationId === memberSchool.application.applicationId
    )
  );
  const schoolOps = new Set([
    "complete_application_details",
    "bind_source_evidence",
    "build_preparation_package",
  ]);
  const caseOps = new Set([
    "select_service_mode",
    "record_offer_or_exception",
    "record_coe_evidence",
  ]);
  for (const action of ownerState.state.nextActions.filter(
    (item) => item.actionability === "executable"
  )) {
    if (schoolOps.has(action.code)) {
      assert.equal(action.targetKind, "school_application");
      assert.ok(
        ownerState.state.matters.schoolApplications?.some(
          (item) => item.applicationId === action.targetId
        )
      );
    }
    if (caseOps.has(action.code)) {
      assert.equal(action.targetKind, "school_admission_case");
    }
  }
  const origins = ownerState.state.matters.standaloneAdmissions ?? [];
  for (const origin of ["existing_offer", "existing_coe"]) {
    const entry = origins.find((item) => item.originKind === origin);
    assert.equal(entry?.linkedSchoolApplicationId, null);
    assert.equal(entry?.outcomes[0]?.independentlyVerified, false);
  }
  const revoked = await projects.revokeProjectMembership({
    actorUserId: fixture.owner,
    projectId: fixture.projectId,
    membershipId: membership.id,
    expectedRevision: accepted.project.revision,
    operationId: op(),
  });
  assert.equal(
    (
      await load({
        actorUserId: fixture.member,
        actorType: "regular",
        projectId: fixture.projectId,
      })
    ).kind,
    "not_found"
  );
  const beforeArchive = await school.get({
    actorUserId: fixture.owner,
    projectId: fixture.projectId,
    applicationId: fixture.b,
  });
  await school.archive({
    actorUserId: fixture.owner,
    projectId: fixture.projectId,
    applicationId: fixture.b,
    expectedRevision: beforeArchive.revision,
    operationId: op(),
  });
  const archived = await load({
    actorUserId: fixture.owner,
    actorType: "regular",
    projectId: fixture.projectId,
  });
  assert.equal(archived.kind, "ok");
  if (archived.kind !== "ok") {
    throw new Error("archived read unavailable");
  }
  assert.equal(
    archived.state.matters.schoolApplications?.find(
      (item) => item.applicationId === fixture.b
    )?.progress,
    "archived"
  );
  assert.equal(
    archived.state.nextActions.some((item) => item.targetId === fixture.b),
    false
  );
  await projects.closeProject({
    actorUserId: fixture.owner,
    projectId: fixture.projectId,
    expectedRevision: revoked.project.revision,
    operationId: op(),
  });
  const closed = await load({
    actorUserId: fixture.owner,
    actorType: "regular",
    projectId: fixture.projectId,
  });
  assert.equal(closed.kind, "ok");
  if (closed.kind !== "ok") {
    throw new Error("closed read unavailable");
  }
  assert.equal(closed.state.project.status, "closed");
  assert.deepEqual(closed.state.nextActions, []);
  process.stdout.write(
    `${JSON.stringify({ case: "C", member: "PASS", revoked: "PASS", privateMatterIsolation: "PASS", archived: "PASS", closed: "PASS", offerCoe: "PASS", sourceUnavailable: "NOT_TESTED" })}\n`
  );
}

async function measurePerformance(client: ReturnType<typeof postgres>) {
  const { projectFoundationRepository: projects } = await import(
    "../lib/db/project-foundation"
  );
  const { schoolApplicationService: school } = await import(
    "../lib/school-applications/runtime"
  );
  const { schoolAdmissionsService: admissions } = await import(
    "../lib/school-admissions/runtime"
  );
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const op = () => `p15a2perf.${randomUUID()}`;
  const owner = randomUUID();
  await client`insert into "User" (id, email, role) values (${owner}, ${`p15a2perf.${owner.slice(0, 12)}@test.invalid`}, 'user')`;
  for (const group of [
    { schools: 1, events: 5 },
    { schools: 3, events: 30 },
    { schools: 5, events: 100 },
  ]) {
    const project = (
      await projects.createProject({
        actorUserId: owner,
        operationId: op(),
        displayName: `P15 A2 perf ${group.schools}`,
      })
    ).project;
    for (let index = 0; index < group.schools; index++) {
      const institutionName = `Synthetic Perf ${index}`;
      let record = (
        await school.create({
          actorUserId: owner,
          projectId: project.id,
          operationId: op(),
          institutionName,
          courseTitle: "Synthetic course",
          intakeLabel: "2027 intake",
        })
      ).application;
      for (let n = 1; n < group.events; n++) {
        record = (
          await school.update({
            actorUserId: owner,
            projectId: project.id,
            applicationId: record.applicationId,
            expectedRevision: record.revision,
            operationId: op(),
            institutionName,
            courseTitle: "Synthetic course",
            intakeLabel: `Synthetic intake ${n}`,
          })
        ).application;
      }
      await admissions.createCase({
        actorUserId: owner,
        projectId: project.id,
        applicationId: record.applicationId,
        originKind: "school_application",
        operationId: op(),
      });
    }
    const [source] = await client`select
      (select count(*)::integer from "SchoolApplicationEvent" where "projectId" = ${project.id}) as school_events,
      (select count(*)::integer from "SchoolAdmissionEvent" where "projectId" = ${project.id}) as admission_events`;
    let queryCount = 0;
    const options = client.options as unknown as {
      debug: false | (() => void);
    };
    const previousDebug = options.debug;
    const times: number[] = [];
    const queries: number[] = [];
    let exposed = 0;
    let bytes = 0;
    try {
      options.debug = () => {
        queryCount++;
      };
      for (let attempt = 0; attempt < 4; attempt++) {
        queryCount = 0;
        const started = performance.now();
        const result = await load({
          actorUserId: owner,
          actorType: "regular",
          projectId: project.id,
        });
        times.push(Math.round((performance.now() - started) * 100) / 100);
        queries.push(queryCount);
        if (result.kind !== "ok") {
          throw new Error(`Performance read ${result.kind}`);
        }
        assert.equal(
          result.state.matters.schoolApplications?.length,
          group.schools
        );
        exposed = (result.state.matters.schoolApplications ?? []).reduce(
          (sum, item) =>
            sum +
            item.provenance.history.length +
            (item.linkedAdmissionsCase?.provenance.history.length ?? 0),
          0
        );
        bytes = Buffer.byteLength(JSON.stringify(result.state));
      }
    } finally {
      options.debug = previousDebug;
    }
    const sorted = [...times].sort((a, b) => a - b);
    process.stdout.write(
      `${JSON.stringify({ case: "performance", schools: group.schools, admissions: group.schools, schoolEvents: source.school_events, admissionEvents: source.admission_events, exposedEvents: exposed, payloadBytes: bytes, readMs: times, medianMs: (sorted[1] + sorted[2]) / 2, maxMs: Math.max(...times), sharedRuntimeStatements: queries, schemaProbeStatements: "NOT_MEASURED" })}\n`
    );
  }
}

async function inspectPerformanceTargets(client: ReturnType<typeof postgres>) {
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const rows =
    await client`select p.id, p."ownerUserId" as owner from "StudyJourneyProject" p join "User" u on u.id = p."ownerUserId" where u.email like 'p15a2perf.%@test.invalid' and p.status = 'active'`;
  assert.equal(rows.length, 3);
  const schoolOps = new Set([
    "complete_application_details",
    "bind_source_evidence",
    "build_preparation_package",
  ]);
  const caseOps = new Set([
    "select_service_mode",
    "record_offer_or_exception",
    "record_coe_evidence",
  ]);
  let schoolActions = 0;
  let caseActions = 0;
  for (const row of rows) {
    const result = await load({
      actorUserId: row.owner,
      actorType: "regular",
      projectId: row.id,
    });
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") {
      throw new Error("Target read unavailable");
    }
    const schools = new Set(
      (result.state.matters.schoolApplications ?? []).map(
        (item) => item.applicationId
      )
    );
    const cases = new Set(
      (result.state.matters.schoolApplications ?? []).flatMap((item) =>
        item.linkedAdmissionsCase ? [item.linkedAdmissionsCase.caseId] : []
      )
    );
    for (const action of result.state.nextActions.filter(
      (item) => item.actionability === "executable"
    )) {
      if (schoolOps.has(action.code)) {
        assert.equal(action.targetKind, "school_application");
        assert.ok(schools.has(action.targetId));
        schoolActions++;
      }
      if (caseOps.has(action.code)) {
        assert.equal(action.targetKind, "school_admission_case");
        assert.ok(cases.has(action.targetId));
        caseActions++;
      }
    }
  }
  assert.ok(schoolActions > 0);
  const guest = await load({
    actorUserId: rows[0].owner,
    actorType: "guest",
    projectId: rows[0].id,
  });
  assert.equal(guest.kind, "ok");
  if (guest.kind !== "ok") {
    throw new Error("Guest restricted read unavailable");
  }
  assert.equal(guest.state.capabilities.schoolApplications.state, "restricted");
  assert.equal(guest.state.matters.schoolApplications, null);
  process.stdout.write(
    `${JSON.stringify({ targetBinding: "PASS", schoolActions, caseActions, restrictedSourceControlledActor: "PASS" })}\n`
  );
}

async function checkAdmissionsTarget(client: ReturnType<typeof postgres>) {
  const { schoolAdmissionsService: admissions } = await import(
    "../lib/school-admissions/runtime"
  );
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const rows =
    await client`select p.id, p."ownerUserId" as owner from "StudyJourneyProject" p join "User" u on u.id = p."ownerUserId" where u.email like 'p15a2perf.%@test.invalid' and p.status = 'active' order by p."createdAt" limit 1`;
  assert.equal(rows.length, 1);
  const item = await admissions.createCase({
    actorUserId: rows[0].owner,
    projectId: rows[0].id,
    originKind: "existing_offer",
    institutionName: "Synthetic entry",
    courseTitle: "Synthetic course",
    operationId: `p15a2target.${randomUUID()}`,
  });
  const state = await load({
    actorUserId: rows[0].owner,
    actorType: "regular",
    projectId: rows[0].id,
  });
  assert.equal(state.kind, "ok");
  if (state.kind !== "ok") {
    throw new Error("Admission target state unavailable");
  }
  assert.ok(
    state.state.nextActions.some(
      (action) =>
        action.code === "record_offer_or_exception" &&
        action.actionability === "executable" &&
        action.targetKind === "school_admission_case" &&
        action.targetId === item.case.caseId
    )
  );
  process.stdout.write("Real Admissions-owned action target PASS.\n");
}

async function checkStudentPreparation(client: ReturnType<typeof postgres>) {
  const { student500Service: student } = await import(
    "../lib/student-500/runtime"
  );
  const { student500PreparationService: preparation } = await import(
    "../lib/student-500/preparation/runtime"
  );
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const rows =
    await client`select p.id, p."ownerUserId" as owner from "StudyJourneyProject" p join "User" u on u.id = p."ownerUserId" where u.email like 'p15a2perf.%@test.invalid' and p.status = 'active' order by p."createdAt" limit 1`;
  assert.equal(rows.length, 1);
  const actorUserId = rows[0].owner;
  const projectId = rows[0].id;
  const app = await student.create({
    actorUserId,
    projectId,
    context: { entryRoute: "no_school_application" },
    operationId: `p15a2visa.${randomUUID()}`,
  });
  const draft = await preparation.createDraft({
    actorUserId,
    projectId,
    applicationId: app.application.applicationId,
    operationId: `p15a2draft.${randomUUID()}`,
  });
  const state = await load({ actorUserId, actorType: "regular", projectId });
  assert.equal(state.kind, "ok");
  if (state.kind !== "ok") {
    throw new Error("Student preparation state unavailable");
  }
  const entry = state.state.matters.student500Applications?.find(
    (item) => item.applicationId === app.application.applicationId
  );
  assert.equal(entry?.schoolDependency.state, "not_applicable");
  assert.ok(
    entry?.preparation.drafts.some((item) => item.draftId === draft.draft.id)
  );
  process.stdout.write(
    "Student 500 no-school draft and state readback PASS.\n"
  );
}

async function verifyStudentPreparation(client: ReturnType<typeof postgres>) {
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const rows =
    await client`select a.id as app, a."projectId" as project, a."ownerUserId" as owner, d.id as draft from "Student500Application" a join "User" u on u.id = a."ownerUserId" join "Student500GsDraft" d on d."applicationId" = a.id where u.email like 'p15a2perf.%@test.invalid' order by d."createdAt" desc limit 1`;
  assert.equal(rows.length, 1);
  const state = await load({
    actorUserId: rows[0].owner,
    actorType: "regular",
    projectId: rows[0].project,
  });
  assert.equal(state.kind, "ok");
  if (state.kind !== "ok") {
    throw new Error("Student state unavailable");
  }
  const entry = state.state.matters.student500Applications?.find(
    (item) => item.applicationId === rows[0].app
  );
  assert.equal(entry?.schoolDependency.state, "not_applicable");
  assert.ok(
    entry?.preparation.drafts.some((item) => item.draftId === rows[0].draft)
  );
  process.stdout.write(
    "Existing synthetic Student 500 draft persisted and Project State readback PASS.\n"
  );
}

async function verifyManagedAuthority(client: ReturnType<typeof postgres>) {
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const rows =
    await client`select p.id as project, p."ownerUserId" as owner from "StudyJourneyProject" p join "User" u on u.id = p."ownerUserId" where u.email like 'p15a2.%@test.invalid' and p.status = 'active' and p."displayName" = 'P15 A2 Synthetic' order by p."createdAt" limit 1`;
  assert.equal(rows.length, 1);
  const result = await load({
    actorUserId: rows[0].owner,
    actorType: "regular",
    projectId: rows[0].project,
  });
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") {
    throw new Error("Managed state unavailable");
  }
  const managed = result.state.matters.schoolApplications
    ?.flatMap((app) =>
      app.linkedAdmissionsCase ? [app.linkedAdmissionsCase] : []
    )
    .find((entry) => entry.serviceMode === "managed_service");
  assert.ok(managed);
  assert.notEqual(managed.externalHandoff.status, "READY");
  assert.ok(managed.externalHandoff.reasonCodes.length > 0);
  assert.equal(
    result.state.nextActions.some(
      (action) =>
        action.actionability === "executable" &&
        [
          "request_managed_service_support",
          "verify_exception_authoritatively",
        ].includes(action.code)
    ),
    false
  );
  process.stdout.write(
    `${JSON.stringify({ managedAuthority: "PASS", handoffStatus: managed.externalHandoff.status, reasonCodes: managed.externalHandoff.reasonCodes })}\n`
  );
}

async function verifyBoundedReads(client: ReturnType<typeof postgres>) {
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const { schoolApplicationService: school } = await import(
    "../lib/school-applications/runtime"
  );
  const { schoolAdmissionsService: admissions } = await import(
    "../lib/school-admissions/runtime"
  );
  const { student500Service: student } = await import(
    "../lib/student-500/runtime"
  );
  const rows =
    await client`select p.id as project, p."ownerUserId" as owner, p."displayName" as label from "StudyJourneyProject" p join "User" u on u.id = p."ownerUserId" where u.email like 'p15a2perf.%@test.invalid' and p.status = 'active' order by p."createdAt"`;
  assert.equal(rows.length, 3);
  for (const row of rows) {
    const [app] =
      await client`select id from "SchoolApplication" where "projectId" = ${row.project} and "ownerUserId" = ${row.owner} order by "createdAt", id limit 1`;
    assert.ok(app?.id);
    const schoolRows =
      await client`select id from "SchoolApplication" where "projectId" = ${row.project} and "ownerUserId" = ${row.owner}`;
    const caseRows =
      await client`select id from "SchoolAdmissionCase" where "projectId" = ${row.project} and "ownerUserId" = ${row.owner}`;
    const visaRows =
      await client`select id from "Student500Application" where "projectId" = ${row.project} and "ownerUserId" = ${row.owner}`;
    let schoolRowsReturned = 0;
    let admissionRowsReturned = 0;
    let studentRowsReturned = 0;
    for (const item of schoolRows) {
      const view = await school.getProjectState({
        actorUserId: row.owner,
        projectId: row.project,
        applicationId: item.id,
      });
      assert.ok(view.events.length <= 13);
      schoolRowsReturned += view.events.length;
    }
    for (const item of caseRows) {
      const view = await admissions.getProjectStateCase({
        actorUserId: row.owner,
        projectId: row.project,
        caseId: item.id,
        applicationDataAvailable: true,
      });
      assert.ok(view.case.events.length <= 13);
      admissionRowsReturned += view.case.events.length;
    }
    for (const item of visaRows) {
      const view = await student.getProjectState({
        actorUserId: row.owner,
        projectId: row.project,
        applicationId: item.id,
      });
      assert.ok(view.events.length <= 13);
      studentRowsReturned += view.events.length;
    }
    const [counts] =
      await client`select (select count(*)::integer from "SchoolApplicationEvent" where "projectId" = ${row.project}) as all_school_events, (select count(*)::integer from "SchoolApplicationEvent" where "applicationId" = ${app.id}) as selected_events, (select count(*)::integer from "SchoolAdmissionEvent" where "projectId" = ${row.project}) as admission_events, (select count(*)::integer from "Student500ApplicationEvent" where "projectId" = ${row.project}) as student_events`;
    const detail = await school.getProjectState({
      actorUserId: row.owner,
      projectId: row.project,
      applicationId: app.id,
    });
    assert.equal(detail.events.length, Math.min(counts.selected_events, 13));
    const oracle =
      await client`select "eventType" as event_type, "applicationRevision" as revision, "subjectId" as subject_id, "subjectKind" as subject_kind from "SchoolApplicationEvent" where "applicationId" = ${app.id} order by date_trunc('milliseconds', "createdAt") desc, "applicationRevision" desc, id desc limit 13`;
    const oracleIdentity = [...oracle].reverse().map((event) => ({
      eventType: event.event_type,
      revision: event.revision,
      subjectId: event.subject_id,
      subjectKind: event.subject_kind,
    }));
    assert.deepEqual(
      detail.events.map((event) => ({
        eventType: event.eventType,
        revision: event.applicationRevision,
        subjectId: event.subjectId,
        subjectKind: event.subjectKind,
      })),
      oracleIdentity
    );
    const expected = detail.events.slice(-12).map((event) => ({
      createdAt: event.createdAt,
      revision: event.applicationRevision,
      eventType: event.eventType,
      subjectId: event.subjectId,
      subjectKind: event.subjectKind,
    }));
    let statements = 0;
    let eventQueries = 0;
    let unboundedEventQueries = 0;
    const options = client.options as unknown as {
      debug: false | ((id: number, text: string, params: unknown[]) => void);
    };
    const prior = options.debug;
    const times: number[] = [];
    const queryCounts: number[] = [];
    let exposed = 0;
    let bytes = 0;
    let stateCalls = 0;
    let stateFingerprint = "";
    try {
      options.debug = (_id, text, params) => {
        statements++;
        if (
          /select\b/i.test(text) &&
          /"(?:SchoolApplicationEvent|SchoolAdmissionEvent|Student500ApplicationEvent)"/.test(
            text
          )
        ) {
          eventQueries++;
          if (
            !/\blimit\s+\$\d+/i.test(text) ||
            !params.some((value) => Number(value) === 13)
          ) {
            unboundedEventQueries++;
          }
        }
      };
      for (let iteration = 0; iteration < 4; iteration++) {
        statements = 0;
        const started = performance.now();
        const result = await load({
          actorUserId: row.owner,
          actorType: "regular",
          projectId: row.project,
        });
        times.push(Math.round((performance.now() - started) * 100) / 100);
        queryCounts.push(statements);
        stateCalls++;
        assert.equal(result.kind, "ok");
        if (result.kind !== "ok") {
          throw new Error("State read unavailable");
        }
        const entry = result.state.matters.schoolApplications?.find(
          (item) => item.applicationId === app.id
        );
        assert.ok(entry);
        assert.deepEqual(entry.provenance.history, expected);
        assert.deepEqual(entry.provenance.latestEvent, expected.at(-1) ?? null);
        assert.equal(
          entry.provenance.historyTruncated,
          counts.selected_events > 12
        );
        exposed = (result.state.matters.schoolApplications ?? []).reduce(
          (sum, item) =>
            sum +
            item.provenance.history.length +
            (item.linkedAdmissionsCase?.provenance.history.length ?? 0),
          0
        );
        exposed += (result.state.matters.standaloneAdmissions ?? []).reduce(
          (sum, item) => sum + item.provenance.history.length,
          0
        );
        exposed += (
          result.state.matters.unresolvedLinkedAdmissions ?? []
        ).reduce((sum, item) => sum + item.provenance.history.length, 0);
        exposed += (result.state.matters.student500Applications ?? []).reduce(
          (sum, item) => sum + item.provenance.history.length,
          0
        );
        bytes = Buffer.byteLength(JSON.stringify(result.state));
        const fingerprint = createHash("sha256")
          .update(JSON.stringify({ ...result.state, generatedAt: "" }))
          .digest("hex");
        if (stateFingerprint) {
          assert.equal(fingerprint, stateFingerprint);
        }
        stateFingerprint = fingerprint;
      }
    } finally {
      options.debug = prior;
    }
    assert.ok(eventQueries > 0);
    assert.equal(unboundedEventQueries, 0);
    const sorted = [...times].sort((a, b) => a - b);
    process.stdout.write(
      `${JSON.stringify({ case: "A3 bounded reads", label: row.label, schools: schoolRows.length, admissions: caseRows.length, studentApplications: visaRows.length, schoolRowsReturned, admissionRowsReturned, studentRowsReturned, sourceSchoolEvents: counts.all_school_events, sourceAdmissionEvents: counts.admission_events, sourceStudentEvents: counts.student_events, selectedSourceEvents: counts.selected_events, selectedRowsReturned: detail.events.length, exposedEvents: exposed, payloadBytes: bytes, readMs: times, medianMs: (sorted[1] + sorted[2]) / 2, maxMs: Math.max(...times), sharedRuntimeStatements: queryCounts, auditedEventQueries: eventQueries, unboundedEventQueries, stateCalls, stateFingerprint, schemaProbeStatements: "NOT_MEASURED" })}\n`
    );
  }
}

async function verifyClosedState() {
  const data = await readFile(manifestPath, "utf8");
  if (Buffer.byteLength(data) > 4096) {
    throw new Error("Manifest too large");
  }
  const fixture = JSON.parse(data) as {
    owner: string;
    other: string;
    member: string;
    projectId: string;
    a: string;
    b: string;
  };
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const { createProjectStateHttpHandler } = await import(
    "../lib/workspace/project-state-http"
  );
  const state = await load({
    actorUserId: fixture.owner,
    actorType: "regular",
    projectId: fixture.projectId,
  });
  assert.equal(state.kind, "ok");
  if (state.kind !== "ok") {
    throw new Error("Closed state unavailable");
  }
  assert.equal(state.state.project.status, "closed");
  assert.deepEqual(state.state.nextActions, []);
  assert.ok(
    state.state.matters.schoolApplications?.find(
      (item) => item.applicationId === fixture.a
    )?.provenance.history.length
  );
  assert.equal(
    state.state.matters.schoolApplications?.find(
      (item) => item.applicationId === fixture.b
    )?.progress,
    "archived"
  );
  assert.equal(
    (
      await load({
        actorUserId: fixture.member,
        actorType: "regular",
        projectId: fixture.projectId,
      })
    ).kind,
    "not_found"
  );
  const handler = createProjectStateHttpHandler({
    authenticate: async () => ({ userId: fixture.owner, type: "regular" }),
    loadForActor: load,
  });
  const response = await handler(fixture.projectId);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const dataBody = await response.json();
  assert.equal(dataBody.state.schemaVersion, "phase15.project-state.v1");
  const unauthorized = createProjectStateHttpHandler({
    authenticate: async () => ({ userId: fixture.other, type: "regular" }),
    loadForActor: load,
  });
  assert.equal((await unauthorized(fixture.projectId)).status, 404);
  const anonymous = createProjectStateHttpHandler({
    authenticate: async () => null,
    loadForActor: load,
  });
  assert.equal((await anonymous(fixture.projectId)).status, 401);
  process.stdout.write(
    "Closed/archived/revoked and controlled-auth real-loader handler PASS.\n"
  );
}

async function verifyStateSourceAuthorization(
  client: ReturnType<typeof postgres>
) {
  const fixture = JSON.parse(await readFile(manifestPath, "utf8")) as {
    other: string;
  };
  const { schoolApplicationService: school } = await import(
    "../lib/school-applications/runtime"
  );
  const { schoolAdmissionsService: admissions } = await import(
    "../lib/school-admissions/runtime"
  );
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const rows =
    await client`select p.id as project, p."ownerUserId" as owner, a.id as school, c.id as admission from "StudyJourneyProject" p join "User" u on u.id = p."ownerUserId" join "SchoolApplication" a on a."projectId" = p.id join "SchoolAdmissionCase" c on c."applicationId" = a.id where u.email like 'p15a2perf.%@test.invalid' and p.status = 'active' order by p."createdAt" limit 1`;
  assert.equal(rows.length, 1);
  const row = rows[0];
  const schoolInput = {
    actorUserId: row.owner,
    projectId: row.project,
    applicationId: row.school,
  };
  assert.ok((await school.getProjectState(schoolInput)).applicationId);
  await assert.rejects(
    school.getProjectState({ ...schoolInput, actorUserId: fixture.other })
  );
  const admissionInput = {
    actorUserId: row.owner,
    projectId: row.project,
    caseId: row.admission,
    applicationDataAvailable: false,
  };
  const detail = (await admissions.getProjectStateCase(admissionInput)).case;
  assert.equal(detail.caseId, row.admission);
  assert.equal(detail.application, null);
  assert.deepEqual(detail.nextStepCodes, []);
  await assert.rejects(
    admissions.getProjectStateCase({
      ...admissionInput,
      actorUserId: fixture.other,
    })
  );
  const guest = await load({
    actorUserId: row.owner,
    actorType: "guest",
    projectId: row.project,
  });
  assert.equal(guest.kind, "ok");
  if (guest.kind !== "ok") {
    throw new Error("Restricted source state unavailable");
  }
  assert.equal(guest.state.capabilities.schoolApplications.state, "restricted");
  assert.equal(guest.state.matters.schoolApplications, null);
  process.stdout.write(
    "Bounded source authorization, unavailable linkage and restricted source PASS.\n"
  );
}

async function profileReadAttribution(client: ReturnType<typeof postgres>) {
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const [row] =
    await client`select p.id as project, p."ownerUserId" as owner from "StudyJourneyProject" p join "User" u on u.id = p."ownerUserId" where u.email like 'p15a2perf.%@test.invalid' and p."displayName" = 'P15 A2 perf 5' and p.status = 'active'`;
  assert.ok(row);
  // Attribution is exclusive by first matching category. SQL and parameters are
  // inspected in this process only and are never emitted.
  const groups: Record<string, number> = {
    schoolEvents: 0,
    admissionEvents: 0,
    studentEvents: 0,
    schoolOther: 0,
    admissionOther: 0,
    studentOther: 0,
    facts: 0,
    projectAuth: 0,
    other: 0,
  };
  const options = client.options as unknown as {
    debug: false | ((id: number, text: string, params: unknown[]) => void);
  };
  const prior = options.debug;
  try {
    options.debug = (_id, text) => {
      let key = "other";
      if (/"SchoolApplicationEvent"/.test(text)) {
        key = "schoolEvents";
      } else if (/"SchoolAdmissionEvent"/.test(text)) {
        key = "admissionEvents";
      } else if (/"Student500ApplicationEvent"/.test(text)) {
        key = "studentEvents";
      } else if (
        /"SchoolApplication(?:Reference|Package|Operation)?"/.test(text)
      ) {
        key = "schoolOther";
      } else if (
        /"SchoolAdmission(?:Case|Preparation|Outcome|Exception|ExternalAction|Operation)"/.test(
          text
        )
      ) {
        key = "admissionOther";
      } else if (/"Student500/.test(text)) {
        key = "studentOther";
      } else if (/"ProjectFact|"ProjectRequirement/.test(text)) {
        key = "facts";
      } else if (/"StudyJourneyProject"|"ProjectMembership"/.test(text)) {
        key = "projectAuth";
      }
      groups[key]++;
    };
    const state = await load({
      actorUserId: row.owner,
      actorType: "regular",
      projectId: row.project,
    });
    assert.equal(state.kind, "ok");
  } finally {
    options.debug = prior;
  }
  process.stdout.write(
    `${JSON.stringify({ case: "A3 query attribution", sharedRuntimeByFirstMatchingTable: groups, sharedRuntimeTotal: Object.values(groups).reduce((a, b) => a + b, 0), schemaProbeStatements: "NOT_MEASURED" })}\n`
  );
}

async function verifyBoundedFactProjection(
  client: ReturnType<typeof postgres>
) {
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.PHASE14_PROJECT_FACTS_ENABLED, "true");
  const { projectFoundationRepository: projects } = await import(
    "../lib/db/project-foundation"
  );
  const { projectFactServices } = await import("../lib/project-facts/runtime");
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const { student500Service: student } = await import(
    "../lib/student-500/runtime"
  );
  const owner = randomUUID();
  const member = randomUUID();
  const outsider = randomUUID();
  const op = () => `p15a4.${randomUUID()}`;
  await client`insert into "User" (id, email, role) values (${owner}, ${`p15a4.${owner.slice(0, 12)}@test.invalid`}, 'user'), (${member}, ${`p15a4.${member.slice(0, 12)}@test.invalid`}, 'user'), (${outsider}, ${`p15a4.${outsider.slice(0, 12)}@test.invalid`}, 'user')`;
  const project = (
    await projects.createProject({
      actorUserId: owner,
      operationId: op(),
      displayName: "P15 A4 Fact Synthetic",
    })
  ).project;
  const invite = await projects.inviteProjectMember({
    actorUserId: owner,
    projectId: project.id,
    targetUserId: member,
    expectedRevision: project.revision,
    operationId: op(),
  });
  const [membership] =
    await client`select id from "ProjectMembership" where "projectId" = ${project.id} and "userId" = ${member}`;
  await projects.acceptProjectMembership({
    actorUserId: member,
    projectId: project.id,
    membershipId: membership.id,
    expectedRevision: invite.project.revision,
    operationId: op(),
  });
  const revision = async () =>
    (
      await projects.authorizeProjectRead({
        actorUserId: owner,
        projectId: project.id,
      })
    ).revision;
  const propose = async (key: string, value: string, actorUserId = owner) =>
    projectFactServices.facts.propose({
      actorUserId,
      projectId: project.id,
      expectedProjectRevision: await revision(),
      operationId: op(),
      key,
      valueType: "string",
      value,
      originKind: "customer_stated",
    });
  const authorizeFact = async (key: string) => {
    const fact = await propose(key, "synthetic value");
    const confirmed = await projectFactServices.facts.confirm({
      actorUserId: owner,
      projectId: project.id,
      assertionId: fact.id,
      assertionVersion: fact.version,
      expectedProjectRevision: await revision(),
      operationId: op(),
    });
    await projectFactServices.facts.publish({
      actorUserId: owner,
      projectId: project.id,
      assertionId: fact.id,
      assertionVersion: confirmed.version,
      expectedProjectRevision: await revision(),
      operationId: op(),
      audience: "project",
    });
    await projectFactServices.facts.grantAIUse({
      actorUserId: owner,
      projectId: project.id,
      assertionId: fact.id,
      assertionVersion: confirmed.version,
      expectedProjectRevision: await revision(),
      operationId: op(),
      audience: "project",
    });
    return confirmed;
  };
  const visible = await authorizeFact("synthetic.visible");
  const privateFact = await propose("synthetic.private", "private synthetic");
  const revoked = await authorizeFact("synthetic.revoked");
  await projectFactServices.facts.revokeAIUse({
    actorUserId: owner,
    projectId: project.id,
    assertionId: revoked.id,
    assertionVersion: revoked.version,
    expectedProjectRevision: await revision(),
    operationId: op(),
  });
  await propose("synthetic.conflict", "one");
  await propose("synthetic.conflict", "two", member);
  for (const actor of [owner, member]) {
    const full = await projectFactServices.facts.stableProjection({
      actorUserId: actor,
      projectId: project.id,
    });
    const bounded = await projectFactServices.facts.stableProjection({
      actorUserId: actor,
      projectId: project.id,
      maxSourceRows: 100,
    });
    assert.deepEqual(bounded, full);
    assert.ok(bounded.authorizedForAI.some((item) => item.id === visible.id));
    assert.equal(
      bounded.authorizedForAI.some((item) => item.id === revoked.id),
      false
    );
    if (actor === member) {
      assert.equal(JSON.stringify(bounded).includes(privateFact.id), false);
    }
  }
  const forbidden = await projectFactServices.facts.stableProjection({
    actorUserId: outsider,
    projectId: project.id,
    maxSourceRows: 100,
  });
  assert.equal(forbidden.available, false);
  const before = await load({
    actorUserId: owner,
    actorType: "regular",
    projectId: project.id,
  });
  assert.equal(before.kind, "ok");
  if (before.kind !== "ok") {
    throw new Error("Fact state unavailable before overflow");
  }
  assert.equal(before.state.facts.state, "available");
  assert.ok(
    before.state.facts.authorizedForAI?.some(
      (item) => item.assertionId === visible.id
    )
  );
  assert.equal(JSON.stringify(before.state).includes("synthetic value"), false);
  const visa = await student.create({
    actorUserId: owner,
    projectId: project.id,
    context: { entryRoute: "no_school_application" },
    operationId: op(),
  });
  const beforeVisa = await load({
    actorUserId: owner,
    actorType: "regular",
    projectId: project.id,
  });
  assert.equal(beforeVisa.kind, "ok");
  if (beforeVisa.kind !== "ok") {
    throw new Error("Student state unavailable before overflow");
  }
  assert.equal(
    beforeVisa.state.capabilities.student500Preparation.state,
    "available"
  );
  const [initial] =
    await client`select count(*)::integer as n from "ProjectFactAssertion" where "projectId" = ${project.id}`;
  for (let n = initial.n; n < 101; n++) {
    await propose(`synthetic.bulk_${n}`, `synthetic ${n}`);
  }
  const [stored] =
    await client`select count(*)::integer as n from "ProjectFactAssertion" where "projectId" = ${project.id}`;
  assert.equal(stored.n, 101);
  let limitedQueries = 0;
  let unsafeQueries = 0;
  const options = client.options as unknown as {
    debug: false | ((id: number, text: string, params: unknown[]) => void);
  };
  const prior = options.debug;
  try {
    options.debug = (_id, text, params) => {
      if (
        /select\b/i.test(text) &&
        /"(?:ProjectFactAssertion|ProjectFactPublication|ProjectFactUseGrant|ProjectFactConflict|ProjectFactAssertionEvidence)"/.test(
          text
        )
      ) {
        if (
          /\blimit\s+\$\d+/i.test(text) &&
          params.some((value) => Number(value) === 101)
        ) {
          limitedQueries++;
        } else {
          unsafeQueries++;
        }
      }
    };
    await assert.rejects(
      projectFactServices.facts.stableProjection({
        actorUserId: owner,
        projectId: project.id,
        maxSourceRows: 100,
      }),
      { code: "project_fact_source_overflow" }
    );
  } finally {
    options.debug = prior;
  }
  assert.equal(limitedQueries, 5);
  assert.equal(unsafeQueries, 0);
  const overflow = await load({
    actorUserId: owner,
    actorType: "regular",
    projectId: project.id,
  });
  assert.equal(overflow.kind, "ok");
  if (overflow.kind !== "ok") {
    throw new Error("Overflow state unavailable");
  }
  assert.equal(
    overflow.state.capabilities.projectFacts.reasonCode,
    "project_fact_source_exceeds_bound"
  );
  assert.equal(overflow.state.facts.authorizedForAI, null);
  assert.equal(
    overflow.state.capabilities.student500Preparation.state,
    "unavailable"
  );
  assert.equal(
    overflow.state.matters.student500Applications?.find(
      (item) => item.applicationId === visa.application.applicationId
    )?.preparation.state,
    "unavailable"
  );
  process.stdout.write(
    `${JSON.stringify({ case: "A4 facts", status: "PASS", ownerMemberVisibility: "PASS", outsiderDenied: "PASS", revokedGrant: "PASS", conflicts: "PASS", storedAssertions: stored.n, maxReturnedPerQuery: 101, limitedQueries, unsafeQueries, factOverflow: "unavailable", studentPreparationOverflow: "unavailable" })}\n`
  );
}

async function verifySchoolHistoryBounds(client: ReturnType<typeof postgres>) {
  const { projectFoundationRepository: projects } = await import(
    "../lib/db/project-foundation"
  );
  const { projectFactServices } = await import("../lib/project-facts/runtime");
  const { schoolApplicationService: school } = await import(
    "../lib/school-applications/runtime"
  );
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const owner = randomUUID();
  const outsider = randomUUID();
  const op = () => `p15a4school.${randomUUID()}`;
  await client`insert into "User" (id, email, role) values (${owner}, ${`p15a4school.${owner.slice(0, 12)}@test.invalid`}, 'user'), (${outsider}, ${`p15a4school.${outsider.slice(0, 12)}@test.invalid`}, 'user')`;
  const project = (
    await projects.createProject({
      actorUserId: owner,
      operationId: op(),
      displayName: "P15 A4 School Synthetic",
    })
  ).project;
  const fact = await projectFactServices.facts.propose({
    actorUserId: owner,
    projectId: project.id,
    expectedProjectRevision: project.revision,
    operationId: op(),
    key: "synthetic.school_ref",
    valueType: "string",
    value: "synthetic",
    originKind: "customer_stated",
  });
  let app = (
    await school.create({
      actorUserId: owner,
      projectId: project.id,
      operationId: op(),
      institutionName: "Synthetic history school",
      courseTitle: "Synthetic course",
      intakeLabel: "2027",
    })
  ).application;
  for (let i = 0; i < 4; i++) {
    app = (
      await school.buildPackage({
        actorUserId: owner,
        projectId: project.id,
        applicationId: app.applicationId,
        expectedRevision: app.revision,
        operationId: op(),
      })
    ).application;
    if (i < 3) {
      app = (
        await school.update({
          actorUserId: owner,
          projectId: project.id,
          applicationId: app.applicationId,
          expectedRevision: app.revision,
          operationId: op(),
          institutionName: "Synthetic history school",
          courseTitle: "Synthetic course",
          intakeLabel: `Synthetic ${i}`,
        })
      ).application;
    }
  }
  const input = {
    actorUserId: owner,
    projectId: project.id,
    applicationId: app.applicationId,
  };
  const full = await school.get(input);
  const bounded = await school.getProjectState(input);
  assert.equal(full.packages.length, 4);
  assert.equal(bounded.packages.length, 2);
  assert.equal(bounded.packageHistoryTruncated, true);
  assert.equal(
    bounded.currentPackage?.packageId,
    full.currentPackage?.packageId
  );
  assert.equal(bounded.currentPackage?.usable, full.currentPackage?.usable);
  await assert.rejects(
    school.getProjectState({ ...input, actorUserId: outsider })
  );
  for (let i = 0; i < 40; i++) {
    const bound = await school.bindReference({
      ...input,
      expectedRevision: app.revision,
      operationId: op(),
      kind: "fact",
      referenceId: fact.id,
    });
    app = bound.application;
    const active = app.references.find(
      (reference) => reference.revokedAt === null
    );
    assert.ok(active);
    app = (
      await school.revokeReference({
        ...input,
        expectedRevision: app.revision,
        operationId: op(),
        referenceRecordId: active.referenceRecordId,
      })
    ).application;
  }
  const afterFull = await school.get(input);
  const afterBounded = await school.getProjectState(input);
  assert.equal(afterFull.references.length, 40);
  assert.equal(afterBounded.references.length, 40);
  assert.equal(afterBounded.currentPackage, null);
  assert.equal(
    afterBounded.packages[0]?.packageId,
    afterFull.packages[0]?.packageId
  );
  assert.equal(afterBounded.packages[0]?.usable, false);
  assert.deepEqual(afterBounded.missingDataCodes, afterFull.missingDataCodes);
  const final = await school.bindReference({
    ...input,
    expectedRevision: app.revision,
    operationId: op(),
    kind: "fact",
    referenceId: fact.id,
  });
  assert.equal(final.application.references.length, 41);
  await assert.rejects(school.getProjectState(input), {
    code: "limit_exceeded",
  });
  const state = await load({
    actorUserId: owner,
    actorType: "regular",
    projectId: project.id,
  });
  assert.equal(state.kind, "ok");
  if (state.kind !== "ok") {
    throw new Error("School overflow state unavailable");
  }
  assert.equal(
    state.state.capabilities.schoolApplications.reasonCode,
    "source_list_exceeds_bound"
  );
  assert.equal(state.state.matters.schoolApplications, null);
  const [counts] =
    await client`select (select count(*)::integer from "SchoolApplicationReference" where "applicationId" = ${app.applicationId}) as refs, (select count(*)::integer from "SchoolApplicationPackage" where "applicationId" = ${app.applicationId}) as packages`;
  assert.equal(counts.refs, 41);
  assert.equal(counts.packages, 4);
  process.stdout.write(
    `${JSON.stringify({ case: "A4 School history", status: "PASS", storedReferences: counts.refs, storedPackages: counts.packages, boundedReferencesBeforeOverflow: afterBounded.references.length, boundedPackageCandidates: bounded.packages.length, packageHistoryTruncated: bounded.packageHistoryTruncated, overflow: "unavailable", unauthorized: "denied" })}\n`
  );
}

async function verifyPreparationMetadata(client: ReturnType<typeof postgres>) {
  const { projectFoundationRepository: projects } = await import(
    "../lib/db/project-foundation"
  );
  const { student500Service: student } = await import(
    "../lib/student-500/runtime"
  );
  const { student500PreparationService: preparation } = await import(
    "../lib/student-500/preparation/runtime"
  );
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const owner = randomUUID();
  const op = () => `p15a4prep.${randomUUID()}`;
  await client`insert into "User" (id, email, role) values (${owner}, ${`p15a4prep.${owner.slice(0, 12)}@test.invalid`}, 'user')`;
  const project = (
    await projects.createProject({
      actorUserId: owner,
      operationId: op(),
      displayName: "P15 A4 Preparation Synthetic",
    })
  ).project;
  const application = (
    await student.create({
      actorUserId: owner,
      projectId: project.id,
      context: { entryRoute: "no_school_application" },
      operationId: op(),
    })
  ).application;
  const input = {
    actorUserId: owner,
    projectId: project.id,
    applicationId: application.applicationId,
  };
  await preparation.createDraft({ ...input, operationId: op() });
  await preparation.createSnapshot({ ...input, operationId: op() });
  const full = await preparation.get(input);
  let draftMetadata = false,
    snapshotMetadata = false,
    boundedReferences = false;
  const options = client.options as unknown as {
    debug: false | ((id: number, text: string, params: unknown[]) => void);
  };
  const prior = options.debug;
  let state: Awaited<ReturnType<typeof load>>;
  try {
    options.debug = (_id, text, params) => {
      if (
        /select\b/i.test(text) &&
        /"Student500GsDraft"/.test(text) &&
        /'\[\]'::jsonb/.test(text) &&
        params.some((x) => Number(x) === 21)
      ) {
        draftMetadata = true;
      }
      if (
        /select\b/i.test(text) &&
        /"Student500PreparationSnapshot"/.test(text) &&
        /jsonb_object_agg/.test(text) &&
        params.some((x) => Number(x) === 21)
      ) {
        snapshotMetadata = true;
      }
      if (
        /select\b/i.test(text) &&
        /"Student500FactReference"/.test(text) &&
        params.some((x) => Number(x) === 201)
      ) {
        boundedReferences = true;
      }
    };
    state = await load({
      actorUserId: owner,
      actorType: "regular",
      projectId: project.id,
    });
  } finally {
    options.debug = prior;
  }
  assert.equal(state.kind, "ok");
  if (state.kind !== "ok") {
    throw new Error("Preparation state unavailable");
  }
  const projected = state.state.matters.student500Applications?.find(
    (item) => item.applicationId === input.applicationId
  )?.preparation;
  assert.equal(projected?.state, "available");
  assert.deepEqual(
    projected?.drafts.map((item) => ({
      id: item.draftId,
      version: item.version,
      stale: item.stale,
      staleReasons: item.staleReasonCodes,
    })),
    full.drafts.map((item) => ({
      id: item.draftId,
      version: item.version,
      stale: item.stale,
      staleReasons: item.staleReasons,
    }))
  );
  assert.deepEqual(
    projected?.snapshots.map((item) => ({
      id: item.snapshotId,
      version: item.version,
      stale: item.stale,
      staleReasons: item.staleReasonCodes,
      currentness: item.legalCurrentness,
    })),
    full.snapshots.map((item) => ({
      id: item.snapshotId,
      version: item.version,
      stale: item.stale,
      staleReasons: item.staleReasons,
      currentness: item.legalCurrentness,
    }))
  );
  assert.equal(draftMetadata, true);
  assert.equal(snapshotMetadata, true);
  assert.equal(boundedReferences, true);
  process.stdout.write(
    `${JSON.stringify({ case: "A4 preparation", status: "PASS", storedDrafts: full.drafts.length, storedSnapshots: full.snapshots.length, draftMetadata, snapshotMetadata, boundedReferences, freshnessEquivalent: true })}\n`
  );
}

async function auditSchoolBounds(client: ReturnType<typeof postgres>) {
  const { schoolApplicationService: school } = await import(
    "../lib/school-applications/runtime"
  );
  const { postgresSchoolApplicationStore: store } = await import(
    "../lib/school-applications/postgres-repository"
  );
  const rows =
    await client`select a.id as app, a."projectId" as project, a."ownerUserId" as owner from "SchoolApplication" a join "User" u on u.id = a."ownerUserId" where u.email like 'p15a4school.%@test.invalid' order by a."createdAt" desc limit 1`;
  assert.equal(rows.length, 1);
  const row = rows[0];
  const full = await school.get({
    actorUserId: row.owner,
    projectId: row.project,
    applicationId: row.app,
  });
  assert.equal(full.references.length, 41);
  assert.equal(full.packages.length, 4);
  let limitedReferences = false;
  let limitedPackages = false;
  const options = client.options as unknown as {
    debug: false | ((id: number, text: string, params: unknown[]) => void);
  };
  const prior = options.debug;
  let refs: Awaited<ReturnType<typeof store.listReferences>>;
  let packages: Awaited<ReturnType<typeof store.listPackages>>;
  try {
    options.debug = (_id, text, params) => {
      if (
        /select\b/i.test(text) &&
        /"SchoolApplicationReference"/.test(text) &&
        /\blimit\s+\$\d+/i.test(text) &&
        params.some((x) => Number(x) === 41)
      ) {
        limitedReferences = true;
      }
      if (
        /select\b/i.test(text) &&
        /"SchoolApplicationPackage"/.test(text) &&
        /\blimit\s+\$\d+/i.test(text) &&
        params.some((x) => Number(x) === 3)
      ) {
        limitedPackages = true;
      }
    };
    refs = await store.listReferences({ applicationId: row.app, maxRows: 41 });
    packages = await store.listPackages({
      applicationId: row.app,
      projectStateCandidates: true,
    });
  } finally {
    options.debug = prior;
  }
  assert.equal(refs.length, 41);
  assert.equal(packages.length, 3);
  assert.equal(limitedReferences, true);
  assert.equal(limitedPackages, true);
  assert.equal(packages[0].id, full.packages[0].packageId);
  process.stdout.write(
    `${JSON.stringify({ case: "A4 School SQL bounds", status: "PASS", storedReferences: 41, returnedReferences: refs.length, storedPackages: 4, returnedPackageRows: packages.length, limitedReferences, limitedPackages })}\n`
  );
}

async function auditFactOverflow(client: ReturnType<typeof postgres>) {
  const { projectFactServices } = await import("../lib/project-facts/runtime");
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.PHASE14_PROJECT_FACTS_ENABLED, "true");
  const [row] =
    await client`select p.id as project, p."ownerUserId" as owner from "StudyJourneyProject" p join "User" u on u.id = p."ownerUserId" where u.email like 'p15a4.%@test.invalid' and p."displayName" = 'P15 A4 Fact Synthetic' order by p."createdAt" desc limit 1`;
  assert.ok(row);
  const [counts] =
    await client`select (select count(*)::integer from "ProjectFactAssertion" where "projectId" = ${row.project}) as assertions, (select count(*)::integer from "ProjectFactPublication" where "projectId" = ${row.project}) as publications, (select count(*)::integer from "ProjectFactUseGrant" where "projectId" = ${row.project}) as grants, (select count(*)::integer from "ProjectFactConflict" where "projectId" = ${row.project}) as conflicts, (select count(*)::integer from "ProjectFactAssertionEvidence" where "projectId" = ${row.project}) as evidence_links`;
  assert.equal(counts.assertions, 101);
  await assert.rejects(
    projectFactServices.facts.stableProjection({
      actorUserId: row.owner,
      projectId: row.project,
      maxSourceRows: 100,
    }),
    { code: "project_fact_source_overflow" }
  );
  const state = await load({
    actorUserId: row.owner,
    actorType: "regular",
    projectId: row.project,
  });
  assert.equal(state.kind, "ok");
  if (state.kind !== "ok") {
    throw new Error("Fact overflow read failed");
  }
  assert.equal(state.state.facts.authorizedForAI, null);
  assert.equal(
    state.state.capabilities.projectFacts.reasonCode,
    "project_fact_source_exceeds_bound"
  );
  assert.equal(
    state.state.capabilities.student500Preparation.state,
    "unavailable"
  );
  process.stdout.write(
    `${JSON.stringify({ case: "A4 Fact stored sources", status: "PASS", counts, returnedAssertionSentinel: 101, factState: "unavailable", studentPreparation: "unavailable" })}\n`
  );
}

async function verifyFactMetadataWithPreparation(
  client: ReturnType<typeof postgres>
) {
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.PHASE14_PROJECT_FACTS_ENABLED, "true");
  const { projectFoundationRepository: projects } = await import(
    "../lib/db/project-foundation"
  );
  const { projectFactServices } = await import("../lib/project-facts/runtime");
  const { student500PreparationService: preparation } = await import(
    "../lib/student-500/preparation/runtime"
  );
  const { loadProjectStateForActor: load } = await import(
    "../lib/workspace/project-state-server"
  );
  const [row] =
    await client`select a.id as app, p.id as project, p."ownerUserId" as owner from "StudyJourneyProject" p join "User" u on u.id = p."ownerUserId" join "Student500Application" a on a."projectId" = p.id where u.email like 'p15a4prep.%@test.invalid' and p."displayName" = 'P15 A4 Preparation Synthetic' order by p."createdAt" desc limit 1`;
  assert.ok(row);
  const op = () => `p15a4meta.${randomUUID()}`;
  const revision = async () =>
    (
      await projects.authorizeProjectRead({
        actorUserId: row.owner,
        projectId: row.project,
      })
    ).revision;
  const fact = await projectFactServices.facts.propose({
    actorUserId: row.owner,
    projectId: row.project,
    operationId: op(),
    expectedProjectRevision: await revision(),
    key: "synthetic.metadata_test",
    valueType: "string",
    value: "a4_sensitive_synthetic",
    originKind: "customer_stated",
  });
  const confirmed = await projectFactServices.facts.confirm({
    actorUserId: row.owner,
    projectId: row.project,
    assertionId: fact.id,
    assertionVersion: fact.version,
    expectedProjectRevision: await revision(),
    operationId: op(),
  });
  await projectFactServices.facts.publish({
    actorUserId: row.owner,
    projectId: row.project,
    assertionId: fact.id,
    assertionVersion: confirmed.version,
    expectedProjectRevision: await revision(),
    operationId: op(),
    audience: "project",
  });
  await projectFactServices.facts.grantAIUse({
    actorUserId: row.owner,
    projectId: row.project,
    assertionId: fact.id,
    assertionVersion: confirmed.version,
    expectedProjectRevision: await revision(),
    operationId: op(),
    audience: "project",
  });
  await preparation.selectFact({
    actorUserId: row.owner,
    projectId: row.project,
    applicationId: row.app,
    factAssertionId: fact.id,
    factVersion: confirmed.version,
    operationId: op(),
  });
  const full = await preparation.get({
    actorUserId: row.owner,
    projectId: row.project,
    applicationId: row.app,
  });
  let metadataQueries = 0;
  let rawQueries = 0;
  const options = client.options as unknown as {
    debug: false | ((id: number, text: string, params: unknown[]) => void);
  };
  const previous = options.debug;
  let state: Awaited<ReturnType<typeof load>>;
  try {
    options.debug = (_id, text, params) => {
      if (
        /select\b/i.test(text) &&
        /"ProjectFactAssertion"/.test(text) &&
        /\blimit\s+\$\d+/i.test(text) &&
        params.some((x) => Number(x) === 101)
      ) {
        if (/'null'::json/.test(text)) {
          metadataQueries++;
        } else {
          rawQueries++;
        }
      }
    };
    state = await load({
      actorUserId: row.owner,
      actorType: "regular",
      projectId: row.project,
    });
  } finally {
    options.debug = previous;
  }
  assert.equal(state.kind, "ok");
  if (state.kind !== "ok") {
    throw new Error("Metadata state unavailable");
  }
  assert.ok(
    state.state.facts.authorizedForAI?.some(
      (item) => item.assertionId === fact.id
    )
  );
  assert.equal(
    JSON.stringify(state.state).includes("a4_sensitive_synthetic"),
    false
  );
  const projected = state.state.matters.student500Applications?.find(
    (item) => item.applicationId === row.app
  )?.preparation;
  assert.deepEqual(
    projected?.drafts.map((item) => ({
      id: item.draftId,
      stale: item.stale,
      reasons: item.staleReasonCodes,
    })),
    full.drafts.map((item) => ({
      id: item.draftId,
      stale: item.stale,
      reasons: item.staleReasons,
    }))
  );
  assert.deepEqual(
    projected?.snapshots.map((item) => ({
      id: item.snapshotId,
      stale: item.stale,
      reasons: item.staleReasonCodes,
      currentness: item.legalCurrentness,
    })),
    full.snapshots.map((item) => ({
      id: item.snapshotId,
      stale: item.stale,
      reasons: item.staleReasons,
      currentness: item.legalCurrentness,
    }))
  );
  assert.ok(metadataQueries >= 2);
  assert.equal(rawQueries, 0);
  process.stdout.write(
    `${JSON.stringify({ case: "A4 Fact metadata", status: "PASS", metadataQueries, rawQueries, stateNoRawValues: true, draftSnapshotFreshnessEquivalent: true })}\n`
  );
}

async function verifyAdmissionsMetadata(client: ReturnType<typeof postgres>) {
  const { schoolAdmissionsService: admissions } = await import(
    "../lib/school-admissions/runtime"
  );
  const [row] =
    await client`select p.id as project, p."ownerUserId" as owner from "StudyJourneyProject" p join "User" u on u.id = p."ownerUserId" where u.email like 'p15a4prep.%@test.invalid' and p."displayName" = 'P15 A4 Preparation Synthetic' order by p."createdAt" desc limit 1`;
  assert.ok(row);
  const op = () => `p15a4admit.${randomUUID()}`;
  const created = await admissions.createCase({
    actorUserId: row.owner,
    projectId: row.project,
    originKind: "existing_offer",
    institutionName: "Synthetic provider",
    courseTitle: "Synthetic course",
    operationId: op(),
  });
  const prepared = await admissions.prepare({
    actorUserId: row.owner,
    projectId: row.project,
    caseId: created.case.caseId,
    expectedRevision: created.case.revision,
    operationId: op(),
  });
  const full = (
    await admissions.get({
      actorUserId: row.owner,
      projectId: row.project,
      caseId: prepared.case.caseId,
    })
  ).case;
  let metadataQuery = false;
  const options = client.options as unknown as {
    debug: false | ((id: number, text: string, params: unknown[]) => void);
  };
  const previous = options.debug;
  let bounded: Awaited<ReturnType<typeof admissions.getProjectStateCase>>;
  try {
    options.debug = (_id, text, params) => {
      if (
        /select\b/i.test(text) &&
        /"SchoolAdmissionPreparation"/.test(text) &&
        /'\[\]'::jsonb/.test(text) &&
        params.some((x) => Number(x) === 25)
      ) {
        metadataQuery = true;
      }
    };
    bounded = await admissions.getProjectStateCase({
      actorUserId: row.owner,
      projectId: row.project,
      caseId: prepared.case.caseId,
      applicationDataAvailable: true,
    });
  } finally {
    options.debug = previous;
  }
  assert.ok(full.preparation?.sections.length);
  assert.equal(bounded.case.preparationContentOmitted, true);
  assert.deepEqual(bounded.case.preparation?.sections, []);
  assert.equal(bounded.case.preparationStale, full.preparationStale);
  assert.deepEqual(bounded.case.staleReasonCodes, full.staleReasonCodes);
  assert.deepEqual(bounded.case.requirements, full.requirements);
  assert.equal(metadataQuery, true);
  process.stdout.write(
    `${JSON.stringify({ case: "A4 Admissions metadata", status: "PASS", storedPreparations: full.preparationHistory.length, returnedPreparations: bounded.case.preparationHistory.length, metadataQuery, freshnessEquivalent: true })}\n`
  );
}

async function run() {
  let runtimeClose: (() => Promise<void>) | undefined;
  try {
    let verifiedClient = sql;
    if (process.argv.includes("--runtime-probe")) {
      assert.equal(
        process.env.POSTGRES_URL,
        "postgres:///immigration_ai_phase15_m1_test"
      );
      assert.equal(
        process.env.PGHOST,
        "/home/rico/.local/state/immigration-ai/phase15-m1-socket"
      );
      assert.equal(process.env.PGPORT, "55432");
      assert.equal(process.env.PGUSER, "phase15_m1_runner");
      assert.equal(process.env.DATABASE_URL, undefined);
      for (const key of Object.keys(process.env)) {
        if (
          key.startsWith("PG") &&
          !["PGHOST", "PGPORT", "PGUSER"].includes(key)
        ) {
          throw new Error(`Unexpected database environment key ${key}`);
        }
      }
      if (process.argv.includes("--foundation")) {
        throw new Error("Incompatible modes");
      }
      const expectedPath =
        "/home/rico/.local/state/immigration-ai/phase15-m1-socket/.s.PGSQL.55432";
      const probe = postgres(process.env.POSTGRES_URL);
      assert.equal(probe.options.path, expectedPath);
      assert.equal(probe.options.database, "immigration_ai_phase15_m1_test");
      assert.equal(probe.options.user, "phase15_m1_runner");
      await probe.end();
      // This isolated Node server harness uses the marker package's empty
      // server entry without selecting the incompatible React server build.
      // Production module resolution and authentication remain untouched.
      type ResolutionContext = Record<string, unknown>;
      type Resolution = { url: string; shortCircuit?: boolean };
      type NextResolve = (
        specifier: string,
        context: ResolutionContext
      ) => Resolution;
      const { registerHooks } = (await import("node:module")) as unknown as {
        registerHooks: (hooks: {
          resolve: (
            specifier: string,
            context: ResolutionContext,
            nextResolve: NextResolve
          ) => Resolution;
        }) => unknown;
      };
      registerHooks({
        resolve(specifier, context, nextResolve) {
          if (specifier === "server-only") {
            return {
              url: pathToFileURL(resolve("node_modules/server-only/empty.js"))
                .href,
              shortCircuit: true,
            };
          }
          return nextResolve(specifier, context);
        },
      });
      const runtime = await import("../lib/db/runtime-client");
      const database = runtime.getLazyDatabase();
      // The lazy proxy binds function-valued properties, so use the Drizzle
      // session to inspect the actual unbound client before any query.
      const client = (
        database as unknown as {
          _: { session: { client: ReturnType<typeof postgres> } };
        }
      )._.session.client;
      assert.equal(client.options.path, expectedPath);
      assert.equal(client.options.database, "immigration_ai_phase15_m1_test");
      assert.equal(client.options.user, "phase15_m1_runner");
      verifiedClient = client;
      runtimeClose = runtime.closeLazyDatabase;
      process.stdout.write(
        "Runtime client socket path verified before query.\n"
      );
    }
    await main(verifiedClient);
    if (
      (process.argv.includes("--a2-write") ||
        process.argv.includes("--a2-read")) &&
      !process.argv.includes("--runtime-probe")
    ) {
      throw new Error("Runtime guard required");
    }
    if (process.argv.includes("--a2-diagnose")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      const [counts] = await verifiedClient`select
        (select count(*)::integer from "User" where email like 'p15a2.%@test.invalid') as users,
        (select count(*)::integer from "StudyJourneyProject" p join "User" u on u.id = p."ownerUserId" where u.email like 'p15a2.%@test.invalid') as projects,
        (select count(*)::integer from "SchoolApplication" a join "User" u on u.id = a."ownerUserId" where u.email like 'p15a2.%@test.invalid') as schools,
        (select count(*)::integer from "SchoolApplicationPackage" p join "SchoolApplication" a on a.id = p."applicationId" join "User" u on u.id = a."ownerUserId" where u.email like 'p15a2.%@test.invalid') as packages,
        (select count(*)::integer from "SchoolAdmissionCase" c join "User" u on u.id = c."ownerUserId" where u.email like 'p15a2.%@test.invalid') as cases,
        (select count(*)::integer from "Student500Application" a join "User" u on u.id = a."ownerUserId" where u.email like 'p15a2.%@test.invalid') as visas`;
      const rows =
        await verifiedClient`select a.status, a.revision, count(e.id)::integer as event_count, count(p.id)::integer as package_join_count from "SchoolApplication" a join "User" u on u.id = a."ownerUserId" left join "SchoolApplicationEvent" e on e."applicationId" = a.id left join "SchoolApplicationPackage" p on p."applicationId" = a.id where u.email like 'p15a2.%@test.invalid' group by a.id order by a.revision`;
      process.stdout.write(
        `${JSON.stringify({ diagnostic: counts, schoolStates: rows })}\n`
      );
    }
    if (process.argv.includes("--a2-write")) {
      await createAcceptanceFixtures(verifiedClient);
    }
    if (process.argv.includes("--a2-read")) {
      await readAcceptanceFixtures(verifiedClient);
    }
    if (process.argv.includes("--a4-admissions")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await verifyAdmissionsMetadata(verifiedClient);
    }
    if (process.argv.includes("--a4-fact-metadata")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await verifyFactMetadataWithPreparation(verifiedClient);
    }
    if (process.argv.includes("--a4-school-audit")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await auditSchoolBounds(verifiedClient);
    }
    if (process.argv.includes("--a4-fact-audit")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await auditFactOverflow(verifiedClient);
    }
    if (process.argv.includes("--a4-prep")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await verifyPreparationMetadata(verifiedClient);
    }
    if (process.argv.includes("--a4-school")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await verifySchoolHistoryBounds(verifiedClient);
    }
    if (process.argv.includes("--a4-facts")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await verifyBoundedFactProjection(verifiedClient);
    }
    if (process.argv.includes("--a3-profile")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await profileReadAttribution(verifiedClient);
    }
    if (process.argv.includes("--a3-auth")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await verifyStateSourceAuthorization(verifiedClient);
    }
    if (process.argv.includes("--a3-lifecycle")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await verifyClosedState();
    }
    if (process.argv.includes("--a3-read")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await verifyBoundedReads(verifiedClient);
    }
    if (process.argv.includes("--a2-managed-read")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await verifyManagedAuthority(verifiedClient);
    }
    if (process.argv.includes("--a2-student-verify")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await verifyStudentPreparation(verifiedClient);
    }
    if (process.argv.includes("--a2-student-prep")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await checkStudentPreparation(verifiedClient);
    }
    if (process.argv.includes("--a2-case-target")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await checkAdmissionsTarget(verifiedClient);
    }
    if (process.argv.includes("--a2-targets")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await inspectPerformanceTargets(verifiedClient);
    }
    if (process.argv.includes("--a2-perf")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await measurePerformance(verifiedClient);
    }
    if (process.argv.includes("--a2-authorize")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      await checkAuthorization(verifiedClient);
    }
    if (process.argv.includes("--loader-smoke")) {
      if (!process.argv.includes("--runtime-probe")) {
        throw new Error("Runtime guard required");
      }
      const { loadProjectStateForActor } = await import(
        "../lib/workspace/project-state-server"
      );
      const result = await loadProjectStateForActor({
        actorUserId: "00000000-0000-4000-8000-000000000001",
        projectId: "00000000-0000-4000-8000-000000000002",
        actorType: "regular",
      });
      assert.equal(result.kind, "not_found");
      process.stdout.write("Guarded real loader missing-project check PASS.\n");
    }
  } catch (error) {
    process.stderr.write(
      `Acceptance guard or foundation check failed: ${error instanceof Error ? error.message : "unknown error"}\n`
    );
    const location =
      error instanceof Error
        ? error.stack?.match(/phase15-m1-postgres-acceptance\.ts:\d+:\d+/)?.[0]
        : undefined;
    if (location) {
      process.stderr.write(`Failure location: ${location}\n`);
    }
    process.exitCode = 1;
  } finally {
    await runtimeClose?.();
    await sql.end();
  }
}
run();
