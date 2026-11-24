import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COURSE_VERIFICATION_ATTESTATION_TTL_MS,
  issueCourseVerificationAttestation,
  verifyCourseVerificationAttestation,
} from "./course-verification-attestation";

const secret = "synthetic-course-verification-secret";
const value = {
  actorUserId: "owner-1",
  projectId: "11111111-1111-4111-8111-111111111111",
  chatId: "22222222-2222-4222-8222-222222222222",
  assistantMessageId: "33333333-3333-4333-8333-333333333333",
  candidateId: "44444444-4444-4444-8444-444444444444",
  fieldKey: "course_code" as const,
  value: "EX-2027",
  sourceId: "55555555-5555-4555-8555-555555555555",
  requestedSourceId: "66666666-6666-4666-8666-666666666666",
  sourceUrl: "https://courses.example.edu.au/course",
  sourceTitle: "Example course page",
  manifestId: "reviewed-course-page-v1",
  observedAt: "2026-11-24T00:00:00.000Z",
  snapshotSha256: "a".repeat(64),
  locator: "jsonld:Course.courseCode",
};

test("verification attestation is short-lived and bound to the actor and exact course field", () => {
  const now = 1_795_478_400_000;
  const token = issueCourseVerificationAttestation({ value, secret, now });
  const verified = verifyCourseVerificationAttestation({
    token,
    secret,
    actorUserId: "owner-1",
    now: now + 1,
  });
  assert.ok(verified);
  assert.equal(verified.projectId, value.projectId);
  assert.equal(verified.chatId, value.chatId);
  assert.equal(verified.assistantMessageId, value.assistantMessageId);
  assert.equal(verified.candidateId, value.candidateId);
  assert.equal(verified.fieldKey, value.fieldKey);
  assert.equal(verified.requestedSourceId, value.requestedSourceId);
  assert.equal(
    verified.expiresAt,
    now + COURSE_VERIFICATION_ATTESTATION_TTL_MS
  );
  assert.equal(
    verifyCourseVerificationAttestation({
      token,
      secret,
      actorUserId: "another-owner",
      now: now + 1,
    }),
    null
  );
  assert.equal(
    verifyCourseVerificationAttestation({
      token,
      secret,
      actorUserId: "owner-1",
      now: now + COURSE_VERIFICATION_ATTESTATION_TTL_MS,
    }),
    null
  );
  assert.equal(
    verifyCourseVerificationAttestation({
      token: `${token.slice(0, -1)}x`,
      secret,
      actorUserId: "owner-1",
      now: now + 1,
    }),
    null
  );
});
