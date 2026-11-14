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
  AccountDeletionReview,
  resolutionMessage,
} = require('../libs/account-deletion.ts');
const {
  deletionReadiness,
  cancelDeletionBlocker,
} = require('../libs/api/account-deletion.ts');
const { BookingError } = require('../libs/api/booking.ts');
const { startSession, clearSession } = require('../libs/auth-session.ts');
const originalFetch = global.fetch;
afterEach(async () => {
  clearSession();
  await new Promise((resolve) => setImmediate(resolve));
  global.fetch = originalFetch;
});
const id = (n) => n.toString(16).padStart(24, '0');
const row = (n, kind = 'APPOINTMENT', action) => ({
  id: id(n),
  kind,
  status: kind === 'APPOINTMENT' ? 'CONFIRMED' : 'ACTIVE',
  clinicId: id(100),
  doctorId: id(101),
  startsAt: '2035-01-01T01:00:00Z',
  endsAt: '2035-01-01T01:30:00Z',
  clinicName: 'Test clinic',
  doctorName: 'Test doctor',
  clinicTimezone: 'Asia/Seoul',
  permittedAction:
    action || (kind === 'APPOINTMENT' ? 'CANCEL_BOOKING' : 'CANCEL_WAITLIST'),
  resolutionReason: null,
});
const data = (appointments = [], waitlists = [], patch = {}) => ({
  asOf: '2026-11-14T00:00:00Z',
  ready: !appointments.length && !waitlists.length,
  appointmentCount: appointments.length,
  waitlistCount: waitlists.length,
  affiliationImpactCount: 0,
  appointments: { entries: appointments, nextCursor: null },
  waitlists: { entries: waitlists, nextCursor: null },
  ...patch,
});
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function signedIn() {
  startSession({
    member: { _id: id(1), memberNick: 'test_user', memberType: 'USER' },
    accessToken: `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`,
  });
  process.env.NEXT_PUBLIC_GRAPHQL_URL =
    'http://disposable.example.test/graphql';
}
const signal = () => new AbortController().signal;

test('readiness transport has fixed scope, no-store and bearer-only credentials', async () => {
  signedIn();
  global.fetch = async (_url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.match(options.headers.Authorization, /^Bearer /);
    const request = JSON.parse(options.body);
    assert.match(request.query, /query AccountDeletionReadiness/);
    assert.deepEqual(request.variables, { input: { appointmentAfter: id(5) } });
    assert.doesNotMatch(
      request.query,
      /patientId|memberEmail|automaticBookingConsent/,
    );
    return Response.json({ data: { accountDeletionReadiness: data() } });
  };
  assert.equal(
    (await deletionReadiness({ appointmentAfter: id(5) }, signal())).ready,
    true,
  );
});

test('HTTP-200 errors and incomplete or contradictory readiness fail safely', async () => {
  signedIn();
  for (const body of [
    {
      errors: [
        {
          message: 'private payload',
          extensions: {
            code: 'CONFLICT',
            accountDeletion: { reason: 'ACCOUNT_DELETION_DATA_UNRESOLVED' },
          },
        },
      ],
    },
    { data: { accountDeletionReadiness: { ready: true } } },
    { data: { accountDeletionReadiness: data([row(1)], [], { ready: true }) } },
    {
      data: {
        accountDeletionReadiness: data([], [], { appointmentCount: -1 }),
      },
    },
  ]) {
    global.fetch = async () => Response.json(body);
    await assert.rejects(
      deletionReadiness({}, signal()),
      (error) =>
        error instanceof BookingError && !error.message.includes('private'),
    );
  }
});

test('cancel uses existing booking/waitlist mutations, verifies the result and rejects unavailable actions', async () => {
  signedIn();
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.deepEqual(body.variables, { id: id(7) });
    return /cancelAppointment/.test(body.query)
      ? Response.json({
          data: { cancelAppointment: { _id: id(7), status: 'CANCELED' } },
        })
      : Response.json({
          data: { leaveWaitlist: { _id: id(7), status: 'WITHDRAWN' } },
        });
  };
  await cancelDeletionBlocker(row(7), signal());
  await cancelDeletionBlocker(row(7, 'WAITLIST'), signal());
  await assert.rejects(
    cancelDeletionBlocker(row(7, 'WAITLIST', 'NONE'), signal()),
    (error) => error.code === 'FORBIDDEN',
  );
  assert.equal(calls, 2);
});

test('lost cancellation replies and unexpected mutation results require reconciliation', async () => {
  signedIn();
  global.fetch = async () => {
    throw new TypeError('network failed');
  };
  await assert.rejects(
    cancelDeletionBlocker(row(1), signal()),
    (error) => error.uncertain,
  );
  global.fetch = async () =>
    Response.json({
      data: { cancelAppointment: { _id: id(1), status: 'CONFIRMED' } },
    });
  await assert.rejects(
    cancelDeletionBlocker(row(1), signal()),
    (error) => error.uncertain,
  );
});

test('an empty later page retains complete counts and cannot establish readiness', async () => {
  const first = data([row(1)], [], {
    appointmentCount: 8,
    appointments: { entries: [row(1)], nextCursor: id(1) },
  });
  let calls = 0;
  const review = new AccountDeletionReview(async () =>
    ++calls === 1 ? first : data([], [], { ready: false, appointmentCount: 8 }),
  );
  await review.refresh();
  await review.more('appointments');
  assert.equal(review.snapshot().data.appointmentCount, 8);
  assert.equal(review.snapshot().data.ready, false);
  assert.equal(review.snapshot().status, 'error');
});

test('pagination appends only its list and preserves the other list', async () => {
  const first = data([row(1)], [row(7, 'WAITLIST')], {
    appointmentCount: 2,
    appointments: { entries: [row(1)], nextCursor: id(1) },
  });
  const review = new AccountDeletionReview(async (input) =>
    input.appointmentAfter
      ? data([row(2)], [row(7, 'WAITLIST')], { appointmentCount: 2 })
      : first,
  );
  await review.refresh();
  await review.more('appointments');
  assert.deepEqual(
    review.snapshot().data.appointments.entries.map((r) => r.id),
    [id(1), id(2)],
  );
  assert.deepEqual(
    review.snapshot().data.waitlists.entries.map((r) => r.id),
    [id(7)],
  );
});

test('changed totals discard partial pagination and reload both lists from the start', async () => {
  let calls = 0;
  const inputs = [];
  const review = new AccountDeletionReview(async (input) => {
    inputs.push(input);
    calls++;
    return calls === 1
      ? data([row(1)], [], {
          appointmentCount: 2,
          appointments: { entries: [row(1)], nextCursor: id(1) },
        })
      : data();
  });
  await review.refresh();
  await review.more('appointments');
  assert.deepEqual(inputs, [{}, { appointmentAfter: id(1) }, {}]);
  assert.equal(review.snapshot().data.ready, true);
  assert.deepEqual(review.snapshot().data.appointments.entries, []);
});

test('repeated pagination cursors fail closed and offer a full refresh', async () => {
  const value = data([row(1)], [], {
    appointmentCount: 3,
    appointments: { entries: [row(1)], nextCursor: id(1) },
  });
  const review = new AccountDeletionReview(async () => value);
  await review.refresh();
  await review.more('appointments');
  assert.equal(review.snapshot().status, 'error');
  assert.match(review.snapshot().error, /Refresh/);
});

test('duplicate cancellation submissions are ignored while the operation is pending', async () => {
  const done = deferred();
  let cancels = 0;
  let loads = 0;
  const review = new AccountDeletionReview(
    async () => (++loads === 1 ? data([row(1)]) : data()),
    async () => {
      cancels++;
      await done.promise;
    },
  );
  await review.refresh();
  const pending = review.act(row(1));
  await review.act(row(1));
  assert.equal(review.snapshot().pending, `APPOINTMENT:${id(1)}`);
  assert.equal(cancels, 1);
  done.resolve();
  await pending;
  assert.equal(loads, 2);
  assert.equal(review.snapshot().data.ready, true);
});

test('successful cancellation remains applied when another cancellation fails', async () => {
  let loads = 0;
  const review = new AccountDeletionReview(
    async () => (++loads === 1 ? data([row(1), row(2)]) : data([row(2)])),
    async (item) => {
      if (item.id === id(2))
        throw new BookingError(
          'The clinic must resolve this visit.',
          'CONFLICT',
        );
    },
  );
  await review.refresh();
  await review.act(row(1));
  await review.act(row(2));
  assert.deepEqual(
    review.snapshot().data.appointments.entries.map((r) => r.id),
    [id(2)],
  );
  assert.equal(loads, 3);
  assert.equal(review.snapshot().status, 'ready');
  assert.match(review.snapshot().error, /clinic/);
});

test('uncertain cancellation refreshes before another action without replaying the mutation', async () => {
  const next = deferred();
  let loads = 0;
  let cancels = 0;
  const review = new AccountDeletionReview(
    async () => (++loads === 1 ? data([row(1)]) : next.promise),
    async () => {
      cancels++;
      throw new BookingError('Unconfirmed', '', undefined, true);
    },
  );
  await review.refresh();
  const pending = review.act(row(1));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(review.snapshot().status, 'loading');
  await review.act(row(1));
  assert.equal(cancels, 1);
  next.resolve(data());
  await pending;
  assert.equal(review.snapshot().data.ready, true);
  assert.match(review.snapshot().message, /could not be confirmed/);
});

test('a failed post-cancellation read disables actions and preserves success feedback for retry', async () => {
  let loads = 0;
  let cancels = 0;
  const review = new AccountDeletionReview(
    async () => {
      if (++loads === 1) return data([row(1)]);
      throw new Error('offline');
    },
    async () => {
      cancels++;
    },
  );
  await review.refresh();
  await review.act(row(1));
  await review.act(row(1));
  assert.equal(review.snapshot().status, 'error');
  assert.match(review.snapshot().message, /Booking canceled/);
  assert.equal(cancels, 1);
});

test('closing discards stale reads and aborted mutation results', async () => {
  const first = deferred();
  const review = new AccountDeletionReview(async () => first.promise);
  const pending = review.refresh();
  review.dispose();
  first.resolve(data([row(1)]));
  await pending;
  assert.equal(review.snapshot().data, null);
  const mutation = deferred();
  let loads = 0;
  const action = new AccountDeletionReview(
    async () => {
      loads++;
      return data([row(1)]);
    },
    async () => mutation.promise,
  );
  await action.refresh();
  const result = action.act(row(1));
  action.dispose();
  mutation.resolve();
  await result;
  assert.equal(loads, 1);
});

test('a late read cannot overwrite a newer refresh', async () => {
  const first = deferred();
  let calls = 0;
  const review = new AccountDeletionReview(async () =>
    ++calls === 1 ? first.promise : data(),
  );
  const initial = review.refresh();
  await review.refresh();
  first.resolve(data([row(1)]));
  await initial;
  assert.equal(review.snapshot().data.ready, true);
});

test('doctor, clinic, legacy and in-progress resolution messages identify the responsible actor', () => {
  assert.match(
    resolutionMessage('CONTACT_PATIENT_OR_CLINIC'),
    /patient or the clinic/,
  );
  assert.match(resolutionMessage('CONTACT_PATIENT'), /patient/);
  assert.match(resolutionMessage('VISIT_IN_PROGRESS'), /must end/);
  assert.match(resolutionMessage('LEGACY_RESOLUTION_REQUIRED'), /clinic/);
});

test('a readiness failure disables actions until an explicit successful retry', async () => {
  let reads = 0; let writes = 0;
  const review = new AccountDeletionReview(async () => {
    if (++reads === 1) throw new BookingError('Unavailable');
    return data([row(1)]);
  }, async () => { writes++; });
  await review.refresh(); await review.act(row(1));
  assert.equal(review.snapshot().status, 'error'); assert.equal(writes, 0);
  await review.refresh();
  assert.equal(review.snapshot().status, 'ready'); assert.equal(review.snapshot().error, '');
});

test('waitlist pagination sends its own cursor and preserves appointment blockers', async () => {
  const first = data([row(9)], [row(1, 'WAITLIST')], {
    waitlistCount: 2,
    waitlists: { entries: [row(1, 'WAITLIST')], nextCursor: id(1) },
  });
  const inputs = [];
  const review = new AccountDeletionReview(async (input) => {
    inputs.push(input);
    return input.waitlistAfter
      ? data([row(9)], [row(2, 'WAITLIST')], { waitlistCount: 2 })
      : first;
  });
  await review.refresh(); await review.more('waitlists');
  assert.deepEqual(inputs, [{}, { waitlistAfter: id(1) }]);
  assert.deepEqual(review.snapshot().data.waitlists.entries.map((item) => item.id), [id(1), id(2)]);
  assert.deepEqual(review.snapshot().data.appointments.entries.map((item) => item.id), [id(9)]);
});
