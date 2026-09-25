import assert from "node:assert/strict";
import test from "node:test";
import type { LawyerWorkspaceQueueItem } from "./queue";
import { bucketForLawyerStatus, countLawyerQueue } from "./queue";

function queueItem(id: string, bucket: LawyerWorkspaceQueueItem["bucket"]) {
  return {
    id,
    customerEmail: `${id}@example.test`,
    status: bucket,
    assistantMode: "default",
    legalMatterId: null,
    questionPreview: id,
    createdAt: null,
    updatedAt: null,
    assignedAt: null,
    bucket,
  };
}

test("queue buckets follow explicit request state only", () => {
  assert.equal(bucketForLawyerStatus("pending"), "needs_action");
  assert.equal(bucketForLawyerStatus("in_review"), "needs_action");
  assert.equal(
    bucketForLawyerStatus("needs_more_information"),
    "waiting_customer"
  );
  assert.equal(bucketForLawyerStatus("confirmed"), "reviewed");
  assert.equal(bucketForLawyerStatus("corrected"), "reviewed");
  assert.equal(bucketForLawyerStatus("closed"), "closed");
  assert.equal(bucketForLawyerStatus("archived"), "closed");
});

test("queue counts derive only from the assigned request set", () => {
  const items = [
    queueItem("a", "needs_action"),
    queueItem("b", "waiting_customer"),
    queueItem("c", "reviewed"),
    queueItem("d", "closed"),
  ];
  assert.deepEqual(countLawyerQueue(items), {
    all: 4,
    needs_action: 1,
    waiting_customer: 1,
    reviewed: 1,
    closed: 1,
  });
});
