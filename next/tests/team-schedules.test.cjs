const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHookHarness, deferred } = require('./helpers/hook-harness.cjs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { validateHours, validateOverrides } = require('../libs/workspace.ts');
const profile = {
  _id: 'a'.repeat(24),
  memberNick: 'Clinic_1',
  clinicName: 'Fixture Clinic',
  memberType: 'CLINIC',
  canChangePassword: false,
};
const doctor = {
  _id: 'b'.repeat(24),
  memberNick: 'Doctor_1',
  memberFullName: 'Fixture Doctor',
  doctorClinicStatus: 'APPROVED',
  doctorSpecializations: ['CARDIOLOGIST'],
};
const zone = 'Asia/Seoul';
function stateHarness() {
  const h = createHookHarness({}, 'components/workspace');
  const { useScheduleDraft } = h.load('useScheduleDraft');
  h.mount(() => useScheduleDraft(zone));
  return h;
}
function previewHarness(read) {
  const h = createHookHarness(
    { '../../libs/api/booking': { availableSlots: read } },
    'components/workspace',
  );
  const { useSchedulePreview } = h.load('useSchedulePreview');
  const input = {
    mode: 'schedules',
    doctorId: doctor._id,
    doctor,
    specialty: 'CARDIOLOGIST',
    date: '2035-01-01',
    profile,
    refresh: 0,
  };
  h.mount(() => useSchedulePreview(input));
  return { h, input };
}
function elements(element) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap(elements);
  return [element, ...elements(element.props?.children)];
}
const button = (tree, text) =>
  elements(tree).find((e) => e.props?.onClick && e.props.children === text);
const html = (Component, props) =>
  renderToStaticMarkup(React.createElement(Component, props));

test('draft edits are immutable, clear their acknowledgements, and preserve the other editor', async () => {
  const h = stateHarness();
  let draft = await h.flush();
  const week = [{ weekday: 1, startMinute: 540, endMinute: 720 }];
  const overrides = [{ type: 'UNAVAILABLE' }];
  draft.setWeekly(week);
  draft.setOverrides(overrides);
  draft.setWeeklyAck(true);
  draft.setDateAck(true);
  draft = await h.flush();
  draft.patchWeekly(0, { endMinute: 690 });
  draft = await h.flush();
  assert.equal(draft.weeklyAck, false);
  assert.equal(draft.dateAck, true);
  assert.equal(week[0].endMinute, 720);
  assert.equal(draft.weekly[0].endMinute, 690);
  draft.patchOverride(0, {
    type: 'CUSTOM_HOURS',
    startMinute: 810,
    endMinute: 1020,
  });
  draft = await h.flush();
  assert.equal(draft.dateAck, false);
  assert.equal(overrides[0].type, 'UNAVAILABLE');
  assert.equal(draft.weekly[0].endMinute, 690);
  h.unmount();
});

test('preview cancels obsolete doctor/date reads and ignores late responses', async () => {
  const reads = [];
  const { h, input } = previewHarness((_target, date, signal) => {
    const read = { ...deferred(), date, signal };
    reads.push(read);
    return read.promise;
  });
  await h.flush();
  input.date = '2035-01-02';
  h.rerender();
  await h.flush();
  assert.equal(reads[0].signal.aborted, true);
  const current = {
    startsAt: '2035-01-02T01:00:00Z',
    clinicTimezone: zone,
    state: 'AVAILABLE',
  };
  reads[1].resolve([current]);
  await h.flush();
  reads[0].resolve([{ startsAt: 'old' }]);
  const state = await h.flush();
  assert.deepEqual(state.preview, [current]);
  assert.equal(state.previewBusy, false);
  h.unmount();
  assert.equal(reads[1].signal.aborted, true);
});

test('preview errors can be refreshed without a mutation and completed writes trigger a new read', async () => {
  let calls = 0;
  const { h, input } = previewHarness(async () => {
    if (++calls === 1) throw new Error('Unavailable');
    return [];
  });
  let state = await h.flush();
  assert.equal(state.previewError, 'Unavailable');
  state.setPreviewRefresh((n) => n + 1);
  state = await h.flush();
  assert.equal(state.previewError, '');
  input.refresh++;
  h.rerender();
  await h.flush();
  assert.equal(calls, 3);
  h.unmount();
});

test('applications mode and missing approved selection do not load preview slots', async () => {
  const { h, input } = previewHarness(() =>
    assert.fail('No preview read expected'),
  );
  input.mode = 'team';
  await h.flush();
  input.mode = 'schedules';
  input.doctor = undefined;
  h.rerender();
  await h.flush();
  h.unmount();
});

test('weekly review snapshots the full draft and writes only after explicit confirmation', async () => {
  const writes = [];
  const h = createHookHarness(
    {
      '../../libs/api/workspace': {
        setWeeklyHours: async (...args) => writes.push(args),
      },
    },
    'components/workspace',
  );
  const { WeeklyHoursEditor } = h.load('WeeklyHoursEditor');
  let task;
  const draft = {
    doctorId: doctor._id,
    weekly: [{ weekday: 1, startMinute: 540, endMinute: 720 }],
    weeklyAck: true,
  };
  const tree = WeeklyHoursEditor({
    draft,
    doctor,
    zone,
    locked: false,
    weeklyError: '',
    review: (value) => {
      task = value;
    },
  });
  button(tree, 'Review weekly replacement').props.onClick();
  assert.equal(writes.length, 0);
  draft.weekly[0].endMinute = 690;
  const signal = new AbortController().signal;
  await task.run(signal);
  assert.deepEqual(writes[0], [
    doctor._id,
    [{ weekday: 1, startMinute: 540, endMinute: 720 }],
    signal,
  ]);
  assert.equal(task.check, undefined); // The existing API has no saved-schedule read.
});

test('override review snapshots date and rows, including a full-day closure', async () => {
  const writes = [];
  const h = createHookHarness(
    {
      '../../libs/api/workspace': {
        setDateOverrides: async (...args) => writes.push(args),
      },
    },
    'components/workspace',
  );
  const { DateOverridesEditor } = h.load('DateOverridesEditor');
  let task;
  const draft = {
    doctorId: doctor._id,
    date: '2035-01-01',
    overrides: [{ type: 'UNAVAILABLE' }],
    dateAck: true,
  };
  const tree = DateOverridesEditor({
    draft,
    doctor,
    zone,
    locked: false,
    overrideError: '',
    review: (value) => {
      task = value;
    },
  });
  button(tree, 'Review date replacement').props.onClick();
  draft.date = '2035-01-02';
  draft.overrides[0].type = 'CUSTOM_HOURS';
  const signal = new AbortController().signal;
  await task.run(signal);
  assert.deepEqual(writes[0], [
    doctor._id,
    '2035-01-01',
    [{ type: 'UNAVAILABLE' }],
    signal,
  ]);
  assert.equal(task.check, undefined);
});

test('doctor application reconciliation reads current status and never repeats the review mutation', async () => {
  let writes = 0,
    reads = 0;
  const pending = { ...doctor, doctorClinicStatus: 'PENDING' };
  const h = createHookHarness(
    {
      '../../libs/api/workspace': {
        reviewDoctor: async (id, approve) => {
          assert.equal(id, doctor._id);
          assert.equal(approve, true);
          writes++;
          return 'APPROVED';
        },
        clinicTeam: async () => {
          reads++;
          return [
            {
              ...pending,
              doctorClinicStatus: reads === 1 ? 'PENDING' : 'APPROVED',
            },
          ];
        },
      },
    },
    'components/workspace',
  );
  const { DoctorApplications } = h.load('DoctorApplications');
  let task;
  const tree = DoctorApplications({
    profile,
    team: [pending],
    locked: false,
    review: (value) => {
      task = value;
    },
  });
  button(tree, 'Approve').props.onClick();
  const signal = new AbortController().signal;
  await task.run(signal);
  assert.equal(await task.check(signal), undefined);
  assert.match(await task.check(signal), /Approved/);
  assert.equal(writes, 1);
  assert.equal(reads, 2);
});

test('locked views and pending-only application actions retain native control guards', async () => {
  const {
    WeeklyHoursEditor,
  } = require('../components/workspace/WeeklyHoursEditor.tsx');
  const {
    DateOverridesEditor,
  } = require('../components/workspace/DateOverridesEditor.tsx');
  const {
    DoctorApplications,
  } = require('../components/workspace/DoctorApplications.tsx');
  const h = stateHarness(),
    draft = await h.flush();
  const props = {
    draft,
    doctor,
    zone,
    locked: true,
    review() {},
    weeklyError: '',
    overrideError: '',
  };
  assert.match(html(WeeklyHoursEditor, props), /<fieldset disabled=""/);
  assert.match(html(DateOverridesEditor, props), /<fieldset disabled=""/);
  const applications = html(DoctorApplications, {
    profile,
    team: [doctor],
    locked: true,
    review() {},
  });
  assert.doesNotMatch(applications, />Approve<|>Reject</);
  assert.match(applications, /read-only/);
  h.unmount();
});

test('invalid intervals and unacknowledged replacement drafts keep review disabled', async () => {
  const {
    WeeklyHoursEditor,
  } = require('../components/workspace/WeeklyHoursEditor.tsx');
  const {
    DateOverridesEditor,
  } = require('../components/workspace/DateOverridesEditor.tsx');
  const h = stateHarness();
  let draft = await h.flush();
  const props = { draft, doctor, zone, locked: false, review() {} };
  assert.equal(
    button(
      WeeklyHoursEditor({ ...props, weeklyError: '' }),
      'Review weekly replacement',
    ).props.disabled,
    true,
  );
  draft.setWeekly([{ weekday: 6, startMinute: 540, endMinute: 720 }]);
  draft.setWeeklyAck(true);
  draft = await h.flush();
  assert.equal(
    button(
      WeeklyHoursEditor({
        ...props,
        draft,
        weeklyError: validateHours(draft.weekly),
      }),
      'Review weekly replacement',
    ).props.disabled,
    true,
  );
  draft.setDate('2035-01-06');
  draft.setOverrides([
    { type: 'CUSTOM_HOURS', startMinute: 540, endMinute: 720 },
  ]);
  draft.setDateAck(true);
  draft = await h.flush();
  assert.equal(
    button(
      DateOverridesEditor({
        ...props,
        draft,
        overrideError: validateOverrides(draft.overrides, draft.date),
      }),
      'Review date replacement',
    ).props.disabled,
    true,
  );
  h.unmount();
});

test('an uncertain schedule review locks editing and offers no automatic write replay', async () => {
  const { BookingError } = require('../libs/api/booking.ts');
  const h = createHookHarness({}, 'components/workspace');
  const { WorkspaceReview } = h.load('WorkspaceReview');
  let writes = 0,
    locked = 0;
  const props = {
    task: {
      title: 'Replace hours?',
      summary: 'Fixture schedule',
      run: async () => {
        writes++;
        throw new BookingError('Lost reply', '', undefined, true);
      },
    },
    open: true,
    onClose() {},
    onComplete() {},
    onUncertain() {
      locked++;
    },
  };
  h.mount(() => WorkspaceReview(props));
  let tree = await h.flush();
  button(tree, 'Confirm change').props.onClick();
  tree = await h.flush();
  assert.equal(writes, 1);
  assert.equal(locked, 1);
  assert.equal(button(tree, 'Confirm change'), undefined);
  assert.equal(button(tree, 'Check current state'), undefined);
  assert.ok(
    elements(tree).some(
      (e) =>
        typeof e.props?.children === 'string' &&
        e.props.children.includes('will not repeat the write'),
    ),
  );
  h.rerender();
  await h.flush();
  assert.equal(writes, 1);
  h.unmount();
});

test('changing the approved doctor clears both replacement drafts and acknowledgements while retaining the date', async () => {
  const h = createHookHarness(
    { '../../libs/api/booking': { availableSlots: async () => [] } },
    'components/workspace',
  );
  const { TeamSchedules } = h.load('TeamSchedules');
  const other = { ...doctor, _id: 'c'.repeat(24) };
  h.mount(() =>
    TeamSchedules({
      mode: 'schedules',
      profile,
      zone,
      team: [doctor, other],
      locked: false,
      review() {},
      refresh: 0,
    }),
  );
  let tree = await h.flush();
  elements(tree)
    .find((e) => e.type === 'select')
    .props.onChange({ target: { value: doctor._id } });
  tree = await h.flush();
  let draft = elements(tree).find((e) => e.type?.name === 'WeeklyHoursEditor')
    .props.draft;
  const date = draft.date;
  draft.setWeekly([{ weekday: 1, startMinute: 540, endMinute: 720 }]);
  draft.setOverrides([{ type: 'UNAVAILABLE' }]);
  draft.setWeeklyAck(true);
  draft.setDateAck(true);
  tree = await h.flush();
  elements(tree)
    .find((e) => e.type === 'select')
    .props.onChange({ target: { value: other._id } });
  tree = await h.flush();
  draft = elements(tree).find((e) => e.type?.name === 'WeeklyHoursEditor').props
    .draft;
  assert.equal(draft.doctorId, other._id);
  assert.deepEqual(draft.weekly, []);
  assert.deepEqual(draft.overrides, []);
  assert.equal(draft.weeklyAck, false);
  assert.equal(draft.dateAck, false);
  assert.equal(draft.date, date);
  h.unmount();
});
