import { pathToFileURL } from "node:url";
import { runB2Cli } from "../lib/project-documents/aws/security-readiness/b2-cli";

function main() {
  const result = runB2Cli(process.argv.slice(2));
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exitCode = result.exitCode;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
