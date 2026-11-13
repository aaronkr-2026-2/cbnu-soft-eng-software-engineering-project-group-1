const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const {
  EmailVerification,
  remainingSeconds,
} = require('../libs/email-verification.ts');
const { sessionProxy } = require('../libs/server/session-proxy.ts');
const { SessionError, sessionRequest } = require('../libs/api/session.ts');
const {
  requestEmailCode,
  verifyEmailCode,
} = require('../libs/api/email-verification.ts');
const { authenticate, AuthError } = require('../libs/api/auth.ts');
const {
  verificationProblem,
} = require('../libs/email-verification-contract.ts');
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
process.env.API_URL = 'http://api.example.test';
const id = 'c'.repeat(43),
  token = 'p'.repeat(43),
  email = 'alice@example.test';
const challenge = {
  challengeId: id,
  expiresInSeconds: 600,
  retryAfterSeconds: 60,
};
const proof = { emailVerificationToken: token, expiresInSeconds: 600 };
const signal = () => new AbortController().signal;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
function fixture(send = async () => challenge, verify = async () => proof) {
  let now = 1000000,
    uuid = 0;
  const check = new EmailVerification(
    send,
    verify,
    () => now,
    () => `request-${++uuid}`,
  );
  return {
    check,
    advance: (milliseconds) => {
      now += milliseconds;
      check.tick();
    },
  };
}
async function proxy(action, body = {}, extra = {}) {
  const res = {
    headers: {},
    statusCode: 200,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(s) {
      this.statusCode = s;
      return this;
    },
    json(v) {
      this.body = v;
    },
    end() {},
  };
  await sessionProxy(
    {
      method: 'POST',
      query: { action },
      headers: {
        origin: 'http://app.test',
        host: 'app.test',
        'content-type': 'application/json',
        'x-medconnect-session': '1',
      },
      cookies: { medconnect_refresh: 'r'.repeat(43), unrelated: 'private' },
      body,
      ...extra,
    },
    res,
  );
  return res;
}
for (const action of ['email-request', 'email-verify'])
  test(`${action} uses fixed paths, field/result allowlists, no credentials and no session cookie`, async () => {
    global.fetch = async (url, options) => {
      assert.equal(
        url,
        `http://api.example.test/member/email-verification/${action === 'email-request' ? 'request' : 'verify'}`,
      );
      assert.equal(options.headers.Cookie, undefined);
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.cache, 'no-store');
      assert.equal(options.redirect, 'error');
      assert.deepEqual(
        JSON.parse(options.body),
        action === 'email-request'
          ? { memberEmail: email, requestId: 'uuid' }
          : { memberEmail: email, challengeId: id, code: '000123' },
      );
      return Response.json(
        {
          ...(action === 'email-request' ? challenge : proof),
          refreshToken: 'secret',
          accessToken: 'secret',
          provider: 'private',
        },
        { headers: { 'set-cookie': 'malicious=cookie' } },
      );
    };
    const res = await proxy(action, {
      memberEmail: email,
      requestId: 'uuid',
      challengeId: id,
      code: '000123',
      memberType: 'ADMIN',
      memberId: 'foreign',
      memberPassword: 'private',
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.headers['Set-Cookie'], undefined);
    assert.deepEqual(res.body, action === 'email-request' ? challenge : proof);
  });
test('signup bridge forwards proof, forces USER and never forwards challenge/code fields', async () => {
  global.fetch = async (_, options) => {
    assert.deepEqual(JSON.parse(options.body), {
      memberEmail: email,
      emailVerificationToken: token,
      memberPassword: 'password',
      memberNick: 'Alice_1',
      memberPhone: '+821012345678',
      memberType: 'USER',
    });
    return Response.json({
      member: {
        _id: 'a'.repeat(24),
        memberNick: 'Alice_1',
        memberType: 'USER',
      },
      accessToken: 'access',
      refreshToken: 'r'.repeat(43),
    });
  };
  const result = await proxy('signup', {
    memberEmail: email,
    emailVerificationToken: token,
    memberPassword: 'password',
    memberNick: 'Alice_1',
    memberPhone: '+821012345678',
    memberType: 'ADMIN',
    code: '000123',
    challengeId: id,
  });
  assert.equal(result.statusCode, 200);
  assert.match(result.headers['Set-Cookie'][0], /HttpOnly/);
  assert.equal(result.body.emailVerificationToken, undefined);
});
for (const [reason, status] of [
  ['INVALID_REQUEST', 400],
  ['EMAIL_VERIFICATION_INVALID', 400],
  ['EMAIL_VERIFICATION_REQUIRED', 400],
  ['EMAIL_VERIFICATION_ATTEMPTS_EXHAUSTED', 400],
  ['EMAIL_VERIFICATION_THROTTLED', 429],
  ['EMAIL_VERIFICATION_UNAVAILABLE', 503],
])
  test(`safe ${reason} survives proxy/session/auth normalization without raw messages`, async () => {
    global.fetch = async () =>
      Response.json(
        {
          reason,
          retryAfterSeconds: 3.2,
          message: 'SMTP private detail',
          code: '000123',
          field: 'private',
        },
        { status },
      );
    const result = await proxy('signup');
    assert.equal(result.body.reason, reason);
    assert.equal(result.body.message, undefined);
    assert.equal(result.body.field, undefined);
    if (status >= 429) assert.equal(result.headers['Retry-After'], '4');
    global.fetch = async () => Response.json(result.body, { status });
    await assert.rejects(
      authenticate('signup', {}, signal()),
      (error) =>
        error instanceof AuthError &&
        error.verificationReason === reason &&
        !error.message.includes('private'),
    );
  });
test('retry metadata clamps only finite numeric values and ignores unknown/mismatched reasons', () => {
  for (const [input, expected] of [
    [0, 1],
    [1.1, 2],
    [999999, 86400],
    [-1, undefined],
    ['60', undefined],
    [NaN, undefined],
    [Infinity, undefined],
  ])
    assert.equal(
      verificationProblem(
        { reason: 'EMAIL_VERIFICATION_THROTTLED', retryAfterSeconds: input },
        429,
      ).retryAfterSeconds,
      expected,
    );
  for (const reason of [
    'SMTP_PASSWORD',
    'USERNAME_TAKEN',
    '__proto__',
    'EMAIL_VERIFICATION_INVALID',
  ])
    assert.deepEqual(
      verificationProblem({ reason, retryAfterSeconds: 60 }, 429),
      {},
    );
});
test('verification routes preserve method/origin/header protections and reject arbitrary actions', async () => {
  global.fetch = () => assert.fail('No upstream call');
  for (const extra of [
    { method: 'GET' },
    { headers: { origin: 'http://other.test', host: 'app.test' } },
    {
      headers: {
        origin: 'http://app.test',
        host: 'app.test',
        'content-type': 'application/json',
      },
    },
  ])
    assert.ok(
      [403, 405].includes((await proxy('email-request', {}, extra)).statusCode),
    );
  assert.equal((await proxy('http://evil.test')).statusCode, 404);
  assert.equal((await proxy(['email-request'])).statusCode, 404);
});
test('bad verification success payloads and network failures cannot produce usable proof/cookies', async () => {
  for (const [action, bad] of [
    ['email-request', { ...challenge, challengeId: 'bad' }],
    ['email-request', { ...challenge, retryAfterSeconds: -1 }],
    ['email-verify', { ...proof, expiresInSeconds: 0 }],
    ['email-verify', { accessToken: 'not-proof' }],
    ['email-verify', null],
  ]) {
    global.fetch = async () => Response.json(bad);
    const result = await proxy(action);
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.reason, 'EMAIL_VERIFICATION_UNAVAILABLE');
    assert.equal(result.headers['Set-Cookie'], undefined);
  }
  global.fetch = async () => {
    throw Error('private upstream error');
  };
  const result = await proxy('email-request');
  assert.equal(result.statusCode, 503);
  assert.ok(!JSON.stringify(result).includes('private upstream'));
});
test('browser transports use same-origin POST, exact fields and validate response shapes', async () => {
  global.fetch = async (url, options) => {
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers['X-MedConnect-Session'], '1');
    assert.equal(options.cache, 'no-store');
    if (url.endsWith('email-request')) {
      assert.deepEqual(JSON.parse(options.body), {
        memberEmail: email,
        requestId: 'uuid',
      });
      return Response.json(challenge);
    }
    assert.deepEqual(JSON.parse(options.body), {
      memberEmail: email,
      challengeId: id,
      code: '000123',
    });
    return Response.json(proof);
  };
  assert.deepEqual(await requestEmailCode(email, 'uuid', signal()), challenge);
  assert.deepEqual(await verifyEmailCode(email, id, '000123', signal()), proof);
  global.fetch = async () =>
    Response.json({ emailVerificationToken: 'bad', expiresInSeconds: 600 });
  await assert.rejects(
    verifyEmailCode(email, id, '000123', signal()),
    SessionError,
  );
});
test('state normalizes/binds email, sends once per click and requires proof before submission', async () => {
  const pending = deferred();
  let calls = 0;
  const { check } = fixture(async (normalized) => {
    calls++;
    assert.equal(normalized, email);
    return pending.promise;
  });
  const task = check.send(' ALICE@EXAMPLE.TEST ');
  await check.send(email);
  assert.equal(calls, 1);
  assert.equal(check.token(email), undefined);
  pending.resolve(challenge);
  await task;
  await check.verify('000123');
  assert.equal(check.token('ALICE@example.test'), token);
  assert.equal(check.token('other@example.test'), undefined);
  check.edit('other@example.test');
  assert.equal(check.token(email), undefined);
  assert.equal(check.snapshot().challengeId, undefined);
});
test('invalid local email/code avoids sending or using a backend guess', async () => {
  let sends = 0,
    verifies = 0;
  const { check } = fixture(
    async () => {
      sends++;
      return challenge;
    },
    async () => {
      verifies++;
      return proof;
    },
  );
  await check.send('bad');
  assert.equal(sends, 0);
  await check.send(email);
  for (const code of ['12345', '１２３４５６', 'abcdef'])
    await check.verify(code);
  assert.equal(verifies, 0);
  await check.verify('000123');
  assert.equal(verifies, 1);
});
test('email edits, returning to the same address and mode reset fence stale send/verify responses', async () => {
  for (const phase of ['send', 'verify']) {
    const pending = deferred();
    let requestSignal;
    const { check } = fixture(
      phase === 'send'
        ? async (_e, _id, s) => {
            requestSignal = s;
            return pending.promise;
          }
        : undefined,
      phase === 'verify'
        ? async (_e, _id, _code, s) => {
            requestSignal = s;
            return pending.promise;
          }
        : undefined,
    );
    let task;
    if (phase === 'send') task = check.send(email);
    else {
      await check.send(email);
      task = check.verify('000123');
    }
    check.edit('other@example.test');
    check.edit(email);
    check.reset();
    assert.equal(requestSignal.aborted, true);
    pending.resolve(phase === 'send' ? challenge : proof);
    await task;
    assert.equal(check.token(email), undefined);
    assert.equal(check.snapshot().status, 'idle');
  }
});
test('uncertain send retry reuses its ID, deliberate resend gets a new ID and both respect server delay', async () => {
  const ids = [];
  const { check, advance } = fixture(async (_email, id) => {
    ids.push(id);
    if (ids.length === 1)
      throw new SessionError(503, false, 'EMAIL_VERIFICATION_UNAVAILABLE', 30);
    return challenge;
  });
  await check.send(email);
  const original = check.snapshot().uncertainRequestId;
  await check.send(email, true);
  assert.equal(ids.length, 1);
  advance(30000);
  await check.send(email, true);
  assert.equal(ids[1], original);
  advance(60000);
  await check.send(email);
  assert.notEqual(ids[2], original);
});
for (const wait of [3600, 10800, 18000, 86400])
  test(`server ${wait}s cooldown survives deadline recomputation and blocks resends while code/proof remain usable`, async () => {
    let sends = 0;
    const { check, advance } = fixture(async () => {
      sends++;
      return { ...challenge, retryAfterSeconds: wait };
    });
    await check.send(email);
    const deadline = check.snapshot().nextSendAt;
    await check.verify('000123');
    assert.equal(check.token(email), token);
    advance(1500);
    assert.equal(remainingSeconds(deadline, 1001500), wait - 1);
    await check.send(email);
    assert.equal(sends, 1);
    assert.equal(check.token(email), token);
    advance(wait * 1000);
    await check.send(email);
    assert.equal(sends, 2);
  });
test('reload obtains long-block timing only on the next explicit send and never retains proof', async () => {
  const { check } = fixture(async () => {
    throw new SessionError(429, false, 'EMAIL_VERIFICATION_THROTTLED', 86400);
  });
  assert.equal(check.snapshot().nextSendAt, 0);
  await check.send(email);
  assert.equal(check.snapshot().nextSendAt, 1000000 + 86400000);
  assert.equal(check.token(email), undefined);
});
test('wrong code remains recoverable; exhausted guesses require a new challenge', async () => {
  let verifies = 0;
  const { check, advance } = fixture(undefined, async () => {
    if (++verifies === 1)
      throw new SessionError(400, false, 'EMAIL_VERIFICATION_INVALID');
    if (verifies === 2)
      throw new SessionError(
        400,
        false,
        'EMAIL_VERIFICATION_ATTEMPTS_EXHAUSTED',
      );
    return proof;
  });
  await check.send(email);
  await check.verify('123456');
  assert.equal(check.snapshot().status, 'code');
  assert.equal(check.snapshot().exhausted, false);
  await check.verify('123456');
  assert.equal(check.snapshot().exhausted, true);
  await check.verify('000123');
  assert.equal(verifies, 2);
  advance(60000);
  await check.send(email);
  assert.equal(check.snapshot().exhausted, false);
  await check.verify('000123');
  assert.equal(check.token(email), token);
});
test('code/proof expire at exact equality and deliberate resend clears prior proof', async () => {
  const { check, advance } = fixture();
  await check.send(email);
  advance(600000);
  assert.equal(check.snapshot().challengeId, undefined);
  await check.send(email);
  await check.verify('000123');
  advance(599999);
  assert.equal(check.token(email), token);
  advance(1);
  assert.equal(check.token(email), undefined);
  assert.equal(check.snapshot().status, 'idle');
  await check.send(email);
  await check.verify('000123');
  advance(60000);
  await check.send(email);
  assert.equal(check.token(email), undefined);
});
test('server-rejected signup proof clears only email authorization; username conflict retains it', async () => {
  const { check } = fixture();
  await check.send(email);
  await check.verify('000123');
  global.fetch = async () =>
    Response.json(
      { reason: 'USERNAME_TAKEN', field: 'memberNick' },
      { status: 409 },
    );
  await assert.rejects(
    authenticate('signup', {}, signal()),
    (e) => e.usernameTaken === true,
  );
  assert.equal(check.token(email), token);
  check.rejectProof();
  assert.equal(check.token(email), undefined);
  assert.equal(check.snapshot().challengeId, undefined);
});

test('a newly received deadline never displays an extra second from a stale interval tick', () => {
  require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { EmailVerification: Controls } = require('../components/auth/EmailVerification.tsx');
  const now = Date.now();
  const html = renderToStaticMarkup(React.createElement(Controls, {
    email, disabled: false,
    verification: { check: {}, now: now - 900, state: { email, status: 'code', challengeId: id, codeExpiresAt: now + 600000, nextSendAt: now + 60000, nextVerifyAt: 0, exhausted: false, message: '', error: false } },
  }));
  assert.match(html, /Code expires in 10m 0s/);
  assert.doesNotMatch(html, /10m 1s|1m 1s/);
});
