const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHookHarness, deferred } = require('./helpers/hook-harness.cjs');
const { ProfileError } = require('../libs/api/member.ts');
const profile = {
  _id: 'a'.repeat(24),
  memberType: 'USER',
  memberNick: 'Patient_1',
  memberFullName: 'Fixture Patient',
  canChangePassword: true,
  memberImage: '/uploads/member/old.jpg',
};
const preventDefault = () => {};
function setup(overrides = {}) {
  const events = [],
    username = {
      state: { status: 'idle' },
      check: {
        reset() {
          username.state.status = 'idle';
        },
        available() {
          return true;
        },
        taken() {
          username.state.status = 'taken';
          events.push('taken');
        },
      },
    };
  const api = {
    ProfileError,
    fetchMyProfile: async () => ({ ...profile }),
    uploadProfileImage: async () => {
      events.push('upload');
      return '/uploads/member/new.jpg';
    },
    updateMember: async (input) => ({
      member: { ...profile, ...input },
      requiresLogin: false,
    }),
    ...overrides,
  };
  const router = {
    replace: async (url) => {
      events.push(['navigate', url]);
      return true;
    },
  };
  const h = createHookHarness({
    '../../libs/api/member': api,
    '../../libs/use-username-check': { useUsernameCheck: () => username },
    '../../libs/auth-session': {
      updateSessionMember: (_token, member) => events.push(['session', member]),
      clearSession: () => events.push('logout'),
    },
    'next/router': { useRouter: () => router },
  });
  const { usePersonalInfo } = h.load('usePersonalInfo');
  let token = 'fixture-token';
  h.mount(() => usePersonalInfo(token, () => events.push('ended')));
  return {
    h,
    api,
    events,
    username,
    token(value) {
      token = value;
      h.rerender();
    },
  };
}

test('profile reads ignore an aborted old token response and abort on unmount', async () => {
  const reads = [];
  const { h, token } = setup({
    fetchMyProfile: (_token, signal) => {
      const read = { ...deferred(), signal };
      reads.push(read);
      return read.promise;
    },
  });
  await h.flush();
  token('new-token');
  await h.flush();
  assert.equal(reads[0].signal.aborted, true);
  reads[1].resolve({ ...profile, memberFullName: 'Current identity' });
  let state = await h.flush();
  reads[0].resolve({ ...profile, memberFullName: 'Obsolete identity' });
  state = await h.flush();
  assert.equal(state.profile.memberFullName, 'Current identity');
  h.unmount();
  assert.equal(reads[1].signal.aborted, true);
});

test('editing and cancel preserve focus targets while restoring fields and password/image drafts', async () => {
  const { h } = setup();
  let state = await h.flush();
  const focus = [];
  state.firstField.current = { focus: () => focus.push('first') };
  state.editButton.current = { focus: () => focus.push('edit') };
  state.setEditing(true);
  state = await h.flush();
  state.change('memberAddress', 'Unsaved address');
  state.change('newPassword', 'unsaved password');
  state.image.confirm(new File(['image'], 'draft.jpg', { type: 'image/jpeg' }));
  state = await h.flush();
  state.reset();
  state.setEditing(false);
  state = await h.flush();
  assert.equal(state.draft.memberAddress, '');
  assert.equal(state.draft.newPassword, '');
  assert.equal(state.image.file, null);
  assert.equal(state.image.uploadedImage.current, '');
  assert.deepEqual(focus, ['first', 'edit']);
  h.unmount();
});

test('validation and an open cropper block writes and focus the first invalid field', async () => {
  let writes = 0;
  const { h } = setup({
    updateMember: async () => {
      writes++;
    },
  });
  let state = await h.flush();
  const focus = [];
  state.form.current = {
    querySelector: (selector) => ({ focus: () => focus.push(selector) }),
  };
  state.change('memberPhone', 'invalid');
  state = await h.flush();
  await state.save({ preventDefault });
  assert.deepEqual(focus, ['[name="memberPhone"]']);
  assert.equal(writes, 0);
  state.reset();
  state = await h.flush();
  state.change('memberAddress', 'Draft');
  state.image.choose({
    target: {
      files: [new File(['png'], 'photo.png', { type: 'image/png' })],
      value: 'photo.png',
    },
  });
  state = await h.flush();
  await state.save({ preventDefault });
  assert.equal(writes, 0);
  h.unmount();
});

test('failed saves retain draft and uploaded image reference; explicit retry avoids a second upload', async () => {
  let writes = 0;
  const pending = deferred();
  const inputs = [];
  const { h, events } = setup({
    updateMember: async (input) => {
      inputs.push(input);
      if (++writes === 1) return pending.promise;
      return { member: { ...profile, ...input }, requiresLogin: false };
    },
  });
  let state = await h.flush();
  state.setEditing(true);
  state.change('memberAddress', 'Saved address');
  state.image.confirm(new File(['image'], 'new.jpg', { type: 'image/jpeg' }));
  state = await h.flush();
  const first = state.save({ preventDefault });
  await h.flush();
  await state.save({ preventDefault });
  assert.equal(writes, 1);
  pending.reject(new Error('Response unavailable'));
  await first;
  state = await h.flush();
  assert.equal(state.draft.memberAddress, 'Saved address');
  assert.equal(state.editing, true);
  assert.equal(state.image.uploadedImage.current, '/uploads/member/new.jpg');
  assert.equal(events.filter((x) => x === 'upload').length, 1);
  await state.save({ preventDefault });
  state = await h.flush();
  assert.equal(writes, 2);
  assert.equal(events.filter((x) => x === 'upload').length, 1);
  assert.equal(inputs[1].memberImage, '/uploads/member/new.jpg');
  assert.equal(state.editing, false);
  assert.equal(state.image.file, null);
  assert.equal(state.draft.memberAddress, 'Saved address');
  h.unmount();
});

test('username conflict preserves edits and focuses the enabled username field after busy clears', async () => {
  const { h, events } = setup({
    updateMember: async () => {
      throw new ProfileError('Taken', 'CONFLICT', true);
    },
  });
  let state = await h.flush();
  state.form.current = {
    querySelector: () => ({ focus: () => events.push('focus') }),
  };
  state.setEditing(true);
  state.change('memberNick', 'Changed_1');
  state = await h.flush();
  await state.save({ preventDefault });
  state = await h.flush();
  assert.equal(state.busy, false);
  assert.equal(state.draft.memberNick, 'Changed_1');
  assert.equal(state.editing, true);
  assert.ok(events.indexOf('taken') < events.indexOf('focus'));
  h.unmount();
});

test('password result clears the session and redirects without treating it as an ordinary profile save', async () => {
  const { h, events } = setup({
    updateMember: async (input) => {
      assert.equal(input.currentPassword, ' original ');
      assert.equal(input.newPassword, ' replacement ');
      return { member: { ...profile }, requiresLogin: true };
    },
  });
  let state = await h.flush();
  state.change('currentPassword', ' original ');
  state.change('newPassword', ' replacement ');
  state.change('confirmPassword', ' replacement ');
  state = await h.flush();
  events.length = 0;
  await state.save({ preventDefault });
  await h.flush();
  assert.deepEqual(events, ['logout', ['navigate', '/auth?passwordChanged=1']]);
  h.unmount();
});

test('unmount aborts an in-flight save and ignores its late response', async () => {
  const pending = deferred();
  let signal;
  const { h, events } = setup({
    updateMember: (_input, _token, s) => {
      signal = s;
      return pending.promise;
    },
  });
  let state = await h.flush();
  state.change('memberAddress', 'Draft');
  state = await h.flush();
  events.length = 0;
  const saving = state.save({ preventDefault });
  h.unmount();
  assert.equal(signal.aborted, true);
  pending.resolve({ member: { ...profile }, requiresLogin: false });
  await saving;
  assert.deepEqual(events, []);
});

test('image validation/cancel preserve the previous draft and release blob URLs on replacement and reset', async () => {
  const { h } = setup();
  let state = await h.flush();
  const oldFile = new File(['old'], 'first.jpg', { type: 'image/jpeg' });
  state.image.confirm(oldFile);
  state = await h.flush();
  const preview = state.image.preview;
  assert.ok(preview.startsWith('blob:'));
  const invalid = {
    target: {
      files: [new File(['bad'], 'bad.txt', { type: 'text/plain' })],
      value: 'bad.txt',
    },
  };
  state.image.choose(invalid);
  state = await h.flush();
  assert.equal(invalid.target.value, '');
  assert.equal(state.image.file, oldFile);
  assert.ok(state.image.imageError);
  state.image.choose({
    target: {
      files: [new File(['crop'], 'crop.png', { type: 'image/png' })],
      value: '',
    },
  });
  state = await h.flush();
  state.image.setCropFile(null);
  state = await h.flush();
  assert.equal(state.image.file, oldFile);
  state.image.remove();
  state = await h.flush();
  assert.equal(state.image.removeImage, true);
  assert.equal(state.image.preview, '');
  await assert.rejects(fetch(preview));
  h.unmount();
});

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const {
  ProfileDetails,
  ProfilePasswordFields,
} = require('../components/mypage/PersonalInfoFields.tsx');
const {
  ProfileImageEditor,
} = require('../components/mypage/ProfileImageEditor.tsx');
const { profileDraft } = require('../libs/profile-form.ts');
const html = (Component, props) =>
  renderToStaticMarkup(React.createElement(Component, props));
test('detail views retain clinic fields, read-only email and doctor specializations', async () => {
  const { h } = setup();
  const state = await h.flush();
  const clinic = {
    ...profile,
    memberType: 'CLINIC',
    clinicName: 'Fixture Clinic',
    location: 'SEOUL',
    memberEmail: 'fixture@example.test',
  };
  const rendered = html(ProfileDetails, {
    token: 'token',
    state: {
      ...state,
      profile: clinic,
      draft: profileDraft(clinic),
      editing: true,
    },
  });
  assert.match(rendered, /Clinic name/);
  assert.match(rendered, /Location/);
  assert.match(rendered, /readOnly=""[^>]*value="fixture@example.test"/);
  const doctor = {
    ...profile,
    memberType: 'DOCTOR',
    doctorSpecializations: ['CARDIOLOGIST'],
  };
  const displayed = html(ProfileDetails, {
    token: 'token',
    state: { ...state, profile: doctor, draft: profileDraft(doctor) },
  });
  assert.match(displayed, /CARDIOLOGIST/);
  assert.doesNotMatch(displayed, /Clinic name/);
  h.unmount();
});
test('password views keep provider restrictions, validation labels and disabled submission fields', async () => {
  const { h } = setup();
  const state = await h.flush();
  const editable = html(ProfilePasswordFields, {
    state: { ...state, busy: true },
  });
  for (const name of ['currentPassword', 'newPassword', 'confirmPassword'])
    assert.ok(editable.includes(`name="${name}"`));
  assert.equal((editable.match(/type="password"/g) || []).length, 3);
  assert.match(editable, /disabled=""/);
  assert.match(editable, /sign in again/);
  const provider = html(ProfilePasswordFields, {
    state: { ...state, profile: { ...profile, canChangePassword: false } },
  });
  assert.match(provider, /managed by your sign-in provider/);
  assert.doesNotMatch(provider, /type="password"/);
  h.unmount();
});
test('image view keeps delayed-save copy, file restrictions and busy controls', async () => {
  const { h } = setup();
  const state = await h.flush();
  const rendered = html(ProfileImageEditor, {
    state: { ...state, busy: true },
  });
  assert.match(rendered, /uploaded when you save/);
  assert.match(rendered, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(rendered, /aria-label="Edit profile image"[^>]*disabled=""/);
  assert.match(rendered, /Remove image/);
  h.unmount();
});
