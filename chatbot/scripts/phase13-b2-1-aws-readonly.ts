import { pathToFileURL } from "node:url";
import { runB2LiveCli } from "../lib/project-documents/aws/security-readiness/b2-live-cli";

async function main() {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    const result = await runB2LiveCli(process.argv.slice(2), {
      signal: controller.signal,
    });
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exitCode = result.exitCode;
  } catch {
    process.stderr.write("B2_1_EXECUTION_ABORTED\n");
    process.exitCode = 2;
  } finally {
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    process.stderr.write("B2_1_EXECUTION_ABORTED\n");
    process.exitCode = 2;
  });
}
