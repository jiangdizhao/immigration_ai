import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DISCOVERY_LIMITS,
  type DiscoveryFetchOptions,
  type DiscoveryRunResult,
  discoverPolicyCandidates,
  getPolicyDiscoverySource,
} from "./policy-intelligence-discovery";

const FIXTURE_IDS = [
  "synthetic-detail",
  "synthetic-listing",
  "synthetic-sitemap",
] as const;

type FixtureId = (typeof FIXTURE_IDS)[number];

type CliOptions = {
  sourceId: string;
  dryRun: boolean;
  write: boolean;
  fixture?: FixtureId;
  maxCandidates: number;
};

function usage(): string {
  return [
    "Usage: pnpm policy:discover -- --source <source-id> (--dry-run | --write) [options]",
    "",
    "Options:",
    "  --fixture <synthetic-detail|synthetic-listing|synthetic-sitemap>",
    "  --max-candidates <1-10>",
    "",
    "Configured sources:",
    "  home-affairs-guidance",
    "  federal-register-legislation",
    "  art-immigration-review",
  ].join("\n");
}

function takeValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parseArgs(args: string[]): CliOptions {
  let sourceId: string | undefined;
  let dryRun = false;
  let write = false;
  let fixture: FixtureId | undefined;
  let maxCandidates: number = DISCOVERY_LIMITS.maxCandidates;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") {
      continue;
    }
    if (argument === "--source") {
      sourceId = takeValue(args, index, argument);
      index += 1;
    } else if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--write") {
      write = true;
    } else if (argument === "--fixture") {
      const value = takeValue(args, index, argument);
      if (!(FIXTURE_IDS as readonly string[]).includes(value)) {
        throw new Error(`Unknown local fixture: ${value}`);
      }
      fixture = value as FixtureId;
      index += 1;
    } else if (argument === "--max-candidates") {
      const value = Number(takeValue(args, index, argument));
      if (
        !Number.isInteger(value) ||
        value < 1 ||
        value > DISCOVERY_LIMITS.maxCandidates
      ) {
        throw new Error(
          `--max-candidates must be an integer from 1 to ${DISCOVERY_LIMITS.maxCandidates}`
        );
      }
      maxCandidates = value;
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (!sourceId) {
    throw new Error("--source is required");
  }
  if (dryRun === write) {
    throw new Error("Choose exactly one of --dry-run or --write");
  }
  getPolicyDiscoverySource(sourceId);
  return { sourceId, dryRun, write, fixture, maxCandidates };
}

function fixturePath(fixture: FixtureId): string {
  return resolve(
    process.cwd(),
    "scripts",
    "fixtures",
    "policy-intelligence-discovery",
    `${fixture.replace("synthetic-", "")}.html`
  );
}

function fixtureBody(fixture: FixtureId): {
  body: string;
  contentType: string;
} {
  if (fixture === "synthetic-sitemap") {
    return {
      body: readFileSync(
        fixturePath(fixture).replace(/\.html$/, ".xml"),
        "utf8"
      ),
      contentType: "application/xml",
    };
  }
  return {
    body: readFileSync(fixturePath(fixture), "utf8"),
    contentType: "text/html",
  };
}

function createFixtureFetch(fixture: FixtureId): DiscoveryFetchOptions {
  let requestCount = 0;
  return {
    fetchImpl: (input) => {
      requestCount += 1;
      const url = new URL(String(input));
      const useIndex =
        fixture === "synthetic-sitemap"
          ? requestCount === 1 && url.pathname.endsWith("/sitemap.xml")
          : fixture === "synthetic-listing" && requestCount === 1;
      const selectedFixture = useIndex ? fixture : "synthetic-detail";
      const { body, contentType } = fixtureBody(selectedFixture);
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: {
            "content-type": contentType,
            etag: `"fixture-${selectedFixture}"`,
            "last-modified": "Tue, 01 Sep 2026 00:00:00 GMT",
          },
        })
      );
    },
    lookupHost: async () => ["203.0.113.10"],
  };
}

function writeCandidates(result: DiscoveryRunResult): string {
  const directory = resolve(
    process.cwd(),
    ".local/policy-intelligence-candidates"
  );
  mkdirSync(directory, { recursive: true });
  for (const candidate of result.candidates) {
    writeFileSync(
      resolve(directory, `${candidate.candidateId}.json`),
      `${JSON.stringify(candidate, null, 2)}\n`,
      "utf8"
    );
  }
  return directory;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const fetchOptions = options.fixture
    ? createFixtureFetch(options.fixture)
    : undefined;
  const result = await discoverPolicyCandidates({
    sourceId: options.sourceId,
    fetchOptions,
    limits: { maxCandidates: options.maxCandidates },
  });

  if (options.write) {
    const directory = writeCandidates(result);
    console.error(
      `Wrote ${result.candidates.length} non-public candidate artifact(s) to ${directory}`
    );
  } else {
    console.error(
      `Dry run: discovered ${result.candidates.length} non-public candidate(s) from ${result.sourceConfigId}`
    );
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Policy discovery failed: ${message}`);
  process.exitCode = 1;
});
