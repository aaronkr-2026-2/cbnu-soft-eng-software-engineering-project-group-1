import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { model, Types } from 'mongoose';
import { Readable } from 'node:stream';
import { mkdtemp, rm, access, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import request from 'supertest';
import type { FileUpload } from 'graphql-upload-ts';
import { MemberService } from '../src/components/member/member.service.js';
import { MemberResolver } from '../src/components/member/member.resolver.js';
import { MemberController } from '../src/components/member/member.controller.js';
import { GoogleAuthService } from '../src/components/auth/google-auth.service.js';
import {
  hashPassword,
  verifyPassword,
} from '../src/components/auth/member-password.js';
import { UploadService } from '../src/components/upload/upload.service.js';
import { graphqlConfig } from '../src/libs/graphql/graphql.config.js';
import MemberSchema, { MEMBER } from '../src/schemas/member.model.js';
import { MEMBER_SESSION } from '../src/schemas/member-session.model.js';
import { AuthProvider, MemberType } from '../src/libs/enum/member.enum.js';
import { Location } from '../src/libs/enum/location.enum.js';
import type { MemberDocument } from '../src/libs/types/member.types.js';

const Member = model('MemberUpdateTest', MemberSchema);
const oldPassword = 'previous password 123';
const nextPassword = 'replacement password 456';
const secret = 'member-update-test-secret-more-than-32-bytes';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=',
  'base64',
);

describe('updateMember GraphQL', () => {
  let app: INestApplication<Server>;
  let rows: MemberDocument[];
  let owner: MemberDocument;
  let token: string;
  let passwordHash: string;
  let directory: string;
  let uploads: UploadService;
  let conflict: boolean;
  const previousDirectory = process.env.UPLOAD_DIR;
  const sessions = new Map<
    string,
    {
      _id: string;
      memberId: Types.ObjectId;
      refreshTokenHash: string;
      authVersion: number;
      expiresAt: Date;
    }
  >();
  const matches = (doc: MemberDocument, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([key, value]) => {
      const actual: unknown = doc.get(key);
      if (value && typeof value === 'object' && '$exists' in value)
        return (actual !== undefined) === value.$exists;
      if (value && typeof value === 'object' && '$in' in value)
        return (value.$in as unknown[]).some(
          (item) => String(item) === String(actual),
        );
      return value === null ? actual == null : String(actual) === String(value);
    });
  const query = <T>(fn: () => T | Promise<T>) => {
    const chain = {
      select: () => chain,
      lean: () => chain,
      exec: async () => fn(),
    };
    return chain;
  };
  const updateWrite = jest.fn(
    (
      filter: Record<string, unknown>,
      update: { $set: Record<string, unknown>; $inc: Record<string, number> },
    ) =>
      query(async () => {
        if (conflict) return null;
        const current = rows.find((row) => matches(row, filter));
        if (!current) return null;
        if (
          rows.some(
            (row) =>
              String(row._id) !== String(current._id) &&
              ['memberPhone', 'memberNick'].some(
                (key) =>
                  update.$set[key] !== undefined &&
                  row.get(key) === update.$set[key],
              ),
          )
        )
          throw { code: 11000 };
        // Work on a copy: failed validation must not mutate the stored record.
        const candidate = new Member(current.toObject());
        candidate.set(update.$set);
        for (const [key, value] of Object.entries(update.$inc))
          candidate.set(key, Number(candidate.get(key) ?? 0) + value);
        await candidate.validate();
        const index = rows.indexOf(current);
        if (index < 0 || !matches(rows[index], filter)) return null;
        rows[index] = candidate;
        return candidate;
      }),
  );

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'member-update-'));
    process.env.UPLOAD_DIR = directory;
    passwordHash = await hashPassword(oldPassword);
    const fixture = await Test.createTestingModule({
      imports: [
        GraphQLModule.forRoot({ ...graphqlConfig, graphiql: false }),
        JwtModule.register({
          secret,
          signOptions: {
            issuer: 'medconnect',
            audience: 'medconnect-api',
            expiresIn: 900,
            algorithm: 'HS256',
          },
        }),
      ],
      controllers: [MemberController],
      providers: [
        MemberService,
        MemberResolver,
        GoogleAuthService,
        UploadService,
        {
          provide: getModelToken(MEMBER),
          useValue: {
            findOne: (filter: Record<string, unknown>) =>
              query(() => rows.find((row) => matches(row, filter)) ?? null),
            find: (filter: Record<string, unknown>) =>
              query(() =>
                rows
                  .filter((row) => matches(row, filter))
                  .map((row) => row.toObject()),
              ),
            findById: (id: Types.ObjectId) =>
              query(
                () =>
                  rows.find((row) => String(row._id) === String(id)) ?? null,
              ),
            findOneAndUpdate: updateWrite,
          },
        },
        {
          provide: getModelToken(MEMBER_SESSION),
          useValue: {
            create: async (data: {
              memberId: Types.ObjectId;
              refreshTokenHash: string;
              authVersion: number;
              expiresAt: Date;
            }) =>
              sessions.set(data.refreshTokenHash, {
                ...data,
                _id: data.refreshTokenHash,
              }),
            findOneAndUpdate: (
              filter: { refreshTokenHash: string; expiresAt: { $gt: Date } },
              update: { $set: { refreshTokenHash: string } },
            ) =>
              query(() => {
                const session = sessions.get(filter.refreshTokenHash);
                if (!session || session.expiresAt <= filter.expiresAt.$gt)
                  return null;
                sessions.delete(filter.refreshTokenHash);
                session.refreshTokenHash = update.$set.refreshTokenHash;
                sessions.set(session.refreshTokenHash, session);
                return session;
              }),
            deleteOne: async ({ _id }: { _id: string }) => {
              for (const [key, value] of sessions)
                if (value._id === _id) sessions.delete(key);
            },
          },
        },
      ],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    uploads = app.get(UploadService);
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    owner = new Member({
      memberEmail: 'owner@example.com',
      memberPhone: '+821012345678',
      memberNick: 'owner',
      memberPassword: passwordHash,
      memberType: 'USER',
      __v: 0,
    });
    rows = [owner];
    sessions.clear();
    conflict = false;
    updateWrite.mockClear();
    token = await app.get(JwtService).signAsync({
      sub: String(owner._id),
      tokenType: 'access',
      authVersion: 0,
    });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    for (const entry of await readdir(directory))
      await rm(join(directory, entry), { force: true, recursive: true });
  });
  afterAll(async () => {
    await app?.close();
    await rm(directory, { force: true, recursive: true });
    if (previousDirectory === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previousDirectory;
  });
  const update = (
    input: Record<string, unknown>,
    accessToken = token,
    selection = 'member { _id memberFullName memberNick memberPhone memberImage memberAddress memberDesc location } requiresLogin imageCleanupPending',
  ) => {
    let req = request(app.getHttpServer()).post('/graphql');
    if (accessToken) req = req.set('Authorization', `Bearer ${accessToken}`);
    return req.send({
      query: `mutation($input: MemberUpdateInput!) { updateMember(input: $input) { ${selection} } }`,
      variables: { input },
    });
  };
  const errorCode = (response: request.Response) =>
    response.body.errors?.[0]?.extensions.code;
  const upload = (id = owner._id, target = 'member') =>
    uploads.imageUploader(
      Promise.resolve({
        filename: 'image.png',
        mimetype: 'image/png',
        encoding: '7bit',
        fieldName: 'file',
        createReadStream: () => Readable.from([png]),
      } as FileUpload),
      target,
      String(id),
    );
  const path = (url: string) => join(directory, url.slice('/uploads/'.length));
  const passwordInput = {
    currentPassword: oldPassword,
    newPassword: nextPassword,
    confirmPassword: nextPassword,
  };

  const myProfile = (
    accessToken = token,
    selection = '_id memberEmail memberPhone memberFullName memberNick memberImage memberAddress memberDesc location clinicId clinicName clinicTimezone doctorClinicStatus doctorSpecializations canChangePassword',
  ) => {
    let req = request(app.getHttpServer()).post('/graphql');
    if (accessToken) req = req.set('Authorization', `Bearer ${accessToken}`);
    return req.send({ query: `query { myProfile { ${selection} } }` });
  };

  it('loads only the authenticated account private profile and fresh saved fields', async () => {
    rows.push(
      new Member({
        memberEmail: 'other@example.com',
        memberPhone: '+821099998888',
        memberNick: 'other',
      }),
    );
    const response = await myProfile().expect(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.myProfile).toMatchObject({
      _id: String(owner._id),
      memberEmail: 'owner@example.com',
      memberPhone: '+821012345678',
      canChangePassword: true,
    });
    const saved = await update(
      { memberFullName: 'Saved Name', memberPhone: '+821011112222' },
      token,
      'member { memberFullName memberPhone canChangePassword } requiresLogin',
    );
    expect(saved.body.errors).toBeUndefined();
    expect(saved.body.data.updateMember.member.canChangePassword).toBe(true);
    const fresh = await myProfile();
    expect(fresh.body.data.myProfile).toMatchObject({
      memberFullName: 'Saved Name',
      memberPhone: '+821011112222',
    });
    const profile = await app
      .get(MemberService)
      .myProfile({
        _id: owner._id,
        memberType: owner.memberType,
        authVersion: 0,
      });
    for (const key of [
      'memberPassword',
      'authProvider',
      'authVersion',
      'googleId',
      'professionalLicenseNumber',
    ])
      expect(profile).not.toHaveProperty(key);
    expect(updateWrite).toHaveBeenCalledTimes(1);
  });

  it('returns false for Google password capability and nullable missing contacts', async () => {
    owner.authProvider = AuthProvider.GOOGLE;
    owner.memberPhone = undefined;
    const response = await myProfile();
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.myProfile).toMatchObject({
      memberPhone: null,
      canChangePassword: false,
    });
    const saved = await update(
      { memberFullName: 'Google Name' },
      token,
      'member { canChangePassword }',
    );
    expect(saved.body.errors).toBeUndefined();
    expect(saved.body.data.updateMember.member.canChangePassword).toBe(false);
  });

  it.each(['missing', 'invalid', 'expired', 'revoked', 'suspended', 'deleted'])(
    'protects myProfile against %s authentication',
    async (condition) => {
      let accessToken = token;
      if (condition === 'missing') accessToken = '';
      if (condition === 'invalid') accessToken = 'invalid';
      if (condition === 'expired')
        accessToken = await app
          .get(JwtService)
          .signAsync(
            { sub: String(owner._id), tokenType: 'access', authVersion: 0 },
            { expiresIn: -60 },
          );
      if (condition === 'revoked') owner.authVersion = 1;
      if (condition === 'suspended')
        owner.memberStatus = 'SUSPENDED' as MemberDocument['memberStatus'];
      if (condition === 'deleted') owner.deletedAt = new Date();
      expect(errorCode(await myProfile(accessToken))).toBe('UNAUTHENTICATED');
      expect(updateWrite).not.toHaveBeenCalled();
    },
  );

  it('hydrates a doctor private profile city from the current clinic', async () => {
    const clinic = new Member({
      memberType: 'CLINIC',
      clinicName: 'Clinic',
      location: 'BUSAN',
    });
    rows.push(clinic);
    owner.memberType = MemberType.DOCTOR;
    owner.clinicId = clinic._id;
    owner.location = Location.SEOUL; // Ignore a stale independent doctor city.
    expect((await myProfile()).body.data.myProfile.location).toBe('BUSAN');
    clinic.location = Location.JEJU;
    expect((await myProfile()).body.data.myProfile.location).toBe('JEJU');
  });

  it.each(['getMember(id: "507f1f77bcf86cd799439011")', 'getDoctors'])(
    'keeps private fields out of public %s',
    async (field) => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `query { ${field} { memberEmail memberPhone canChangePassword } }`,
        });
      expect(errorCode(response)).toBe('GRAPHQL_VALIDATION_FAILED');
    },
  );

  it('does not accept a target ID or expose credentials through myProfile', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: 'query { myProfile(id: "507f1f77bcf86cd799439011") { _id } }',
      });
    expect(errorCode(response)).toBe('GRAPHQL_VALIDATION_FAILED');
    expect(
      errorCode(
        await myProfile(
          token,
          'memberPassword authProvider authVersion googleId',
        ),
      ),
    ).toBe('GRAPHQL_VALIDATION_FAILED');
  });

  it('updates only the authenticated member and returns private self fields', async () => {
    const other = new Member({ memberNick: 'other' });
    rows.push(other);
    const result = await update({
      memberFullName: '  Owner Name  ',
      memberNick: 'newnick',
      memberPhone: '+821099998888',
      memberDesc: 'About me',
    }).expect(200);
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.updateMember.member).toMatchObject({
      _id: String(owner._id),
      memberFullName: 'Owner Name',
      memberPhone: '+821099998888',
      memberNick: 'newnick',
    });
    expect(result.body.data.updateMember.requiresLogin).toBe(false);
    expect(rows[1].memberNick).toBe('other');
    expect(await verifyPassword(oldPassword, rows[0].memberPassword)).toBe(
      true,
    );
  });
  it.each(['', 'invalid'])(
    'requires authentication: %j',
    async (accessToken) => {
      expect(
        errorCode(await update({ memberNick: 'changed' }, accessToken)),
      ).toBe('UNAUTHENTICATED');
      expect(updateWrite).not.toHaveBeenCalled();
    },
  );
  it.each([
    {},
    { memberFullName: null },
    { memberFullName: '' },
    { memberNick: 'a' },
    { memberPhone: '123' },
    { memberDesc: 'x'.repeat(2001) },
    { currentPassword: oldPassword },
    { newPassword: nextPassword },
    { confirmPassword: nextPassword },
    { ...passwordInput, confirmPassword: 'does not match' },
    { ...passwordInput, newPassword: 'short', confirmPassword: 'short' },
    {
      ...passwordInput,
      currentPassword: 'incorrect password',
      memberNick: 'changed',
    },
    { clinicName: 'Clinic' },
    { location: 'SEOUL' },
  ])('rejects invalid updates without writing: %j', async (input) => {
    expect(errorCode(await update(input))).toBe('BAD_USER_INPUT');
    expect(updateWrite).not.toHaveBeenCalled();
    expect(rows[0].memberNick).toBe('owner');
  });
  it.each([
    '_id',
    'memberType',
    'memberStatus',
    'authProvider',
    'authVersion',
    'clinicId',
    'doctorClinicStatus',
    'memberPassword',
    'memberEmail',
  ])('rejects unexposed field %s', async (field) => {
    expect(errorCode(await update({ [field]: 'anything' }))).toBe(
      'BAD_USER_INPUT',
    );
  });
  it('keeps private fields off public Member', async () => {
    const result = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: 'query { getMember(id: "' + owner._id + '") { memberPhone } }',
      });
    expect(errorCode(result)).toBe('GRAPHQL_VALIDATION_FAILED');
  });
  it('changes the password and immediately invalidates old access and refresh credentials', async () => {
    const login = await request(app.getHttpServer())
      .post('/member/login')
      .send({ memberEmail: owner.memberEmail, memberPassword: oldPassword })
      .expect(200);
    const changed = await update({
      ...passwordInput,
      memberFullName: 'New Name',
    }).expect(200);
    expect(changed.body.errors).toBeUndefined();
    expect(changed.body.data.updateMember.requiresLogin).toBe(true);
    expect(rows[0].memberFullName).toBe('New Name');
    expect(await verifyPassword(nextPassword, rows[0].memberPassword)).toBe(
      true,
    );
    expect(rows[0].get('confirmPassword')).toBeUndefined();
    expect(rows[0].get('currentPassword')).toBeUndefined();
    expect(JSON.stringify(changed.body)).not.toContain('scrypt$');
    expect(
      errorCode(await update({ memberNick: 'again' }, login.body.accessToken)),
    ).toBe('UNAUTHENTICATED');
    await request(app.getHttpServer())
      .post('/member/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/member/login')
      .send({ memberEmail: owner.memberEmail, memberPassword: oldPassword })
      .expect(401);
    const fresh = await request(app.getHttpServer())
      .post('/member/login')
      .send({ memberEmail: owner.memberEmail, memberPassword: nextPassword })
      .expect(200);
    expect(
      errorCode(await update({ memberNick: 'again' }, fresh.body.accessToken)),
    ).toBeUndefined();
  });
  it('allows only one concurrent password change from the same snapshot', async () => {
    const results = await Promise.all([
      update(passwordInput),
      update(passwordInput),
    ]);
    expect(results.filter((result) => !result.body.errors)).toHaveLength(1);
    expect(
      results.filter((result) => errorCode(result) === 'CONFLICT'),
    ).toHaveLength(1);
    expect(rows[0].authVersion).toBe(1);
  });
  it.each(['suspended', 'deleted'])('rejects %s accounts', async (status) => {
    if (status === 'deleted') owner.deletedAt = new Date();
    else owner.memberStatus = 'SUSPENDED' as MemberDocument['memberStatus'];
    expect(errorCode(await update({ memberFullName: 'Changed' }))).toBe(
      'UNAUTHENTICATED',
    );
    expect(updateWrite).not.toHaveBeenCalled();
  });
  it('accepts legacy version-zero tokens and rejects malformed version claims', async () => {
    const legacy = await app
      .get(JwtService)
      .signAsync({ sub: String(owner._id), tokenType: 'access' });
    expect(
      errorCode(await update({ memberFullName: 'Legacy' }, legacy)),
    ).toBeUndefined();
    const malformed = await app.get(JwtService).signAsync({
      sub: String(owner._id),
      tokenType: 'access',
      authVersion: '0',
    });
    expect(
      errorCode(await update({ memberFullName: 'Changed' }, malformed)),
    ).toBe('UNAUTHENTICATED');
  });

  it('allows Google profile edits but rejects a local password change', async () => {
    owner.authProvider = AuthProvider.GOOGLE;
    owner.memberPassword = undefined;
    owner.googleId = 'subject';
    expect(
      errorCode(await update({ memberFullName: 'Google Name' })),
    ).toBeUndefined();
    expect(errorCode(await update(passwordInput))).toBe('FORBIDDEN');
  });
  it('updates clinic city and keeps doctor city derived', async () => {
    owner.memberType = MemberType.CLINIC;
    owner.clinicName = 'Clinic';
    owner.location = Location.SEOUL;
    expect(
      errorCode(await update({ location: 'BUSAN', clinicName: 'New Clinic' })),
    ).toBeUndefined();
    const clinic = rows[0];
    owner = new Member({
      memberEmail: 'doctor@example.com',
      memberPhone: '+821011112222',
      memberNick: 'doctor',
      memberPassword: passwordHash,
      memberType: 'DOCTOR',
      clinicId: clinic._id,
      doctorSpecializations: ['DENTIST'],
      professionalLicenseNumber: 'TEST',
      __v: 0,
    });
    rows.push(owner);
    token = await app.get(JwtService).signAsync({
      sub: String(owner._id),
      tokenType: 'access',
      authVersion: 0,
    });
    const doctor = await update({ memberFullName: 'Doctor Name' });
    expect(doctor.body.errors).toBeUndefined();
    expect(doctor.body.data.updateMember.member.location).toBe('BUSAN');
    expect(errorCode(await update({ location: 'SEOUL' }))).toBe(
      'BAD_USER_INPUT',
    );
  });
  it('replaces an image only on save and deletes the previously attached owned image', async () => {
    const oldImage = await upload();
    expect(errorCode(await update({ memberImage: oldImage }))).toBeUndefined();
    const newImage = await upload();
    await expect(access(path(oldImage))).resolves.toBeUndefined();
    expect(rows[0].memberImage).toBe(oldImage);
    const saved = await update({ memberImage: newImage });
    expect(saved.body.errors).toBeUndefined();
    expect(saved.body.data.updateMember.imageCleanupPending).toBe(false);
    expect(rows[0].memberImage).toBe(newImage);
    await expect(access(path(oldImage))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(access(path(newImage))).resolves.toBeUndefined();
    expect(errorCode(await update({ memberImage: newImage }))).toBeUndefined();
    await expect(access(path(newImage))).resolves.toBeUndefined();
  });
  it('preserves old image and releases new image claim when saving conflicts', async () => {
    const oldImage = await upload();
    await update({ memberImage: oldImage });
    const newImage = await upload();
    conflict = true;
    expect(
      errorCode(await update({ memberImage: newImage, memberNick: 'new' })),
    ).toBe('CONFLICT');
    expect(rows[0].memberImage).toBe(oldImage);
    await expect(access(path(oldImage))).resolves.toBeUndefined();
    conflict = false;
    expect(errorCode(await update({ memberImage: newImage }))).toBeUndefined();
  });
  it('rejects foreign, external, missing and traversal image paths', async () => {
    const foreign = await upload(new Types.ObjectId());
    for (const image of [
      foreign,
      'https://example.com/photo.png',
      '/uploads/member/../photo.png',
      '/uploads/member/legacy.png',
    ]) {
      expect(errorCode(await update({ memberImage: image }))).toBe(
        'BAD_USER_INPUT',
      );
    }
    await expect(access(path(foreign))).resolves.toBeUndefined();
  });
  it('does not delete external or unowned legacy images and supports clearing an image', async () => {
    owner.memberImage = 'https://example.com/google-photo.png';
    expect(
      errorCode(await update({ memberImage: await upload() })),
    ).toBeUndefined();
    const current = rows[0].memberImage!;
    expect(errorCode(await update({ memberImage: '' }))).toBeUndefined();
    expect(rows[0].memberImage).toBe('');
    await expect(access(path(current))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('keeps the successful profile save if old-image deletion fails', async () => {
    const oldImage = await upload();
    await update({ memberImage: oldImage });
    const newImage = await upload();
    jest
      .spyOn(uploads, 'deletePreviousProfileImage')
      .mockRejectedValue(new Error('disk failure'));
    const saved = await update({ memberImage: newImage });
    expect(saved.body.errors).toBeUndefined();
    expect(saved.body.data.updateMember.imageCleanupPending).toBe(true);
    expect(rows[0].memberImage).toBe(newImage);
    await expect(access(path(oldImage))).resolves.toBeUndefined();
    // Failed deletion must not allow reattaching the retired URL while cleanup is pending.
    expect(errorCode(await update({ memberImage: oldImage }))).toBe(
      'BAD_USER_INPUT',
    );
    expect(rows[0].memberImage).toBe(newImage);
  });
  it('rejects duplicate phone atomically and releases a pending image for retry', async () => {
    rows.push(
      new Member({ memberPhone: '+821099998888', memberNick: 'other' }),
    );
    const image = await upload();
    expect(
      errorCode(
        await update({
          memberPhone: '+821099998888',
          memberFullName: 'Changed',
          memberImage: image,
        }),
      ),
    ).toBe('CONFLICT');
    expect(rows[0].memberFullName).toBeUndefined();
    expect(errorCode(await update({ memberImage: image }))).toBeUndefined();
  });
});
