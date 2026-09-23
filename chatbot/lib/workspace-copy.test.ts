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

test("AI confidence is distinct from legal certainty", () => {
  assert.match(getWorkspaceCopy("zh-CN").matter.confidenceNote, /不代表律师/);
  assert.match(getWorkspaceCopy("en").matter.confidenceNote, /not a lawyer/);
});
