import assert from "node:assert/strict";
import test from "node:test";

import { getSafeEmailErrorMetadata } from "./email-errors";
import {
  buildConsultationNotificationEmail,
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
  buildSesEmailRequest,
  buildVerificationEmail,
} from "./email-templates";

process.env.APP_BASE_URL = "https://app.example.test";
process.env.EMAIL_FROM_ADDRESS = "no-reply@example.test";
process.env.EMAIL_FROM_NAME = "Au Lawyers";

test("verification and reset templates use the correct purpose and link", () => {
  const verification = buildVerificationEmail({
    email: "user@example.test",
    token: "verification-token",
  });
  const reset = buildPasswordResetEmail({
    email: "user@example.test",
    token: "reset-token",
  });

  assert.match(verification.subject, /Verify/);
  assert.match(verification.text, /\/verify-email\?token=verification-token/);
  assert.doesNotMatch(verification.text, /reset-password/);
  assert.match(reset.subject, /Reset/);
  assert.match(reset.text, /\/reset-password\?token=reset-token/);
  assert.doesNotMatch(reset.text, /verify-email/);
});

test("consultation email uses a generic event and the role-specific application route", () => {
  const customer = buildConsultationNotificationEmail({
    email: "customer@example.test",
    consultationId: "123e4567-e89b-12d3-a456-426614174000",
    recipient: "customer",
    kind: "proposal_ready",
  });
  const lawyer = buildConsultationNotificationEmail({
    email: "lawyer@example.test",
    consultationId: "123e4567-e89b-12d3-a456-426614174000",
    recipient: "lawyer",
    kind: "request_assigned",
  });
  const staff = buildConsultationNotificationEmail({
    email: "staff@example.test",
    consultationId: "123e4567-e89b-12d3-a456-426614174000",
    recipient: "staff",
    kind: "request_created",
  });

  assert.match(customer.text, /updated time proposal/);
  assert.match(customer.text, /https:\/\/app\.example\.test\/consultations\//);
  assert.match(
    lawyer.text,
    /https:\/\/app\.example\.test\/lawyer-portal\/consultations\//
  );
  assert.match(
    staff.text,
    /https:\/\/app\.example\.test\/admin-portal\/consultations\//
  );
  for (const email of [customer, lawyer, staff]) {
    assert.doesNotMatch(
      `${email.subject} ${email.text} ${email.html}`,
      /customer note|preferred window|chat text|document text|legal matter|provider token|meeting provider/i
    );
  }
});

test("SES request construction is local and does not send", () => {
  const request = buildSesEmailRequest(
    buildPasswordChangedEmail({ email: "user@example.test" })
  );

  assert.equal(request.FromEmailAddress, "Au Lawyers <no-reply@example.test>");
  assert.deepEqual(request.Destination, {
    ToAddresses: ["user@example.test"],
  });
  assert.equal(
    request.Content?.Simple?.Subject?.Data,
    "Your Au Lawyers password was changed"
  );
});

test("email delivery diagnostics expose only safe provider metadata", () => {
  const error = Object.assign(
    new Error("secret token and full email payload must not be logged"),
    {
      type: "SesException",
      code: "MessageRejected",
      $metadata: { httpStatusCode: 400 },
    }
  );

  assert.deepEqual(getSafeEmailErrorMetadata(error), {
    errorName: "Error",
    errorType: "SesException",
    awsErrorCode: "MessageRejected",
    httpStatus: 400,
  });
  assert.doesNotMatch(
    JSON.stringify(getSafeEmailErrorMetadata(error)),
    /secret|token|payload|email/i
  );
});
