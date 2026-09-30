import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  throw new Error("POSTGRES_URL is not configured");
}
const client = postgres(connectionString, {
  max: 2,
  connection: { TimeZone: "UTC" },
});
export const db = drizzle(client);
