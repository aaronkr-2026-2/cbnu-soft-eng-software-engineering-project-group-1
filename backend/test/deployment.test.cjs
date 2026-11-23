const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

// Exercise deployment control flow without Docker, Git writes, or a database.
function run(args = [], overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'medconnect-deploy-test-'));
  try {
    mkdirSync(join(dir, 'backend'));
    mkdirSync(join(dir, 'bin'));
    writeFileSync(join(dir, 'backend/.env'), 'PORT_API=3333\n');
    copyFileSync(resolve(__dirname, '../../deploy.sh'), join(dir, 'deploy.sh'));
    const mock = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const name = require('node:path').basename(process.argv[1]);
fs.appendFileSync(process.env.DEPLOY_TEST_LOG, JSON.stringify([name, ...args]) + '\\n');
if (name === 'git') {
  if (args[0] === 'status') process.stdout.write(process.env.DEPLOY_TEST_DIRTY || '');
  if (args[0] === 'branch') process.stdout.write(process.env.DEPLOY_TEST_BRANCH || 'main');
}
if (name === 'docker') {
  if (args.includes('build') && process.env.DEPLOY_TEST_FAIL === 'build') process.exit(1);
  if (args.includes('dist/tools/booking-status.js') && process.env.DEPLOY_TEST_FAIL === 'readiness') process.exit(2);
  if (args.includes('--apply') && process.env.DEPLOY_TEST_FAIL === 'migration') process.exit(1);
  if (args.includes('up') && process.env.DEPLOY_TEST_FAIL === 'health') process.exit(1);
}
`;
    for (const name of ['git', 'docker']) writeFileSync(join(dir, 'bin', name), mock, { mode: 0o755 });
    const log = join(dir, 'calls');
    const result = spawnSync('/bin/bash', [join(dir, 'deploy.sh'), ...args], {
      cwd: tmpdir(), // Script must resolve its own repository directory.
      encoding: 'utf8',
      env: { ...process.env, DEPLOY_BRANCH: 'main', ...overrides, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, DEPLOY_TEST_LOG: log },
    });
    const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    return { ...result, calls };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const has = (calls, arg) => calls.some(row => row.includes(arg));

test('production deploy uses explicit env, fast-forward main, readiness and health checks', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.calls.some(row => row.join(' ') === 'git pull --ff-only origin main'));
  for (const row of result.calls.filter(row => row[0] === 'docker' && row[1] === 'compose' && !row.includes('version'))) {
    assert.ok(row.includes('--env-file') && row.includes('backend/.env'));
  }
  assert.ok(has(result.calls, 'dist/tools/booking-status.js'));
  const up = result.calls.find(row => row.includes('up'));
  assert.ok(up.includes('--wait') && up.includes('--force-recreate'));
  assert.ok(!has(result.calls, '--apply'));
  assert.ok(!has(result.calls, 'reset'));
  assert.match(result.stdout, /API is healthy/);
});

test('dirty checkout aborts before pulling or changing containers', () => {
  const result = run([], { DEPLOY_TEST_DIRTY: ' M backend/src/main.ts' });
  assert.notEqual(result.status, 0);
  assert.ok(!has(result.calls, 'pull') && !has(result.calls, 'build') && !has(result.calls, 'up'));
});

test('wrong branch aborts without switching or resetting it', () => {
  const result = run([], { DEPLOY_TEST_BRANCH: 'backend' });
  assert.notEqual(result.status, 0);
  assert.ok(!has(result.calls, 'checkout') && !has(result.calls, 'reset') && !has(result.calls, 'pull'));
});

test('failed image build leaves the running API untouched', () => {
  const result = run(['--migrate-booking'], { DEPLOY_TEST_FAIL: 'build' });
  assert.notEqual(result.status, 0);
  assert.ok(!has(result.calls, 'stop') && !has(result.calls, '--apply') && !has(result.calls, 'up'));
});

test('failed readiness never activates a new API or claims success', () => {
  const result = run([], { DEPLOY_TEST_FAIL: 'readiness' });
  assert.notEqual(result.status, 0);
  assert.ok(!has(result.calls, 'up'));
  assert.doesNotMatch(result.stdout, /API is healthy/);
});

test('explicit initial cutover stops the writer before dry-run and apply', () => {
  const result = run(['--migrate-booking']);
  assert.equal(result.status, 0, result.stderr);
  const stop = result.calls.findIndex(row => row.includes('stop'));
  const dry = result.calls.findIndex(row => row.includes('--dry-run'));
  const apply = result.calls.findIndex(row => row.includes('--apply'));
  const audit = result.calls.findIndex(row => row.includes('dist/tools/booking-status.js'));
  assert.ok(stop >= 0 && stop < dry && dry < apply && apply < audit);
  for (const index of [dry, apply]) assert.ok(result.calls[index].includes('BOOKING_POLICY_V2_ENABLED=false'));
  assert.ok(result.calls[apply].includes('--writers-stopped'));
});

test('failed migration leaves activation stopped', () => {
  const result = run(['--migrate-booking'], { DEPLOY_TEST_FAIL: 'migration' });
  assert.notEqual(result.status, 0);
  assert.ok(!has(result.calls, 'up'));
  assert.doesNotMatch(result.stdout, /API is healthy/);
});

test('failed health wait cannot report successful deployment', () => {
  const result = run([], { DEPLOY_TEST_FAIL: 'health' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /API is healthy/);
});
