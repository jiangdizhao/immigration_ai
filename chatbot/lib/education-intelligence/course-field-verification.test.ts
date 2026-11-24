import assert from "node:assert/strict";
import test from "node:test";
import type {
  AcquisitionPorts,
  AcquisitionTransportResponse,
} from "./acquisition-core";
import { createAcquisitionManifest } from "./acquisition-fixtures";
import {
  type VerifiableCourseField,
  verifyCourseFieldFromManifest,
} from "./course-field-verification";
import { pinnedLookup } from "./pinned-https-transport";

const html = (
  overrides: { title?: string; institution?: string; code?: string } = {}
) => {
  const course = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: overrides.title ?? "Master of Example Studies",
    provider: {
      "@type": "CollegeOrUniversity",
      name: overrides.institution ?? "Example University",
    },
    courseCode: overrides.code ?? "EX-2027",
    educationalCredentialAwarded: "Master's degree",
  };
  return `<html><script type="application/ld+json">${JSON.stringify(course)}</script></html>`;
};

function ports(body: string): AcquisitionPorts {
  const bytes = new TextEncoder().encode(body);
  const response: AcquisitionTransportResponse = {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-length": String(bytes.byteLength),
    },
    connectedAddress: "93.184.216.34",
    body: (async function* () {
      await Promise.resolve();
      yield bytes;
    })(),
  };
  return {
    resolver: { resolve: async () => ["93.184.216.34"] },
    transport: {
      capabilities: {
        pinsResolvedAddress: true,
        validatesTlsHostname: true,
        followsRedirects: false,
        automaticDecompression: false,
      },
      request: async () => response,
    },
  };
}

function verify(input: {
  body?: string;
  field?: VerifiableCourseField;
  expected?: string;
  manifest?: ReturnType<typeof createAcquisitionManifest>;
}) {
  return verifyCourseFieldFromManifest({
    manifest: input.manifest ?? createAcquisitionManifest("INSTITUTION"),
    identity: {
      institutionName: "Example University",
      courseTitle: "Master of Example Studies",
    },
    field: input.field ?? "course_code",
    expectedValue: input.expected ?? "EX-2027",
    attemptedAt: "2026-11-24T00:00:00.000Z",
    ports: ports(input.body ?? html()),
  });
}

test("approved manifest and exact JSON-LD course identity produce one ephemeral L3 field observation", async () => {
  const result = await verify({});
  assert.equal(result.attempt.outcome, "CAPTURED");
  assert.equal(result.field?.key, "course_code");
  assert.equal(result.field?.value, "EX-2027");
  assert.match(result.field?.snapshotSha256 ?? "", /^[a-f0-9]{64}$/u);
  assert.equal(result.field?.effectiveFrom, null);
  assert.equal(result.field?.effectiveTo, null);
  assert.equal(result.field?.manifestId, "proposal-institution");
});

test("wrong course, wrong institution and ambiguous identity stay unverified", async () => {
  assert.equal(
    (await verify({ body: html({ title: "Different Course" }) })).field,
    null
  );
  assert.equal(
    (await verify({ body: html({ institution: "Different University" }) }))
      .field,
    null
  );
  const ambiguous = `${html()}${html()}`;
  assert.equal((await verify({ body: ambiguous })).field, null);
});

test("exact qualification and campus observations are supported only from structured identity-matched data", async () => {
  const qualification = await verify({
    field: "qualification",
    expected: "Master's degree",
  });
  assert.equal(qualification.field?.value, "Master's degree");
  const campusPage = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Course",
    name: "Master of Example Studies",
    provider: { name: "Example University" },
    hasCourseInstance: { location: { name: "Sydney Campus" } },
  })}</script>`;
  const campus = await verify({
    body: campusPage,
    field: "campus_location",
    expected: "Sydney Campus",
  });
  assert.equal(campus.field?.value, "Sydney Campus");
});

test("unapproved and synthetic manifests do not create L3", async () => {
  const unapproved = createAcquisitionManifest("INSTITUTION", {
    reviewState: "PROPOSED",
  });
  assert.equal((await verify({ manifest: unapproved })).field, null);
  const synthetic = createAcquisitionManifest("INSTITUTION", {
    syntheticFixture: true,
  });
  assert.equal((await verify({ manifest: synthetic })).field, null);
});

test("pinned lookup uses only supplied addresses and rejects another hostname", () => {
  const resolvePinned = pinnedLookup("catalog.example.edu", ["93.184.216.34"]);
  let output: unknown[] = [];
  resolvePinned("catalog.example.edu", {}, (...args: unknown[]) => {
    output = args;
  });
  assert.deepEqual(output, [null, "93.184.216.34", 4]);
  resolvePinned("attacker.example", {}, (...args: unknown[]) => {
    output = args;
  });
  assert.equal(
    (output[0] as unknown as NodeJS.ErrnoException).code,
    "EDNSMISMATCH"
  );
});
