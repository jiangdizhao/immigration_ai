import assert from "node:assert/strict";
import test from "node:test";
import {
  getPolicyPresentationGroup,
  getPolicyPresentationGroupLabel,
  getPolicyPresentationStatusLabel,
} from "./policy-intelligence-product-copy";

test("public Legal Updates consolidate source statuses into two groups", () => {
  assert.equal(getPolicyPresentationGroup("in_force"), "published");
  assert.equal(getPolicyPresentationGroup("announced"), "published");
  assert.equal(getPolicyPresentationGroup("proposed"), "proposed");
  assert.equal(getPolicyPresentationGroup("consultation"), "proposed");
  assert.equal(getPolicyPresentationGroup("superseded"), null);
});

test("public group labels are bilingual and historical detail remains identifiable", () => {
  assert.equal(
    getPolicyPresentationGroupLabel("published", "zh-CN"),
    "已公布 / 已实施"
  );
  assert.equal(
    getPolicyPresentationGroupLabel("proposed", "zh-CN"),
    "拟议 / 计划中"
  );
  assert.equal(
    getPolicyPresentationGroupLabel("published", "en"),
    "Published / In force"
  );
  assert.equal(
    getPolicyPresentationGroupLabel("proposed", "en"),
    "Proposed / Planned"
  );
  assert.match(
    getPolicyPresentationStatusLabel("superseded", "en"),
    /superseded/i
  );
});
