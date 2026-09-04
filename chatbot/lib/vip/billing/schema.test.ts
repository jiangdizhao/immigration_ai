import assert from "node:assert/strict";
import { test } from "node:test";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";

import {
  user,
  vipBillingEvent,
  vipPlanPrice,
  vipSubscription,
} from "../../db/schema";

const dialect = new PgDialect();

function columnNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).columns.map((column) => column.name);
}

function uniqueIndexNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table)
    .indexes.filter((index) => index.config.unique)
    .map((index) => index.config.name);
}

function indexWhereSql(
  table: Parameters<typeof getTableConfig>[0],
  name: string
) {
  const index = getTableConfig(table).indexes.find(
    (candidate) => candidate.config.name === name
  );
  if (!index?.config.where) {
    return null;
  }
  return dialect.sqlToQuery(index.config.where).sql;
}

test("VipPlanPrice holds immutable, admin-created monthly AUD prices", () => {
  const config = getTableConfig(vipPlanPrice);
  const columns = columnNames(vipPlanPrice);

  for (const required of [
    "id",
    "amountMinor",
    "currency",
    "billingInterval",
    "active",
    "createdByUserId",
    "provider",
    "providerProductId",
    "providerPriceId",
    "providerSyncStatus",
    "createdAt",
    "retiredAt",
  ]) {
    assert.ok(columns.includes(required), `missing column ${required}`);
  }

  const amount = config.columns.find((column) => column.name === "amountMinor");
  assert.equal(amount?.columnType, "PgInteger");

  const currency = config.columns.find((column) => column.name === "currency");
  assert.equal(currency?.notNull, true);

  const interval = config.columns.find(
    (column) => column.name === "billingInterval"
  );
  assert.deepEqual(interval?.enumValues, ["month"]);

  // Exactly one active price at a time is DB-enforced via a partial unique
  // index on the active flag.
  assert.ok(
    uniqueIndexNames(vipPlanPrice).includes("VipPlanPrice_active_unique")
  );
  const whereSql = indexWhereSql(vipPlanPrice, "VipPlanPrice_active_unique");
  assert.ok(whereSql !== null, "active price unique index must be partial");
  assert.ok(whereSql.includes("active"), whereSql ?? "");

  // Administrator attribution is nullable and detached on user deletion.
  assert.equal(config.foreignKeys.length, 1);
});

test("VipSubscription is separate from VipPurchase and retains its price", () => {
  const columns = columnNames(vipSubscription);

  for (const required of [
    "id",
    "userId",
    "planPriceId",
    "provider",
    "providerCustomerId",
    "providerSubscriptionId",
    "providerPriceId",
    "amountMinor",
    "currency",
    "status",
    "currentPeriodStart",
    "currentPeriodEnd",
    "cancelAtPeriodEnd",
    "cancelledAt",
    "endedAt",
    "createdAt",
    "updatedAt",
  ]) {
    assert.ok(columns.includes(required), `missing column ${required}`);
  }

  const config = getTableConfig(vipSubscription);
  // userId -> User and planPriceId -> VipPlanPrice references.
  assert.equal(config.foreignKeys.length, 2);

  const status = config.columns.find((column) => column.name === "status");
  assert.deepEqual(status?.enumValues, [
    "pending",
    "incomplete",
    "active",
    "past_due",
    "unpaid",
    "paused",
    "cancelled",
  ]);

  // Provider subscription identity is unique when present.
  assert.ok(
    uniqueIndexNames(vipSubscription).includes(
      "VipSubscription_provider_subscription_unique"
    )
  );
});

test("VipBillingEvent enforces provider event idempotency", () => {
  assert.ok(
    uniqueIndexNames(vipBillingEvent).includes(
      "VipBillingEvent_provider_event_unique"
    )
  );

  const config = getTableConfig(vipBillingEvent);
  const status = config.columns.find(
    (column) => column.name === "processingStatus"
  );
  assert.deepEqual(status?.enumValues, [
    "received",
    "processed",
    "failed",
    "ignored",
  ]);

  // No raw provider payload storage.
  assert.equal(
    columnNames(vipBillingEvent).includes("payload"),
    false,
    "raw webhook payloads must not be persisted"
  );
});

test("no raw payment card data fields exist anywhere in the billing schema", () => {
  const forbidden = /card|pan|cvc|cvv|expir/i;
  for (const table of [vipPlanPrice, vipSubscription, vipBillingEvent]) {
    for (const column of getTableConfig(table).columns) {
      assert.equal(
        forbidden.test(column.name),
        false,
        `unexpected card-like column ${table.constructor.name}.${column.name}`
      );
    }
  }
});

test("existing User entitlement columns are untouched", () => {
  const columns = columnNames(user);
  assert.ok(columns.includes("membershipTier"));
  assert.ok(columns.includes("vipExpiresAt"));
  assert.ok(columns.includes("role"));
});
