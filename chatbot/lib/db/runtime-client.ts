import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

type Database = ReturnType<typeof drizzle>;
let database: Database | undefined;
let lazyDatabase: Database | undefined;

function configuredDatabase(): Database {
  if (database) {
    return database;
  }
  const connectionString = process.env.POSTGRES_URL?.trim();
  if (!connectionString) {
    throw new Error("POSTGRES_URL is not configured");
  }
  const client = postgres(connectionString, {
    connection: { TimeZone: "UTC" },
  });
  database = drizzle(client);
  return database;
}

/** Importing route modules does not initialize a DB client; the first DB operation does. */
export function getLazyDatabase(): Database {
  if (lazyDatabase) {
    return lazyDatabase;
  }
  lazyDatabase = new Proxy({} as Database, {
    get(_target, property) {
      const current = configuredDatabase();
      const value = Reflect.get(current, property, current) as unknown;
      return typeof value === "function" ? value.bind(current) : value;
    },
  });
  return lazyDatabase;
}
