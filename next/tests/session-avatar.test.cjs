const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('saved photo changes notify session subscribers immediately; stale saves cannot change another session', () => {
  const listeners = new Set();
  const filename = path.resolve(__dirname, '../libs/auth-session.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  let getSnapshot;
  // Exercise the real session store while replacing browser transport, timers,
  // and the React hook boundary; no network requests or long-lived timers.
  new Function('require', 'exports', 'setTimeout', 'clearTimeout', source)(
    (name) => {
      if (name === 'react') return {
        useSyncExternalStore(subscribe, snapshot) {
          getSnapshot = snapshot;
          subscribe(() => listeners.forEach((listener) => listener(snapshot())));
          return snapshot();
        },
      };
      if (name === './api/session') return { sessionRequest: async () => ({}) };
      throw new Error(`Unexpected import: ${name}`);
    },
    exports,
    () => 1,
    () => {},
  );
  const member = { _id: 'a'.repeat(24), memberNick: 'alex', memberType: 'USER' };
  const token = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.signature`;
  exports.startSession({ member: { ...member, memberImage: '/uploads/member/a/old.jpg' }, accessToken: token });
  assert.equal(exports.useSession().member.memberImage, '/uploads/member/a/old.jpg');
  const changes = [];
  listeners.add((session) => changes.push(session.member.memberImage));
  exports.updateSessionMember(token, { ...member, memberImage: '/uploads/member/a/new.jpg', memberPassword: 'private' });
  assert.deepEqual(changes, ['/uploads/member/a/new.jpg']);
  assert.equal(getSnapshot().member.memberPassword, undefined);
  exports.updateSessionMember(token, { ...member, memberImage: '' });
  assert.deepEqual(changes, ['/uploads/member/a/new.jpg', '']);
  exports.startSession({ member: { ...member, _id: 'b'.repeat(24), memberImage: '/uploads/member/b/current.jpg' }, accessToken: `${token}-other` });
  exports.updateSessionMember(token, { ...member, memberImage: '/uploads/member/a/stale.jpg' });
  assert.equal(getSnapshot().member.memberImage, '/uploads/member/b/current.jpg');
});
