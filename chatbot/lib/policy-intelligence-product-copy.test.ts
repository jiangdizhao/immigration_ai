import assert from "node:assert/strict";
import test from "node:test";
import { getPolicySourceStatusLabel } from "./policy-intelligence";
import {
  getPolicyPresentationGroup,
  getPolicyPresentationGroupLabel,
  getPolicyPresentationStatusLabel,
} from "./policy-intelligence-product-copy";

test("public Legal Updates consolidate source statuses into two groups", () => {
  assert.equal(getPolicyPresentationGroup("in_force"), "published");
  assert.equal(getPolicyPresentationGroup("published_guidance"), "published");
  assert.equal(getPolicyPresentationGroup("announced"), "published");
  assert.equal(getPolicyPresentationGroup("proposed"), "proposed");
  assert.equal(getPolicyPresentationGroup("consultation"), "proposed");
  assert.equal(getPolicyPresentationGroup("superseded"), null);
});

test("public group labels are bilingual and historical detail remains identifiable", () => {
  assert.equal(
    getPolicyPresentationGroupLabel("published", "zh-CN"),
    "已发布或现行"
  );
  assert.equal(
    getPolicyPresentationGroupLabel("proposed", "zh-CN"),
    "拟议 / 计划中"
  );
  assert.equal(
    getPolicyPresentationGroupLabel("published", "en"),
    "Published or in force"
  );
  assert.equal(
    getPolicyPresentationGroupLabel("proposed", "en"),
    "Proposed / Planned"
  );
  assert.match(
    getPolicyPresentationStatusLabel("superseded", "en"),
    /superseded/i
  );
  assert.equal(
    getPolicySourceStatusLabel("published_guidance", "zh-CN"),
    "官方指引已发布"
  );
  assert.equal(
    getPolicySourceStatusLabel("published_guidance", "en"),
    "Published guidance"
  );
});
