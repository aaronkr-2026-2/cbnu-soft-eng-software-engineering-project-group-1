import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GraphQLModule } from '@nestjs/graphql';
import { getModelToken } from '@nestjs/mongoose';
import { createConnection, type Connection } from 'mongoose';
import { ObjectId } from 'mongodb';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, stat, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import MemberSchema, { MEMBER } from '../src/schemas/member.model.js';
import {
  MEMBER_SESSION,
  MemberSessionSchema as SessionSchema,
} from '../src/schemas/member-session.model.js';
import { MemberService } from '../src/components/member/member.service.js';
import { MemberController } from '../src/components/member/member.controller.js';
import { MemberResolver } from '../src/components/member/member.resolver.js';
import { GoogleAuthService } from '../src/components/auth/google-auth.service.js';
import { MemberAccessGuard } from '../src/components/auth/guards/member-access.guard.js';
import {
  auditUsernames,
  migrateUsernames,
  parseUsernameResolutions,
} from '../src/components/member/member-username-migration.js';
import {
  assertUsernameStorage,
  USERNAME_INDEX,
} from '../src/components/member/member-username-storage.js';
import { graphqlConfig } from '../src/libs/graphql/graphql.config.js';

const exec = promisify(execFile);
describe('Offline username migration and real database enforcement', () => {
  let connection: Connection;
  let app: INestApplication | undefined;
  const db = () => connection.db!;
  const members = () => db().collection('members');
  const model = () => connection.model(MEMBER, MemberSchema);
  const identity = {
    sub: 'test-google',
    name: 'Case_1',
    email: 'google@example.test',
  };
  beforeAll(async () => {
    if (
      process.env.BOOKING_TEST_DISPOSABLE !== '1' ||
      !process.env.BOOKING_TEST_URI
    )
      throw new Error('Use the owned disposable MongoDB runner');
    connection = await createConnection(process.env.BOOKING_TEST_URI, {
      dbName: 'username_' + new ObjectId(),
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
  });
  beforeEach(async () => {
    await db().dropDatabase();
  });
  afterEach(async () => {
    await app?.close();
    app = undefined;
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await db().dropDatabase();
    await connection.close();
  });

  const resolution = (
    id: ObjectId,
    expectedMemberNick: string | null,
    memberNick: string,
  ) => ({ memberId: String(id), expectedMemberNick, memberNick });
  async function startApi() {
    await migrateUsernames(connection, [], true);
    const fixture = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-only-username-secret-at-least-32-bytes',
          signOptions: {
            issuer: 'medconnect',
            audience: 'medconnect-api',
            algorithm: 'HS256',
            expiresIn: 900,
          },
        }),
        GraphQLModule.forRoot({ ...graphqlConfig, graphiql: false }),
      ],
      controllers: [MemberController],
      providers: [
        MemberService,
        MemberResolver,
        MemberAccessGuard,
        {
          provide: GoogleAuthService,
          useValue: { verify: async () => identity },
        },
        { provide: getModelToken(MEMBER), useValue: model() },
        {
          provide: getModelToken(MEMBER_SESSION),
          useValue: connection.model(MEMBER_SESSION, SessionSchema),
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
    await app.init();
    return app;
  }
  const signup = (memberNick: string, n: number) =>
    request(app!.getHttpServer())
      .post('/member/signup')
      .send({
        memberEmail: `user${n}@example.test`,
        memberPassword: 'test-only-password',
        memberPhone: '+8210555500' + String(n).padStart(2, '0'),
        memberNick,
      });
  const edit = (token: string, input: object) =>
    request(app!.getHttpServer())
      .post('/graphql')
      .set('Authorization', 'Bearer ' + token)
      .send({
        query:
          'mutation($input:MemberUpdateInput!){updateMember(input:$input){member{_id memberNick memberFullName} requiresLogin}}',
        variables: { input },
      });

  it('audits a missing collection without DDL and refuses unprepared startup', async () => {
    expect((await auditUsernames(db())).summary.members).toBe(0);
    expect(await db().listCollections().toArray()).toEqual([]);
    await expect(assertUsernameStorage(db())).rejects.toThrow('not ready');
    await expect(migrateUsernames(connection, [], false)).rejects.toThrow(
      'stopped writers',
    );
  });

  it('reports invalid, colliding and Google legacy usernames without changing data', async () => {
    await members().insertMany([
      { memberNick: 'Alex_1' },
      { memberNick: 'aLEX_1' },
      { memberNick: 'short' },
      { memberNick: 'Google Person', authProvider: 'GOOGLE' },
      { memberNick: 'Old@Name' },
    ]);
    const before = await members().find().toArray();
    const report = await auditUsernames(db());
    expect(report.issues.map((row) => row.reason)).toEqual(
      expect.arrayContaining([
        'INVALID_USERNAME',
        'DUPLICATE_USERNAME',
        'GOOGLE_REVIEW_REQUIRED',
      ]),
    );
    await expect(migrateUsernames(connection, [], true)).rejects.toThrow(
      'Resolve',
    );
    expect(await members().find().toArray()).toEqual(before);
    expect(await members().listIndexes().toArray()).toHaveLength(1);
  });

  it('applies explicit legacy decisions, preserves full names, and is rerunnable', async () => {
    const ids = Array.from({ length: 5 }, () => new ObjectId());
    await members().insertMany([
      { _id: ids[0], memberNick: 'Alex_1', __v: 2 },
      { _id: ids[1], memberNick: 'aLEX_1', __v: 3, memberStatus: 'SUSPENDED' },
      {
        _id: ids[2],
        memberNick: 'Google Person',
        authProvider: 'GOOGLE',
        memberFullName: 'Saved Full Name',
        __v: 0,
      },
      {
        _id: ids[3],
        memberNick: 'My_Handle',
        authProvider: 'GOOGLE',
        memberFullName: 'Custom Owner',
        __v: 1,
      },
      { _id: ids[4], memberNick: null },
    ]);
    const decisions = parseUsernameResolutions([
      resolution(ids[1], 'aLEX_1', 'Alex_2'),
      resolution(ids[2], 'Google Person', 'google_user12345678'),
      resolution(ids[3], 'My_Handle', 'My_Handle'),
      resolution(ids[4], null, 'Restored_1'),
    ]);
    expect((await auditUsernames(db(), decisions)).issues).toEqual([]);
    expect(
      (await migrateUsernames(connection, decisions, true)).unresolved,
    ).toBe(0);
    await assertUsernameStorage(db());
    const rows = await members().find().sort({ _id: 1 }).toArray();
    expect(rows[0]).toMatchObject({
      memberNick: 'Alex_1',
      memberNickNormalized: 'alex_1',
      __v: 2,
    });
    expect(rows[1]).toMatchObject({
      memberNick: 'Alex_2',
      memberNickNormalized: 'alex_2',
      __v: 4,
      memberStatus: 'SUSPENDED',
    });
    expect(rows[2]).toMatchObject({
      memberFullName: 'Saved Full Name',
      memberNick: 'google_user12345678',
      __v: 1,
    });
    expect(rows[3]).toMatchObject({
      memberNick: 'My_Handle',
      memberFullName: 'Custom Owner',
      __v: 1,
    });
    expect(
      (await model().findById(ids[0]).lean())?.memberNickNormalized,
    ).toBeUndefined();
    expect((await migrateUsernames(connection, decisions, true)).renames).toBe(
      0,
    );
    expect(await members().find().sort({ _id: 1 }).toArray()).toEqual(rows);
  });

  it('rejects stale, unknown, invalid, and duplicate resolution decisions', async () => {
    const result = await members().insertOne({ memberNick: 'short' });
    const stale = [resolution(result.insertedId, 'different', 'Valid_1')];
    expect((await auditUsernames(db(), stale)).issues[0].reason).toBe(
      'STALE_RESOLUTION',
    );
    await expect(migrateUsernames(connection, stale, true)).rejects.toThrow(
      'Resolve',
    );
    expect(
      (
        await auditUsernames(db(), [
          resolution(new ObjectId(), null, 'Valid_1'),
        ])
      ).issues.map((row) => row.reason),
    ).toContain('UNKNOWN_MEMBER');
    expect(() =>
      parseUsernameResolutions([
        resolution(result.insertedId, 'short', 'short'),
      ]),
    ).toThrow();
    expect(() => parseUsernameResolutions([...stale, ...stale])).toThrow();
    expect(
      (await members().findOne({ _id: result.insertedId }))?.memberNick,
    ).toBe('short');
  });

  it('fails startup after interrupted DDL and recovers by rerunning without renaming twice', async () => {
    const id = (await members().insertOne({ memberNick: 'short', __v: 0 }))
      .insertedId;
    const decisions = [resolution(id, 'short', 'Valid_1')];
    jest
      .spyOn(model(), 'createIndexes')
      .mockRejectedValueOnce(new Error('Injected DDL interruption'));
    await expect(migrateUsernames(connection, decisions, true)).rejects.toThrow(
      'interruption',
    );
    await expect(assertUsernameStorage(db())).rejects.toThrow('not ready');
    await migrateUsernames(connection, decisions, true);
    expect((await members().findOne({ _id: id }))?.__v).toBe(1);
    await assertUsernameStorage(db());
  });

  it('reports non-simple collection collation instead of weakening comparisons', async () => {
    await db().createCollection('members', {
      collation: { locale: 'en', strength: 2 },
    });
    expect((await auditUsernames(db())).issues[0].reason).toBe(
      'UNSUPPORTED_COLLECTION_COLLATION',
    );
    await expect(migrateUsernames(connection, [], true)).rejects.toThrow(
      'Resolve',
    );
    expect(await members().listIndexes().toArray()).toHaveLength(1);
  });

  it('preserves pre-existing collection validation', async () => {
    await db().createCollection('members', {
      validator: { tenant: { $ne: 'blocked' } },
    });
    await migrateUsernames(connection, [], true);
    await expect(
      members().insertOne({
        memberNick: 'Valid_1',
        memberNickNormalized: 'valid_1',
        tenant: 'blocked',
      }),
    ).rejects.toMatchObject({ code: 121 });
    await assertUsernameStorage(db());
  });

  it('uses a non-sparse unique key and blocks absent, forged, and stale normalized keys', async () => {
    await migrateUsernames(connection, [], true);
    const index = (await members().listIndexes().toArray()).find(
      (row) => row.name === USERNAME_INDEX,
    )!;
    expect(index.unique).toBe(true);
    expect(index.sparse).toBeUndefined();
    for (const row of [
      { memberNick: 'Valid_1' },
      { memberNick: 'Valid_1', memberNickNormalized: 'forged_1' },
      { memberNick: 'Valid_1', memberNickNormalized: 'Valid_1' },
      { memberNick: 'short', memberNickNormalized: 'short' },
    ]) {
      await expect(members().insertOne(row)).rejects.toMatchObject({
        code: 121,
      });
    }
    await members().insertOne({
      memberNick: 'Valid_1',
      memberNickNormalized: 'valid_1',
    });
    await expect(
      members().updateOne({}, { $set: { memberNick: 'Other_1' } }),
    ).rejects.toMatchObject({ code: 121 });
    const writes = await Promise.allSettled(
      ['Race_1', 'rACE_1'].map((memberNick) =>
        members().insertOne({
          memberNick,
          memberNickNormalized: memberNick.toLowerCase(),
        }),
      ),
    );
    expect(writes.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(writes.filter((row) => row.status === 'rejected')).toHaveLength(1);
  });

  const availability = (memberNick: unknown, token?: string) => {
    const call = request(app!.getHttpServer()).post(
      '/member/username/availability' + (token ? '/me' : ''),
    );
    if (token) call.set('Authorization', 'Bearer ' + token);
    return call.send({ memberNick });
  };

  it('reports public/current-owner availability without exposing account details or reserving a name', async () => {
    await startApi();
    expect((await availability('Alex#1')).body).toEqual({
      status: 'AVAILABLE',
      available: true,
    });
    const owner = await signup('Alex#1', 1).expect(201);
    const other = await signup('Other_1', 2).expect(201);
    const taken = await availability(' aLEX#1 ').expect(200);
    expect(taken.body).toEqual({ status: 'TAKEN', available: false });
    expect(taken.headers['cache-control']).toBe('no-store');
    expect((await availability('ALEX#1', owner.body.accessToken)).body).toEqual(
      { status: 'AVAILABLE', available: true },
    );
    expect((await availability('ALEX#1', other.body.accessToken)).body).toEqual(
      { status: 'TAKEN', available: false },
    );
    expect(
      (await availability('Aa1_#$%!&?', owner.body.accessToken)).body,
    ).toEqual({ status: 'AVAILABLE', available: true });
    expect(await members().countDocuments()).toBe(2);
    await members().updateOne(
      { memberNick: 'Alex#1' },
      { $set: { memberStatus: 'SUSPENDED' } },
    );
    expect((await availability('alex#1')).body.status).toBe('TAKEN');
  });

  it('rejects malformed inputs and reports invalid usernames without database lookups', async () => {
    await startApi();
    const lookup = jest.spyOn(model(), 'findOne');
    for (const memberNick of [
      '',
      'short',
      'a'.repeat(41),
      'Bad@Name',
      'Bad Name',
      '홍길동abc',
    ]) {
      expect((await availability(memberNick).expect(200)).body).toEqual({
        status: 'INVALID',
        available: false,
      });
    }
    for (const body of [
      {},
      { memberNick: null },
      { memberNick: 123456 },
      { memberNick: { $ne: null } },
      { memberNick: 'a'.repeat(257) },
      { memberNick: 'Valid_1', memberId: new ObjectId() },
    ]) {
      await request(app!.getHttpServer())
        .post('/member/username/availability')
        .send(body)
        .expect(400);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('requires a current authenticated account for the own-username check', async () => {
    await startApi();
    const owner = await signup('Owner_1', 1).expect(201);
    await request(app!.getHttpServer())
      .post('/member/username/availability/me')
      .send({ memberNick: 'Owner_1' })
      .expect(401);
    await availability('Owner_1', 'invalid-token').expect(401);
    await members().updateOne(
      { memberNick: 'Owner_1' },
      { $set: { authVersion: 1 } },
    );
    await availability('Owner_1', owner.body.accessToken).expect(401);
    await members().updateOne(
      { memberNick: 'Owner_1' },
      { $set: { authVersion: 0, memberStatus: 'SUSPENDED' } },
    );
    await availability('Owner_1', owner.body.accessToken).expect(401);
  });

  it('reports an unavailable check during database failure instead of claiming the name is free', async () => {
    await startApi();
    const lookup = jest.spyOn(model(), 'findOne').mockImplementation(() => {
      throw new Error('Synthetic database outage');
    });
    const failure = await availability('Unused_1').expect(503);
    expect(failure.body).not.toHaveProperty('available');
    expect(JSON.stringify(failure.body)).not.toContain('Synthetic');
    lookup.mockRestore();
    expect((await availability('Unused_1')).body).toEqual({
      status: 'AVAILABLE',
      available: true,
    });
  });

  it('does not misclassify a phone conflict as a username conflict', async () => {
    await startApi();
    const owner = await signup('Owner_1', 1).expect(201);
    const other = await signup('Owner_2', 2).expect(201);
    const signupConflict = await request(app!.getHttpServer())
      .post('/member/signup')
      .send({
        memberEmail: 'third@example.test',
        memberPassword: 'test-only-password',
        memberPhone: '+821055550001',
        memberNick: 'Unused_1',
      })
      .expect(409);
    expect(signupConflict.body.reason).toBeUndefined();
    const profileConflict = await edit(other.body.accessToken, {
      memberPhone: '+821055550001',
    });
    expect(profileConflict.body.errors[0].extensions.code).toBe('CONFLICT');
    expect(profileConflict.body.errors[0].extensions.reason).toBeUndefined();
    expect(owner.body.member.memberNick).toBe('Owner_1');
  });

  it('allows only one of two simultaneous case-variant signups and keeps keys private', async () => {
    await startApi();
    expect((await availability('Alex#1')).body.available).toBe(true);
    expect((await availability('aLEX#1')).body.available).toBe(true);
    const replies = await Promise.all([
      signup('Alex#1', 1),
      signup('aLEX#1', 2),
    ]);
    expect(replies.map((row) => row.status).sort()).toEqual([201, 409]);
    expect(replies.find((row) => row.status === 409)!.body).toMatchObject({
      reason: 'USERNAME_TAKEN',
      field: 'memberNick',
    });
    const success = replies.find((row) => row.status === 201)!;
    expect(success.body.member).not.toHaveProperty('memberNickNormalized');
    expect(await members().countDocuments()).toBe(1);
    expect((await members().findOne())?.memberNickNormalized).toBe('alex#1');
  });

  it('allows only one competing profile rename and supports own case-only edits', async () => {
    await startApi();
    const a = await signup('Owner_1', 1),
      b = await signup('Owner_2', 2);
    expect(
      (await availability('Shared?1', a.body.accessToken)).body.available,
    ).toBe(true);
    expect(
      (await availability('sHARED?1', b.body.accessToken)).body.available,
    ).toBe(true);
    const results = await Promise.all([
      edit(a.body.accessToken, { memberNick: 'Shared?1' }),
      edit(b.body.accessToken, { memberNick: 'sHARED?1' }),
    ]);
    expect(results.filter((row) => !row.body.errors)).toHaveLength(1);
    expect(
      results.find((row) => row.body.errors)?.body.errors[0].extensions.code,
    ).toBe('CONFLICT');
    expect(
      results.find((row) => row.body.errors)?.body.errors[0].extensions,
    ).toMatchObject({ reason: 'USERNAME_TAKEN', field: 'memberNick' });
    const winner = results[0].body.errors ? b : a;
    expect(
      (await edit(winner.body.accessToken, { memberNick: 'SHARED?1' })).body
        .errors,
    ).toBeUndefined();
    expect(
      (
        await edit(winner.body.accessToken, {
          memberFullName: 'Edited Full Name',
        })
      ).body.errors,
    ).toBeUndefined();
    const login = await request(app!.getHttpServer())
      .post('/member/login')
      .send({
        memberEmail: winner.body.member.memberEmail.toUpperCase(),
        memberPassword: 'test-only-password',
      });
    expect(login.status).toBe(200);
    expect(login.body.member.memberNick).toBe('SHARED?1');
    expect(login.body.member).not.toHaveProperty('memberNickNormalized');
  });

  it('generates a normalized Google username independently of the full name and preserves profile edits on later login', async () => {
    await startApi();
    await signup('GOOGLE_USER12345678', 1).expect(201);
    const random = jest
      .spyOn(crypto, 'randomInt')
      .mockImplementationOnce(() => 12345678)
      .mockImplementationOnce(() => 42);
    const reply = await request(app!.getHttpServer())
      .post('/member/google/login')
      .send({ idToken: 'synthetic-provider-token' });
    expect(reply.status).toBe(200);
    expect(reply.body.member.memberNick).toMatch(/^google_user\d{8}$/);
    expect(reply.body.member.memberNick).toBe('google_user00000042');
    expect(random).toHaveBeenCalledTimes(2);
    expect(reply.body.member.memberFullName).toBe('Case_1');
    const google = await members().findOne({ googleId: identity.sub });
    expect(google?.memberNickNormalized).toBe(google?.memberNick.toLowerCase());
    expect(
      (
        await edit(reply.body.accessToken, {
          memberNick: 'Chosen#1',
          memberFullName: 'Preferred Full Name',
        })
      ).body.errors,
    ).toBeUndefined();
    const again = await request(app!.getHttpServer())
      .post('/member/google/login')
      .send({ idToken: 'synthetic-provider-token' });
    expect(again.status).toBe(200);
    expect(again.body.member).toMatchObject({
      _id: reply.body.member._id,
      memberNick: 'Chosen#1',
      memberFullName: 'Preferred Full Name',
    });
  });

  it('runs the built CLI read-only with private reports and no identifying console output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'username-cli-'));
    try {
      const uri = new URL(process.env.BOOKING_TEST_URI!);
      uri.pathname = '/' + db().databaseName;
      const env = { ...process.env, MONGO_URI: String(uri) };
      const cli = join(__dirname, '../dist/tools/member-username-migration.js');
      const report = join(dir, 'report.json');
      const result = await exec(
        process.execPath,
        [cli, '--dry-run', '--report', report],
        { env },
      );
      expect(result.stdout).not.toContain('mongodb');
      expect(JSON.parse(await readFile(report, 'utf8')).summary.members).toBe(
        0,
      );
      expect((await stat(report)).mode & 0o777).toBe(0o600);
      expect(await db().listCollections().toArray()).toEqual([]);
      await exec(process.execPath, [cli, '--apply', '--writers-stopped'], {
        env,
      });
      await assertUsernameStorage(db());
      await expect(
        exec(process.execPath, [cli, '--apply'], { env }),
      ).rejects.toMatchObject({ code: 1 });
      await expect(
        exec(process.execPath, [cli, '--report', report], { env }),
      ).rejects.toMatchObject({ code: 1 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rehearses a reviewed legacy rename through the built CLI and reports unresolved records privately', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'username-legacy-cli-'));
    try {
      const id = (
        await members().insertOne({
          memberNick: 'short',
          memberFullName: 'Unchanged Full Name',
        })
      ).insertedId;
      const uri = new URL(process.env.BOOKING_TEST_URI!);
      uri.pathname = '/' + db().databaseName;
      const env = { ...process.env, MONGO_URI: String(uri) };
      const cli = join(__dirname, '../dist/tools/member-username-migration.js');
      const report = join(dir, 'report.json');
      const failure = await exec(process.execPath, [cli, '--report', report], {
        env,
      }).catch((error) => error);
      expect(failure.code).toBe(2);
      expect(failure.stdout).not.toContain(String(id));
      expect(failure.stdout).not.toContain('short');
      expect(JSON.parse(await readFile(report, 'utf8')).issues[0].reason).toBe(
        'INVALID_USERNAME',
      );
      const file = join(dir, 'reviewed.json');
      await writeFile(
        file,
        JSON.stringify([resolution(id, 'short', 'Chosen#1')]),
        { mode: 0o600 },
      );
      await exec(
        process.execPath,
        [cli, '--apply', '--writers-stopped', '--resolutions', file],
        { env },
      );
      await assertUsernameStorage(db());
      expect(await members().findOne({ _id: id })).toMatchObject({
        memberNick: 'Chosen#1',
        memberFullName: 'Unchanged Full Name',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
