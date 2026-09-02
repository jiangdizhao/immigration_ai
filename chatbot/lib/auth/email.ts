import "server-only";

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

import {
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
  buildSesEmailRequest,
  buildVerificationEmail,
} from "./email-templates";

let sesClient: SESv2Client | null = null;

async function sendEmail(message: Parameters<typeof buildSesEmailRequest>[0]) {
  const provider = (process.env.EMAIL_PROVIDER || "ses").trim().toLowerCase();
  if (provider !== "ses") {
    throw new Error(`Unsupported email provider: ${provider}`);
  }

  const region = process.env.AWS_REGION?.trim();
  if (!region) {
    throw new Error("AWS_REGION is not configured");
  }

  sesClient ??= new SESv2Client({ region });
  await sesClient.send(new SendEmailCommand(buildSesEmailRequest(message)));
}

export async function sendVerificationEmail(args: {
  email: string;
  token: string;
}) {
  await sendEmail(buildVerificationEmail(args));
}

export async function sendPasswordResetEmail(args: {
  email: string;
  token: string;
}) {
  await sendEmail(buildPasswordResetEmail(args));
}

export async function sendPasswordChangedEmail(args: { email: string }) {
  await sendEmail(buildPasswordChangedEmail(args));
}
