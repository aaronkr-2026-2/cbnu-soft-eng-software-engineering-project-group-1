import { BadRequestException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import {
  EmailDeliveryException,
  EmailDeliveryService,
} from './email-delivery.service.js';

describe('EmailDeliveryService', () => {
  const originalUser = process.env.GOOGLE_SMTP_USER;
  const originalPassword = process.env.GOOGLE_SMTP;
  const service = new EmailDeliveryService();
  const sendMail = jest.fn();
  const close = jest.fn();
  let createTransport: jest.SpyInstance;

  beforeEach(() => {
    process.env.GOOGLE_SMTP_USER = 'project@example.com';
    process.env.GOOGLE_SMTP = 'abcd efgh ijkl mnop';
    sendMail.mockReset().mockResolvedValue({
      accepted: ['patient@example.com'],
      rejected: [],
    });
    close.mockReset();
    createTransport = jest
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({
        sendMail,
        close,
      } as unknown as ReturnType<typeof nodemailer.createTransport>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    if (originalUser === undefined) delete process.env.GOOGLE_SMTP_USER;
    else process.env.GOOGLE_SMTP_USER = originalUser;
    if (originalPassword === undefined) delete process.env.GOOGLE_SMTP;
    else process.env.GOOGLE_SMTP = originalPassword;
  });

  it('uses Gmail TLS, the authenticated sender and exactly one normalized recipient', async () => {
    await service.sendVerificationCode(' PATIENT@EXAMPLE.COM ', '001234');
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: 'project@example.com', pass: 'abcdefghijklmnop' },
        tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
        logger: false,
        debug: false,
      }),
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: 'MedConnect', address: 'project@example.com' },
        envelope: { from: 'project@example.com', to: ['patient@example.com'] },
        text: expect.stringContaining('001234'),
        subject: 'Verify your email for MedConnect',
        html: expect.stringContaining('001234'),
        attachments: [
          expect.objectContaining({
            content: expect.any(Buffer),
            contentDisposition: 'inline',
            cid: 'medconnect-logo',
          }),
        ],
        signal: expect.any(AbortSignal),
      }),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['GOOGLE_SMTP_USER', undefined],
    ['GOOGLE_SMTP_USER', 'invalid sender'],
    ['GOOGLE_SMTP', undefined],
    ['GOOGLE_SMTP', 'too-short'],
  ])('fails closed for invalid configuration in %s', async (key, value) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    await expect(
      service.sendVerificationCode('patient@example.com', '001234'),
    ).rejects.toMatchObject({ deliveryOutcome: 'NOT_SENT' });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it.each([
    ['patient@example.com,other@example.com', '001234'],
    ['Patient <patient@example.com>', '001234'],
    ['patient@example.com', '12345'],
    ['patient@example.com', '１２３４５６'],
    ['patient@example.com', '123456\r\nBcc: another@example.com'],
  ])(
    'rejects invalid mail input before transport creation',
    async (email, code) => {
      await expect(
        service.sendVerificationCode(email, code),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createTransport).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ code: 'EAUTH' }, 'NOT_SENT'],
    [{ code: 'EDNS' }, 'NOT_SENT'],
    [{ responseCode: 550 }, 'REJECTED'],
    [{ responseCode: 421 }, 'REJECTED'],
    [{ code: 'ECONNECTION' }, 'UNKNOWN'],
    [{ code: 'ETIMEDOUT' }, 'UNKNOWN'],
    [null, 'UNKNOWN'],
  ])(
    'classifies provider failures and excludes their private payloads',
    async (failure, outcome) => {
      sendMail.mockRejectedValue(
        failure && {
          ...failure,
          message:
            'private-provider-response patient@example.com 001234 secret',
        },
      );
      let caught: unknown;
      try {
        await service.sendVerificationCode('patient@example.com', '001234');
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(EmailDeliveryException);
      expect(caught).toMatchObject({ deliveryOutcome: outcome });
      const error = caught as EmailDeliveryException;
      expect(error.getStatus()).toBe(503);
      expect(error.getResponse()).toEqual({
        statusCode: 503,
        reason: 'EMAIL_VERIFICATION_UNAVAILABLE',
        message: 'Verification email is temporarily unavailable',
      });
      expect(error.stack).not.toContain('private-provider-response');
      expect(close).toHaveBeenCalledTimes(1);
    },
  );

  it('treats a rejected recipient as failure even when sendMail resolves', async () => {
    sendMail.mockResolvedValue({
      accepted: [],
      rejected: ['patient@example.com'],
    });
    await expect(
      service.sendVerificationCode('patient@example.com', '001234'),
    ).rejects.toMatchObject({ deliveryOutcome: 'REJECTED' });
  });

  it('aborts an active send after ten seconds and does not automatically retry', async () => {
    jest.useFakeTimers();
    sendMail.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    const sending = service.sendVerificationCode(
      'patient@example.com',
      '001234',
    );
    const rejected = expect(sending).rejects.toMatchObject({
      deliveryOutcome: 'UNKNOWN',
    });
    await jest.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
