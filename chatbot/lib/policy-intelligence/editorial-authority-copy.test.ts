import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Owner-host correction guard: after D-070 the Admin account is the firm's
 * principal lawyer and holds full editorial authority inherently, so no Admin,
 * Policy Editor or capability-panel copy may keep saying that an administrator
 * role does not confer publication authority. The grant requirement for other
 * lawyers must stay explicit.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const UI_FILES = [
  "components/admin-policy-editors.tsx",
  "components/admin-policy-intelligence.tsx",
  "components/admin-policy-compatibility.tsx",
  "components/policy-editor-workspace.tsx",
  "app/admin/policy-intelligence/page.tsx",
  "app/policy-editor/page.tsx",
];

const STALE_PATTERNS: RegExp[] = [
  /administrator role alone/iu,
  /does not confer/iu,
  /does not have publication authority/iu,
  /administrators? (?:can|may)not publish/iu,
  /管理员(?:角色|账户)?(?:本身)?不(?:授予|具备|拥有)/u,
];

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

test("no UI copy claims that an administrator lacks publication authority", () => {
  for (const file of UI_FILES) {
    const source = read(file);
    for (const pattern of STALE_PATTERNS) {
      assert.equal(
        pattern.test(source),
        false,
        `${file} still contains stale authority wording: ${pattern}`
      );
    }
  }
});

test("the capability panel states the D-070 model and keeps the lawyer-grant rule", () => {
  const editors = read("components/admin-policy-editors.tsx");
  assert.match(editors, /principal\s+lawyer/iu);
  assert.match(editors, /verified\s+lawyer\s+account/iu);
  assert.match(editors, /active\s+Policy\s+Editor\s+grant/iu);
  const adminPage = read("app/admin/policy-intelligence/page.tsx");
  assert.match(adminPage, /principal\s+lawyer/iu);
  const adminItems = read("components/admin-policy-intelligence.tsx");
  assert.match(adminItems, /principal\s+lawyer/iu);
  assert.match(adminItems, /\/policy-editor/u);
});

test("the compatibility registry UI labels its storage and provenance honestly", () => {
  const compatibility = read("components/admin-policy-compatibility.tsx");
  assert.match(compatibility, /Bundled\s+registry/iu);
  assert.match(compatibility, /Reviewed\s+compatibility\s+content/iu);
  assert.match(
    compatibility,
    /not\s+AI-verified\s+analysis\s+and\s+not\s+official/iu
  );
  assert.match(compatibility, /Import\s+into\s+Policy\s+Editor/iu);
});
