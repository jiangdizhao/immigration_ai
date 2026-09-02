import assert from "node:assert/strict";
import test from "node:test";

import {
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
