import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const runtimeDir = join(root, '.test-runtime');
const latestUrlFile = join(runtimeDir, 'latest-play-url.txt');

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    let output = '';
    const relay = (stream, target) => stream.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      target.write(text);
    });
    relay(child.stdout, process.stdout);
    relay(child.stderr, process.stderr);
    child.on('error', rejectRun);
    child.on('exit', (code) => {
      if (code === 0) resolveRun(output);
      else rejectRun(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function installedPowerAppsCli() {
  const pnpmStore = join(root, 'node_modules/.pnpm');
  const packageDir = readdirSync(pnpmStore)
    .filter((name) => name.startsWith('@microsoft+power-apps-cli@'))
    .sort()
    .at(-1);
  if (!packageDir) {
    throw new Error('Installed @microsoft/power-apps-cli was not found. Run pnpm install without --force.');
  }
  return join(
    pnpmStore,
    packageDir,
    'node_modules/@microsoft/power-apps-cli/dist/Bin.js',
  );
}

console.log('\n[test:publish] Building the current source...');
await run('pnpm', ['build']);

console.log('\n[test:publish] Publishing the verified dist package...');
const pushOutput = await run(process.execPath, [
  installedPowerAppsCli(),
  'push',
  '--non-interactive',
  '--no-color',
]);

const playUrl = pushOutput.match(/https:\/\/apps(?:\.[a-z]+)?\.powerapps\.[^\s]+\/play\/[^\s]+/i)?.[0];
if (!playUrl) {
  throw new Error('Push completed but no play URL was found in the CLI output.');
}

mkdirSync(runtimeDir, { recursive: true });
writeFileSync(latestUrlFile, `${playUrl}\n`, 'utf8');

console.log('\n[test:publish] Fresh hosted test package is ready.');
console.log(`LATEST_PLAY_URL=${playUrl}`);
console.log(`LATEST_PLAY_URL_FILE=${latestUrlFile}`);