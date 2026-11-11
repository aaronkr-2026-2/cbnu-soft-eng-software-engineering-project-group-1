import {
  Module,
  ValidationPipe,
  type INestApplication,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MemberController } from '../src/components/member/member.controller.js';
import { MemberModule } from '../src/components/member/member.module.js';
import { MemberService } from '../src/components/member/member.service.js';
import { GoogleAuthService } from '../src/components/auth/google-auth.service.js';

// Exercise the real module's middleware registration without a database/provider.
@Module({
  controllers: [MemberController],
  providers: [
    {
      provide: MemberService,
      useValue: {
        usernameAvailability: () => ({ status: 'AVAILABLE', available: true }),
      },
    },
    { provide: GoogleAuthService, useValue: {} },
  ],
})
class LimitsFixture implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    new MemberModule().configure(consumer);
  }
}

describe('Username availability request limits', () => {
  let app: INestApplication;
  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      imports: [LimitsFixture],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  const check = () =>
    request(app.getHttpServer())
      .post('/member/username/availability')
      .send({ memberNick: 'Sample_1' });
  const badLogin = () =>
    request(app.getHttpServer()).post('/member/login').send({});

  it('shares thirty checks across both routes without exhausting authentication', async () => {
    for (let i = 0; i < 30; i++) await check().expect(200);
    const blocked = await check().expect(429);
    expect(blocked.headers['cache-control']).toBe('no-store');
    expect(blocked.headers.ratelimit).toBeDefined();
    await request(app.getHttpServer())
      .post('/member/username/availability/me')
      .send({ memberNick: 'Sample_1' })
      .expect(429);
    await badLogin().expect(400);
  });
  it('keeps the username budget separate from exhausted authentication limits', async () => {
    for (let i = 0; i < 20; i++) await badLogin().expect(400);
    await badLogin().expect(429);
    await check().expect(200);
  });
});
