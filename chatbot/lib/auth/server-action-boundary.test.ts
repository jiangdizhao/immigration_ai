import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("auth server actions do not export runtime validation schemas", async () => {
  const authActionsPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../app/(auth)/actions.ts"
  );
  const source = await readFile(authActionsPath, "utf8");

  assert.match(source, /^"use server";/);
  assert.doesNotMatch(
    source,
    /^export const (emailSchema|passwordSchema)\s*=/m
  );
  assert.match(source, /^const emailSchema\s*=/m);
  assert.match(source, /^const passwordSchema\s*=/m);
});
