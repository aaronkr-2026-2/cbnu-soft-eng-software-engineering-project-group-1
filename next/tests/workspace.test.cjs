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
  calendarWindow,
  clinicMidnight,
  entriesForDay,
  validateHours,
  validateOverrides,
} = require('../libs/workspace.ts');
const {
  calendarSnapshot,
  calendarUpdates,
  staffBooking,
  reviewDoctor,
  setWeeklyHours,
} = require('../libs/api/workspace.ts');
const { startSession, clearSession } = require('../libs/auth-session.ts');
const originalFetch = global.fetch;
afterEach(async () => {
  clearSession();
  await new Promise((r) => setImmediate(r));
  global.fetch = originalFetch;
});
process.env.NEXT_PUBLIC_GRAPHQL_URL = 'http://api.example.test/graphql';
const row = (id, start = '2026-11-04T00:00:00.000Z') => ({
  _id: id,
  doctorId: 'b'.repeat(24),
  clinicId: 'a'.repeat(24),
  patientId: 'c'.repeat(24),
  specialty: 'DENTIST',
  startsAt: start,
  endsAt: new Date(+new Date(start) + 1800000).toISOString(),
  source: 'ONLINE',
  status: 'CONFIRMED',
  version: 'version',
  clinicTimezone: 'Asia/Seoul',
});
const range = {
  from: '2026-11-03T15:00:00.000Z',
  to: '2026-11-04T15:00:00.000Z',
};
function signedIn() {
  startSession({
    member: { _id: 'a'.repeat(24), memberNick: 'clinic', memberType: 'CLINIC' },
    accessToken: `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`,
  });
}
function mock(callback) {
  signedIn();
  global.fetch = async (url, options) => {
    if (url.startsWith('/api/')) return Response.json({ signedOut: true });
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    assert.match(options.headers.Authorization, /^Bearer /);
    return callback(JSON.parse(options.body));
  };
}
test('clinic-local calendar bounds use the clinic timezone instead of browser midnight', () => {
  assert.deepEqual(calendarWindow('2026-11-04', 1, 'Asia/Seoul'), range);
  assert.equal(
    clinicMidnight('2026-11-04', 'Pacific/Kiritimati'),
    '2026-11-03T10:00:00.000Z',
  );
});
test('day and week windows preserve DST-short and DST-long local dates', () => {
  for (const [date, hours] of [
    ['2026-03-08', 23],
    ['2026-11-01', 25],
  ]) {
    const window = calendarWindow(date, 1, 'America/New_York');
    assert.equal(
      (+new Date(window.to) - +new Date(window.from)) / 3600000,
      hours,
    );
  }
  assert.equal(
    clinicMidnight('2018-11-04', 'America/Sao_Paulo'),
    '2018-11-04T03:00:00.000Z',
  );
  const week = calendarWindow('2026-03-02', 7, 'America/New_York');
  assert.equal((+new Date(week.to) - +new Date(week.from)) / 3600000, 167);
});
test('invalid and skipped local dates are rejected rather than shifted silently', () => {
  assert.throws(() => clinicMidnight('2026-02-30', 'UTC'));
  assert.throws(() => clinicMidnight('2011-12-30', 'Pacific/Apia'));
});
test('calendar grouping includes overlapping records and excludes an exclusive end boundary', () => {
  const before = row('1', '2026-11-03T14:45:00.000Z'),
    end = row('2', '2026-11-04T15:00:00.000Z');
  assert.deepEqual(
    entriesForDay([before, end], '2026-11-04', 'Asia/Seoul').map((r) => r._id),
    ['1'],
  );
});
test('weekly schedule drafts accept splits/weekends and reject overlap or misaligned intervals', () => {
  assert.equal(
    validateHours([
      { weekday: 6, startMinute: 540, endMinute: 600 },
      { weekday: 6, startMinute: 600, endMinute: 660 },
    ]),
    '',
  );
  assert.ok(
    validateHours([
      { weekday: 1, startMinute: 540, endMinute: 600 },
      { weekday: 1, startMinute: 570, endMinute: 660 },
    ]),
  );
  assert.ok(validateHours([{ weekday: 1, startMinute: 541, endMinute: 600 }]));
  assert.equal(validateHours([]), '');
});
test('date overrides support full-day closure and clearing, and reject duplicate starts/overlap', () => {
  assert.equal(validateOverrides([{ type: 'UNAVAILABLE' }]), '');
  assert.equal(validateOverrides([]), '');
  assert.ok(validateOverrides([{ type: 'CUSTOM_HOURS' }]));
  assert.ok(
    validateOverrides([{ type: 'UNAVAILABLE' }, { type: 'UNAVAILABLE' }]),
  );
  assert.ok(
    validateOverrides([
      { type: 'CUSTOM_HOURS', startMinute: 540, endMinute: 660 },
      { type: 'CUSTOM_HOURS', startMinute: 600, endMinute: 720 },
    ]),
  );
});
test('calendar buffers consistent pages, binds continuation to revision and deduplicates IDs', async () => {
  let count = 0;
  mock(({ variables }) => {
    count++;
    assert.equal(variables.input.limit, 100);
    if (count === 1)
      return Response.json({
        data: {
          myCalendar: {
            entries: [row('1')],
            revision: 'a'.repeat(64),
            nextCursor: '1',
            clinicTimezone: 'Asia/Seoul',
          },
        },
      });
    assert.equal(variables.input.revision, 'a'.repeat(64));
    assert.equal(variables.input.after, '1');
    return Response.json({
      data: {
        myCalendar: {
          entries: [row('1'), row('2')],
          revision: 'a'.repeat(64),
          nextCursor: null,
          clinicTimezone: 'Asia/Seoul',
        },
      },
    });
  });
  const result = await calendarSnapshot(range, new AbortController().signal);
  assert.deepEqual(
    result.entries.map((r) => r._id),
    ['1', '2'],
  );
  assert.equal(count, 2);
});
test('a later-page conflict discards partial data and restarts the whole snapshot', async () => {
  let count = 0;
  mock(({ variables }) => {
    count++;
    if (count === 1)
      return Response.json({
        data: {
          myCalendar: {
            entries: [row('discard')],
            revision: 'a'.repeat(64),
            nextCursor: 'discard',
            clinicTimezone: 'Asia/Seoul',
          },
        },
      });
    if (count === 2)
      return Response.json({
        errors: [{ message: 'private', extensions: { code: 'CONFLICT' } }],
      });
    assert.equal(variables.input.after, undefined);
    return Response.json({
      data: {
        myCalendar: {
          entries: [row('fresh')],
          revision: 'b'.repeat(64),
          nextCursor: null,
          clinicTimezone: 'Asia/Seoul',
        },
      },
    });
  });
  const result = await calendarSnapshot(range, new AbortController().signal);
  assert.deepEqual(
    result.entries.map((r) => r._id),
    ['fresh'],
  );
  assert.equal(count, 3);
});
test('unstable snapshots stop after bounded read retries and never expose partial results', async () => {
  let count = 0;
  mock(() => {
    count++;
    return Response.json({ errors: [{ extensions: { code: 'CONFLICT' } }] });
  });
  await assert.rejects(calendarSnapshot(range, new AbortController().signal));
  assert.equal(count, 3);
});
test('calendar polling sends the exact authorized window and known revision', async () => {
  mock(({ variables }) => {
    assert.deepEqual(variables.input, {
      ...range,
      knownRevision: 'a'.repeat(64),
    });
    return Response.json({
      data: {
        calendarUpdates: {
          revision: 'a'.repeat(64),
          changed: false,
          pollAfterSeconds: 5,
        },
      },
    });
  });
  assert.equal(
    (await calendarUpdates(range, 'a'.repeat(64), new AbortController().signal))
      .changed,
    false,
  );
});
test('staff mutation sends no clinic/patient impersonation fields and does not retry lost responses', async () => {
  let calls = 0;
  const input = {
    doctorId: 'b'.repeat(24),
    patientId: 'c'.repeat(24),
    specialty: 'DENTIST',
    startsAt: row('1').startsAt,
    source: 'PHONE',
  };
  mock(({ variables }) => {
    calls++;
    assert.deepEqual(variables.input, input);
    assert.equal(variables.input.clinicId, undefined);
    throw new Error('connection lost');
  });
  await assert.rejects(
    staffBooking(input, new AbortController().signal),
    (error) => error.uncertain === true,
  );
  assert.equal(calls, 1);
});
test('doctor review and complete weekly replacements map current backend arguments', async () => {
  mock(({ query, variables }) => {
    if (query.includes('reviewDoctorAffiliation')) {
      assert.deepEqual(variables, { doctorId: 'b'.repeat(24), approve: true });
      return Response.json({ data: { reviewDoctorAffiliation: 'APPROVED' } });
    }
    assert.deepEqual(variables.input, {
      doctorId: 'b'.repeat(24),
      intervals: [],
    });
    return Response.json({ data: { setDoctorWeeklyHours: true } });
  });
  assert.equal(
    await reviewDoctor('b'.repeat(24), true, new AbortController().signal),
    'APPROVED',
  );
  assert.equal(
    await setWeeklyHours('b'.repeat(24), [], new AbortController().signal),
    true,
  );
});
