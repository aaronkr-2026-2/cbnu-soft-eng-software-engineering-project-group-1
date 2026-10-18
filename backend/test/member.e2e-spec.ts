import { GoogleAuthService } from '../src/components/auth/google-auth.service.js';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { JwtModule } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import type { Server } from 'node:http';
import { Types } from 'mongoose';
import request from 'supertest';
import { MemberController } from '../src/components/member/member.controller.js';
import { MemberResolver } from '../src/components/member/member.resolver.js';
import { MemberService } from '../src/components/member/member.service.js';
import { graphqlConfig } from '../src/libs/graphql/graphql.config.js';
import { MEMBER } from '../src/schemas/member.model.js';
import { LoggingInterceptor } from '../src/libs/interceptor/logging.interceptor.js';
import { FileLogger } from '../src/libs/logger/file-logger.service.js';

describe('Get User, Doctor, and Clinic member profiles', () => {
  let app: INestApplication<Server>;
  const logger = { log: jest.fn(), error: jest.fn() };
  const id = new Types.ObjectId();
  let member: Record<string, unknown>;
  let directoryMembers: Record<string, unknown>[];
  let clinics: Record<string, unknown>[];
  const selectPublicFields = jest.fn();
  const find = jest.fn((filter: Record<string, unknown>) => {
    let fields: Record<string, number> = {};
    let limit = Infinity;
    const chain = {
      select: (projection: Record<string, number>) => {
        selectPublicFields(projection);
        fields = projection;
        return chain;
      },
      sort: () => chain,
      limit: (value: number) => {
        limit = value;
        return chain;
      },
      lean: () => chain,
      exec: async () => (filter._id ? clinics : directoryMembers)
        .filter((record) => Object.entries(filter).every(([key, value]) => {
          if (key === '_id') return (value as { $in: unknown[] }).$in.some(id => String(id) === String(record._id));
          return record[key] === value;
        }))
        .slice(0, limit)
        .map((record) => Object.fromEntries(Object.entries(record).filter(([key]) => fields[key] === 1))),
    };
    return chain;
  });
  const findOne = jest.fn((filter: Record<string, unknown>) => {
    const types = filter.memberType as { $in: string[] };
    const matches =
      String(filter._id) === String(member._id) &&
      types.$in.includes(String(member.memberType)) &&
      member.memberStatus === filter.memberStatus &&
      member.deletedAt == null;
    let fields: Record<string, number> = {};
    const chain = {
      select: (projection: Record<string, number>) => {
        fields = projection;
        return chain;
      },
      lean: () => chain,
      exec: async () =>
        matches
          ? Object.fromEntries(
              Object.entries(member).filter(([key]) => fields[key] === 1),
            )
          : null,
    };
    return chain;
  });

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [
        GraphQLModule.forRoot({ ...graphqlConfig, graphiql: false }),
        JwtModule.register({ secret: 'member-profile-test-secret' }),
      ],
      controllers: [MemberController],
      providers: [
        MemberService,
        GoogleAuthService,
        MemberResolver,
        { provide: getModelToken(MEMBER), useValue: { findOne, find } },
      ],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalInterceptors(new LoggingInterceptor(logger as unknown as FileLogger));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => {
    findOne.mockClear();
    find.mockClear();
    selectPublicFields.mockClear();
    logger.log.mockClear();
    logger.error.mockClear();
    member = {
      _id: id,
      memberType: 'DOCTOR',
      memberStatus: 'ACTIVE',
      memberNick: 'doctor',
      memberFullName: 'Example Doctor',
      memberImage: '',
      memberAddress: 'Seoul',
      memberDesc: 'Provider profile',
      clinicId: new Types.ObjectId(),
      doctorClinicStatus: 'APPROVED',
      doctorSpecializations: ['DENTIST'],
      location: 'BUSAN',
      memberPassword: 'private-password-hash',
      memberEmail: 'private@example.com',
      memberPhone: '+821012345678',
      professionalLicenseNumber: 'PRIVATE-LICENSE',
      googleId: 'private-provider-id',
      telegramId: 'private-provider-id',
      deletedAt: null,
      __v: 0,
    };
    directoryMembers = [member];
    clinics = [{ _id: member.clinicId, memberType: 'CLINIC', memberStatus: 'ACTIVE', deletedAt: null, location: 'SEOUL' }];
  });
  afterAll(async () => app.close());

  const getGraphql = (memberId: string = String(id)) =>
    request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `query($id: ID!) {
        getMember(id: $id) {
          _id memberType memberNick memberFullName memberAddress memberDesc
          clinicId clinicName clinicTimezone location doctorClinicStatus doctorSpecializations
        }
      }`,
        variables: { id: memberId },
      });

  it.each(['USER', 'DOCTOR', 'CLINIC'])(
    'returns a public %s profile over GraphQL',
    async (type) => {
      member.memberType = type;
      if (type !== 'USER') member.location = 'SEOUL';
      if (type === 'USER') {
        delete member.location;
        delete member.clinicId;
        delete member.doctorSpecializations;
        member.doctorClinicStatus = 'NOT_APPLICABLE';
      }
      if (type === 'CLINIC') {
        member.clinicName = 'Example Clinic';
        member.clinicTimezone = 'Asia/Seoul';
        delete member.clinicId;
        delete member.doctorSpecializations;
        member.doctorClinicStatus = 'NOT_APPLICABLE';
      }
      const graphql = await getGraphql().expect(200);
      expect(graphql.body.errors).toBeUndefined();
      expect(logger.log).toHaveBeenCalledWith('GraphQL Query.getMember started', 'MemberResolver.getMember');
      expect(logger.log).toHaveBeenCalledWith(expect.stringMatching(/^GraphQL Query\.getMember completed in \d+ms$/), 'MemberResolver.getMember');
      expect(JSON.stringify(logger.log.mock.calls)).not.toContain(String(id));
      expect(JSON.stringify(logger.log.mock.calls)).not.toContain('private@example.com');
      expect(graphql.headers['cache-control']).toBe('no-store');
      expect(graphql.body.data.getMember).toMatchObject({
        _id: String(id),
        memberType: type,
        location: type === 'USER' ? null : 'SEOUL',
        ...(type === 'DOCTOR'
          ? {
              clinicId: String(member.clinicId),
              doctorSpecializations: ['DENTIST'],
            }
          : type === 'CLINIC'
            ? { clinicName: 'Example Clinic', clinicTimezone: 'Asia/Seoul' }
            : {
                clinicId: null,
                clinicName: null,
                doctorClinicStatus: 'NOT_APPLICABLE',
                doctorSpecializations: null,
              }),
      });
    },
  );

  it('derives city from the current clinic, ignoring stale doctor city', async () => {
    let response = await getGraphql().expect(200);
    expect(response.body.data.getMember.location).toBe('SEOUL');
    clinics[0].location = 'JEJU';
    response = await getGraphql().expect(200);
    expect(response.body.data.getMember.location).toBe('JEJU');
    const other = { ...clinics[0], _id: new Types.ObjectId(), location: 'BUSAN' };
    clinics.push(other);
    member.clinicId = other._id;
    response = await getGraphql().expect(200);
    expect(response.body.data.getMember.location).toBe('BUSAN');
  });

  it.each(['missing', 'no-city', 'null-city', 'deleted', 'suspended', 'wrong-role'])(
    'returns null for an unavailable clinic city: %s', async condition => {
      if (condition === 'missing') clinics = [];
      if (condition === 'no-city') delete clinics[0].location;
      if (condition === 'null-city') clinics[0].location = null;
      if (condition === 'deleted') clinics[0].deletedAt = new Date();
      if (condition === 'suspended') clinics[0].memberStatus = 'SUSPENDED';
      if (condition === 'wrong-role') clinics[0].memberType = 'USER';
      const response = await getGraphql().expect(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.getMember.location).toBeNull();
    },
  );

  it('hydrates multiple doctors with one clinic lookup and follows changed affiliations', async () => {
    const other = { ...clinics[0], _id: new Types.ObjectId(), location: 'JEJU' };
    clinics.push(other);
    directoryMembers.push({ ...member, _id: new Types.ObjectId(), clinicId: other._id });
    const query = '{ getDoctors { _id location } }';
    let response = await request(app.getHttpServer()).post('/graphql').send({ query }).expect(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.getDoctors.map((doctor: { location: string }) => doctor.location)).toEqual(['SEOUL', 'JEJU']);
    expect(find).toHaveBeenCalledTimes(2);
    expect(find.mock.calls[1][0]._id).toEqual({ $in: [member.clinicId, other._id] });
    expect(selectPublicFields.mock.calls[1][0]).toEqual({ _id: 1, location: 1 });
    member.clinicId = other._id;
    response = await request(app.getHttpServer()).post('/graphql').send({ query }).expect(200);
    expect(response.body.data.getDoctors.map((doctor: { location: string }) => doctor.location)).toEqual(['JEJU', 'JEJU']);
  });

  it.each([
    { memberType: 'ADMIN' },
    { memberStatus: 'SUSPENDED' },
    { memberStatus: 'DELETED' },
    { deletedAt: new Date() },
    { _id: new Types.ObjectId() },
  ])('hides unavailable or admin members: %j', async (overrides) => {
    Object.assign(member, overrides);
    const graphql = await getGraphql().expect(200);
    expect(graphql.body.errors[0].message).toBe('Member not found');
    expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/^GraphQL Query\.getMember failed in \d+ms: Member not found$/), expect.any(String), 'MemberResolver.getMember');
    expect(graphql.body.errors[0].extensions.code).toBe('NOT_FOUND');
    expect(graphql.body.data).toBeNull();
  });

  it('rejects invalid IDs before querying persistence', async () => {
    const graphql = await getGraphql('invalid-id').expect(200);
    expect(graphql.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(findOne).not.toHaveBeenCalled();
  });

  it('does not expose a REST member lookup route', async () => {
    await request(app.getHttpServer()).get(`/member/${id}`).expect(404);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('lists only active approved nondeleted doctors with public fields', async () => {
    directoryMembers.push(
      { ...member, memberType: 'USER' },
      { ...member, memberType: 'CLINIC' },
      { ...member, memberType: 'ADMIN' },
      { ...member, memberStatus: 'SUSPENDED' },
      { ...member, memberStatus: 'DELETED' },
      { ...member, deletedAt: new Date() },
      { ...member, doctorClinicStatus: 'PENDING' },
      { ...member, doctorClinicStatus: 'REJECTED' },
      { ...member, doctorClinicStatus: 'REMOVED' },
    );
    const result = await request(app.getHttpServer()).post('/graphql').send({
      query: '{ getDoctors { _id memberNick memberFullName memberImage location doctorSpecializations } }',
    }).expect(200);
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.getDoctors).toEqual([{
      _id: String(id),
      memberNick: 'doctor',
      memberFullName: 'Example Doctor',
      memberImage: '',
      location: 'SEOUL',
      doctorSpecializations: ['DENTIST'],
    }]);
    expect(find).toHaveBeenCalledWith({
      memberType: 'DOCTOR', memberStatus: 'ACTIVE', deletedAt: null,
      doctorClinicStatus: 'APPROVED',
    });
    for (const field of ['memberPassword', 'memberEmail', 'memberPhone', 'professionalLicenseNumber']) {
      expect(selectPublicFields.mock.calls[0][0]).not.toHaveProperty(field);
    }
    expect(result.headers['cache-control']).toBe('no-store');
  });

  it('caps the public doctor directory at 100 records', async () => {
    directoryMembers = Array.from({ length: 101 }, () => ({ ...member, _id: new Types.ObjectId() }));
    const result = await request(app.getHttpServer()).post('/graphql').send({
      query: '{ getDoctors { _id } }',
    }).expect(200);
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.getDoctors).toHaveLength(100);
  });

  it('does not expose private fields in the GraphQL schema', async () => {
    const result = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `query { getMember(id: "${id}") { memberPassword memberEmail memberPhone professionalLicenseNumber } }`,
      })
      .expect(400);
    expect(result.body.errors[0].extensions.code).toBe(
      'GRAPHQL_VALIDATION_FAILED',
    );
    expect(findOne).not.toHaveBeenCalled();
  });
});
