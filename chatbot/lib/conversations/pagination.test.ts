import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeCursor,
  encodeCursor,
  isNewerThanCursor,
  isOlderThanCursor,
  normalizePageSize,
  type PaginationCursor,
  PaginationCursorError,
  pageNewestFirst,
  pageOldestFirst,
} from "./pagination";

type Row = { id: string; timestamp: number };

function cursorOf(row: Row): PaginationCursor {
  return { timestamp: row.timestamp, id: row.id };
}

function rows(count: number, options?: { sameTimestamp?: boolean }): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `0000000${String(index).padStart(3, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    timestamp: options?.sameTimestamp
      ? 1_700_000_000_000
      : 1_700_000_000_000 + index,
  }));
}

test("cursors round trip for conversations, messages and documents", () => {
  for (const kind of ["conversation", "message", "document"] as const) {
    const cursor = {
      timestamp: 1_700_000_000_123,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    const encoded = encodeCursor(kind, cursor);
    const decoded = decodeCursor(kind, encoded);
    assert.deepEqual(decoded, cursor);
    // A cursor issued for one collection kind cannot be replayed against another.
    assert.throws(
      () =>
        decodeCursor(kind === "message" ? "conversation" : "message", encoded),
      PaginationCursorError
    );
  }
  assert.equal(decodeCursor("message", null), null);
  assert.equal(decodeCursor("message", undefined), null);
});

test("invalid cursors fail closed without throwing raw errors", () => {
  const invalid = [
    "not-base64!!!",
    Buffer.from("m1:1", "utf8").toString("base64url"),
    Buffer.from(
      "m9:1700000000000:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    ).toString("base64url"),
    Buffer.from("m1:notanumber:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa").toString(
      "base64url"
    ),
    Buffer.from("m1:-5:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa").toString(
      "base64url"
    ),
    Buffer.from("m1:1700000000000:").toString("base64url"),
    "a".repeat(600),
  ];
  for (const value of invalid) {
    assert.throws(() => decodeCursor("message", value), PaginationCursorError);
  }
});

test("page size normalization is bounded and never zero", () => {
  assert.equal(normalizePageSize("conversation", null), 50);
  assert.equal(normalizePageSize("conversation", 0), 1);
  assert.equal(normalizePageSize("conversation", 10_000), 200);
  assert.equal(normalizePageSize("message", 250), 250);
  assert.equal(normalizePageSize("message", 10_000), 500);
  assert.equal(normalizePageSize("document", Number.NaN), 100);
});

test("newest-first keyset pages cover every row exactly once across 250 records", () => {
  const all = rows(250);
  const seen: string[] = [];
  let cursor: PaginationCursor | null = null;
  let pages = 0;
  for (;;) {
    const page: { items: Row[]; nextCursor: PaginationCursor | null } =
      pageNewestFirst(all, {
        limit: 37,
        cursor,
        cursorOf,
      });
    seen.push(...page.items.map((row) => row.id));
    cursor = page.nextCursor;
    pages += 1;
    if (!cursor) {
      break;
    }
    assert.ok(pages < 20, "pagination must terminate");
  }

  assert.equal(seen.length, all.length);
  assert.equal(new Set(seen).size, all.length, "no duplicates across pages");
  const expectedOrder = [...all]
    .sort((left, right) => right.timestamp - left.timestamp)
    .map((row) => row.id);
  assert.deepEqual(seen, expectedOrder);
});

test("newest-first keyset pages stay exact when all rows share one timestamp", () => {
  const all = rows(120, { sameTimestamp: true });
  const seen: string[] = [];
  let cursor: PaginationCursor | null = null;
  for (;;) {
    const page: { items: Row[]; nextCursor: PaginationCursor | null } =
      pageNewestFirst(all, { limit: 25, cursor, cursorOf });
    seen.push(...page.items.map((row) => row.id));
    cursor = page.nextCursor;
    if (!cursor) {
      break;
    }
  }
  assert.equal(new Set(seen).size, all.length);
  assert.deepEqual(seen, [...all].map((row) => row.id).reverse());
});

test("oldest-first pages walk history forward without gaps", () => {
  const all = rows(90);
  const seen: string[] = [];
  let cursor: PaginationCursor | null = null;
  for (;;) {
    const page: { items: Row[]; nextCursor: PaginationCursor | null } =
      pageOldestFirst(all, { limit: 20, cursor, cursorOf });
    seen.push(...page.items.map((row) => row.id));
    cursor = page.nextCursor;
    if (!cursor) {
      break;
    }
  }
  assert.equal(new Set(seen).size, all.length);
  assert.deepEqual(
    seen,
    [...all].map((row) => row.id)
  );
});

test("keyset comparisons use the identifier tiebreaker in both directions", () => {
  const cursor = {
    timestamp: 1_700_000_000_000,
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  };
  assert.equal(
    isOlderThanCursor(
      {
        timestamp: 1_700_000_000_000,
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
      cursor
    ),
    true
  );
  assert.equal(
    isOlderThanCursor(
      {
        timestamp: 1_700_000_000_000,
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      },
      cursor
    ),
    false
  );
  assert.equal(
    isOlderThanCursor({ timestamp: 1_699_999_999_999, id: "zzzz" }, cursor),
    true
  );
  assert.equal(
    isNewerThanCursor(
      {
        timestamp: 1_700_000_000_000,
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      },
      cursor
    ),
    true
  );
  assert.equal(
    isNewerThanCursor({ timestamp: cursor.timestamp, id: cursor.id }, cursor),
    false
  );
});

test("an exhausted newest-first scan reports no next cursor", () => {
  const all = rows(5);
  const page = pageNewestFirst(all, { limit: 50, cursor: null, cursorOf });
  assert.equal(page.items.length, 5);
  assert.equal(page.nextCursor, null);
});

test("a single-record page still returns a resumable cursor when more rows exist", () => {
  const all = rows(3);
  const page = pageNewestFirst(all, { limit: 1, cursor: null, cursorOf });
  assert.equal(page.items.length, 1);
  assert.deepEqual(page.nextCursor, cursorOf(page.items[0] as Row));
});
