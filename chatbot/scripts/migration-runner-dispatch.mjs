import { spawn } from 'node:child_process';

const sourceHost =
  'immigration-ai-staging-postgres.ctkuiomwqo61.ap-southeast-2.rds.amazonaws.com';
const targetHost =
  'immigration-ai-staging-postgres-secure.ctkuiomwqo61.ap-southeast-2.rds.amazonaws.com';
const [mode, expectedDatabase, ...extraArgs] = process.argv.slice(2);
const rawConnectionString = process.env.POSTGRES_URL;

if (
  !rawConnectionString ||
  !['preflight', 'migrate'].includes(mode) ||
  extraArgs.length > 0
) {
  console.error('Runner stopped: missing DB URL or unsupported operation.');
  process.exit(2);
}

let targetUrl;
try {
  targetUrl = new URL(rawConnectionString);
} catch {
  console.error('Runner stopped: DB URL validation failed.');
  process.exit(2);
}

if (
  targetUrl.hostname !== sourceHost ||
  !targetUrl.pathname ||
  targetUrl.pathname === '/'
) {
  console.error('Runner stopped: DB URL source identity validation failed.');
  process.exit(2);
}

targetUrl.hostname = targetHost;
process.env.POSTGRES_URL = targetUrl.toString();

let operatorArgs;
if (mode === 'preflight') {
  operatorArgs = ['dist/db-migration-operator.js', '--preflight'];
} else if (expectedDatabase?.trim()) {
  operatorArgs = [
    'dist/db-migration-operator.js',
    '--acknowledge-migrations',
    `--expect-database=${expectedDatabase}`,
  ];
} else {
  console.error(
    'Runner stopped: migration requires the preflight-confirmed database name.'
  );
  process.exit(2);
}

const child = spawn(process.execPath, operatorArgs, {
  cwd: '/opt/migration/chatbot',
  env: process.env,
  stdio: 'inherit',
});

child.on('error', () => {
  console.error('Runner stopped: repository migration command could not start.');
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
