// Run with: node --test tests/profile.test.cjs
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
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
};
const {
  profileDraft,
  profileFields,
  prepareProfileUpdate,
} = require('../libs/profile-form.ts');
const {
  fetchMyProfile,
  updateMember,
  uploadProfileImage,
  profileImageUrl,
} = require('../libs/api/member.ts');
const profile = {
  _id: '123',
  memberType: 'USER',
  memberNick: 'alex',
  memberFullName: 'Alex',
  canChangePassword: true,
};
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
process.env.NEXT_PUBLIC_GRAPHQL_URL = 'http://localhost:4334/graphql';
const signal = () => new AbortController().signal;

test('unchanged profile omits empty passwords and optional fields', () => {
  assert.deepEqual(prepareProfileUpdate(profile, profileDraft(profile)), {
    input: {},
    errors: {},
  });
});
test('only changed fields are sent, with trimmed text and international phone validation', () => {
  const result = prepareProfileUpdate(profile, {
    ...profileDraft(profile),
    memberNick: '  new_name  ',
    memberPhone: '01012345678',
  });
  assert.deepEqual(result.input, {
    memberNick: 'new_name',
    memberPhone: '01012345678',
  });
  assert.ok(result.errors.memberPhone);
});
test('password changes require all three fields and preserve spaces exactly', () => {
  const draft = { ...profileDraft(profile), newPassword: ' password ' };
  assert.ok(prepareProfileUpdate(profile, draft).errors.currentPassword);
  assert.ok(prepareProfileUpdate(profile, draft).errors.confirmPassword);
  const result = prepareProfileUpdate(profile, {
    ...draft,
    currentPassword: ' old password ',
    confirmPassword: ' password ',
  });
  assert.deepEqual(result.errors, {});
  assert.equal(result.input.currentPassword, ' old password ');
  assert.equal(result.input.newPassword, ' password ');
});
test('provider accounts cannot send password fields; patient cannot send clinic fields', () => {
  const member = { ...profile, canChangePassword: false };
  const result = prepareProfileUpdate(member, {
    ...profileDraft(member),
    currentPassword: 'wrong',
    newPassword: 'new pass',
    clinicName: 'Other',
    location: 'SEOUL',
  });
  assert.deepEqual(result.input, {});
});
test('clinics can edit clinic details; changed mandatory values cannot be cleared', () => {
  const member = {
    ...profile,
    memberType: 'CLINIC',
    clinicName: 'Clinic',
    location: 'SEOUL',
  };
  assert.deepEqual(
    prepareProfileUpdate(member, { ...profileDraft(member), location: 'BUSAN' })
      .input,
    { location: 'BUSAN' },
  );
  const result = prepareProfileUpdate(member, {
    ...profileDraft(member),
    memberFullName: '',
    memberNick: 'x',
    clinicName: '',
    location: '',
  });
  for (const field of [
    'memberFullName',
    'memberNick',
    'clinicName',
    'location',
  ])
    assert.ok(result.errors[field]);
});
test('authenticated profile transport disables caching and sends only the bearer token', async () => {
  global.fetch = async (url, options) => {
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers.Authorization, 'Bearer token');
    assert.match(JSON.parse(options.body).query, /query MyProfile/);
    return Response.json({ data: { myProfile: profile } });
  };
  assert.deepEqual(await fetchMyProfile('token', signal()), profile);
});
test('HTTP-200 GraphQL failures reject and do not expose server messages', async () => {
  global.fetch = async () =>
    Response.json({
      errors: [
        {
          message: 'private stack trace',
          extensions: { code: 'UNAUTHENTICATED' },
        },
      ],
    });
  await assert.rejects(
    fetchMyProfile('token', signal()),
    (error) =>
      error.code === 'UNAUTHENTICATED' && !error.message.includes('private'),
  );
  global.fetch = async () =>
    Response.json({
      errors: [{ message: 'private', extensions: { code: 'CONFLICT' } }],
    });
  await assert.rejects(
    updateMember({ memberNick: 'new' }, 'token', signal()),
    (error) => error.code === 'CONFLICT',
  );
});
test('multipart image request supplies operations, file map, owner target and preflight header', async () => {
  global.fetch = async (url, options) => {
    assert.equal(options.headers['Apollo-Require-Preflight'], 'true');
    assert.equal(options.headers['Content-Type'], undefined);
    assert.deepEqual(JSON.parse(options.body.get('map')), {
      0: ['variables.file'],
    });
    assert.deepEqual(JSON.parse(options.body.get('operations')).variables, {
      file: null,
      target: 'clinic',
    });
    assert.equal(options.body.get('0').name, 'photo.png');
    return Response.json({
      data: { imageUploader: '/uploads/clinic/owner/photo.png' },
    });
  };
  assert.equal(
    await uploadProfileImage(
      new File(['png'], 'photo.png', { type: 'image/png' }),
      true,
      'token',
      signal(),
    ),
    '/uploads/clinic/owner/photo.png',
  );
});
test('save result carries reauthentication and cleanup status', async () => {
  global.fetch = async () =>
    Response.json({
      data: {
        updateMember: {
          member: profile,
          requiresLogin: true,
          imageCleanupPending: false,
        },
      },
    });
  const result = await updateMember(
    { newPassword: 'password' },
    'token',
    signal(),
  );
  assert.equal(result.requiresLogin, true);
});
test('relative image URLs use the API origin and unsafe schemes fall back', () => {
  assert.equal(
    profileImageUrl('/uploads/member/a/photo.png'),
    'http://localhost:4334/uploads/member/a/photo.png',
  );
  assert.equal(
    profileImageUrl('javascript:alert(1)'),
    '/images/users/defaultUser.svg',
  );
});

const { usernameError, displayUsername } = require('../libs/username.ts');
const { memberName } = require('../libs/api/public-members.ts');

test('username validation matches the six-to-forty character English/symbol rule', () => {
  for (const value of ['Alex_1', 'A'.repeat(40), '123456', 'Aa1_#$%!&?', ' Alex_1 '])
    assert.equal(usernameError(value), undefined, value);
  for (const value of ['short', 'A'.repeat(41), '@Alex_1', 'Alex 1', 'Alex-1', '홍길동abc', 'Aléx_1', 'Alex_1\n!', 'Alex/1'])
    assert.equal(typeof usernameError(value), 'string', value);
});
test('profile username validation keeps the API value unprefixed and preserves case-only edits', () => {
  const member = { ...profile, memberNick: 'Alex_1' };
  const changed = prepareProfileUpdate(member, { ...profileDraft(member), memberNick: ' aLEX#1 ' });
  assert.deepEqual(changed.errors, {});
  assert.deepEqual(changed.input, { memberNick: 'aLEX#1' });
  const caseOnly = prepareProfileUpdate(member, { ...profileDraft(member), memberNick: 'aLEX_1' });
  assert.deepEqual(caseOnly.input, { memberNick: 'aLEX_1' });
  assert.equal(profileFields.find(([key]) => key === 'memberNick')[1], 'Username');
  assert.equal(displayUsername('aLEX#1'), '@aLEX#1');
});
test('invalid username edits are rejected while an untouched legacy username allows unrelated edits', () => {
  assert.ok(prepareProfileUpdate(profile, { ...profileDraft(profile), memberNick: '@Alex_1' }).errors.memberNick);
  const changed = prepareProfileUpdate(profile, { ...profileDraft(profile), memberFullName: '홍길동 Full Name' });
  assert.deepEqual(changed.errors, {});
  assert.deepEqual(changed.input, { memberFullName: '홍길동 Full Name' });
});
test('member name displays prefix only the username fallback', () => {
  assert.equal(memberName({ memberNick: 'Alex_1' }), '@Alex_1');
  assert.equal(memberName({ memberNick: 'Alex_1', memberFullName: 'Alex Full Name' }), 'Alex Full Name');
  assert.equal(memberName({ memberNick: 'Clinic_1', memberFullName: 'Owner', clinicName: 'Clinic Name' }), 'Clinic Name');
});

test('profile saves distinguish username conflicts without exposing other backend details', async () => {
  for (const [field, expected] of [['memberNick', true], ['memberPhone', false]]) {
    global.fetch = async () => Response.json({errors:[{message:'private detail',extensions:{code:'CONFLICT',reason:'USERNAME_TAKEN',field,secret:'private'}}]});
    await assert.rejects(updateMember({memberNick:'Alex123'}, 'token', signal()), e => e.usernameTaken === expected && e.code === 'CONFLICT' && !e.message.includes('private'));
  }
});
