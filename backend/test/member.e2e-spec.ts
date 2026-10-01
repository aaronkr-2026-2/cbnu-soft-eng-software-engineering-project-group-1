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
        MemberResolver,
        { provide: getModelToken(MEMBER), useValue: { findOne } },
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
      memberPassword: 'private-password-hash',
      memberEmail: 'private@example.com',
      memberPhone: '+821012345678',
      professionalLicenseNumber: 'PRIVATE-LICENSE',
      googleId: 'private-provider-id',
      telegramId: 'private-provider-id',
      deletedAt: null,
      __v: 0,
    };
  });
  afterAll(async () => app.close());

  const getGraphql = (memberId: string = String(id)) =>
    request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `query($id: ID!) {
        getMember(id: $id) {
          _id memberType memberNick memberFullName memberAddress memberDesc
          clinicId clinicName clinicTimezone doctorClinicStatus doctorSpecializations
        }
      }`,
        variables: { id: memberId },
      });

  it.each(['USER', 'DOCTOR', 'CLINIC'])(
    'returns a public %s profile over GraphQL',
    async (type) => {
      member.memberType = type;
      if (type === 'USER') {
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
