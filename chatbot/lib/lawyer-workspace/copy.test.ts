import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionLawyerClarification } from "../lawyer-requests/status";
import {
  formatLawyerWorkspaceDate,
  getLawyerWorkspaceActionLabel,
  getLawyerWorkspaceAssistantLabel,
  getLawyerWorkspaceBucketLabel,
  getLawyerWorkspaceContextRoleLabel,
  getLawyerWorkspaceRoleLabel,
  getLawyerWorkspaceStatusLabel,
} from "./copy";
import {
  availableLawyerActions,
  canProvideLawyerLearningFeedback,
} from "./types";

test("assistant mode never exposes unknown internal strings", () => {
  assert.equal(
    getLawyerWorkspaceAssistantLabel("default", "zh-CN"),
    "标准法律核查"
  );
  assert.equal(getLawyerWorkspaceAssistantLabel("premium", "en"), "Premium");
  assert.equal(getLawyerWorkspaceAssistantLabel("vip", "zh-CN"), "暂不可用");
  assert.equal(getLawyerWorkspaceAssistantLabel(null, "en"), "Unavailable");
  assert.equal(
    getLawyerWorkspaceAssistantLabel("internal-mode", "en"),
    "Unavailable"
  );
});

test("status, bucket, assistant, and role copy has no raw enum fallback", () => {
  assert.equal(getLawyerWorkspaceStatusLabel("pending", "zh-CN"), "待处理");
  assert.equal(getLawyerWorkspaceStatusLabel("in_review", "en"), "In review");
  assert.equal(getLawyerWorkspaceStatusLabel("mystery", "zh-CN"), "暂不可用");
  assert.equal(getLawyerWorkspaceStatusLabel("mystery", "en"), "Unavailable");
  assert.equal(
    getLawyerWorkspaceBucketLabel("needs_action", "zh-CN"),
    "需要律师处理"
  );
  assert.equal(getLawyerWorkspaceBucketLabel("all", "en"), "All assigned");
  assert.equal(
    getLawyerWorkspaceAssistantLabel("default", "zh-CN"),
    "标准法律核查"
  );
  assert.equal(getLawyerWorkspaceAssistantLabel("premium", "en"), "Premium");
  assert.equal(getLawyerWorkspaceRoleLabel("customer", "zh-CN"), "客户");
  assert.equal(getLawyerWorkspaceRoleLabel("lawyer", "en"), "Lawyer");
  assert.equal(getLawyerWorkspaceRoleLabel("admin", "zh-CN"), "管理员");
  assert.equal(getLawyerWorkspaceContextRoleLabel("user", "zh-CN"), "客户");
  assert.equal(
    getLawyerWorkspaceContextRoleLabel("assistant", "en"),
    "AI assistant"
  );
  assert.equal(
    getLawyerWorkspaceContextRoleLabel("system", "en"),
    "Unavailable"
  );
});

test("learning feedback is available before the first confirm or correct", () => {
  assert.equal(canProvideLawyerLearningFeedback("pending"), true);
  assert.equal(canProvideLawyerLearningFeedback("in_review"), true);
  assert.equal(
    canProvideLawyerLearningFeedback("needs_more_information"),
    false
  );
  assert.equal(canProvideLawyerLearningFeedback("confirmed"), false);
  assert.equal(canProvideLawyerLearningFeedback("corrected"), false);
  assert.equal(canProvideLawyerLearningFeedback("closed"), false);
});

test("status workflow keeps server-validated disposition boundaries", () => {
  assert.equal(canTransitionLawyerClarification("pending", "in_review"), true);
  assert.equal(canTransitionLawyerClarification("confirmed", "closed"), true);
  assert.equal(canTransitionLawyerClarification("closed", "in_review"), false);
  assert.equal(canTransitionLawyerClarification("confirmed", "pending"), false);
  assert.deepEqual(availableLawyerActions("pending"), [
    "in_review",
    "needs_more_information",
    "confirmed",
    "corrected",
    "closed",
  ]);
  assert.deepEqual(availableLawyerActions("closed"), []);
});

test("clarification timestamps format without raw values", () => {
  assert.equal(formatLawyerWorkspaceDate(null, "zh-CN"), "—");
  assert.equal(formatLawyerWorkspaceDate("not-a-date", "en"), "—");
  assert.ok(
    formatLawyerWorkspaceDate("2026-09-02T00:00:00.000Z", "en").length > 4
  );
  assert.ok(
    formatLawyerWorkspaceDate("2026-09-02T00:00:00.000Z", "zh-CN").length > 4
  );
});

test("date, URL, email, and locator values format without raw JSON", () => {
  assert.equal(formatLawyerWorkspaceDate(null, "zh-CN"), "—");
  assert.equal(formatLawyerWorkspaceDate("not-a-date", "en"), "—");
  assert.ok(
    formatLawyerWorkspaceDate("2026-09-02T00:00:00.000Z", "en").length > 4
  );
});

test("only status-valid actions are presented", () => {
  assert.deepEqual(availableLawyerActions("in_review"), [
    "needs_more_information",
    "confirmed",
    "corrected",
    "closed",
  ]);
  assert.deepEqual(availableLawyerActions("needs_more_information"), [
    "in_review",
    "closed",
  ]);
  assert.deepEqual(availableLawyerActions("confirmed"), ["closed"]);
  assert.deepEqual(availableLawyerActions("corrected"), ["closed"]);
  assert.deepEqual(availableLawyerActions("closed"), []);
  assert.equal(getLawyerWorkspaceActionLabel("confirmed", "zh-CN"), "确认");
  assert.equal(getLawyerWorkspaceActionLabel("closed", "en"), "Close");
});
