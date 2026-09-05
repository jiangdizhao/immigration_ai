import "server-only";

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

import { getSafeEmailErrorMetadata } from "./email-errors";
import {
  buildLawyerRequestNotificationEmail,
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
  buildSesEmailRequest,
  buildVerificationEmail,
} from "./email-templates";

let sesClient: SESv2Client | null = null;

type AuthEmailPurpose =
  | "verification"
  | "password-reset"
  | "password-changed"
  | "lawyer-request";

async function sendEmail(
  message: Parameters<typeof buildSesEmailRequest>[0],
  purpose: AuthEmailPurpose
) {
  const provider = (process.env.EMAIL_PROVIDER || "ses").trim().toLowerCase();
  try {
    if (provider !== "ses") {
      throw new Error(`Unsupported email provider: ${provider}`);
    }

    const region = process.env.AWS_REGION?.trim();
    if (!region) {
      throw new Error("AWS_REGION is not configured");
    }

    sesClient ??= new SESv2Client({ region });
    await sesClient.send(new SendEmailCommand(buildSesEmailRequest(message)));
  } catch (error) {
    console.error("Auth email delivery failed", {
      purpose,
      provider: provider === "ses" ? "ses" : "unsupported",
      ...getSafeEmailErrorMetadata(error),
    });
    throw error;
  }
}

export async function sendVerificationEmail(args: {
  email: string;
  token: string;
}) {
  await sendEmail(buildVerificationEmail(args), "verification");
}

export async function sendPasswordResetEmail(args: {
  email: string;
  token: string;
}) {
  await sendEmail(buildPasswordResetEmail(args), "password-reset");
}

export async function sendPasswordChangedEmail(args: { email: string }) {
  await sendEmail(buildPasswordChangedEmail(args), "password-changed");
}

export async function sendLawyerRequestNotificationEmail(args: {
  email: string;
  requestId: string;
  recipient: "customer" | "lawyer" | "staff";
  kind:
    | "request_created"
    | "request_assigned"
    | "needs_more_information"
    | "customer_replied"
    | "review_completed";
}) {
  await sendEmail(buildLawyerRequestNotificationEmail(args), "lawyer-request");
}
