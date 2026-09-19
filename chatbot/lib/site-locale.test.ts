import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SITE_LOCALE,
  getSiteLocaleFromCookie,
  getSiteTranslation,
  normalizeSiteLocale,
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
  assert.equal(getSiteTranslation("zh-CN").nav.services, "服务");
  assert.equal(getSiteTranslation("en").nav.services, "Services");
  assert.equal(getSiteTranslation("zh-CN").account.logOut, "退出登录");
  assert.equal(getSiteTranslation("en").account.logOut, "Log out");
});
