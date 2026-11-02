/**
 * Writes the synthetic browser identity to a 0600 file for the Playwright run.
 * Values are synthetic fixtures for the disposable cluster only.
 */
import { writeFileSync } from "node:fs";
import { closeDb } from "./env";
import { seedFixtureGraph, SYNTHETIC_PASSWORD } from "./seed";

async function main() {
  const graph = await seedFixtureGraph();
  writeFileSync(
    "/tmp/phase13-postm5-e2e/browser-identity.json",
    JSON.stringify({
      email: graph.actors.customerA!.email,
      password: SYNTHETIC_PASSWORD,
      projectId: graph.projects.A,
    }),
    { mode: 0o600 }
  );
  await closeDb();
  process.stdout.write("browser identity prepared\n");
}

main();
