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
describe('Public directory search against owned disposable MongoDB', () => {
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
  const searchClinics = (
    input: object = {},
    fields = '_id clinicName memberNick location',
  ) =>
    request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `query($input:DirectorySearchInput!){searchClinics(input:$input){entries{${fields}} total page limit}}`,
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
  describe('clinic search', () => {
    it.each(['김 병원', 'Care [A]+(B)?^$.*|\\', 'Élodie Care'])(
      'matches literal trimmed clinic name %s',
      async (clinicName) => {
        const id = await insert({ memberType: 'CLINIC', clinicName });
        const result = (await searchClinics({ name: '  ' + clinicName + '  ' }))
          .body;
        expect(result.errors).toBeUndefined();
        expect(result.data.searchClinics).toEqual({
          entries: [
            {
              _id: String(id),
              clinicName,
              memberNick: 'user_' + id,
              location: null,
            },
          ],
          total: 1,
          page: 1,
          limit: 12,
        });
      },
    );

    it('matches clinic-name substrings case-insensitively, excluding usernames and full names', async () => {
      await insert({
        memberType: 'CLINIC',
        clinicName: 'Other',
        memberNick: 'SeoulNick',
        memberNickNormalized: 'seoulnick',
        memberFullName: 'Seoul Owner',
      });
      const result = (await searchClinics({ name: 'sEOuL' })).body.data
        .searchClinics;
      expect(result.total).toBe(1);
      expect(result.entries[0]._id).toBe(String(seoul));
      expect(
        (await searchClinics({ name: '  ' })).body.data.searchClinics.total,
      ).toBe(3);
    });

    it('combines filters before pagination/counting without duplicating clinics with many matching doctors', async () => {
      await doctor({ location: 'BUSAN' });
      await doctor();
      await doctor({ clinicId: busan, location: 'SEOUL' });
      const other = await insert({
        memberType: 'CLINIC',
        clinicName: 'Seoul Other',
        location: 'SEOUL',
      });
      await doctor({ clinicId: other, doctorSpecializations: ['SURGEON'] });
      const result = (
        await searchClinics({
          name: 'care',
          city: 'SEOUL',
          specialty: 'DENTIST',
          limit: 1,
        })
      ).body.data.searchClinics;
      expect(result).toEqual({
        entries: [
          {
            _id: String(seoul),
            clinicName: 'Seoul Care',
            memberNick: 'user_' + seoul,
            location: 'SEOUL',
          },
        ],
        total: 1,
        page: 1,
        limit: 1,
      });
      expect(
        (await searchClinics({ specialty: 'DENTIST', limit: 1 })).body.data
          .searchClinics.total,
      ).toBe(2);
      expect(
        (await searchClinics({ city: 'SEOUL' })).body.data.searchClinics.total,
      ).toBe(2);
      await collection().updateOne(
        { _id: seoul },
        { $set: { location: 'BUSAN' } },
      );
      expect(
        (await searchClinics({ city: 'SEOUL', specialty: 'DENTIST' })).body.data
          .searchClinics.total,
      ).toBe(0);
    });

    it('includes clinics without doctors only when no specialty is selected', async () => {
      expect((await searchClinics()).body.data.searchClinics.total).toBe(2);
      expect(
        (await searchClinics({ city: 'SEOUL' })).body.data.searchClinics.total,
      ).toBe(1);
      expect(
        (await searchClinics({ specialty: 'DENTIST' })).body.data.searchClinics
          .total,
      ).toBe(0);
      await doctor({ doctorSpecializations: ['SURGEON', 'DENTIST'] });
      expect(
        (await searchClinics({ specialty: 'SURGEON' })).body.data.searchClinics
          .total,
      ).toBe(1);
    });

    it.each([
      { memberStatus: 'SUSPENDED' },
      { memberStatus: 'DELETED' },
      { deletedAt: new Date() },
      { doctorClinicStatus: 'PENDING' },
      { doctorClinicStatus: 'REJECTED' },
      { doctorClinicStatus: 'REMOVED' },
      { doctorSpecializations: ['SURGEON'] },
      { doctorSpecializations: [] },
      { clinicId: null },
      { clinicId: new Types.ObjectId() },
      { memberType: 'USER' },
    ])('ignores ineligible specialty contributor %j', async (fields) => {
      await doctor(fields);
      expect(
        (await searchClinics({ name: 'Seoul', specialty: 'DENTIST' })).body.data
          .searchClinics.total,
      ).toBe(0);
      expect(
        (await searchClinics({ name: 'Seoul' })).body.data.searchClinics.total,
      ).toBe(1);
    });

    it('excludes inactive/deleted clinics and other member roles even when an eligible doctor refers to them', async () => {
      for (const fields of [
        { memberStatus: 'SUSPENDED' },
        { memberStatus: 'DELETED' },
        { deletedAt: new Date() },
        { memberType: 'USER' },
        { memberType: 'DOCTOR' },
      ]) {
        const clinicId = await insert({
          memberType: 'CLINIC',
          clinicName: 'Unavailable',
          ...fields,
        });
        await doctor({ clinicId });
      }
      expect((await searchClinics()).body.data.searchClinics.total).toBe(2);
      expect(
        (await searchClinics({ specialty: 'DENTIST' })).body.data.searchClinics
          .total,
      ).toBe(0);
    });

    it('sorts by clinic name in both directions, independent of member full name', async () => {
      await collection().updateOne(
        { _id: seoul },
        { $set: { clinicName: 'alice', memberFullName: 'Zoe Owner' } },
      );
      await collection().updateOne(
        { _id: busan },
        { $set: { clinicName: 'Zoe', memberFullName: 'Alice Owner' } },
      );
      for (const [sort, expected] of [
        ['NAME_ASC', ['alice', 'Zoe']],
        ['NAME_DESC', ['Zoe', 'alice']],
      ] as const) {
        const result = (await searchClinics({ sort })).body.data.searchClinics;
        expect(
          result.entries.map((row: { clinicName: string }) => row.clinicName),
        ).toEqual(expected);
      }
    });

    it('paginates over 100 tied clinic names with accurate specialty totals in both directions', async () => {
      await collection().deleteMany({});
      const ids: string[] = [];
      for (let n = 0; n < 105; n++) {
        const clinicId = await insert({
          memberType: 'CLINIC',
          clinicName: n % 2 ? 'care' : 'Care',
          location: 'SEOUL',
        });
        ids.push(String(clinicId));
        await doctor({ clinicId });
        await doctor({ clinicId });
      }
      ids.sort();
      for (const sort of ['NAME_ASC', 'NAME_DESC']) {
        const found: string[] = [];
        for (let page = 1; page <= 3; page++) {
          const result = (
            await searchClinics({
              name: 'care',
              city: 'SEOUL',
              specialty: 'DENTIST',
              sort,
              page,
              limit: 50,
            })
          ).body.data.searchClinics;
          expect(result.total).toBe(105);
          found.push(...result.entries.map((row: { _id: string }) => row._id));
        }
        expect(found).toEqual(sort === 'NAME_ASC' ? ids : [...ids].reverse());
      }
      expect(
        (await searchClinics({ specialty: 'DENTIST', page: 1000 })).body.data
          .searchClinics,
      ).toEqual({ entries: [], total: 105, page: 1000, limit: 12 });
    });

    it('returns empty results with pagination metadata', async () => {
      expect(
        (await searchClinics({ name: 'Missing' })).body.data.searchClinics,
      ).toEqual({ entries: [], total: 0, page: 1, limit: 12 });
    });

    it.each([
      { page: 0 },
      { page: 1001 },
      { page: 1.5 },
      { page: null },
      { limit: 0 },
      { limit: 51 },
      { limit: null },
      { name: 'x'.repeat(101) },
      { name: null },
      { city: 'INVALID' },
      { city: null },
      { specialty: 'INVALID' },
      { specialty: null },
      { sort: 'INVALID' },
      { sort: null },
      { unknown: true },
    ])('rejects invalid clinic input %j before querying', async (input) => {
      const spy = jest.spyOn(model, 'aggregate');
      try {
        expect(
          (await searchClinics(input)).body.errors?.length,
        ).toBeGreaterThan(0);
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it('projects public fields and excludes private clinic/affiliated-doctor data', async () => {
      await collection().updateOne(
        { _id: seoul },
        {
          $set: {
            memberEmail: 'clinic@example.test',
            memberPhone: 'private',
            memberPassword: 'secret',
            authVersion: 8,
            googleId: 'private-clinic',
          },
        },
      );
      await doctor();
      const input = Object.assign(new DirectorySearchInput(), {
        specialty: 'DENTIST',
      });
      const result = await service.searchClinics(input);
      expect(Object.keys(result.entries[0]).sort()).toEqual(
        [
          '_id',
          'memberNick',
          'memberType',
          'memberStatus',
          'clinicName',
          'location',
        ].sort(),
      );
      expect(
        (await searchClinics({}, 'memberPhone')).body.errors,
      ).toBeDefined();
    });

    it('bounds clinic queries and inspects the specialty lookup plan without proposing indexes', async () => {
      for (let n = 0; n < 50; n++) {
        const clinicId = await insert({
          memberType: 'CLINIC',
          clinicName: 'Fixture Care ' + n,
        });
        await doctor({ clinicId });
      }
      const spy = jest.spyOn(model, 'aggregate');
      try {
        await service.searchClinics(
          Object.assign(new DirectorySearchInput(), { specialty: 'DENTIST' }),
        );
        expect(spy.mock.results[0].value.options).toMatchObject({
          maxTimeMS: 5000,
          collation: { locale: 'en', strength: 2 },
        });
        const plan = await model
          .aggregate(spy.mock.calls[0][0]!)
          .collation({ locale: 'en', strength: 2 })
          .option({ maxTimeMS: 5000 })
          .explain('executionStats');
        expect(JSON.stringify(plan)).toContain('executionStats');
        expect(JSON.stringify(plan)).toContain('COLLSCAN');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe.each(['doctor', 'clinic'] as const)(
    '%s name suggestions',
    (kind) => {
      const queryName =
        kind === 'doctor' ? 'suggestDoctorNames' : 'suggestClinicNames';
      const suggest = (input: object) =>
        request(app.getHttpServer())
          .post('/graphql')
          .send({
            query: `query($input:DirectoryNameSuggestionsInput!){${queryName}(input:$input)}`,
            variables: { input },
          });
      const named = (name: string, fields: Record<string, unknown> = {}) =>
        kind === 'doctor'
          ? doctor({ memberFullName: name, ...fields })
          : insert({
              memberType: 'CLINIC',
              clinicName: name,
              location: 'SEOUL',
              ...fields,
            });

      it.each(['김 의사', 'Dr [A]+(B)?^$.*|\\', 'Élodie'])(
        'matches literal Unicode names %s',
        async (name) => {
          await named(name);
          await named('Other');
          const response = await suggest({ name: '  ' + name + '  ' });
          expect(response.body.errors).toBeUndefined();
          expect(response.body.data[queryName]).toEqual([name]);
        },
      );

      it('deduplicates case-equivalent names deterministically and sorts before the eight-name limit', async () => {
        for (const name of [
          'Kim J',
          'Kim I',
          'Kim H',
          'Kim G',
          'Kim F',
          'Kim E',
          'Kim D',
          'Kim C',
          'Kim B',
          'Kim A',
        ])
          await named(name);
        await named('kim a');
        await named('Kim A');
        const expected = [
          'Kim A',
          'Kim B',
          'Kim C',
          'Kim D',
          'Kim E',
          'Kim F',
          'Kim G',
          'Kim H',
        ];
        for (let n = 0; n < 2; n++) {
          expect((await suggest({ name: 'kIM' })).body.data[queryName]).toEqual(
            expected,
          );
        }
      });

      it('accepts the trimmed two- and hundred-character boundaries and returns empty matches', async () => {
        const longName = 'A'.repeat(100);
        await named('Al');
        await named(longName);
        expect(
          (await suggest({ name: '  Al  ' })).body.data[queryName],
        ).toEqual(['Al']);
        expect(
          (await suggest({ name: longName })).body.data[queryName],
        ).toEqual([longName]);
        expect(
          (await suggest({ name: 'Missing' })).body.data[queryName],
        ).toEqual([]);
      });

      it('never matches a username or the other name field', async () => {
        await named('Other', {
          memberNick: 'NeedleNick',
          memberNickNormalized: 'needlenick',
          ...(kind === 'doctor'
            ? { clinicName: 'Needle Clinic' }
            : { memberFullName: 'Needle Owner' }),
        });
        expect(
          (await suggest({ name: 'Needle' })).body.data[queryName],
        ).toEqual([]);
      });

      it('applies city and specialty together with name, using the current clinic city', async () => {
        if (kind === 'doctor') {
          await named('Match Wanted', { location: 'BUSAN' });
          await named('Match Wrong City', {
            clinicId: busan,
            location: 'SEOUL',
          });
          await named('Match Wrong Specialty', {
            doctorSpecializations: ['SURGEON'],
          });
        } else {
          const wanted = await named('Match Wanted');
          await doctor({ clinicId: wanted });
          await doctor({ clinicId: wanted });
          const wrongCity = await named('Match Wrong City', {
            location: 'BUSAN',
          });
          await doctor({ clinicId: wrongCity });
          const wrongSpecialty = await named('Match Wrong Specialty');
          await doctor({
            clinicId: wrongSpecialty,
            doctorSpecializations: ['SURGEON'],
          });
        }
        expect(
          (
            await suggest({
              name: 'Match',
              city: 'SEOUL',
              specialty: 'DENTIST',
            })
          ).body.data[queryName],
        ).toEqual(['Match Wanted']);
        if (kind === 'doctor') {
          await collection().updateOne(
            { _id: seoul },
            { $set: { location: 'BUSAN' } },
          );
          expect(
            (
              await suggest({
                name: 'Match',
                city: 'SEOUL',
                specialty: 'DENTIST',
              })
            ).body.data[queryName],
          ).toEqual([]);
        }
      });

      it('excludes inactive/deleted accounts and enforces approved affiliation for doctor discovery', async () => {
        await named('Match Active');
        for (const fields of [
          { memberStatus: 'SUSPENDED' },
          { memberStatus: 'DELETED' },
          { deletedAt: new Date() },
          { memberType: 'USER' },
        ])
          await named('Match Hidden', fields);
        if (kind === 'doctor') {
          for (const fields of [
            { doctorClinicStatus: 'PENDING' },
            { doctorClinicStatus: 'REJECTED' },
            { doctorClinicStatus: 'REMOVED' },
            { clinicId: null },
            { clinicId: oid() },
          ])
            await named('Match Hidden', fields);
          for (const fields of [
            { memberStatus: 'SUSPENDED' },
            { deletedAt: new Date() },
            { memberType: 'USER' },
          ]) {
            const clinicId = await insert({ memberType: 'CLINIC', ...fields });
            await named('Match Hidden', { clinicId });
          }
        }
        expect((await suggest({ name: 'Match' })).body.data[queryName]).toEqual(
          ['Match Active'],
        );
      });

      it.each([
        {},
        { name: null },
        { name: '' },
        { name: ' ' },
        { name: 'A' },
        { name: ' A ' },
        { name: 'A'.repeat(101) },
        { name: 12 },
        { name: 'Al', city: null },
        { name: 'Al', city: 'INVALID' },
        { name: 'Al', specialty: null },
        { name: 'Al', specialty: 'INVALID' },
        { name: 'Al', limit: 50 },
        { name: 'Al', page: 1 },
        { name: 'Al', sort: 'NAME_DESC' },
      ])(
        'rejects invalid suggestion input %j without querying',
        async (input) => {
          const spy = jest.spyOn(model, 'aggregate');
          try {
            expect((await suggest(input)).body.errors?.length).toBeGreaterThan(
              0,
            );
            expect(spy).not.toHaveBeenCalled();
          } finally {
            spy.mockRestore();
          }
        },
      );

      it('returns only name strings from the real service with a bounded query', async () => {
        await named('Match Public', {
          memberEmail: 'secret@example.test',
          memberPhone: 'secret',
          memberPassword: 'secret',
          googleId: 'private-provider',
          authVersion: 6,
        });
        const spy = jest.spyOn(model, 'aggregate');
        try {
          const input = { name: 'Match' };
          const result =
            kind === 'doctor'
              ? await service.suggestDoctorNames(input)
              : await service.suggestClinicNames(input);
          expect(result).toEqual(['Match Public']);
          expect(spy.mock.results[0].value.options).toMatchObject({
            maxTimeMS: 5000,
            collation: { locale: 'en', strength: 2 },
          });
        } finally {
          spy.mockRestore();
        }
      });
    },
  );

  it('clinic suggestions require eligible doctors only when specialty is supplied', async () => {
    const suggest = (input: object) =>
      request(app.getHttpServer()).post('/graphql').send({
        query:
          'query($input:DirectoryNameSuggestionsInput!){suggestClinicNames(input:$input)}',
        variables: { input },
      });
    const empty = await insert({
      memberType: 'CLINIC',
      clinicName: 'Match Empty',
      location: 'SEOUL',
    });
    for (const fields of [
      { memberStatus: 'SUSPENDED' },
      { memberStatus: 'DELETED' },
      { deletedAt: new Date() },
      { doctorClinicStatus: 'PENDING' },
      { doctorClinicStatus: 'REJECTED' },
      { doctorClinicStatus: 'REMOVED' },
      { doctorSpecializations: ['SURGEON'] },
      { memberType: 'USER' },
    ]) {
      await doctor({ clinicId: empty, ...fields });
    }
    expect(
      (await suggest({ name: 'Match' })).body.data.suggestClinicNames,
    ).toEqual(['Match Empty']);
    expect(
      (await suggest({ name: 'Match', specialty: 'DENTIST' })).body.data
        .suggestClinicNames,
    ).toEqual([]);
    await doctor({ clinicId: empty });
    expect(
      (await suggest({ name: 'Match', specialty: 'DENTIST' })).body.data
        .suggestClinicNames,
    ).toEqual(['Match Empty']);
    await collection().updateOne(
      { _id: empty },
      { $set: { memberStatus: 'SUSPENDED' } },
    );
    expect(
      (await suggest({ name: 'Match', specialty: 'DENTIST' })).body.data
        .suggestClinicNames,
    ).toEqual([]);
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
