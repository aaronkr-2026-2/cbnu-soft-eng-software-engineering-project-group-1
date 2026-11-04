import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { GraphQLModule } from '@nestjs/graphql';
import { getModelToken } from '@nestjs/mongoose';
import { createConnection, Types, type Connection, type Model } from 'mongoose';
import request from 'supertest';
import MemberSchema, { MEMBER } from '../src/schemas/member.model.js';
import { MemberService } from '../src/components/member/member.service.js';
import { MemberResolver } from '../src/components/member/member.resolver.js';
import { GoogleAuthService } from '../src/components/auth/google-auth.service.js';
import { migrateUsernames } from '../src/components/member/member-username-migration.js';
import { graphqlConfig } from '../src/libs/graphql/graphql.config.js';
import { DirectorySearchInput } from '../src/libs/dto/directory/directory.input.js';
import { DirectorySort } from '../src/libs/enum/directory.enum.js';
import type { MemberEntity } from '../src/libs/types/member.types.js';

const selection =
  '_id memberFullName memberNick location clinicId doctorSpecializations';
describe('Public doctor search against owned disposable MongoDB', () => {
  let connection: Connection;
  let app: INestApplication;
  let service: MemberService;
  let model: Model<MemberEntity>;
  let seoul: Types.ObjectId;
  let busan: Types.ObjectId;
  const oid = () => new Types.ObjectId();
  const collection = () => connection.db!.collection('members');
  const search = (input: object = {}, fields = selection) =>
    request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `query($input:DirectorySearchInput!){searchDoctors(input:$input){entries{${fields}} total page limit}}`,
        variables: { input },
      });
  async function insert(fields: Record<string, unknown>) {
    const _id = oid();
    await collection().insertOne({
      _id,
      memberNick: 'user_' + _id,
      memberNickNormalized: 'user_' + _id,
      memberStatus: 'ACTIVE',
      deletedAt: null,
      ...fields,
    });
    return _id;
  }
  const doctor = (fields: Record<string, unknown> = {}) =>
    insert({
      memberType: 'DOCTOR',
      memberFullName: 'Kim',
      clinicId: seoul,
      doctorClinicStatus: 'APPROVED',
      doctorSpecializations: ['DENTIST'],
      memberEmail: String(oid()) + '@example.test',
      memberPhone: String(oid()),
      memberPassword: 'secret',
      authVersion: 7,
      googleId: String(oid()),
      ...fields,
    });
  beforeAll(async () => {
    if (
      process.env.BOOKING_TEST_DISPOSABLE !== '1' ||
      !process.env.BOOKING_TEST_URI
    )
      throw new Error('Use the owned disposable MongoDB runner');
    connection = await createConnection(process.env.BOOKING_TEST_URI, {
      dbName: 'directory_' + oid(),
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
    await migrateUsernames(connection, [], true);
    model = connection.model<MemberEntity>(MEMBER, MemberSchema);
    const fixture = await Test.createTestingModule({
      imports: [GraphQLModule.forRoot({ ...graphqlConfig, graphiql: false })],
      providers: [
        MemberService,
        MemberResolver,
        { provide: JwtService, useValue: {} },
        { provide: GoogleAuthService, useValue: {} },
        { provide: getModelToken(MEMBER), useValue: model },
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
    service = app.get(MemberService);
  });
  beforeEach(async () => {
    await collection().deleteMany({});
    seoul = await insert({
      memberType: 'CLINIC',
      clinicName: 'Seoul Care',
      location: 'SEOUL',
    });
    busan = await insert({
      memberType: 'CLINIC',
      clinicName: 'Busan Care',
      location: 'BUSAN',
    });
  });
  afterAll(async () => {
    await app?.close();
    await connection?.dropDatabase();
    await connection?.close();
  });

  it.each(['김 의사', 'Dr. [Kim]+(A)?^$.*|\\', 'Élodie'])(
    'matches trimmed literal Unicode full name %s',
    async (name) => {
      const id = await doctor({ memberFullName: name });
      await doctor({ memberFullName: 'Other' });
      const response = await search({ name: '  ' + name + '  ' });
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.searchDoctors).toMatchObject({
        entries: [{ _id: String(id) }],
        total: 1,
        page: 1,
        limit: 12,
      });
      expect(response.body.data.searchDoctors.entries).toHaveLength(1);
    },
  );
  it('excludes username-only matches', async () => {
    await doctor({
      memberFullName: 'Other',
      memberNick: 'NickNeedle',
      memberNickNormalized: 'nickneedle',
    });
    expect(
      (await search({ name: 'NickNeedle' })).body.data.searchDoctors.total,
    ).toBe(0);
  });
  it('matches case-insensitive substrings and blank names', async () => {
    await doctor({ memberFullName: 'Dr. KIM Lee' });
    expect((await search({ name: 'kim' })).body.data.searchDoctors.total).toBe(
      1,
    );
    expect((await search({ name: '   ' })).body.data.searchDoctors.total).toBe(
      1,
    );
  });
  it('applies name, specialty and clinic-derived city individually and together before counting', async () => {
    const wanted = await doctor({ location: 'BUSAN' });
    await doctor({ clinicId: busan, location: 'SEOUL' });
    await doctor({ doctorSpecializations: ['SURGEON'] });
    await doctor({ memberFullName: 'Lee' });
    for (const [input, count] of [
      [{ city: 'SEOUL' }, 3],
      [{ specialty: 'DENTIST' }, 3],
      [{ name: 'Kim', city: 'SEOUL', specialty: 'DENTIST', limit: 1 }, 1],
    ] as const) {
      const result = (await search(input)).body.data.searchDoctors;
      expect(result.total).toBe(count);
    }
    const result = (
      await search({ name: 'Kim', city: 'SEOUL', specialty: 'DENTIST' })
    ).body.data.searchDoctors;
    expect(result.entries).toEqual([
      expect.objectContaining({ _id: String(wanted), location: 'SEOUL' }),
    ]);
    await collection().updateOne(
      { _id: seoul },
      { $set: { location: 'BUSAN' } },
    );
    expect(
      (await search({ city: 'SEOUL' })).body.data.searchDoctors.total,
    ).toBe(0);
  });
  it('excludes inactive/deleted/unapproved doctors and unavailable or wrong-role clinics', async () => {
    const wanted = await doctor();
    for (const fields of [
      { memberStatus: 'SUSPENDED' },
      { memberStatus: 'DELETED' },
      { deletedAt: new Date() },
      { doctorClinicStatus: 'PENDING' },
      { doctorClinicStatus: 'REJECTED' },
      { doctorClinicStatus: 'REMOVED' },
      { clinicId: oid() },
      { clinicId: null },
      { memberType: 'USER' },
    ])
      await doctor(fields);
    for (const fields of [
      { memberStatus: 'SUSPENDED' },
      { deletedAt: new Date() },
      { memberType: 'USER' },
    ]) {
      const clinicId = await insert({ memberType: 'CLINIC', ...fields });
      await doctor({ clinicId });
    }
    const result = (await search()).body.data.searchDoctors;
    expect(result.total).toBe(1);
    expect(result.entries[0]._id).toBe(String(wanted));
  });
  it('returns null city for a legacy clinic without city instead of stale doctor location', async () => {
    await collection().updateOne({ _id: seoul }, { $unset: { location: '' } });
    await doctor({ location: 'BUSAN' });
    expect(
      (await search()).body.data.searchDoctors.entries[0].location,
    ).toBeNull();
    expect(
      (await search({ city: 'BUSAN' })).body.data.searchDoctors.total,
    ).toBe(0);
  });
  it('paginates more than 100 names with stable ties in both directions and actual out-of-range totals', async () => {
    const ids: string[] = [];
    for (let n = 0; n < 125; n++)
      ids.push(String(await doctor({ memberFullName: n % 2 ? 'kim' : 'Kim' })));
    ids.sort();
    for (const sort of ['NAME_ASC', 'NAME_DESC']) {
      const found: string[] = [];
      for (let page = 1; page <= 3; page++) {
        const result = (await search({ sort, page, limit: 50 })).body.data
          .searchDoctors;
        expect(result.total).toBe(125);
        found.push(
          ...result.entries.map((entry: { _id: string }) => entry._id),
        );
      }
      expect(found).toEqual(sort === 'NAME_ASC' ? ids : [...ids].reverse());
    }
    expect((await search({ page: 1000 })).body.data.searchDoctors).toEqual({
      entries: [],
      total: 125,
      page: 1000,
      limit: 12,
    });
  });
  it('sorts different names alphabetically in both directions', async () => {
    for (const memberFullName of ['zoe', 'Bob', 'alice'])
      await doctor({ memberFullName });
    expect(
      (await search()).body.data.searchDoctors.entries.map(
        (e: { memberFullName: string }) => e.memberFullName,
      ),
    ).toEqual(['alice', 'Bob', 'zoe']);
    expect(
      (await search({ sort: 'NAME_DESC' })).body.data.searchDoctors.entries.map(
        (e: { memberFullName: string }) => e.memberFullName,
      ),
    ).toEqual(['zoe', 'Bob', 'alice']);
  });
  it('returns a successful empty page', async () => {
    expect((await search({ name: 'Nobody' })).body.data.searchDoctors).toEqual({
      entries: [],
      total: 0,
      page: 1,
      limit: 12,
    });
  });
  it.each([
    { page: 0 },
    { page: 1001 },
    { page: 1.5 },
    { page: null },
    { limit: 0 },
    { limit: 51 },
    { limit: -1 },
    { limit: null },
    { name: 'a'.repeat(101) },
    { name: null },
    { city: 'INVALID' },
    { city: null },
    { specialty: 'INVALID' },
    { specialty: null },
    { sort: 'INVALID' },
    { sort: null },
    { unknown: true },
  ])('rejects invalid input %j before querying', async (input) => {
    const spy = jest.spyOn(model, 'aggregate');
    try {
      const response = await search(input);
      expect(response.body.errors?.length).toBeGreaterThan(0);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
  it('projects only public fields even in raw service results', async () => {
    await doctor();
    const result = await service.searchDoctors(new DirectorySearchInput());
    expect(Object.keys(result.entries[0]).sort()).toEqual(
      [
        '_id',
        'memberNick',
        'memberFullName',
        'memberStatus',
        'memberType',
        'location',
        'clinicId',
        'doctorClinicStatus',
        'doctorSpecializations',
      ].sort(),
    );
    expect((await search({}, 'memberEmail')).body.errors).toBeDefined();
  });
  it('uses bounded aggregation and inspects execution plans on disposable representative data', async () => {
    for (let n = 0; n < 150; n++)
      await doctor({
        memberFullName: 'Doctor ' + n,
        clinicId: n % 2 ? seoul : busan,
      });
    const spy = jest.spyOn(model, 'aggregate');
    try {
      await service.searchDoctors(
        Object.assign(new DirectorySearchInput(), {
          name: 'Doctor',
          city: 'SEOUL',
          sort: DirectorySort.NAME_DESC,
        }),
      );
      expect(spy.mock.results[0].value.options).toMatchObject({
        maxTimeMS: 5000,
        collation: { locale: 'en', strength: 2 },
      });
      const pipeline = spy.mock.calls[0][0]!;
      const plan = await model
        .aggregate(pipeline)
        .collation({ locale: 'en', strength: 2 })
        .option({ maxTimeMS: 5000 })
        .explain('executionStats');
      expect(JSON.stringify(plan)).toContain('executionStats');
      // Substring matching scans the doctor collection; the clinic join uses _id.
      expect(JSON.stringify(plan)).toContain('COLLSCAN');
      expect(JSON.stringify(plan)).toContain('_id_');
    } finally {
      spy.mockRestore();
    }
  });
});
