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
const {
  notificationTitle,
  notificationStatus,
  notificationIdPattern,
  slotBookingLink,
  ownedCareLink,
  linkedBookingTarget,
} = require('../libs/notification.ts');
const {
  notificationPages,
  notificationContext,
  getNotification,
  markNotificationRead,
} = require('../libs/api/notification.ts');
const { startSession, clearSession } = require('../libs/auth-session.ts');
const { authReturn } = require('../libs/auth-return.ts');
const originalFetch = global.fetch;
afterEach(async () => {
  clearSession();
  await new Promise((r) => setImmediate(r));
  global.fetch = originalFetch;
});
process.env.NEXT_PUBLIC_GRAPHQL_URL = 'http://api.example.test/graphql';
const notice = (id, type = 'WAITLIST_JOINED') => ({
  _id: id.repeat(64),
  type,
  message: 'Historical notice',
  waitlistId: 'a'.repeat(24),
  doctorId: 'b'.repeat(24),
  clinicId: 'c'.repeat(24),
  appointmentId: null,
  startsAt: '2026-11-05T00:00:00.000Z',
  endsAt: '2026-11-05T00:30:00.000Z',
  occurredAt: '2026-11-01T00:00:00.000Z',
  readAt: null,
});
function mock(callback) {
  startSession({
    member: { _id: 'd'.repeat(24), memberNick: 'patient', memberType: 'USER' },
    accessToken: `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`,
  });
  global.fetch = async (url, options) => {
    if (url.startsWith('/api/')) return Response.json({ signedOut: true });
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    assert.match(options.headers.Authorization, /^Bearer /);
    return callback(JSON.parse(options.body));
  };
}
test('notification identifiers and auth returns accept only the supported owned route shape', () => {
  assert.equal(notificationIdPattern.test('a'.repeat(64)), true);
  assert.equal(notificationIdPattern.test('a'.repeat(24)), false);
  assert.equal(
    authReturn('/notifications?notificationId=' + 'a'.repeat(64)),
    '/notifications?notificationId=' + 'a'.repeat(64),
  );
  assert.equal(authReturn('//evil.test/notifications'), '/');
});
test('historical notification titles never assert a current booking or free slot', () => {
  assert.equal(
    notificationTitle('WAITLIST_BOOKING_CREATED'),
    'Waitlist booking update',
  );
  assert.equal(
    notificationTitle('SLOT_OPEN_FOR_MANUAL_BOOKING'),
    'An opening was reported',
  );
  assert.equal(notificationTitle('UNKNOWN'), 'Care notification');
});
test('current context distinguishes confirmed, canceled, occupied, unreserved and missing targets', () => {
  assert.match(
    notificationStatus({
      targetKind: 'APPOINTMENT',
      appointment: { status: 'CONFIRMED' },
    }),
    /confirmed/,
  );
  assert.equal(
    notificationStatus({
      targetKind: 'APPOINTMENT',
      appointment: { status: 'CANCELED' },
    }),
    'Appointment status: canceled',
  );
  assert.equal(
    notificationStatus({ targetKind: 'SLOT', slot: { state: 'OCCUPIED' } }),
    'This slot is currently occupied',
  );
  assert.match(
    notificationStatus({ targetKind: 'SLOT', slot: { state: 'AVAILABLE' } }),
    /not reserved/,
  );
  assert.match(
    notificationStatus({ targetKind: 'UNAVAILABLE' }),
    /no longer available/,
  );
});
test('booking links retain the exact doctor, clinic, specialty and instant with no mutation', () => {
  const target = {
    doctorId: 'b'.repeat(24),
    clinicId: 'c'.repeat(24),
    specialty: 'CARDIOLOGIST',
    startsAt: '2026-11-05T00:00:00.000Z',
  };
  const url = new URL(slotBookingLink(target), 'https://example.test');
  assert.equal(url.pathname, '/book');
  assert.deepEqual(
    linkedBookingTarget(Object.fromEntries(url.searchParams)),
    target,
  );
  assert.equal(linkedBookingTarget({ ...target, doctorId: 'bad' }), undefined);
  assert.equal(
    linkedBookingTarget({ ...target, startsAt: 'invalid' }),
    undefined,
  );
  assert.equal(
    linkedBookingTarget({ ...target, specialty: ['DENTIST'] }),
    undefined,
  );
});
test('care links select owned detail routes rather than treating a historical notification as confirmation', () => {
  assert.equal(
    ownedCareLink(
      { ...notice('a'), appointmentId: 'e'.repeat(24) },
      'APPOINTMENT',
    ),
    '/appointments?appointmentId=' + 'e'.repeat(24),
  );
  assert.equal(
    ownedCareLink(notice('a'), 'WAITLIST'),
    '/waitlist?waitlistId=' + 'a'.repeat(24),
  );
});
test('inbox pages are deduplicated, newest-first and never add a patient identity argument', async () => {
  let calls = 0;
  mock(({ variables }) => {
    calls++;
    assert.equal(variables.input.patientId, undefined);
    assert.equal(variables.input.unreadOnly, true);
    return Response.json({
      data: {
        myNotifications: {
          entries: calls === 1 ? [notice('b')] : [notice('b'), notice('a')],
          nextCursor: calls === 1 ? 'b'.repeat(64) : null,
          unreadCount: 2,
        },
      },
    });
  });
  const result = await notificationPages(true, 2, new AbortController().signal);
  assert.deepEqual(
    result.entries.map((row) => row._id),
    ['b'.repeat(64), 'a'.repeat(64)],
  );
  assert.equal(result.unreadCount, 2);
  assert.equal(calls, 2);
});
test('opening notification/context issues reads only and preserves unread state', async () => {
  const item = notice('a');
  const queries = [];
  mock(({ query, variables }) => {
    queries.push(query);
    assert.deepEqual(variables, { id: item._id });
    assert.ok(!query.includes('mutation'));
    return Response.json({
      data: query.includes('notificationContext')
        ? {
            notificationContext: {
              notification: item,
              targetKind: 'UNAVAILABLE',
              checkedAt: item.occurredAt,
              appointment: null,
              slot: null,
              waitlist: null,
            },
          }
        : { getNotification: item },
    });
  });
  assert.equal(
    (await getNotification(item._id, new AbortController().signal)).readAt,
    null,
  );
  assert.equal(
    (await notificationContext(item._id, new AbortController().signal))
      .notification.readAt,
    null,
  );
  assert.equal(queries.length, 2);
});
test('mark-read sends one mutation and leaves ambiguous responses for read reconciliation', async () => {
  let count = 0;
  mock(({ query, variables }) => {
    count++;
    assert.match(query, /markNotificationRead/);
    assert.deepEqual(variables, { id: 'a'.repeat(64) });
    throw new Error('response lost');
  });
  await assert.rejects(
    markNotificationRead('a'.repeat(64), new AbortController().signal),
    (error) => error.uncertain === true,
  );
  assert.equal(count, 1);
});
test('HTTP-200 foreign-context rejection does not expose server payloads', async () => {
  mock(() =>
    Response.json({
      errors: [
        {
          message: 'private patient details',
          extensions: { code: 'NOT_FOUND' },
        },
      ],
    }),
  );
  await assert.rejects(
    notificationContext('a'.repeat(64), new AbortController().signal),
    (error) =>
      error.code === 'NOT_FOUND' && !error.message.includes('private patient'),
  );
});
