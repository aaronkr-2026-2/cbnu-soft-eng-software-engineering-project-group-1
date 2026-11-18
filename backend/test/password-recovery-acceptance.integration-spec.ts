import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import type { MemberEntity } from '../src/libs/types/member.types.js';
import { Types, type Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PasswordRecoveryService } from '../src/components/auth/password-recovery.service.js';
import { EmailDeliveryService } from '../src/components/auth/email-delivery.service.js';
import { MemberService } from '../src/components/member/member.service.js';
import { hashPassword } from '../src/components/auth/member-password.js';
import { recoveryLink } from '../src/components/auth/password-recovery-policy.js';
import {
  passwordRecoveryEmail,
  passwordChangedEmail,
} from '../src/components/auth/recovery-email.js';
import { migrateUsernames } from '../src/components/member/member-username-migration.js';
import { BookingMigrationService } from '../src/components/booking/booking-migration.service.js';
import {
  setupPasswordRecoveryStorage,
  RECOVERY_CONFIRMATIONS,
  RECOVERY_REQUESTS,
} from '../src/schemas/password-recovery.model.js';

// This suite runs only with the explicit acceptance runner and an isolated Next build.
describe('Production Next HTTP proxy → normal Nest AppModule → disposable MongoDB', () => {
  let app: INestApplication;
  let connection: Connection;
  let recovery: PasswordRecoveryService;
  let web: ChildProcess | undefined;
  let origin: string;
  let link = '';
  let confirmation = '';
  let releaseMail: (() => void) | undefined;
  const id = new Types.ObjectId();
  const email = 'combined-recovery@example.test';
  const password = 'disposable-original-password';
  const changed = 'disposable-replacement-password';
  const original = { ...process.env };
  const mail = {
    assertConfigured() {},
    async sendRecoveryLink(_email: string, token: string) {
      link = recoveryLink(token);
      expect(passwordRecoveryEmail(link).text).toContain(link);
      if (releaseMail === undefined)
        await new Promise<void>((resolve) => {
          releaseMail = resolve;
        });
    },
    async sendPasswordChanged() {
      confirmation = passwordChangedEmail(`${origin}/auth`).text;
    },
  };
  const post = (action: string, body: object, cookie?: string, headers = {}) =>
    fetch(`${origin}/api/session/${action}`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'x-medconnect-session': '1',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  async function until(predicate: () => boolean | Promise<boolean>) {
    const deadline = Date.now() + 12000;
    while (!(await predicate())) {
      if (Date.now() >= deadline)
        throw new Error('Combined acceptance condition timed out');
      await delay(50);
    }
  }
  beforeAll(async () => {
    if (
      process.env.BOOKING_TEST_DISPOSABLE !== '1' ||
      !process.env.RECOVERY_NEXT_APP
    )
      throw new Error('Use --recovery-acceptance with an isolated Next build');
    process.env.MONGO_URI = process.env.BOOKING_TEST_URI!.replace(
      '/?',
      `/combined_${randomUUID().replaceAll('-', '')}?`,
    );
    process.env.NODE_ENV = 'development';
    process.env.JWT_ACCESS_SECRET =
      'disposable-combined-recovery-secret-at-least-32-bytes';
    for (const key of [
      'PASSWORD_RECOVERY_ENABLED',
      'BOOKING_POLICY_V2_ENABLED',
      'WAITLIST_ENROLLMENT_ENABLED',
      'WAITLIST_PROMOTION_ENABLED',
      'COMMITMENT_REPLACEMENT_ENABLED',
      'WAITLIST_NOTIFICATIONS_ENABLED',
      'WAITLIST_LIFECYCLE_ENABLED',
      'APPOINTMENT_REMINDERS_ENABLED',
    ])
      process.env[key] = 'false';
    const portServer = createServer();
    await new Promise<void>((resolve) =>
      portServer.listen(0, '127.0.0.1', resolve),
    );
    const port = (portServer.address() as { port: number }).port;
    await new Promise<void>((resolve) => portServer.close(() => resolve()));
    origin = `http://127.0.0.1:${port}`;
    process.env.PASSWORD_RESET_WEB_ORIGIN = origin;
    const { AppModule } = await import('../src/app.module.js');
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailDeliveryService)
      .useValue(mail)
      .compile();
    app = fixture.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: () => new BadRequestException('Invalid request data'),
      }),
    );
    connection = app.get<Connection>(getConnectionToken());
    await migrateUsernames(connection, [], true);
    await app.get(BookingMigrationService).apply();
    await setupPasswordRecoveryStorage(connection.db!);
    await app.listen(0, '127.0.0.1');
    recovery = app.get(PasswordRecoveryService);
    await connection.db!.collection('members').insertOne({
      _id: id,
      memberNick: 'combined_user',
      memberNickNormalized: 'combined_user',
      memberEmail: email,
      memberPassword: await hashPassword(password),
      memberPhone: '+821099990099',
      memberType: 'USER',
      memberStatus: 'ACTIVE',
      authProvider: 'EMAIL',
      authVersion: 0,
      __v: 0,
    });
    const dir = process.env.RECOVERY_NEXT_APP;
    web = spawn(
      process.execPath,
      [
        join(dir, 'node_modules/next/dist/bin/next'),
        'start',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port),
      ],
      {
        cwd: dir,
        stdio: 'ignore',
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'production',
          API_URL: await app.getUrl(),
          NEXT_TELEMETRY_DISABLED: '1',
        },
      },
    );
    await until(async () => {
      if (web!.exitCode !== null) throw new Error('Isolated Next exited');
      try {
        return (await fetch(`${origin}/reset-password`)).ok;
      } catch {
        return false;
      }
    });
  });
  afterAll(async () => {
    releaseMail?.();
    if (web && web.exitCode === null) {
      const exited = new Promise((resolve) => web!.once('exit', resolve));
      web.kill('SIGTERM');
      const force = setTimeout(() => web!.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(force);
    }
    if (app) await app.close();
    // Runner owns mongod/data directory; app.close disconnects before runner cleanup.
    for (const key of Object.keys(process.env))
      if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  });
  it('serves private recovery pages and rejects cross-origin or injected recovery requests', async () => {
    for (const route of ['forgot-password', 'reset-password']) {
      const response = await fetch(`${origin}/${route}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    }
    const input = { memberEmail: email, requestId: randomUUID() };
    expect(
      (
        await post('password-request', input, undefined, {
          Origin: 'https://foreign.example',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post('password-request', {
          ...input,
          redirect: 'https://foreign.example',
        })
      ).status,
    ).toBe(400);
  });
  it('admits without waiting for SMTP, runs the timer worker, resets once and revokes old sessions', async () => {
    const login = await post('login', {
      memberEmail: email,
      memberPassword: password,
    });
    expect(login.status).toBe(200);
    const old = await login.json();
    const oldCookie = login.headers.get('set-cookie')!.split(';')[0];
    const input = { memberEmail: email, requestId: randomUUID() };
    process.env.PASSWORD_RECOVERY_ENABLED = 'true';
    await recovery.onModuleInit(); // Real timer loop, no manual runOnce calls.
    const queued = await post('password-request', input);
    expect(queued.status).toBe(202);
    expect(await queued.json()).toEqual({ accepted: true });
    expect(queued.headers.get('set-cookie')).toBeNull();
    await until(() => !!releaseMail);
    const duplicate = await post('password-request', input);
    expect(duplicate.status).toBe(202); // Mail remains deliberately blocked.
    expect(
      await connection
        .db!.collection(RECOVERY_REQUESTS)
        .countDocuments({ email }),
    ).toBe(1);
    releaseMail!();
    const token = new URL(link).hash.slice('#token='.length);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const resetInput = {
      token,
      newPassword: changed,
      confirmPassword: changed,
    };
    const replies = await Promise.all([
      post('password-reset', resetInput, oldCookie),
      post('password-reset', resetInput),
    ]);
    expect(replies.map((r) => r.status).sort()).toEqual([200, 400]);
    const success = replies.find((r) => r.status === 200)!;
    expect(await success.json()).toEqual({ passwordChanged: true });
    expect(success.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect(success.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await replies.find((r) => r.status === 400)!.json()).toEqual({
      reason: 'PASSWORD_RECOVERY_INVALID',
    });
    expect(
      await connection
        .db!.collection('member_sessions')
        .countDocuments({ memberId: id }),
    ).toBe(0);
    await expect(
      app.get(MemberService).authenticateAccessToken(old.accessToken),
    ).rejects.toThrow();
    expect((await post('refresh', {}, oldCookie)).status).toBe(401);
    expect(
      (await post('login', { memberEmail: email, memberPassword: password }))
        .status,
    ).toBe(401);
    expect(
      (await post('login', { memberEmail: email, memberPassword: changed }))
        .status,
    ).toBe(200);
    await until(() => !!confirmation);
    expect(confirmation).not.toContain(token);
    expect(confirmation).not.toContain(changed);
    await until(
      async () =>
        (
          await connection
            .db!.collection(RECOVERY_CONFIRMATIONS)
            .findOne({ memberId: id })
        )?.state === 'SENT',
    );
  });
  it('restarts worker ownership against durable storage without duplicating completed delivery', async () => {
    await recovery.onApplicationShutdown();
    const resumedEmail = 'restart-recovery@example.test';
    await connection.db!.collection('members').insertOne({
      _id: new Types.ObjectId(),
      memberNick: 'restart_user',
      memberNickNormalized: 'restart_user',
      memberEmail: resumedEmail,
      memberPassword: await hashPassword(password),
      memberPhone: '+821099990098',
      memberType: 'USER',
      memberStatus: 'ACTIVE',
      authProvider: 'EMAIL',
      authVersion: 0,
      __v: 0,
    });
    expect(
      (
        await post('password-request', {
          memberEmail: resumedEmail,
          requestId: randomUUID(),
        })
      ).status,
    ).toBe(202);
    expect(
      await connection
        .db!.collection(RECOVERY_REQUESTS)
        .countDocuments({ email: resumedEmail, state: 'QUEUED' }),
    ).toBe(1);
    const restarted = new PasswordRecoveryService(
      app.get(EmailDeliveryService),
      connection.model<MemberEntity>('Member'),
    );
    await restarted.onModuleInit();
    try {
      await until(() => restarted.getMetrics().accepted === 1);
      expect(
        await connection
          .db!.collection(RECOVERY_REQUESTS)
          .countDocuments({ email: resumedEmail, state: 'ACCEPTED' }),
      ).toBe(1);
      expect(restarted.getMetrics().confirmationSent).toBe(0);
      expect(
        await connection
          .db!.collection(RECOVERY_CONFIRMATIONS)
          .countDocuments({ state: 'SENT' }),
      ).toBe(1);
    } finally {
      await restarted.onApplicationShutdown();
    }
  });
});
