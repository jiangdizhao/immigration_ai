import "server-only";

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

import {
  buildSesEmailRequest,
  getValidatedAppBaseUrl,
} from "@/lib/auth/email-templates";

import { buildVipBillingEmail } from "./billing-emails";
import type { VipBillingMailer } from "./types";

// SES-backed billing notification sender. This module is only wired into the
// webhook route; tests inject fake mailers so no SES network is ever used.

export function createSesVipBillingMailer(): VipBillingMailer {
  return {
    async send(input) {
      const region = process.env.AWS_REGION?.trim();
      if (!region) {
        throw new Error("AWS_REGION is not configured");
      }

      const client = new SESv2Client({ region });
      const message = buildVipBillingEmail({
        to: input.to,
        notificationType: input.notificationType,
        amountMinor: input.amountMinor,
        currency: input.currency,
        periodEnd: input.periodEnd,
        vipUrl: `${getValidatedAppBaseUrl()}/vip`,
      });
      await client.send(new SendEmailCommand(buildSesEmailRequest(message)));
    },
  };
}
