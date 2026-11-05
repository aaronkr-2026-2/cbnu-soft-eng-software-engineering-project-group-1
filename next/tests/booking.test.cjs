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
const { sessionProxy } = require('../libs/server/session-proxy.ts');
const { authReturn } = require('../libs/auth-return.ts');
const {
  parseProblem,
  needsForfeit,
  timeLabel,
  sameTarget,
} = require('../libs/booking.ts');
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
process.env.API_URL = 'http://api.example.test';
const token = 'r'.repeat(43);
const member = { _id: 'a'.repeat(24), memberNick: 'test', memberType: 'USER' };
const auth = {
  member: { ...member, memberPassword: 'private' },
  accessToken: 'access',
  refreshToken: token,
};
const request = (action, extra = {}) => ({
  method: 'POST',
  query: { action },
  headers: {
    origin: 'http://app.example.test',
    host: 'app.example.test',
    'x-medconnect-session': '1',
    'content-type': 'application/json',
  },
  body: {},
  cookies: {},
  ...extra,
});
function response() {
  return {
    statusCode: 200,
    headers: {},
    status(value) {
      this.statusCode = value;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(value) {
      this.body = value;
    },
    end() {},
  };
}
async function call(action, extra) {
  const res = response();
  await sessionProxy(request(action, extra), res);
  return res;
}
test('session actions reject GET and cross-origin/CSRF requests before forwarding', async () => {
  global.fetch = () => assert.fail('No upstream request expected');
  for (const change of [
    { method: 'GET' },
    { headers: { origin: 'http://other.test', host: 'app.example.test' } },
    {
      headers: {
        origin: 'http://app.example.test',
        host: 'app.example.test',
        'content-type': 'application/json',
      },
    },
  ]) {
    const result = await call('login', change);
    assert.ok([403, 405].includes(result.statusCode));
    assert.equal(result.headers['Cache-Control'], 'no-store');
  }
});
test('login exposes only allowlisted member and access token; refresh cookie is HttpOnly', async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, 'http://api.example.test/member/login');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Cookie, undefined);
    assert.deepEqual(JSON.parse(options.body), {
      memberEmail: 'test@example.test',
      memberPassword: 'password',
    });
    return Response.json(auth);
  };
  const res = await call('login', {
    body: {
      memberEmail: 'test@example.test',
      memberPassword: 'password',
      memberType: 'ADMIN',
    },
    cookies: { unrelated: 'private' },
  });
  assert.deepEqual(res.body, { member, accessToken: 'access' });
  const cookies = res.headers['Set-Cookie'].join(';');
  assert.match(cookies, /HttpOnly/);
  assert.match(cookies, /SameSite=Lax/);
  assert.match(cookies, /Path=\/api\/session/);
  assert.ok(!JSON.stringify(res.body).includes(token));
});
test('signup always requests a patient account', async () => {
  global.fetch = async (url, options) => {
    assert.equal(JSON.parse(options.body).memberType, 'USER');
    return Response.json(auth);
  };
  assert.equal(
    (await call('signup', { body: { memberType: 'ADMIN' } })).statusCode,
    200,
  );
});
test('parallel refresh requests coalesce rotation and return the same replacement cookie', async () => {
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'http://api.example.test/member/refresh');
    assert.deepEqual(JSON.parse(options.body), {
      refreshToken: 'c'.repeat(43),
    });
    await new Promise((r) => setTimeout(r, 10));
    return Response.json(auth);
  };
  const results = await Promise.all([
    call('refresh', { cookies: { medconnect_refresh: 'c'.repeat(43) } }),
    call('refresh', { cookies: { medconnect_refresh: 'c'.repeat(43) } }),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(
    results[0].headers['Set-Cookie'],
    results[1].headers['Set-Cookie'],
  );
  assert.equal(results[0].body.refreshToken, undefined);
});
test('invalid refresh clears the cookie; transient outages preserve it and sanitize errors', async () => {
  global.fetch = async () =>
    Response.json({ message: 'private stack trace' }, { status: 401 });
  let res = await call('refresh', {
    cookies: { medconnect_refresh: 'x'.repeat(43) },
  });
  assert.equal(res.statusCode, 401);
  assert.match(res.headers['Set-Cookie'], /Max-Age=0/);
  global.fetch = async () => {
    throw new Error('secret');
  };
  res = await call('refresh', {
    cookies: { medconnect_refresh: 'y'.repeat(43) },
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['Set-Cookie'], undefined);
  assert.ok(!JSON.stringify(res.body).includes('secret'));
});
test('Google nonce bridge forwards only its verified cookie to the login endpoint', async () => {
  global.fetch = async () =>
    Response.json(
      { nonce: 'signed.nonce.value' },
      {
        headers: {
          'set-cookie':
            'medconnect_google_nonce=signed.nonce.value; HttpOnly; Path=/',
        },
      },
    );
  const nonce = await call('nonce');
  assert.deepEqual(nonce.body, { nonce: 'signed.nonce.value' });
  assert.match(nonce.headers['Set-Cookie'], /HttpOnly/);
  global.fetch = async (url, options) => {
    assert.equal(url, 'http://api.example.test/member/google/login');
    assert.equal(
      options.headers.Cookie,
      'medconnect_google_nonce=signed.nonce.value',
    );
    return Response.json(auth);
  };
  const res = await call('google', {
    body: { idToken: 'id-token' },
    cookies: {
      medconnect_nonce: 'medconnect_google_nonce:signed.nonce.value',
      unrelated: 'secret',
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.refreshToken, undefined);
});
test('logout expires only the local session cookies', async () => {
  global.fetch = () => assert.fail('No nonexistent revoke endpoint');
  const res = await call('logout');
  assert.equal(res.headers['Set-Cookie'].length, 2);
  for (const cookie of res.headers['Set-Cookie'])
    assert.match(cookie, /Max-Age=0/);
});
test('auth returns remain restricted to relative patient routes', () => {
  for (const url of [
    'https://evil.test/book',
    '//evil.test',
    '/auth',
    '/mypage',
  ])
    assert.equal(authReturn(url), '/');
  assert.equal(authReturn('/book?doctorId=abc'), '/book?doctorId=abc');
});
const commitment = {
  kind: 'APPOINTMENT',
  id: 'a'.repeat(24),
  doctorId: 'b'.repeat(24),
  clinicId: 'c'.repeat(24),
  specialty: 'DENTIST',
  startsAt: '2099-01-01T00:00:00.000Z',
  endsAt: '2099-01-01T00:30:00.000Z',
  status: 'CONFIRMED',
  version: 'version',
};
test('replace is shown only for a single current, versioned blocker and server choice', () => {
  const parse = (rows, choices = ['KEEP', 'REPLACE']) =>
    parseProblem({
      reason: 'COMMITMENT_CONFLICT',
      existingCommitments: rows,
      choices,
    });
  assert.deepEqual(parse([commitment]).choices, ['KEEP', 'REPLACE']);
  assert.deepEqual(parse([commitment, commitment]).choices, ['KEEP']);
  assert.deepEqual(parse([{ ...commitment, version: null }]).choices, ['KEEP']);
  assert.deepEqual(parse([{ ...commitment, status: 'CANCELED' }]).choices, [
    'KEEP',
  ]);
  assert.deepEqual(parse([commitment], ['KEEP']).choices, ['KEEP']);
  assert.equal(parse([{ ...commitment, id: 'invalid' }]), undefined);
});
test('forfeit acknowledgement is required only when an appointment becomes a waitlist', () => {
  assert.equal(
    needsForfeit({
      operation: 'REPLACE',
      kind: 'WAITLIST',
      original: commitment,
    }),
    true,
  );
  assert.equal(needsForfeit({ operation: 'CREATE', kind: 'WAITLIST' }), false);
  assert.equal(
    needsForfeit({
      operation: 'REPLACE',
      kind: 'APPOINTMENT',
      original: commitment,
    }),
    false,
  );
});
test('target comparisons normalize timestamps; displayed time uses the clinic timezone', () => {
  assert.equal(
    sameTarget(commitment, {
      ...commitment,
      startsAt: '2099-01-01T09:00:00+09:00',
    }),
    true,
  );
  assert.equal(
    sameTarget(commitment, { ...commitment, doctorId: 'd'.repeat(24) }),
    false,
  );
  assert.match(timeLabel('2099-01-01T00:00:00Z', 'Asia/Seoul', false), /9:00/);
});
const { startSession, clearSession } = require('../libs/auth-session.ts');
const { execute, BookingError } = require('../libs/api/booking.ts');
const access = () =>
  `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.signature`;
const action = {
  operation: 'CREATE',
  kind: 'APPOINTMENT',
  target: {
    doctorId: commitment.doctorId,
    clinicId: commitment.clinicId,
    specialty: commitment.specialty,
    startsAt: commitment.startsAt,
  },
};
process.env.NEXT_PUBLIC_GRAPHQL_URL = 'http://api.example.test/graphql';
test('authenticated mutation omits cookies and shared caches and is sent once', async () => {
  const accessToken = access();
  startSession({ member, accessToken });
  let calls = 0;
  global.fetch = async (url, options) => {
    if (url.startsWith('/api/')) return Response.json({ signedOut: true });
    calls++;
    assert.equal(options.headers.Authorization, `Bearer ${accessToken}`);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    return Response.json({
      data: { bookAppointment: { _id: commitment.id, status: 'CONFIRMED' } },
    });
  };
  try {
    const receipt = await execute(action, new AbortController().signal);
    assert.equal(receipt.record.status, 'CONFIRMED');
    assert.equal(calls, 1);
  } finally {
    clearSession();
    await new Promise((r) => setImmediate(r));
  }
});
test('lost mutation response is uncertain and never automatically retried', async () => {
  startSession({ member, accessToken: access() });
  let calls = 0;
  global.fetch = async (url) => {
    if (url.startsWith('/api/')) return Response.json({ signedOut: true });
    calls++;
    throw new Error('private connection details');
  };
  try {
    await assert.rejects(
      execute(action, new AbortController().signal),
      (e) =>
        e instanceof BookingError &&
        e.uncertain &&
        !e.message.includes('private'),
    );
    assert.equal(calls, 1);
  } finally {
    clearSession();
    await new Promise((r) => setImmediate(r));
  }
});
test('HTTP-200 structured conflicts remain definitive and expose only reviewed choices', async () => {
  startSession({ member, accessToken: access() });
  global.fetch = async (url) =>
    url.startsWith('/api/')
      ? Response.json({ signedOut: true })
      : Response.json({
          errors: [
            {
              message: 'private',
              extensions: {
                code: 'CONFLICT',
                booking: {
                  reason: 'COMMITMENT_CONFLICT',
                  existingCommitments: [commitment],
                  choices: ['KEEP', 'REPLACE'],
                },
              },
            },
          ],
        });
  try {
    await assert.rejects(
      execute(action, new AbortController().signal),
      (e) =>
        !e.uncertain &&
        e.problem.choices.includes('REPLACE') &&
        !e.message.includes('private'),
    );
  } finally {
    clearSession();
    await new Promise((r) => setImmediate(r));
  }
});
const { fetchMembers } = require('../libs/api/public-members.ts');
test('clinic discovery uses the approved-doctor list and public member lookup only', async () => {
  let count = 0;
  global.fetch = async (url, options) => {
    count++;
    const { query, variables } = JSON.parse(options.body);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.ok(!query.includes('getClinics'));
    assert.ok(!query.includes('getClinicDoctors'));
    return query.includes('getDoctors')
      ? Response.json({
          data: {
            getDoctors: [
              {
                _id: 'b'.repeat(24),
                memberNick: 'doctor',
                clinicId: 'a'.repeat(24),
              },
              {
                _id: 'c'.repeat(24),
                memberNick: 'doctor2',
                clinicId: 'a'.repeat(24),
              },
            ],
          },
        })
      : Response.json({
          data: {
            getMember: {
              _id: variables.id,
              memberType: 'CLINIC',
              memberNick: 'clinic',
              clinicName: 'Clinic',
            },
          },
        });
  };
  const clinics = await fetchMembers(undefined, new AbortController().signal);
  assert.equal(clinics.length, 1);
  assert.equal(count, 2);
});
test('clinic doctor discovery reads the public clinic-specific endpoint without global doctor discovery', async () => {
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.match(body.query, /getClinicDoctors/);
    assert.doesNotMatch(body.query, /getDoctors\s*\{/);
    assert.deepEqual(body.variables, { clinicId: 'clinic1' });
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    return Response.json({
      data: {
        getClinicDoctors: [
          { _id: '1', memberNick: 'a', clinicId: 'clinic1' },
          { _id: '2', memberNick: 'b', clinicId: 'clinic2' },
        ],
      },
    });
  };
  assert.deepEqual(
    (await fetchMembers('clinic1', new AbortController().signal)).map(
      (row) => row._id,
    ),
    ['1'],
  );
});
const {
  monthDays,
  isWorkingDate,
  workingDate,
  shiftDay,
  shiftMonth,
} = require('../libs/booking-calendar.ts');
test('calendar builds complete weekday rows, including leap day and Sunday starts', () => {
  const leap = monthDays('2028-02');
  assert.ok(leap.flat().includes('2028-02-29'));
  assert.equal(leap[0][0], null);
  assert.equal(leap[0][2], '2028-02-01');
  assert.ok(leap.every((row) => row.length === 7));
  assert.equal(monthDays('2026-11')[0][0], '2026-11-01');
  assert.equal(monthDays('2026-02').flat().filter(Boolean).length, 28);
});
test('calendar month movement clamps the day and crosses year boundaries', () => {
  assert.equal(shiftMonth('2026-01-31', 1), '2026-02-28');
  assert.equal(shiftMonth('2028-01-31', 1), '2028-02-29');
  assert.equal(shiftMonth('2026-12-31', 1), '2027-01-31');
  assert.equal(shiftMonth('2027-01-01', -1), '2026-12-01');
});
test('calendar day movement stays date-only across DST and year boundaries', () => {
  assert.equal(shiftDay('2026-03-08', 1), '2026-03-09');
  assert.equal(shiftDay('2026-11-01', -1), '2026-10-31');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
});

test('booking dates skip weekends across months and years', () => {
  assert.equal(isWorkingDate('2026-11-01'), false);
  assert.equal(isWorkingDate('2026-11-07'), false);
  assert.equal(workingDate('2026-11-01'), '2026-11-02');
  assert.equal(workingDate('2026-11-07', -1), '2026-11-06');
  assert.equal(workingDate('2028-01-01'), '2028-01-03');
  assert.equal(workingDate('2028-01-01', -1), '2027-12-31');
  assert.equal(workingDate('2026-11-06'), '2026-11-06');
});

test('signup bridge forwards only the exact username-conflict marker', async () => {
  for (const detail of [
    { reason: 'USERNAME_TAKEN', field: 'memberNick', secret: 'private', message: 'private' },
    { reason: 'USERNAME_TAKEN', field: 'memberPhone', message: 'private' },
    { reason: 'OTHER', field: 'memberNick', message: 'private' },
  ]) {
    global.fetch = async () => Response.json(detail, { status: 409 });
    const res = await call('signup');
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.reason, detail.field === 'memberNick' && detail.reason === 'USERNAME_TAKEN' ? 'USERNAME_TAKEN' : undefined);
    assert.equal(res.body.secret, undefined);
    assert.ok(!JSON.stringify(res.body).includes('private'));
  }
  global.fetch = async () => Response.json({ reason: 'USERNAME_TAKEN', field: 'memberNick' }, { status: 409 });
  assert.equal((await call('login')).body.reason, undefined);
});
