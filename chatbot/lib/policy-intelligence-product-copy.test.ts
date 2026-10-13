import assert from "node:assert/strict";
import test from "node:test";
import { getPolicySourceStatusLabel } from "./policy-intelligence";
import {
  getPolicyPresentationGroup,
  getPolicyPresentationGroupLabel,
  getPolicyPresentationStatusLabel,
} from "./policy-intelligence-product-copy";

test("every valid source status stays visible in a public group (D-073)", () => {
  assert.equal(getPolicyPresentationGroup("in_force"), "published");
  assert.equal(getPolicyPresentationGroup("published_guidance"), "published");
  assert.equal(getPolicyPresentationGroup("announced"), "published");
  assert.equal(getPolicyPresentationGroup("proposed"), "proposed");
  assert.equal(getPolicyPresentationGroup("consultation"), "proposed");
  // D-073: a published record is never hidden merely because its legal-effect
  // status is unverified or no longer in force.
  assert.equal(getPolicyPresentationGroup("unknown"), "official_update");
  assert.equal(getPolicyPresentationGroup("superseded"), "official_update");
  assert.equal(getPolicyPresentationGroup("withdrawn"), "official_update");
  assert.equal(
    getPolicyPresentationGroup("enacted_not_commenced"),
    "official_update"
  );
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
  // The third group is labelled honestly and never implies legal force.
  assert.equal(
    getPolicyPresentationGroupLabel("official_update", "zh-CN"),
    "官方更新（尚未生效或待确认）"
  );
  assert.equal(
    getPolicyPresentationGroupLabel("official_update", "en"),
    "Official updates (not in force or awaiting confirmation)"
  );
  // Official updates show their exact status, not a bucket label.
  assert.match(
    getPolicyPresentationStatusLabel("superseded", "en"),
    /superseded/i
  );
  assert.match(
    getPolicyPresentationStatusLabel("unknown", "en"),
    /not yet verified/i
  );
  assert.match(
    getPolicyPresentationStatusLabel("enacted_not_commenced", "en"),
    /not yet commenced/i
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
