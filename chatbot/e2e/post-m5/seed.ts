/**
 * Phase 13 Post-M5 E2E — synthetic fixture seeding.
 *
 * Writes only to the disposable acceptance database. Every identity is
 * synthetic; no customer, staff, institution or provider record is real.
 */
import { createHash, randomUUID } from "node:crypto";
import { hash } from "bcrypt-ts";
import { assertDisposableTarget, EXPECTED_ENVIRONMENT_ID, db } from "./env";

// Deterministic for this disposable environment only, so separate campaign
// processes can authenticate the same synthetic users. Never printed.
export const SYNTHETIC_PASSWORD = `E2e-${createHash("sha256")
  .update(`${EXPECTED_ENVIRONMENT_ID}:synthetic`)
  .digest("hex")
  .slice(0, 24)}`;

export type SyntheticActor = {
  readonly id: string;
  readonly email: string;
  readonly role: "user" | "admin" | "lawyer";
  readonly password: string;
};

export type CatalogTarget = {
  readonly institutionId: string;
  readonly courseId: string;
  readonly intakeId: string;
};

export type FixtureGraph = {
  readonly actors: Record<string, SyntheticActor>;
  readonly projects: Record<string, string>;
  readonly facts: Record<string, string>;
  readonly documents: Record<string, string>;
  readonly revokedDocument: string;
  readonly foreignDocument: string;
  readonly crossUploaderDocument: string;
  readonly catalog: {
    readonly northbridgeIt: CatalogTarget;
    readonly northbridgeDataScience: CatalogTarget;
    readonly riversideBusiness: CatalogTarget;
  };
};

type Sql = ReturnType<typeof db>;



async function createActor(
  sql: Sql,
  key: string,
  role: SyntheticActor["role"]
): Promise<SyntheticActor> {
  const id = randomUUID();
  const email = `${key}-${EXPECTED_ENVIRONMENT_ID}@e2e.invalid`;
  const [existing] = await sql`select id from "User" where lower(trim(email)) = ${email}`;
  if (existing) {
    return { email, id: (existing as { id: string }).id, password: SYNTHETIC_PASSWORD, role };
  }
  const password = await hash(SYNTHETIC_PASSWORD, 10);
  await sql`
    insert into "User" (id, email, password, "emailVerifiedAt", "authVersion", role)
    values (${id}, ${email}, ${password}, ${new Date()}, 1, ${role})
  `;
  return { id, email, role, password: SYNTHETIC_PASSWORD };
}

async function createProject(sql: Sql, ownerId: string): Promise<string> {
  const [row] = await sql`
    insert into "StudyJourneyProject" ("ownerUserId", status, revision)
    values (${ownerId}, 'active', 1)
    returning id
  `;
  return (row as { id: string }).id;
}

async function createFact(
  sql: Sql,
  projectId: string,
  createdByUserId: string,
  key: string
): Promise<string> {
  const id = randomUUID();
  const normalized = createHash("sha256").update(key).digest("hex");
  await sql`
    insert into "ProjectFactAssertion"
      (id, "projectId", key, "valueType", value, "normalizedComparison",
       "originKind", state, "createdByUserId", version, stale)
    values (${id}, ${projectId}, ${key}, 'string', ${sql.json({ text: key })},
            ${normalized}, 'customer_stated', 'customer_confirmed', ${createdByUserId}, 1, false)
  `;
  return id;
}


async function createDocument(
  sql: Sql,
  projectId: string,
  uploadedByUserId: string,
  label: string,
  options: { security?: "clean" | "rejected" | "pending"; lifecycle?: string } = {}
): Promise<string> {
  const assetId = randomUUID();
  const versionId = randomUUID();
  const sha = createHash("sha256").update(label + versionId).digest("hex");
  await sql`
    insert into "ProjectDocumentAsset" (id, "projectId", "createdByUserId", lifecycle)
    values (${assetId}, ${projectId}, ${uploadedByUserId}, ${options.lifecycle ?? "active"})
  `;
  await sql`
    insert into "ProjectDocumentVersion"
      ("projectId", "assetId", "versionId", "versionNumber", "storageKey", sha256,
       "byteSize", "canonicalMime", "originKind", "uploadedByUserId",
       "storageStatus", "securityStatus", "processingGeneration")
    values (${projectId}, ${assetId}, ${versionId}, 1, ${`e2e/${assetId}/v1`},
            ${sha}, 1024, 'application/pdf', 'direct_upload', ${uploadedByUserId},
            'pending', 'pending', 1)
  `;
  await sql`
    update "ProjectDocumentVersion"
    set "storageStatus" = 'stored',
        "storageObjectVersionId" = ${`synthetic-object-${assetId}`},
        "storageVerifiedAt" = now()
    where "versionId" = ${versionId}
  `;

  const security = options.security ?? "clean";
  if (security !== "pending") {
    // Reproduce the real M2 scan-provenance chain before the terminal state.
    const runId = randomUUID();
    await sql`
      insert into "ProjectDocumentProcessingRun"
        (id, "projectId", "versionId", generation, "operationKind", "providerCode",
         "initiatedByUserId", "servicePrincipalCode", "objectSha256", "eventFingerprint",
         status)
      values (${runId}, ${projectId}, ${versionId}, 1, 'scan', 'synthetic_scan_provider',
              null, 'project_document_scan_worker', ${sha},
              ${createHash("sha256").update('fp-' + versionId).digest("hex")}, 'started')
    `;
    await sql`
      update "ProjectDocumentProcessingRun"
      set status = 'completed', verdict = ${security}, "completedAt" = now()
      where id = ${runId}
    `;
    await sql`
      update "ProjectDocumentVersion"
      set "securityStatus" = ${security}
      where "versionId" = ${versionId}
    `;
  }
  return assetId;
}

async function seedCatalog(sql: Sql): Promise<void> {
  const providers = [
    ["northbridge-university", "Northbridge University"],
    ["riverside-college", "Riverside College"],
  ] as const;
  for (const [providerId, displayName] of providers) {
    await sql`
      insert into "EducationProvider" ("providerId", "recordClass", "displayName")
      values (${providerId}, 'UNVERIFIED', ${displayName})
      on conflict do nothing
    `;
  }
  const courses = [
    ["nb-master-it", "northbridge-university", "Master of Information Technology"],
    ["nb-master-ds", "northbridge-university", "Master of Data Science"],
    ["rs-diploma-business", "riverside-college", "Diploma of Business"],
  ] as const;
  for (const [courseId, providerId, title] of courses) {
    await sql`
      insert into "EducationCourse" ("courseId", "providerId", "recordClass", title)
      values (${courseId}, ${providerId}, 'UNVERIFIED', ${title})
      on conflict do nothing
    `;
  }
  const deliveries = [
    ["nb-it-delivery", "nb-master-it", "northbridge-university", "Northbridge City Campus"],
    ["nb-ds-delivery", "nb-master-ds", "northbridge-university", "Northbridge City Campus"],
    ["rs-bus-delivery", "rs-diploma-business", "riverside-college", "Riverside Campus"],
  ] as const;
  for (const [deliveryId, courseId, providerId, campusName] of deliveries) {
    await sql`
      insert into "EducationDelivery" ("deliveryId", "courseId", "providerId", "recordClass", "campusName", city, state, mode)
      values (${deliveryId}, ${courseId}, ${providerId}, 'UNVERIFIED', ${campusName}, 'Sydney', 'NSW', 'On campus')
      on conflict do nothing
    `;
  }
  const intakes = [
    ["nb-it-2027-s1", "northbridge-university", "nb-it-delivery", "S1-2027", "Semester 1", 2027, "2027-02-22"],
    ["nb-ds-2027-s1", "northbridge-university", "nb-ds-delivery", "S1-2027", "Semester 1", 2027, "2027-02-22"],
    ["rs-bus-2027-s2", "riverside-college", "rs-bus-delivery", "S2-2027", "Semester 2", 2027, "2027-07-19"],
  ] as const;
  for (const [intakeId, providerId, deliveryId, code, term, year, startDate] of intakes) {
    await sql`
      insert into "EducationIntake"
        ("intakeId", "deliveryId", "providerId", "recordClass", "intakeCode", term, year, "startDate")
      values (${intakeId}, ${deliveryId}, ${providerId}, 'UNVERIFIED', ${code}, ${term}, ${year}, ${startDate})
      on conflict do nothing
    `;
  }
}


export async function seedFixtureGraph(): Promise<FixtureGraph> {
  assertDisposableTarget();
  const sql = db();

  const actors: Record<string, SyntheticActor> = {
    customerA: await createActor(sql, "customer-a", "user"),
    customerB: await createActor(sql, "customer-b", "user"),
    memberA: await createActor(sql, "member-a", "user"),
    staffS: await createActor(sql, "staff-s", "admin"),
  };

  const projects: Record<string, string> = {
    A: await createProject(sql, actors.customerA.id),
    B: await createProject(sql, actors.customerB.id),
    closed: await createProject(sql, actors.customerA.id),
  };

  await sql`
    insert into "ProjectMembership"
      ("projectId", "userId", status, "invitedByUserId", "acceptedAt")
    values (${projects.A}, ${actors.memberA.id}, 'active', ${actors.customerA.id}, ${new Date()})
  `;

  const facts: Record<string, string> = {
    english: await createFact(sql, projects.A, actors.customerA.id, "english_test_result"),
    finance: await createFact(sql, projects.A, actors.customerA.id, "finance_capacity"),
    foreign: await createFact(sql, projects.B, actors.customerB.id, "english_test_result"),
  };

  const documents: Record<string, string> = {
    passport: await createDocument(sql, projects.A, actors.customerA.id, "a"),
    transcript: await createDocument(sql, projects.A, actors.customerA.id, "b"),
    pendingSecurity: await createDocument(sql, projects.A, actors.customerA.id, "c", {
      security: "pending",
    }),
  };
  const revokedDocument = await createDocument(sql, projects.A, actors.customerA.id, "d", {
    lifecycle: "deleted",
  });
  const foreignDocument = await createDocument(sql, projects.B, actors.customerB.id, "e");
  const crossUploaderDocument = await createDocument(sql, projects.A, actors.staffS.id, "f");

  await seedCatalog(sql);

  return {
    actors,
    projects,
    facts,
    documents,
    revokedDocument,
    foreignDocument,
    crossUploaderDocument,
    catalog: {
      northbridgeIt: {
        institutionId: "northbridge-university",
        courseId: "nb-master-it",
        intakeId: "nb-it-2027-s1",
      },
      northbridgeDataScience: {
        institutionId: "northbridge-university",
        courseId: "nb-master-ds",
        intakeId: "nb-ds-2027-s1",
      },
      riversideBusiness: {
        institutionId: "riverside-college",
        courseId: "rs-diploma-business",
        intakeId: "rs-bus-2027-s2",
      },
    },
  };
}

export async function createExtraProject(ownerId: string): Promise<string> {
  assertDisposableTarget();
  return createProject(db(), ownerId);
}
