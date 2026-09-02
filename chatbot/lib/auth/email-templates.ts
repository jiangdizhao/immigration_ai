import type { SendEmailCommandInput } from "@aws-sdk/client-sesv2";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

const DEFAULT_APP_BASE_URL = "http://localhost:3000";

function getAppBaseUrl() {
  const configuredUrl =
    process.env.APP_BASE_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    DEFAULT_APP_BASE_URL;
  const url = new URL(configuredUrl);

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("APP_BASE_URL must be an http(s) URL without credentials");
  }

  return url.toString().replace(/\/$/, "");
}

function buildActionUrl(pathname: string, token: string) {
  const url = new URL(pathname, `${getAppBaseUrl()}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character
  );
}

function buildLinkEmail({
  email,
  pathname,
  subject,
  intro,
  buttonLabel,
  expiry,
  token,
}: {
  email: string;
  pathname: "/verify-email" | "/reset-password";
  subject: string;
  intro: string;
  buttonLabel: string;
  expiry: string;
  token: string;
}) {
  const link = buildActionUrl(pathname, token);
  const safeLink = escapeHtml(link);

  return {
    to: email,
    subject,
    text: `${intro}\n\nOpen this link to continue:\n${link}\n\nThis link expires in ${expiry}. If you did not request this, you can ignore this email.`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${safeLink}">${escapeHtml(buttonLabel)}</a></p><p>This link expires in ${escapeHtml(expiry)}. If you did not request this, you can ignore this email.</p>`,
  } satisfies EmailMessage;
}

export function buildVerificationEmail({
  email,
  token,
}: {
  email: string;
  token: string;
}) {
  return buildLinkEmail({
    email,
    pathname: "/verify-email",
    subject: "Verify your Au Lawyers account email",
    intro:
      "Please verify your email address to finish creating your Au Lawyers account.",
    buttonLabel: "Verify email address",
    expiry: "24 hours",
    token,
  });
}

export function buildPasswordResetEmail({
  email,
  token,
}: {
  email: string;
  token: string;
}) {
  return buildLinkEmail({
    email,
    pathname: "/reset-password",
    subject: "Reset your Au Lawyers password",
    intro: "A password reset was requested for your Au Lawyers account.",
    buttonLabel: "Reset password",
    expiry: "1 hour",
    token,
  });
}

export function buildPasswordChangedEmail({ email }: { email: string }) {
  return {
    to: email,
    subject: "Your Au Lawyers password was changed",
    text: "Your Au Lawyers password was successfully changed. If you did not make this change, contact support immediately.",
    html: "<p>Your Au Lawyers password was successfully changed.</p><p>If you did not make this change, contact support immediately.</p>",
  } satisfies EmailMessage;
}

function getFromAddress() {
  const address = process.env.EMAIL_FROM_ADDRESS?.trim();
  if (!address) {
    throw new Error("EMAIL_FROM_ADDRESS is not configured");
  }

  const name = process.env.EMAIL_FROM_NAME?.trim();
  return name ? `${name} <${address}>` : address;
}

export function buildSesEmailRequest(
  message: EmailMessage
): SendEmailCommandInput {
  return {
    FromEmailAddress: getFromAddress(),
    Destination: { ToAddresses: [message.to] },
    Content: {
      Simple: {
        Subject: { Data: message.subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: message.text, Charset: "UTF-8" },
          Html: { Data: message.html, Charset: "UTF-8" },
        },
      },
    },
  };
}
