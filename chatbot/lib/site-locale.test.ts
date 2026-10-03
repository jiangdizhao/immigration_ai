import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SITE_LOCALE,
  getSiteLocaleFromCookie,
  getSiteTranslation,
  normalizeSiteLocale,
  SITE_PRIMARY_NAVIGATION,
  serializeSiteLocaleCookie,
} from "./site-locale";

test("site locale defaults to Simplified Chinese and normalizes supported values", () => {
  assert.equal(DEFAULT_SITE_LOCALE, "zh-CN");
  assert.equal(normalizeSiteLocale("zh-CN"), "zh-CN");
  assert.equal(normalizeSiteLocale("ZH-cn"), "zh-CN");
  assert.equal(normalizeSiteLocale("en"), "en");
  assert.equal(normalizeSiteLocale("en-US"), "en");
});

test("invalid or absent site locale values fall back to Simplified Chinese", () => {
  assert.equal(normalizeSiteLocale("fr"), "zh-CN");
  assert.equal(normalizeSiteLocale(undefined), "zh-CN");
  assert.equal(getSiteLocaleFromCookie(), "zh-CN");
  assert.equal(getSiteLocaleFromCookie("other=value"), "zh-CN");
  assert.equal(getSiteLocaleFromCookie("site-locale=fr"), "zh-CN");
});

test("site locale cookie round-trips across request and browser formats", () => {
  const cookie = serializeSiteLocaleCookie("en");

  assert.match(cookie, /^site-locale=en;/);
  assert.equal(getSiteLocaleFromCookie(cookie), "en");
  assert.equal(
    getSiteLocaleFromCookie("session=abc; site-locale=zh-CN; theme=dark"),
    "zh-CN"
  );
});

test("shared-shell translations expose safe fallback copy for both locales", () => {
  const chinese = getSiteTranslation("zh-CN").nav;
  const english = getSiteTranslation("en").nav;
  assert.deepEqual(Object.keys(chinese), [
    "home",
    "workspace",
    "services",
    "intelligence",
  ]);
  assert.deepEqual(Object.keys(english), [
    "home",
    "workspace",
    "services",
    "intelligence",
  ]);
  assert.deepEqual(Object.values(chinese), [
    "首页",
    "AI 工作台",
    "服务与联系",
    "法律动态",
  ]);
  assert.deepEqual(Object.values(english), [
    "Home",
    "AI Workspace",
    "Services & Contact",
    "Legal Updates",
  ]);
  assert.equal(getSiteTranslation("zh-CN").account.logOut, "退出登录");
  assert.equal(getSiteTranslation("en").account.logOut, "Log out");
});

test("primary public navigation has exactly the four approved destinations", () => {
  assert.deepEqual(SITE_PRIMARY_NAVIGATION, [
    { key: "home", href: "/" },
    { key: "workspace", href: "/ai-workspace" },
    { key: "services", href: "/contact" },
    { key: "intelligence", href: "/intelligence" },
  ]);
});
