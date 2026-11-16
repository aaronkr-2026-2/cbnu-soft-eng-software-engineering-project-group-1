import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import {
  countSend,
  resetInactive,
  RECOVERY_LIFETIME,
  DAY,
  HOUR,
  MINUTE,
  newRecoveryToken,
  recoveryTokenHash,
  recoveryLink,
  recoveryWebOrigin,
  recoveryTokenIsCurrent,
} from './password-recovery-policy.js';
import type { RecoverySendLimit } from '../../libs/types/password-recovery.types.js';
import {
  RecoveryRequestDto,
  RecoveryResetDto,
  RecoveryValidationPipe,
} from '../../libs/dto/member/password-recovery.dto.js';

const origin = {
  PASSWORD_RESET_WEB_ORIGIN: 'https://medconnect.example',
  NODE_ENV: 'production',
};
const now = new Date('2035-01-01T00:00:00Z');
const limit = (): RecoverySendLimit => ({
  _id: 'patient@example.test',
  version: 0,
  initialSent: false,
  groupCount: 0,
  blockLevel: 0,
  blockedUntil: new Date(0),
  nextSendAt: new Date(0),
  lastSendAttemptAt: now,
});

describe('Recovery policy and shared email send rules', () => {
  it('uses a ten-minute deadline and rejects expiry equality, consumption and changed credentials', () => {
    expect(RECOVERY_LIFETIME).toBe(10 * MINUTE);
    const row = {
      expiresAt: new Date(+now + RECOVERY_LIFETIME),
      authVersion: 0,
    };
    expect(recoveryTokenIsCurrent(row, 0, new Date(+row.expiresAt - 1))).toBe(
      true,
    );
    expect(recoveryTokenIsCurrent(row, 0, row.expiresAt)).toBe(false);
    expect(recoveryTokenIsCurrent({ ...row, consumedAt: now }, 0, now)).toBe(
      false,
    );
    expect(recoveryTokenIsCurrent(row, 1, now)).toBe(false);
  });

  it('recognizes the same link by digest without identifying its visitor or changing token state', () => {
    const first = newRecoveryToken();
    const second = newRecoveryToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
    expect(recoveryTokenHash(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(recoveryTokenHash(first)).toBe(recoveryTokenHash(first));
    expect(recoveryTokenHash(first)).not.toBe(recoveryTokenHash(second));
    const row = {
      expiresAt: new Date(+now + RECOVERY_LIFETIME),
      authVersion: 0,
    };
    expect(recoveryTokenIsCurrent(row, 0, now)).toBe(true);
    expect(recoveryTokenIsCurrent(row, 0, now)).toBe(true);
    expect(row).not.toHaveProperty('consumedAt');
  });

  it('keeps the initial send outside groups of three and escalates 1/3/5/24 hours', () => {
    const row = limit();
    countSend(row, now);
    expect(row).toMatchObject({
      initialSent: true,
      groupCount: 0,
      blockLevel: 0,
    });
    let sentAt = new Date(now);
    for (const block of [HOUR, 3 * HOUR, 5 * HOUR, DAY, DAY]) {
      for (let i = 0; i < 3; i++) {
        sentAt = new Date(+sentAt + MINUTE);
        countSend(row, sentAt);
      }
      expect(+row.blockedUntil).toBe(+sentAt + block);
      sentAt = row.blockedUntil;
    }
    expect(row.blockLevel).toBe(3);
  });

  it('resets only at the full inactivity boundary with no active block or reservation', () => {
    const row = { ...limit(), initialSent: true, groupCount: 2, blockLevel: 3 };
    resetInactive(row, new Date(+now + DAY - 1));
    expect(row.blockLevel).toBe(3);
    row.pending = {
      id: newRecoveryToken(),
      until: new Date(+now + DAY + MINUTE),
    };
    resetInactive(row, new Date(+now + DAY));
    expect(row.blockLevel).toBe(3);
    delete row.pending;
    row.blockedUntil = new Date(+now + DAY + 1);
    resetInactive(row, new Date(+now + DAY));
    expect(row.blockLevel).toBe(3);
    row.blockedUntil = new Date(+now + DAY);
    resetInactive(row, new Date(+now + DAY));
    expect(row).toMatchObject({
      initialSent: false,
      groupCount: 0,
      blockLevel: 0,
    });
  });

  it('blocked attempts retain escalation without extending the fixed deadline', () => {
    const deadline = new Date(+now + DAY);
    const row = {
      ...limit(),
      initialSent: true,
      blockLevel: 3,
      blockedUntil: deadline,
    };
    const attempt = new Date(+now + 23 * HOUR);
    resetInactive(row, attempt);
    row.lastSendAttemptAt = attempt;
    resetInactive(row, deadline);
    expect(row.blockLevel).toBe(3);
    expect(row.blockedUntil).toEqual(deadline);
  });

  it('keeps recovery and signup state separate while using the same policy', () => {
    const signup = limit();
    const recovery = limit();
    countSend(recovery, now);
    expect(signup.initialSent).toBe(false);
    expect(recovery.initialSent).toBe(true);
  });
});

describe('Trusted reset URL', () => {
  it('uses a fixed page and fragment without email, redirect or URL query', () => {
    const token = newRecoveryToken();
    const url = new URL(recoveryLink(token, origin));
    expect(url.origin).toBe(origin.PASSWORD_RESET_WEB_ORIGIN);
    expect(url.pathname).toBe('/reset-password');
    expect(url.search).toBe('');
    expect(url.hash).toBe('#token=' + token);
  });
  it.each([
    undefined,
    '',
    'http://medconnect.example',
    'javascript:alert(1)',
    'https://user:pass@medconnect.example',
    'https://medconnect.example/other',
    'https://medconnect.example?redirect=https://evil.example',
    'https://medconnect.example#fragment',
    'https://medconnect.example\\@evil.example',
  ])('fails closed for missing or untrusted origin %s', (value) => {
    expect(() =>
      recoveryWebOrigin({ ...origin, PASSWORD_RESET_WEB_ORIGIN: value }),
    ).toThrow('origin is unavailable');
  });
  it('allows HTTP only for loopback in explicit development', () => {
    expect(
      recoveryWebOrigin({
        NODE_ENV: 'development',
        PASSWORD_RESET_WEB_ORIGIN: 'http://127.0.0.1:3000',
      }),
    ).toBe('http://127.0.0.1:3000');
    expect(() =>
      recoveryWebOrigin({
        NODE_ENV: 'test',
        PASSWORD_RESET_WEB_ORIGIN: 'http://localhost:3000',
      }),
    ).toThrow();
    expect(() =>
      recoveryWebOrigin({
        NODE_ENV: 'development',
        PASSWORD_RESET_WEB_ORIGIN: 'http://example.com',
      }),
    ).toThrow();
    expect(() => recoveryLink('bad\r\nlink', origin)).toThrow(
      'Invalid recovery token',
    );
  });
});

describe('Recovery DTOs', () => {
  const metadata = { type: 'body' as const };
  it('normalizes email but preserves password whitespace', async () => {
    const input = (await new RecoveryValidationPipe(
      RecoveryRequestDto,
    ).transform(
      {
        memberEmail: ' Patient@Example.test ',
        requestId: randomUUID(),
      },
      metadata,
    )) as RecoveryRequestDto;
    expect(input.memberEmail).toBe('patient@example.test');
    const password = '  new password  ';
    const reset = (await new RecoveryValidationPipe(RecoveryResetDto).transform(
      {
        token: newRecoveryToken(),
        newPassword: password,
        confirmPassword: password,
      },
      metadata,
    )) as RecoveryResetDto;
    expect(reset.newPassword).toBe(password);
  });
  it.each([
    { memberEmail: 'invalid', requestId: randomUUID() },
    { memberEmail: 'patient@example.test', requestId: 'not-a-uuid' },
    {
      memberEmail: 'patient@example.test',
      requestId: randomUUID(),
      redirect: 'https://evil.example',
    },
  ])('rejects invalid request or injected fields', async (body) => {
    await expect(
      new RecoveryValidationPipe(RecoveryRequestDto).transform(body, metadata),
    ).rejects.toMatchObject({ response: { reason: 'INVALID_REQUEST' } });
  });
  it.each([
    { token: 'invalid', newPassword: 'password', confirmPassword: 'password' },
    {
      token: newRecoveryToken(),
      newPassword: 'short',
      confirmPassword: 'short',
    },
    {
      token: newRecoveryToken(),
      newPassword: 'x'.repeat(101),
      confirmPassword: 'x'.repeat(101),
    },
    {
      token: newRecoveryToken(),
      newPassword: 'password',
      confirmPassword: 'different',
    },
    {
      token: newRecoveryToken(),
      newPassword: 'password',
      confirmPassword: 'password',
      memberId: 'injected',
    },
  ])(
    'rejects unsafe reset input without reflecting its secrets',
    async (body) => {
      try {
        await new RecoveryValidationPipe(RecoveryResetDto).transform(
          body,
          metadata,
        );
        throw new Error('Expected validation rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getResponse()).toEqual({
          statusCode: 400,
          reason: 'INVALID_REQUEST',
          message: 'Invalid request data',
        });
      }
    },
  );
});
