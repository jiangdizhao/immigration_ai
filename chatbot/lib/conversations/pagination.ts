/**
 * Cursor pagination helpers for complete history enumeration.
 *
 * Ordering is always deterministic: a timestamp plus a unique identifier
 * tiebreaker. Page boundaries therefore never skip or duplicate a record, even
 * when many rows share the same timestamp (bulk imports, tests, retries).
 */

export type CursorKind = "conversation" | "message" | "document";

export type PaginationCursor = {
  /** Epoch milliseconds of the ordered timestamp column. */
  timestamp: number;
  /** Unique row identifier used as the tiebreaker. */
  id: string;
};

const CURSOR_VERSION: Record<CursorKind, string> = {
  conversation: "c1",
  message: "m1",
  document: "d1",
};
const VERSION_TO_KIND = new Map(
  Object.entries(CURSOR_VERSION).map(([kind, version]) => [version, kind])
);
const ID_PATTERN = /^[0-9a-z][0-9a-z._:-]{0,127}$/u;

export class PaginationCursorError extends Error {
  readonly code = "invalid_cursor";

  constructor() {
    super("Invalid pagination cursor.");
    this.name = "PaginationCursorError";
  }
}

export function encodeCursor(
  kind: CursorKind,
  cursor: PaginationCursor
): string {
  if (
    !Number.isFinite(cursor.timestamp) ||
    cursor.timestamp < 0 ||
    !ID_PATTERN.test(cursor.id)
  ) {
    throw new PaginationCursorError();
  }
  return Buffer.from(
    `${CURSOR_VERSION[kind]}:${Math.trunc(cursor.timestamp)}:${cursor.id}`,
    "utf8"
  ).toString("base64url");
}

export function decodeCursor(
  kind: CursorKind,
  raw: string | null | undefined
): PaginationCursor | null {
  if (!raw) {
    return null;
  }
  if (raw.length > 512) {
    throw new PaginationCursorError();
  }
  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    throw new PaginationCursorError();
  }
  const parts = decoded.split(":");
  if (parts.length !== 3) {
    throw new PaginationCursorError();
  }
  const [version, timestampText, id] = parts;
  if (VERSION_TO_KIND.get(version) !== kind) {
    throw new PaginationCursorError();
  }
  const timestamp = Number(timestampText);
  if (
    !Number.isInteger(timestamp) ||
    timestamp < 0 ||
    !ID_PATTERN.test(id ?? "")
  ) {
    throw new PaginationCursorError();
  }
  return { timestamp, id: id as string };
}

export const PAGE_SIZE_LIMITS = {
  conversation: { default: 50, max: 200 },
  message: { default: 200, max: 500 },
  document: { default: 100, max: 500 },
} as const;

export function normalizePageSize(
  kind: CursorKind,
  value: number | null | undefined
): number {
  const limits = PAGE_SIZE_LIMITS[kind];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return limits.default;
  }
  return Math.max(1, Math.min(Math.trunc(value), limits.max));
}

/**
 * True when `item` sorts strictly after `cursor` in newest-first order, so it
 * belongs on the next page.
 */
export function isOlderThanCursor(
  item: PaginationCursor,
  cursor: PaginationCursor
): boolean {
  if (item.timestamp !== cursor.timestamp) {
    return item.timestamp < cursor.timestamp;
  }
  return item.id < cursor.id;
}

/**
 * True when `item` sorts strictly after `cursor` in oldest-first order, so it
 * belongs on the next page of an ascending history.
 */
export function isNewerThanCursor(
  item: PaginationCursor,
  cursor: PaginationCursor
): boolean {
  if (item.timestamp !== cursor.timestamp) {
    return item.timestamp > cursor.timestamp;
  }
  return item.id > cursor.id;
}

export function newestFirst<T>(
  items: readonly T[],
  cursorOf: (item: T) => PaginationCursor
): T[] {
  return [...items].sort((left, right) => {
    const a = cursorOf(left);
    const b = cursorOf(right);
    if (a.timestamp !== b.timestamp) {
      return b.timestamp - a.timestamp;
    }
    return b.id.localeCompare(a.id);
  });
}

export function oldestFirst<T>(
  items: readonly T[],
  cursorOf: (item: T) => PaginationCursor
): T[] {
  return [...items].sort((left, right) => {
    const a = cursorOf(left);
    const b = cursorOf(right);
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return a.id.localeCompare(b.id);
  });
}

/** Keyset page for newest-first ordering. Returns at most `limit` items. */
export function pageNewestFirst<T>(
  items: readonly T[],
  options: {
    limit: number;
    cursor: PaginationCursor | null;
    cursorOf: (item: T) => PaginationCursor;
  }
): { items: T[]; nextCursor: PaginationCursor | null } {
  const ordered = newestFirst(items, options.cursorOf).filter((item) =>
    options.cursor
      ? isOlderThanCursor(options.cursorOf(item), options.cursor)
      : true
  );
  const page = ordered.slice(0, options.limit);
  const hasMore = ordered.length > page.length;
  const last = page.at(-1);
  return {
    items: page,
    nextCursor: hasMore && last ? options.cursorOf(last) : null,
  };
}

/** Keyset page for oldest-first ordering. Returns at most `limit` items. */
export function pageOldestFirst<T>(
  items: readonly T[],
  options: {
    limit: number;
    cursor: PaginationCursor | null;
    cursorOf: (item: T) => PaginationCursor;
  }
): { items: T[]; nextCursor: PaginationCursor | null } {
  const ordered = oldestFirst(items, options.cursorOf).filter((item) =>
    options.cursor
      ? isNewerThanCursor(options.cursorOf(item), options.cursor)
      : true
  );
  const page = ordered.slice(0, options.limit);
  const hasMore = ordered.length > page.length;
  const last = page.at(-1);
  return {
    items: page,
    nextCursor: hasMore && last ? options.cursorOf(last) : null,
  };
}
