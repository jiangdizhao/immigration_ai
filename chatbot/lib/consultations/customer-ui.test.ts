import assert from "node:assert/strict";
import test from "node:test";
import { getConsultationCopy } from "./copy";
import {
  browserTimezone,
  consultationCreateHref,
  customerActionsForStatus,
  localDateTimeToIso,
  runCustomerAction,
  shouldShowConsultationCreateForm,
  shouldShowConsultationHistory,
} from "./customer-ui";
import { consultationAvailabilityFromCatalogRows } from "./schema-availability-policy";

test("consultation copy covers both persisted locales", () => {
  assert.equal(getConsultationCopy("zh-CN").newTitle, "提交咨询请求");
  assert.equal(getConsultationCopy("zh-CN").loading, "正在加载咨询信息…");
  assert.equal(
    getConsultationCopy("en").loading,
    "Loading consultation information…"
  );
  assert.equal(getConsultationCopy("zh-CN").other, "其他");
  assert.equal(getConsultationCopy("en").other, "Other");
  assert.equal(
    getConsultationCopy("en").newTitle,
    "Submit a consultation request"
  );
});

test("customer actions follow the Stage 1 lifecycle", () => {
  assert.deepEqual(customerActionsForStatus("requested"), ["cancel"]);
  assert.deepEqual(customerActionsForStatus("proposed"), [
    "confirm",
    "request_reschedule",
    "cancel",
  ]);
  assert.deepEqual(customerActionsForStatus("confirmed"), ["cancel"]);
  assert.deepEqual(customerActionsForStatus("completed"), []);
  assert.deepEqual(customerActionsForStatus("cancelled"), []);
});

test("schema catalog result distinguishes absent from present relation", () => {
  assert.equal(
    consultationAvailabilityFromCatalogRows([{ relation: null }]),
    "unavailable"
  );
  assert.equal(
    consultationAvailabilityFromCatalogRows([
      { relation: '"ConsultationRequest"' },
    ]),
    "available"
  );
  assert.throws(() => consultationAvailabilityFromCatalogRows([]));
});

test("timezone helper requires a valid browser zone and safely converts local datetime", () => {
  assert.equal(browserTimezone(""), null);
  assert.equal(browserTimezone("Not/AZone"), null);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  assert.ok(browserTimezone(zone));
  assert.equal(localDateTimeToIso("not-a-date", zone), null);
  assert.equal(localDateTimeToIso("2026-13-40T25:99", zone), null);
  assert.equal(localDateTimeToIso("2026-05-04T10:30", null), null);
  assert.equal(
    localDateTimeToIso("2026-05-04T10:30", zone),
    new Date("2026-05-04T10:30").toISOString()
  );
  const differentZone =
    zone === "Australia/Sydney" ? "Pacific/Auckland" : "Australia/Sydney";
  assert.equal(localDateTimeToIso("2026-05-04T10:30", differentZone), null);
});

test("continuity link encodes only chatId", () => {
  const href = consultationCreateHref("chat /?x=1");
  assert.equal(href, "/consultations/new?chatId=chat%20%2F%3Fx%3D1");
  assert.equal(href.includes("legalMatterId"), false);
  assert.equal(consultationCreateHref(null), "/consultations/new");
});

test("409 reloads latest state and never retries mutation", async () => {
  let sends = 0;
  let reloads = 0;
  const result = await runCustomerAction({
    send: () => {
      sends += 1;
      return Promise.resolve(new Response(null, { status: 409 }));
    },
    reload: () => {
      reloads += 1;
      return Promise.resolve();
    },
  });
  assert.equal(result, "stale");
  assert.equal(sends, 1);
  assert.equal(reloads, 1);
});

test("schema-unavailable PATCH response keeps unavailable distinct from an action failure", async () => {
  const result = await runCustomerAction({
    send: () =>
      Promise.resolve(
        Response.json(
          { code: "consultation_schema_unavailable" },
          { status: 503 }
        )
      ),
    reload: () => Promise.resolve(),
  });
  assert.equal(result, "unavailable");
});

test("create form stays hidden until the authenticated availability check succeeds", () => {
  assert.equal(
    shouldShowConsultationCreateForm({
      availabilityChecked: false,
      loading: false,
      unavailable: false,
      error: "",
    }),
    false
  );
  assert.equal(
    shouldShowConsultationCreateForm({
      availabilityChecked: true,
      loading: true,
      unavailable: false,
      error: "",
    }),
    false
  );
  assert.equal(
    shouldShowConsultationCreateForm({
      availabilityChecked: true,
      loading: false,
      unavailable: true,
      error: "",
    }),
    false
  );
  assert.equal(
    shouldShowConsultationCreateForm({
      availabilityChecked: true,
      loading: false,
      unavailable: false,
      error: "database unavailable",
    }),
    false
  );
  assert.equal(
    shouldShowConsultationCreateForm({
      availabilityChecked: true,
      loading: false,
      unavailable: false,
      error: "",
    }),
    true
  );
});

test("consultation history content stays hidden after a failed load", () => {
  assert.equal(
    shouldShowConsultationHistory({
      loading: false,
      unavailable: false,
      error: "Unable to load consultation information",
    }),
    false
  );
  assert.equal(
    shouldShowConsultationHistory({
      loading: false,
      unavailable: true,
      error: "",
    }),
    false
  );
  assert.equal(
    shouldShowConsultationHistory({
      loading: false,
      unavailable: false,
      error: "",
    }),
    true
  );
});

test("a new action clears stale notice before sending without adding a retry", async () => {
  const order: string[] = [];
  const result = await runCustomerAction({
    onStart: () => {
      order.push("clear-stale");
    },
    send: () => {
      order.push("send");
      return Promise.resolve(new Response(null, { status: 409 }));
    },
    reload: () => {
      order.push("reload");
      return Promise.resolve();
    },
  });
  assert.deepEqual(order, ["clear-stale", "send", "reload"]);
  assert.equal(result, "stale");
});
