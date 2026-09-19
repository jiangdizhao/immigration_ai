import assert from "node:assert/strict";
import test from "node:test";
import {
  getPublicPageContent,
  getPublicServiceCatalog,
  getPublicTeamPlaceholders,
  PUBLIC_SERVICE_CATALOG,
  PUBLIC_SERVICE_IDS,
  PUBLIC_TEAM_PLACEHOLDERS,
} from "./public-content";

test("public content provides exactly six stable service families in both locales", () => {
  assert.equal(PUBLIC_SERVICE_CATALOG.length, 6);
  assert.equal(new Set(PUBLIC_SERVICE_IDS).size, 6);
  assert.deepEqual(
    PUBLIC_SERVICE_CATALOG.map((service) => service.id),
    PUBLIC_SERVICE_IDS
  );

  const chinese = getPublicServiceCatalog("zh-CN");
  const english = getPublicServiceCatalog("en");
  assert.deepEqual(
    chinese.map((service) => service.id),
    english.map((service) => service.id)
  );
  assert.deepEqual(
    chinese.map((service) => service.id),
    PUBLIC_SERVICE_IDS
  );
  assert.ok(chinese.every((service) => service.title.length > 0));
  assert.ok(english.every((service) => service.title.length > 0));
});

test("home and services read the same catalogue identity", () => {
  assert.deepEqual(
    getPublicServiceCatalog("zh-CN").map((service) => service.id),
    getPublicServiceCatalog("en").map((service) => service.id)
  );
  assert.equal(
    getPublicPageContent("zh-CN").home.services.cardCta,
    "查看服务方向"
  );
  assert.equal(
    getPublicPageContent("en").services.aiCta,
    "Start AI initial consultation"
  );
});

test("both locales expose the public page content model", () => {
  const chinese = getPublicPageContent("zh-CN");
  const english = getPublicPageContent("en");

  assert.ok(chinese.home.hero.title.length > 0);
  assert.ok(english.home.hero.title.length > 0);
  assert.equal(chinese.process.steps.length, 5);
  assert.equal(english.process.steps.length, 5);
  assert.equal(chinese.contact.readiness.length, 4);
  assert.equal(english.contact.readiness.length, 4);
});

test("team data is generic and structurally marked as placeholder content", () => {
  assert.ok(PUBLIC_TEAM_PLACEHOLDERS.length > 0);
  assert.ok(
    PUBLIC_TEAM_PLACEHOLDERS.every(
      (profile) => profile.isPlaceholder && profile.avatar === "generic"
    )
  );
  assert.ok(
    getPublicTeamPlaceholders("zh-CN").every((profile) =>
      profile.status.includes("待确认")
    )
  );
  assert.ok(
    getPublicTeamPlaceholders("en").every((profile) =>
      profile.status.includes("pending confirmation")
    )
  );
});
