const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHookHarness, deferred } = require('./helpers/hook-harness.cjs');
const { BookingError } = require('../libs/api/booking.ts');
const target = {
  doctorId: 'a'.repeat(24),
  clinicId: 'b'.repeat(24),
  specialty: 'CARDIOLOGIST',
  startsAt: '2035-01-01T01:00:00.000Z',
};
const row = (kind = 'APPOINTMENT', extra = {}) => ({
  ...target,
  _id: 'c'.repeat(24),
  endsAt: '2035-01-01T01:30:00.000Z',
  status: kind === 'APPOINTMENT' ? 'CONFIRMED' : 'ACTIVE',
  version: 'v1',
  source: 'ONLINE',
  ...extra,
});
const original = (kind = 'APPOINTMENT') => ({
  ...row(kind),
  kind,
  id: row(kind)._id,
});
const action = { operation: 'CREATE', kind: 'APPOINTMENT', target };
function setup(overrides = {}, current = action, component = 'useCareAction') {
  const events = [],
    completions = [];
  const api = {
    BookingError,
    detail: async (kind) => row(kind),
    targetRecords: async () => [],
    execute: async (current) => ({
      kind: current.kind,
      operation: current.operation,
      record: row(current.kind),
    }),
    ...overrides,
  };
  const h = createHookHarness(
    {
      '../../libs/api/booking': api,
      '../../libs/hooks/usePublicProfiles': { usePublicProfiles: () => ({}) },
    },
    'components/booking',
  );
  const loaded = h.load(component);
  const props = {
    action: current,
    open: true,
    onUncertain() {
      events.push('uncertain');
    },
    onComplete(receipt) {
      events.push('complete');
      completions.push(receipt);
    },
    onClose(value) {
      events.push(['close', value]);
    },
  };
  h.mount(() => loaded[component](props));
  return { h, props, events, completions };
}
function elements(element) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap(elements);
  return [element, ...elements(element.props?.children)];
}
const button = (tree, text) =>
  elements(tree).find((e) => e.props?.onClick && e.props.children === text);

test('lost post-commit replies reconcile a single newly visible record without replaying the write', async () => {
  let writes = 0,
    reads = 0;
  const old = row('APPOINTMENT', { _id: 'd'.repeat(24) });
  const { h, events, completions } = setup({
    targetRecords: async () => (++reads === 1 ? [old] : [old, row()]),
    execute: async () => {
      writes++;
      throw new BookingError('Lost reply', '', undefined, true);
    },
  });
  let state = await h.flush();
  await state.submit();
  state = await h.flush();
  assert.equal(writes, 1);
  assert.equal(reads, 2);
  assert.equal(state.receipt.record._id, row()._id);
  assert.equal(state.uncertain, false);
  assert.equal(state.busy, false);
  assert.deepEqual(events, ['uncertain', 'complete']);
  assert.equal(completions.length, 1);
  h.unmount();
});

test('pre-existing target records do not falsely complete an uncertain request', async () => {
  let writes = 0;
  const existing = row();
  const { h, completions } = setup({
    targetRecords: async () => [existing],
    execute: async () => {
      writes++;
      throw new BookingError('Lost reply', '', undefined, true);
    },
  });
  let state = await h.flush();
  await state.submit();
  state = await h.flush();
  assert.equal(state.receipt, undefined);
  assert.equal(state.uncertain, true);
  assert.match(state.error, /Do not submit again/);
  await state.submit();
  state = await h.flush();
  assert.equal(writes, 1);
  assert.equal(state.receipt, undefined);
  assert.equal(completions.length, 0);
  h.unmount();
});

test('ambiguous reconciliation stays uncertain and later checks perform reads only', async () => {
  let reads = 0,
    writes = 0;
  const { h, completions } = setup({
    targetRecords: async () => {
      reads++;
      return reads === 1
        ? []
        : reads === 2
          ? [row(), row('APPOINTMENT', { _id: 'd'.repeat(24) })]
          : [row()];
    },
    execute: async () => {
      writes++;
      throw new BookingError('Lost reply', '', undefined, true);
    },
  });
  let state = await h.flush();
  await state.submit();
  state = await h.flush();
  assert.equal(state.uncertain, true);
  assert.equal(state.receipt, undefined);
  await state.submit();
  state = await h.flush();
  assert.equal(writes, 1);
  assert.equal(reads, 3);
  assert.equal(state.receipt.record._id, row()._id);
  assert.equal(completions.length, 1);
  h.unmount();
});

test('failed reconciliation retains a safe read-check state and can recover without resubmitting', async () => {
  let writes = 0,
    reads = 0;
  const { h } = setup({
    targetRecords: async () => {
      if (++reads === 1) return [];
      if (reads === 2) throw new Error('offline');
      return [row()];
    },
    execute: async () => {
      writes++;
      throw new BookingError('Lost reply', '', undefined, true);
    },
  });
  let state = await h.flush();
  await state.submit();
  state = await h.flush();
  assert.equal(state.uncertain, true);
  assert.match(state.error, /Do not submit this request again/);
  await state.submit();
  state = await h.flush();
  assert.equal(writes, 1);
  assert.equal(state.receipt.record.status, 'CONFIRMED');
  h.unmount();
});

for (const [operation, kind, status] of [
  ['CANCEL', 'APPOINTMENT', 'CANCELED'],
  ['WITHDRAW', 'WAITLIST', 'WITHDRAWN'],
]) {
  test(`${operation} reconciles terminal detail after a lost reply`, async () => {
    let details = 0,
      writes = 0;
    const current = { operation, kind, target, original: original(kind) };
    const { h, completions } = setup(
      {
        detail: async () =>
          row(kind, {
            status: ++details === 1 ? original(kind).status : status,
          }),
        targetRecords: () =>
          assert.fail('No target-list read for terminal actions'),
        execute: async () => {
          writes++;
          throw new BookingError('Lost reply', '', undefined, true);
        },
      },
      current,
    );
    let state = await h.flush();
    await state.submit();
    state = await h.flush();
    assert.equal(writes, 1);
    assert.equal(details, 2);
    assert.equal(state.receipt.record.status, status);
    assert.equal(completions.length, 1);
    h.unmount();
  });
}

test('stale original versions fail preflight before any mutation and keep the latest verified source', async () => {
  let writes = 0;
  const { h } = setup(
    {
      detail: async () => row('APPOINTMENT', { version: 'v2' }),
      execute: async () => {
        writes++;
      },
    },
    { ...action, operation: 'REPLACE', original: original() },
  );
  let state = await h.flush();
  await state.submit();
  state = await h.flush();
  assert.equal(writes, 0);
  assert.equal(state.stale, true);
  assert.equal(state.verifiedOriginal.version, 'v2');
  assert.match(state.error, /original commitment changed/);
  h.unmount();
});

test('duplicate submit clicks share the same in-flight guard and complete only once', async () => {
  const pending = deferred();
  let writes = 0;
  const { h, completions } = setup({
    execute: async () => {
      writes++;
      return pending.promise;
    },
  });
  let state = await h.flush();
  const first = state.submit();
  await h.flush();
  await state.submit();
  assert.equal(writes, 1);
  pending.resolve({ operation: 'CREATE', kind: 'APPOINTMENT', record: row() });
  await first;
  state = await h.flush();
  assert.equal(state.busy, false);
  assert.equal(completions.length, 1);
  h.unmount();
});

test('unmount aborts pending submission and ignores a late successful response', async () => {
  const pending = deferred();
  let signal;
  const { h, completions } = setup({
    execute: (_action, value) => {
      signal = value;
      return pending.promise;
    },
  });
  const state = await h.flush();
  const first = state.submit();
  await h.flush();
  h.unmount();
  assert.equal(signal.aborted, true);
  pending.resolve({ operation: 'CREATE', kind: 'APPOINTMENT', record: row() });
  await first;
  assert.equal(completions.length, 0);
});

test('switching a single conflict to replacement resets both consent drafts and retains the blocking source', async () => {
  const problem = {
    reason: 'COMMITMENT_CONFLICT',
    existingCommitments: [original()],
    choices: ['KEEP', 'REPLACE'],
  };
  const { h } = setup(
    {
      execute: async () => {
        throw new BookingError('Conflict', 'CONFLICT', problem);
      },
    },
    { ...action, kind: 'WAITLIST' },
  );
  let state = await h.flush();
  state.setConsent(true);
  state.setForfeit(true);
  state = await h.flush();
  await state.submit();
  state = await h.flush();
  state.chooseReplacement();
  state = await h.flush();
  assert.equal(state.current.operation, 'REPLACE');
  assert.equal(state.current.original.id, original().id);
  assert.equal(state.verifiedOriginal.id, original().id);
  assert.equal(state.joining, true);
  assert.equal(state.forfeiting, true);
  assert.equal(state.consent, false);
  assert.equal(state.forfeit, false);
  assert.equal(state.problem, undefined);
  assert.equal(state.error, '');
  h.unmount();
});

test('an action-prop rerender preserves the mounted request and consent draft', async () => {
  const { h, props } = setup({}, { ...action, kind: 'WAITLIST' });
  let state = await h.flush();
  state.setConsent(true);
  state = await h.flush();
  props.action = {
    ...action,
    target: { ...target, startsAt: '2035-01-02T01:00:00.000Z' },
  };
  h.rerender();
  state = await h.flush();
  assert.equal(state.current.target.startsAt, target.startsAt);
  assert.equal(state.current.kind, 'WAITLIST');
  assert.equal(state.consent, true);
  h.unmount();
});

test('dialog presentation requires both consent and forfeit, prevents busy close, and locks uncertain checkboxes', async () => {
  const pending = deferred();
  const { h, props, events } = setup(
    { execute: async () => pending.promise, targetRecords: async () => [] },
    { ...action, operation: 'REPLACE', kind: 'WAITLIST', original: original() },
    'ActionDialog',
  );
  let tree = await h.flush();
  const checkboxes = () =>
    elements(tree).filter(
      (e) => e.type === 'input' && e.props.type === 'checkbox',
    );
  assert.equal(checkboxes().length, 2);
  assert.equal(button(tree, 'Confirm replacement').props.disabled, true);
  checkboxes()[0].props.onChange({ target: { checked: true } });
  tree = await h.flush();
  assert.equal(button(tree, 'Confirm replacement').props.disabled, true);
  checkboxes()[1].props.onChange({ target: { checked: true } });
  tree = await h.flush();
  assert.equal(button(tree, 'Confirm replacement').props.disabled, false);
  button(tree, 'Confirm replacement').props.onClick();
  tree = await h.flush();
  assert.equal(button(tree, 'Close review').props.disabled, true);
  tree.props.onClose();
  assert.equal(
    events.some((x) => Array.isArray(x) && x[0] === 'close'),
    false,
  );
  pending.reject(new BookingError('Lost reply', '', undefined, true));
  tree = await h.flush();
  assert.equal(
    checkboxes().every((e) => e.props.disabled),
    true,
  );
  assert.equal(button(tree, 'Check current state').props.disabled, false);
  tree.props.onClose();
  assert.deepEqual(events.at(-1), ['close', true]);
  props.open = false;
  h.rerender();
  await h.flush();
  props.open = true;
  h.rerender();
  tree = await h.flush();
  assert.ok(button(tree, 'Check current state'));
  h.unmount();
});
