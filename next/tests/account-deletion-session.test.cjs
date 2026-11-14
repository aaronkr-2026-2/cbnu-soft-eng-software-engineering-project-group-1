const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../libs/auth-session.ts');
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const auth = {
  member: { _id: 'a'.repeat(24), memberType: 'USER', memberNick: 'test_user' },
  accessToken: `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.signature`,
};
function store(request, Channel) {
  const exports = {};
  class SessionError extends Error {}
  new Function(
    'require',
    'exports',
    'setTimeout',
    'clearTimeout',
    'BroadcastChannel',
    source,
  )(
    (name) => {
      if (name === 'react')
        return { useSyncExternalStore: (_subscribe, snapshot) => snapshot() };
      if (name === './api/session')
        return { sessionRequest: request, SessionError };
      throw new Error(`Unexpected import ${name}`);
    },
    exports,
    () => 1,
    () => {},
    Channel,
  );
  return exports;
}

test('deletion sign-out notifies other tabs and fences a late refresh result', async () => {
  const channels = new Set();
  class Channel {
    constructor() {
      channels.add(this);
    }
    postMessage(data) {
      for (const other of channels)
        if (other !== this) other.onmessage?.({ data });
    }
  }
  const delayed = deferred();
  let late = false;
  const first = store(
    async (action) => (action === 'logout' ? { signedOut: true } : auth),
    Channel,
  );
  const second = store(async () => (late ? delayed.promise : auth), Channel);
  first.initializeSession();
  second.initializeSession();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(second.currentSessionMemberId(), auth.member._id);
  late = true;
  const refresh = second.restoreSession(true);
  assert.equal(await first.clearSession(), true);
  assert.equal(second.currentSessionMemberId(), null);
  delayed.resolve(auth);
  await refresh;
  assert.equal(second.currentSessionMemberId(), null);
  assert.equal(first.currentSessionMemberId(), null);
});

test('sign-out clears memory immediately and reports completion only after the cookie request finishes', async () => {
  const pending = deferred();
  const current = store(async () => pending.promise, undefined);
  current.startSession(auth);
  const cleared = current.clearSession();
  let settled = false;
  void cleared.then(() => {
    settled = true;
  });
  assert.equal(current.currentSessionMemberId(), null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  pending.resolve({ signedOut: true });
  assert.equal(await cleared, true);
});
