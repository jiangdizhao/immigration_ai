// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions run only inside this test.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";
import { closeLazyDatabase } from "@/lib/db/runtime-client";

/**
 * Real Drizzle + postgres.js coverage for the recurring invoice entitlement
 * projection. This uses only the isolated Phase 12 test database; it never
 * targets the configured application database.
 */
const TEST_DATABASE_URL = process.env.PHASE12_TEST_DATABASE_URL?.trim() ?? "";
const skipReason = TEST_DATABASE_URL
  ? false
  : "PHASE12_TEST_DATABASE_URL is not configured (isolated test database required)";
const EXPECTED_DATABASE = "immigration_ai_phase12_stage1_test";

function assertIsolatedTarget(url: string) {
  const database = new URL(url).pathname.replace(/^\//u, "");
  assert.equal(
    database,
    EXPECTED_DATABASE,
    "refusing to run VIP billing integration work against a non-isolated database"
  );
}

type ProcessingEvent = { id: string; processingToken: string };

function timestampText(value: Date) {
  return value.toISOString().slice(0, 19);
}

async function createProcessingEvent(
  sql: ReturnType<typeof postgres>,
  providerEventId: string
): Promise<ProcessingEvent> {
  const id = randomUUID();
  const processingToken = randomUUID();
  await sql`
    insert into "VipBillingEvent" (
      "id", "provider", "providerEventId", "eventType", "processingStatus",
      "processingToken", "processingStartedAt"
    ) values (
      ${id}, ${"stripe"}, ${providerEventId}, ${"invoice.paid"}, ${"processing"},
      ${processingToken}, ${new Date("2026-10-15T00:00:00.000Z")}
    )
  `;
  return { id, processingToken };
}

function applyPaidInvoice(
  queries: typeof import("@/lib/db/queries"),
  event: ProcessingEvent,
  input: {
    subscriptionId: string;
    providerSubscriptionId: string;
    invoiceId: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    now: Date;
  }
) {
  return queries.applyVipInvoicePaid({
    billingEventId: event.id,
    processingToken: event.processingToken,
    subscriptionId: input.subscriptionId,
    providerSubscriptionId: input.providerSubscriptionId,
    invoiceId: input.invoiceId,
    status: "active",
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    providerCustomerId: "cus_vip_invoice_paid_test",
    providerPriceId: "price_vip_invoice_paid_test",
    cancelAtPeriodEnd: false,
    now: input.now,
  });
}

test(
  "invoice.paid serializes the raw expiry timestamp and preserves VIP activation, renewal, idempotency, and prepaid expiry",
  { skip: skipReason },
  async () => {
    assertIsolatedTarget(TEST_DATABASE_URL);
    process.env.POSTGRES_URL = TEST_DATABASE_URL;
    const sql = postgres(TEST_DATABASE_URL, {
      max: 4,
      connect_timeout: 5,
      connection: { TimeZone: "UTC" },
    });
    const nonce = randomUUID();
    const providerEventPrefix = `evt_vip_invoice_paid_test_${nonce}_`;
    const providerSubscriptionId = `sub_vip_invoice_paid_test_${nonce}`;
    const ownerEmail = `vip-${nonce}@example.test`;
    let userId: string | null = null;
    let planPriceId: string | null = null;
    let subscriptionId: string | null = null;

    try {
      const queries = await import("@/lib/db/queries");
      const [owner] = await sql<{ id: string }[]>`
        insert into "User" ("email", "password")
        values (${ownerEmail}, ${"x".repeat(64)})
        returning "id"
      `;
      userId = owner.id;

      const [planPrice] = await sql<{ id: string }[]>`
        insert into "VipPlanPrice" ("amountMinor", "currency", "active")
        values (${1}, ${"AUD"}, ${false})
        returning "id"
      `;
      planPriceId = planPrice.id;

      const [subscription] = await sql<{ id: string }[]>`
        insert into "VipSubscription" (
          "userId", "planPriceId", "provider", "providerSubscriptionId",
          "amountMinor", "currency", "status"
        ) values (
          ${userId}, ${planPriceId}, ${"stripe"}, ${providerSubscriptionId},
          ${1}, ${"AUD"}, ${"incomplete"}
        )
        returning "id"
      `;
      subscriptionId = subscription.id;

      const period1Start = new Date("2026-10-15T00:00:00.000Z");
      const period1End = new Date("2026-11-15T00:00:00.000Z");
      const event1 = await createProcessingEvent(
        sql,
        `${providerEventPrefix}activation`
      );
      const activation = await applyPaidInvoice(queries, event1, {
        subscriptionId,
        providerSubscriptionId,
        invoiceId: `in_vip_invoice_paid_test_${nonce}_1`,
        currentPeriodStart: period1Start,
        currentPeriodEnd: period1End,
        now: period1Start,
      });

      assert.equal(activation.duplicate, false);
      assert.equal(activation.subscription?.status, "active");
      assert.equal(activation.notification?.notificationType, "vip_activated");
      const [afterActivation] = await sql<
        { membershipTier: string; vipExpiresAt: string | null }[]
      >`
        select "membershipTier",
          to_char("vipExpiresAt", 'YYYY-MM-DD"T"HH24:MI:SS') as "vipExpiresAt"
        from "User" where "id" = ${userId}
      `;
      assert.equal(afterActivation.membershipTier, "vip");
      assert.equal(afterActivation.vipExpiresAt, timestampText(period1End));

      const period2Start = period1End;
      const period2End = new Date("2026-12-15T00:00:00.000Z");
      const invoice2 = `in_vip_invoice_paid_test_${nonce}_2`;
      const event2 = await createProcessingEvent(
        sql,
        `${providerEventPrefix}renewal`
      );
      const renewal = await applyPaidInvoice(queries, event2, {
        subscriptionId,
        providerSubscriptionId,
        invoiceId: invoice2,
        currentPeriodStart: period2Start,
        currentPeriodEnd: period2End,
        now: period2Start,
      });

      assert.equal(renewal.duplicate, false);
      assert.equal(renewal.subscription?.lastPaidInvoiceId, invoice2);
      assert.equal(renewal.notification?.notificationType, "vip_renewal_paid");
      const [afterRenewal] = await sql<{ vipExpiresAt: string | null }[]>`
        select to_char("vipExpiresAt", 'YYYY-MM-DD"T"HH24:MI:SS') as "vipExpiresAt"
        from "User" where "id" = ${userId}
      `;
      assert.equal(afterRenewal.vipExpiresAt, timestampText(period2End));

      const duplicateEvent = await createProcessingEvent(
        sql,
        `${providerEventPrefix}duplicate-invoice`
      );
      const duplicate = await applyPaidInvoice(queries, duplicateEvent, {
        subscriptionId,
        providerSubscriptionId,
        invoiceId: invoice2,
        currentPeriodStart: period2Start,
        currentPeriodEnd: period2End,
        now: period2End,
      });

      assert.equal(duplicate.duplicate, true);
      assert.equal(duplicate.notification, null);
      const [afterDuplicate] = await sql<{ vipExpiresAt: string | null }[]>`
        select to_char("vipExpiresAt", 'YYYY-MM-DD"T"HH24:MI:SS') as "vipExpiresAt"
        from "User" where "id" = ${userId}
      `;
      assert.equal(afterDuplicate.vipExpiresAt, timestampText(period2End));

      const laterPrepaidExpiry = new Date("2027-06-15T00:00:00.000Z");
      await sql`
        update "User"
        set "vipExpiresAt" = ${laterPrepaidExpiry.toISOString()}::timestamp
        where "id" = ${userId}
      `;
      const period3End = new Date("2027-01-15T00:00:00.000Z");
      const event3 = await createProcessingEvent(
        sql,
        `${providerEventPrefix}later-prepaid-expiry`
      );
      const laterExpiryRenewal = await applyPaidInvoice(queries, event3, {
        subscriptionId,
        providerSubscriptionId,
        invoiceId: `in_vip_invoice_paid_test_${nonce}_3`,
        currentPeriodStart: period2End,
        currentPeriodEnd: period3End,
        now: period2End,
      });

      assert.equal(laterExpiryRenewal.duplicate, false);
      const [afterLaterExpiryRenewal] = await sql<
        { vipExpiresAt: string | null }[]
      >`
        select to_char("vipExpiresAt", 'YYYY-MM-DD"T"HH24:MI:SS') as "vipExpiresAt"
        from "User" where "id" = ${userId}
      `;
      assert.equal(
        afterLaterExpiryRenewal.vipExpiresAt,
        timestampText(laterPrepaidExpiry)
      );

      const eventIds = [event1.id, event2.id, duplicateEvent.id, event3.id];
      const finalEvents = await sql<{ id: string; processingStatus: string }[]>`
        select "id", "processingStatus" from "VipBillingEvent"
        where "id" = any(${sql.array(eventIds)}::uuid[])
      `;
      assert.deepEqual(
        Object.fromEntries(
          finalEvents.map(({ id, processingStatus }) => [id, processingStatus])
        ),
        {
          [event1.id]: "processed",
          [event2.id]: "processed",
          [duplicateEvent.id]: "ignored",
          [event3.id]: "processed",
        }
      );

      const notificationCounts = await sql<
        { notificationType: string; count: number }[]
      >`
        select "notificationType", count(*)::int as count
        from "VipBillingNotification"
        where "userId" = ${userId}
        group by "notificationType"
        order by "notificationType"
      `;
      assert.deepEqual(Array.from(notificationCounts), [
        { notificationType: "vip_activated", count: 1 },
        { notificationType: "vip_renewal_paid", count: 2 },
      ]);
    } finally {
      if (subscriptionId) {
        await sql`delete from "VipSubscription" where "id" = ${subscriptionId}`;
      }
      await sql`
        delete from "VipBillingEvent"
        where "provider" = ${"stripe"}
          and "providerEventId" like ${`${providerEventPrefix}%`}
      `;
      if (planPriceId) {
        await sql`delete from "VipPlanPrice" where "id" = ${planPriceId}`;
      }
      if (userId) {
        await sql`delete from "User" where "id" = ${userId}`;
      }
      await closeLazyDatabase();
      await sql.end({ timeout: 5 });
    }
  }
);
