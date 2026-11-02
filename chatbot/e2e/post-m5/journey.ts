/**
 * Phase 13 Post-M5 E2E — shared real-HTTP business journey helpers.
 */
import assert from "node:assert/strict";
import { applicationOf, caseOf, SchoolApi } from "./api";
import type { ScenarioContext } from "./scenario";
import type { CatalogTarget, FixtureGraph } from "./seed";

export type Target = CatalogTarget & {
  institutionName: string;
  courseTitle: string;
  intakeLabel: string;
};

export const NORTHBRIDGE_IT: Target = {
  courseId: "nb-master-it",
  courseTitle: "Master of Information Technology",
  institutionId: "northbridge-university",
  institutionName: "Northbridge University",
  intakeId: "nb-it-2027-s1",
  intakeLabel: "Semester 1 · 2027",
};

export const NORTHBRIDGE_DS: Target = {
  courseId: "nb-master-ds",
  courseTitle: "Master of Data Science",
  institutionId: "northbridge-university",
  institutionName: "Northbridge University",
  intakeId: "nb-ds-2027-s1",
  intakeLabel: "Semester 1 · 2027",
};

export const RIVERSIDE_BUSINESS: Target = {
  courseId: "rs-diploma-business",
  courseTitle: "Diploma of Business",
  institutionId: "riverside-college",
  institutionName: "Riverside College",
  intakeId: "rs-bus-2027-s2",
  intakeLabel: "Semester 2 · 2027",
};

export async function createApplication(api: SchoolApi, target: Target) {
  const response = await api.createApplication(target);
  assert.equal(response.status, 201, `create application failed: ${response.text.slice(0, 200)}`);
  return applicationOf(response.json).applicationId;
}

export async function packageApplication(
  api: SchoolApi,
  graph: FixtureGraph,
  ctx: ScenarioContext,
  options: { applicationId?: string; target?: Target } = {}
) {
  const applicationId =
    options.applicationId ?? (await createApplication(api, options.target ?? NORTHBRIDGE_IT));
  let view = applicationOf((await api.getApplication(applicationId)).json);

  const fact = await api.bindReference({
    applicationId,
    expectedRevision: view.revision,
    kind: "fact",
    referenceId: graph.facts.english!,
  });
  assert.equal(fact.status, 200, `bind fact: ${fact.text.slice(0, 200)}`);

  // NOTE: a *clean* M2 document requires the full scan-run + ProjectOperation +
  // ProjectEvent audit chain. That chain is produced by the real scan worker,
  // which this campaign does not run (no providers). The positive journey
  // therefore uses an authorized fact reference, and document evidence is
  // exercised on the refusal path in E2E-04 instead of fabricating audit rows.
  ctx.note("document-backed positive evidence not constructed: M2 scan audit chain requires the real scan worker");

  view = applicationOf((await api.getApplication(applicationId)).json);
  const built = await api.buildPackage({ applicationId, expectedRevision: view.revision });
  assert.equal(built.status, 200, `build package: ${built.text.slice(0, 200)}`);
  const packaged = applicationOf(built.json);
  ctx.cite(`http package v${packaged.currentPackage?.version} ${packaged.currentPackage?.packageId}`);
  return { applicationId, packaged };
}

export async function prepareAndConfirm(
  api: SchoolApi,
  caseId: string,
  expectedRevision: number
) {
  const prepared = await api.prepare({ caseId, expectedRevision });
  assert.equal(prepared.status, 200, `prepare: ${prepared.text.slice(0, 240)}`);
  const preparedCase = caseOf(prepared.json);
  const confirmed = await api.confirmPreparation({
    caseId,
    expectedRevision: preparedCase.revision,
    preparationId: preparedCase.preparation?.preparationId as string,
  });
  assert.equal(confirmed.status, 200, `confirm: ${confirmed.text.slice(0, 240)}`);
  return { confirmedCase: caseOf(confirmed.json), preparedCase };
}

/**
 * Performs the M2 material-change operation the way the governing schema models
 * it: a successor assertion is recorded and the predecessor is marked stale, so
 * the reference fingerprint of the bound assertion genuinely changes.
 */
export async function supersedeFact(
  projectId: string,
  createdByUserId: string,
  assertionId: string
): Promise<string> {
  const { createHash, randomUUID } = await import("node:crypto");
  const { db } = await import("./env");
  const successorId = randomUUID();
  const key = `superseding-${successorId}`;
  const normalized = createHash("sha256").update(key).digest("hex");
  const sql = db();
  await sql`
    insert into "ProjectFactAssertion"
      (id, "projectId", key, "valueType", value, "normalizedComparison",
       "originKind", state, "createdByUserId", "supersedesAssertionId", version, stale)
    values (${successorId}, ${projectId}, ${key}, 'string', ${sql.json({ text: key })},
            ${normalized}, 'customer_stated', 'customer_confirmed', ${createdByUserId},
            ${assertionId}, 2, false)
  `;
  await sql`update "ProjectFactAssertion" set stale = true where id = ${assertionId}`;
  return successorId;
}
