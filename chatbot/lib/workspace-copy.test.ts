import assert from "node:assert/strict";
import test from "node:test";
import { getWorkspaceCopy } from "./workspace-copy";

test("workspace copy provides Chinese-first and English chrome", () => {
  assert.equal(getWorkspaceCopy("zh-CN").history.newConversation, "新建对话");
  assert.equal(
    getWorkspaceCopy("en").history.newConversation,
    "New conversation"
  );
});

test("registered users see localized VIP mode requirements", () => {
  const zh = getWorkspaceCopy("zh-CN").mode.registeredVipRequired;
  const en = getWorkspaceCopy("en").mode.registeredVipRequired;
  assert.match(zh, /Legal Check.*VIP/iu);
  assert.match(en, /Legal Check.*active VIP/iu);
});

test("archived conversation copy is present, localized and non-misleading", () => {
  const zh = getWorkspaceCopy("zh-CN").legacy;
  const en = getWorkspaceCopy("en").legacy;

  assert.equal(zh.badge, "历史归档");
  assert.equal(zh.title, "历史对话（只读）");
  assert.equal(zh.startNewConversation, "新建对话");
  assert.match(zh.description, /只读|不能在此对话中继续提问/);
  assert.match(zh.readOnlySubmitBlocked, /只读/);

  assert.equal(en.badge, "Archived");
  assert.match(en.title, /read-only/);
  assert.equal(en.startNewConversation, "Start a new conversation");
  assert.match(en.description, /read-only/);
  assert.match(en.readOnlySubmitBlocked, /read-only/);

  for (const key of [
    "badge",
    "title",
    "description",
    "listHint",
    "readOnlySubmitBlocked",
    "readOnlyIntakeBlocked",
    "readOnlyUploadBlocked",
    "readOnlyLawyerBlocked",
    "startNewConversation",
    "startNewConversationHint",
  ] as const) {
    assert.ok(zh[key].trim().length > 0, `zh.legacy.${key} must not be empty`);
    assert.ok(en[key].trim().length > 0, `en.legacy.${key} must not be empty`);
    assert.notEqual(zh[key], en[key], `legacy.${key} must be localized`);
  }

  // The archived surface must never promise an outcome.
  assert.doesNotMatch(Object.values(zh).join(" "), /保证|一定获批|必然/);
  assert.doesNotMatch(
    Object.values(en).join(" "),
    /guarantee|guaranteed approval|always approved/i
  );
});

test("quick questions are localized and make no outcome guarantees", () => {
  const chineseQuestions = getWorkspaceCopy("zh-CN").quickQuestions;
  const englishQuestions = getWorkspaceCopy("en").quickQuestions;

  assert.equal(chineseQuestions.length, 6);
  assert.equal(englishQuestions.length, chineseQuestions.length);
  assert.doesNotMatch(chineseQuestions.join(" "), /保证|一定获批|必然/);
  assert.doesNotMatch(
    englishQuestions.join(" "),
    /guarantee|will be approved/i
  );
});

test("workspace context and human-service actions have localized copy", () => {
  assert.equal(getWorkspaceCopy("zh-CN").matter.knownFacts, "已知信息");
  assert.equal(getWorkspaceCopy("en").matter.knownFacts, "Known information");
  assert.equal(getWorkspaceCopy("zh-CN").matter.toConfirm, "待确认");
  assert.equal(getWorkspaceCopy("en").matter.toConfirm, "To confirm");
  assert.match(
    getWorkspaceCopy("zh-CN").lawyerRequest.consultationDescription,
    /独立服务/
  );
  assert.match(
    getWorkspaceCopy("en").lawyerRequest.consultationDescription,
    /separate services/
  );
});
