const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const { UsernameCheck } = require('../libs/username-check.ts');
const {
  checkUsername,
  UsernameCheckError,
} = require('../libs/api/username.ts');
const { authenticate } = require('../libs/api/auth.ts');
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
process.env.NEXT_PUBLIC_API_URL = 'http://api.example.test';
const signal = () => new AbortController().signal;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test('public and owner checks send trimmed unprefixed usernames with no cookies/cache', async () => {
  for (const token of [undefined, 'owner-token']) {
    global.fetch = async (url, options) => {
      assert.equal(
        url,
        `http://api.example.test/member/username/availability${token ? '/me' : ''}`,
      );
      assert.deepEqual(JSON.parse(options.body), { memberNick: 'Alex_123' });
      assert.equal(options.credentials, 'omit');
      assert.equal(options.cache, 'no-store');
      assert.equal(
        options.headers.Authorization,
        token ? 'Bearer owner-token' : undefined,
      );
      return Response.json({ status: 'AVAILABLE', available: true });
    };
    assert.equal(
      await checkUsername(' Alex_123 ', signal(), token),
      'AVAILABLE',
    );
  }
});
test('invalid names never issue a network request', async () => {
  global.fetch = () => assert.fail('Invalid names must stay local');
  for (const value of ['alex', '@Alex123', 'Alex 123'])
    assert.equal(await checkUsername(value, signal()), 'INVALID');
});
test('HTTP errors, malformed results and outages cannot become Available', async () => {
  for (const status of [401, 429, 503]) {
    global.fetch = async () =>
      Response.json({ message: 'private detail' }, { status });
    await assert.rejects(
      checkUsername('Alex123', signal(), 'owner'),
      (e) => e.status === status && !e.message.includes('private'),
    );
  }
  for (const value of [
    { status: 'AVAILABLE', available: false },
    { status: 'UNKNOWN', available: true },
    null,
  ]) {
    global.fetch = async () => Response.json(value);
    await assert.rejects(checkUsername('Alex123', signal()));
  }
  global.fetch = async () => {
    throw Error('private detail');
  };
  await assert.rejects(
    checkUsername('Alex123', signal()),
    (e) => !e.message.includes('private'),
  );
});
test('edits invalidate results immediately, including returning to the same name', async () => {
  const pending = deferred();
  let requestSignal;
  const check = new UsernameCheck((value, signal) => {
    requestSignal = signal;
    return pending.promise;
  });
  const request = check.check('Alex123');
  assert.equal(check.snapshot().status, 'checking');
  check.reset(); // edit away, then return to the original spelling
  assert.equal(requestSignal.aborted, true);
  pending.resolve('AVAILABLE');
  await request;
  assert.equal(check.snapshot().status, 'idle');
  assert.equal(check.available('Alex123'), false);
});
test('a late previous request cannot overwrite a newer check or save conflict', async () => {
  const first = deferred(),
    second = deferred();
  let calls = 0;
  const check = new UsernameCheck(() =>
    ++calls === 1 ? first.promise : second.promise,
  );
  const one = check.check('Alex123');
  const two = check.check('Other123');
  second.resolve('AVAILABLE');
  await two;
  first.resolve('TAKEN');
  await one;
  assert.equal(check.available('Other123'), true);
  assert.equal(check.available('Alex123'), false);
  check.taken('Other123');
  assert.equal(check.available('Other123'), false);
  assert.equal(check.snapshot().status, 'taken');
});
test('checking/error/invalid/taken do not authorize submission; a new check can recover', async () => {
  let result = 'TAKEN';
  const check = new UsernameCheck(async () => {
    if (result === 'error') throw new UsernameCheckError('Try again', 429);
    return result;
  });
  await check.check('Alex123');
  assert.equal(check.snapshot().status, 'taken');
  result = 'error';
  await check.check('Alex123');
  assert.equal(check.snapshot().status, 'error');
  assert.equal(check.available('Alex123'), false);
  await check.check('@Alex123');
  assert.equal(check.snapshot().status, 'invalid');
  result = 'AVAILABLE';
  await check.check('Alex123');
  assert.equal(check.available('Alex123'), true);
  assert.equal(check.available('alex123'), false); // a case edit still requires a fresh check
  check.reset();
  assert.equal(check.available('Alex123'), false);
});
test('session and auth helpers preserve only allowlisted signup conflict markers', async () => {
  for (const [field, expected] of [
    ['memberNick', true],
    ['memberPhone', false],
  ]) {
    global.fetch = async () =>
      Response.json(
        { reason: 'USERNAME_TAKEN', field, message: 'private' },
        { status: 409 },
      );
    await assert.rejects(
      authenticate('signup', {}, signal()),
      (e) => e.usernameTaken === expected && !e.message.includes('private'),
    );
  }
});
