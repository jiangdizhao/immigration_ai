import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

async function main() {
  const databaseUrl = process.env.POSTGRES_URL;

  if (!databaseUrl) {
    console.log(
      "POSTGRES_URL not defined; skipping Phase 0 chatbot schema check."
    );
    return;
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "ImmigrationConversation" (
        "chatId" uuid PRIMARY KEY REFERENCES "Chat"("id") ON DELETE CASCADE,
        "legalMatterId" varchar(255),
        "title" text,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS "ImmigrationConversation_legalMatterId_idx"
      ON "ImmigrationConversation" ("legalMatterId")
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS "ImmigrationConversation_updatedAt_idx"
      ON "ImmigrationConversation" ("updatedAt")
    `;

    console.log("Phase 0 chatbot schema is present.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Phase 0 chatbot schema migration failed.");
  console.error(error);
  process.exit(1);
});
