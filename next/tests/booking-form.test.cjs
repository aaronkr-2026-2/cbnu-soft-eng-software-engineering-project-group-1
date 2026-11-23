const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHookHarness, deferred } = require('./helpers/hook-harness.cjs');
const harness = (api = {}) =>
  createHookHarness(
    {
      '../../libs/api/booking': api,
      '../../libs/api/public-members': api,
    },
    'components/booking',
  );
const clinicId = 'a'.repeat(24),
  doctorId = 'b'.repeat(24);
const target = {
  clinicId,
  doctorId,
  specialty: 'CARDIOLOGIST',
  startsAt: '2035-01-01T01:00:00.000Z',
};
const clinic = {
  _id: clinicId,
  memberNick: 'Clinic',
  clinicTimezone: 'Asia/Seoul',
};
const doctor = {
  _id: doctorId,
  memberNick: 'Doctor',
  doctorSpecializations: ['CARDIOLOGIST'],
};
const slot = {
  ...target,
  endsAt: '2035-01-01T01:30:00.000Z',
  clinicTimezone: 'Asia/Seoul',
  state: 'AVAILABLE',
  canJoinWaitlist: false,
};
function selectionHarness(read) {
  const h = harness({
    fetchMembers: async (id) => (id ? [doctor] : [clinic]),
    availableSlots: read,
  });
  const { useBookingSelection } = h.load('useBookingSelection');
  const { useBookingSlots } = h.load('useBookingSlots');
  const router = { isReady: true, query: { ...target } };
  h.mount(() => {
    const state = useBookingSelection(router);
    useBookingSlots(state);
    return state;
  });
  return { h, router };
}

test('exact links select an eligible clinic-zone time once and preserve subsequent user edits', async () => {
  const { h } = selectionHarness(async () => [slot]);
  let state = await h.flush();
  assert.equal(state.date, '2035-01-01');
  assert.equal(state.selected, slot.startsAt);
  assert.equal(state.linkedChecked, true);
  state.setSelected('');
  state = await h.flush();
  assert.equal(state.selected, '');
  state.setRetry((n) => n + 1);
  state = await h.flush();
  assert.equal(state.selected, '');
  h.unmount();
});

test('obsolete slot reads abort and late results cannot overwrite a newer date or selection', async () => {
  const reads = [];
  const { h } = selectionHarness((_target, date, signal) => {
    const read = { ...deferred(), date, signal };
    reads.push(read);
    return read.promise;
  });
  let state = await h.flush();
  const old = reads.at(-1);
  state.setDate('2035-01-02');
  state = await h.flush();
  const current = reads.at(-1);
  assert.equal(old.signal.aborted, true);
  const newer = { ...slot, startsAt: '2035-01-02T01:00:00.000Z' };
  current.resolve([newer]);
  state = await h.flush();
  state.setSelected(newer.startsAt);
  old.resolve([slot]);
  state = await h.flush();
  assert.equal(state.slots[0].startsAt, newer.startsAt);
  assert.equal(state.selected, newer.startsAt);
  h.unmount();
  assert.equal(current.signal.aborted, true);
});

test('slot outages retain the care team/date draft and retry only the read', async () => {
  let fail = true,
    calls = 0;
  const { h } = selectionHarness(async () => {
    calls++;
    if (fail) throw new Error('Temporarily unavailable');
    return [slot];
  });
  let state = await h.flush();
  assert.equal(state.error, 'Temporarily unavailable');
  assert.equal(state.doctorId, doctorId);
  assert.equal(state.date, '2035-01-01');
  fail = false;
  state.setRetry((n) => n + 1);
  state = await h.flush();
  assert.equal(state.error, '');
  assert.equal(state.slots.length, 1);
  assert.equal(calls, 2);
  h.unmount();
});

test('weekend links do not request slots or invent eligibility', async () => {
  const { h, router } = selectionHarness(() =>
    assert.fail('Weekend must not fetch slots'),
  );
  router.query.startsAt = '2035-01-06T01:00:00.000Z';
  const state = await h.flush();
  assert.match(state.error, /non-working days/);
  assert.equal(state.selected, '');
  assert.equal(state.linkedChecked, true);
  h.unmount();
});

test('leaving replacement mode aborts source loading and ignores late success', async () => {
  const pending = deferred();
  let signal;
  const h = harness({
    detail: (_kind, _id, abort) => {
      signal = abort;
      return pending.promise;
    },
  });
  const { useReplacementSource } = h.load('useReplacementSource');
  const router = {
    query: { replaceId: 'c'.repeat(24), replaceKind: 'APPOINTMENT' },
  };
  h.mount(() => useReplacementSource(router, 0));
  assert.equal((await h.flush()).sourceLoading, true);
  router.query = {};
  h.rerender();
  let state = await h.flush();
  assert.equal(signal.aborted, true);
  assert.equal(state.sourceLoading, false);
  pending.resolve({
    _id: 'c'.repeat(24),
    status: 'CONFIRMED',
    version: 'old',
    startsAt: target.startsAt,
  });
  state = await h.flush();
  assert.equal(state.original, undefined);
  assert.equal(state.sourceError, '');
  h.unmount();
});

test('replacement source failures fail closed and invalid links never request details', async () => {
  let calls = 0;
  const h = harness({
    detail: async () => {
      calls++;
      throw new Error('offline');
    },
  });
  const { useReplacementSource } = h.load('useReplacementSource');
  const router = {
    query: { replaceId: 'c'.repeat(24), replaceKind: 'WAITLIST' },
  };
  h.mount(() => useReplacementSource(router, 0));
  let state = await h.flush();
  assert.equal(state.original, undefined);
  assert.match(state.sourceError, /could not verify/);
  assert.equal(state.sourceLoading, false);
  router.query.replaceId = 'invalid';
  h.rerender();
  state = await h.flush();
  assert.match(state.sourceError, /invalid/);
  assert.equal(calls, 1);
  h.unmount();
});

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const {
  CareTeamSelection,
  AppointmentTimeSelection,
  VisitSummary,
} = require('../components/booking/BookingFormViews.tsx');
const viewState = {
  clinics: [clinic],
  doctors: [doctor],
  clinicId,
  doctorId,
  specialty: target.specialty,
  clinic,
  doctor,
  date: '2035-01-01',
  slots: [
    slot,
    {
      ...slot,
      startsAt: '2035-01-01T02:00:00.000Z',
      state: 'OCCUPIED',
      canJoinWaitlist: true,
    },
    { ...slot, startsAt: '2035-01-01T03:00:00.000Z', state: 'UNAVAILABLE' },
  ],
  selected: slot.startsAt,
  slot,
  loading: '',
  error: '',
  setClinicId() {},
  setDoctorId() {},
  setSpecialty() {},
  setSelected() {},
  setDate() {},
  setRetry() {},
};
const html = (Component, props) =>
  renderToStaticMarkup(React.createElement(Component, props));
test('selection views retain labels, clinic timezone, radio eligibility and uncertain-result blocking', () => {
  const team = html(CareTeamSelection, {
    selection: viewState,
    uncertain: true,
  });
  assert.match(team, /<fieldset disabled=""/);
  for (const text of ['Clinic', 'Doctor', 'Specialty', 'care-team-title'])
    assert.ok(team.includes(text));
  const times = html(AppointmentTimeSelection, {
    selection: viewState,
    uncertain: true,
  });
  assert.match(times, /Asia\/Seoul/);
  assert.match(times, /<fieldset class="care-slots" disabled=""/);
  assert.equal((times.match(/type="radio"/g) || []).length, 3);
  assert.match(times, /Join waitlist/);
  assert.match(times, /disabled=""[^>]*value="2035-01-01T03:00:00.000Z"/);
});

test('visit review fails closed for unresolved sources or uncertain outcomes and preserves the selected visit', () => {
  for (const overrides of [
    { sourceLoading: true },
    { uncertain: true },
    { replacing: true, original: undefined },
  ]) {
    const rendered = html(VisitSummary, {
      selection: viewState,
      uncertain: false,
      sourceLoading: false,
      replacing: false,
      review() {},
      ...overrides,
    });
    assert.match(rendered, /disabled=""[^>]*>Review booking/);
    assert.match(rendered, /Choosing a time does not reserve it/);
  }
  const rendered = html(VisitSummary, {
    selection: viewState,
    uncertain: false,
    sourceLoading: false,
    replacing: false,
    review() {},
  });
  assert.doesNotMatch(rendered, /disabled=""[^>]*>Review booking/);
});

test('changing clinics clears dependent drafts and ignores the old care-team response', async () => {
  const reads = [];
  const nextClinic = { ...clinic, _id: 'd'.repeat(24) };
  const nextDoctor = { ...doctor, _id: 'e'.repeat(24) };
  const h = harness({
    fetchMembers: (id, signal) => {
      if (!id) return Promise.resolve([clinic, nextClinic]);
      const read = { ...deferred(), id, signal };
      reads.push(read);
      return read.promise;
    },
  });
  const { useBookingSelection } = h.load('useBookingSelection');
  const router = { isReady: true, query: {} };
  h.mount(() => useBookingSelection(router));
  let state = await h.flush();
  state.setClinicId(clinicId);
  state = await h.flush();
  state.setDoctorId(doctorId);
  state.setSpecialty('CARDIOLOGIST');
  state.setSlots([slot]);
  state.setSelected(slot.startsAt);
  state.setClinicId(nextClinic._id);
  state = await h.flush();
  assert.equal(reads[0].signal.aborted, true);
  assert.equal(state.doctorId, '');
  assert.equal(state.specialty, '');
  assert.equal(state.selected, '');
  assert.deepEqual(state.slots, []);
  reads[1].resolve([nextDoctor]);
  state = await h.flush();
  reads[0].resolve([doctor]);
  state = await h.flush();
  assert.equal(state.doctors[0]._id, nextDoctor._id);
  assert.equal(state.clinicId, nextClinic._id);
  h.unmount();
});
