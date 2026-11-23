import {
  ApplicationConfig,
  environmentConfig,
} from '../../libs/config/application-config.service.js';
import {
  BadRequestException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isEmail } from 'class-validator';
import nodemailer from 'nodemailer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EmailDeliveryOutcome } from '../../libs/types/email-delivery.types.js';
import { verificationEmail } from './verification-email.js';
import {
  passwordRecoveryEmail,
  passwordChangedEmail,
} from './recovery-email.js';
import { recoveryLink } from './password-recovery-policy.js';

export class EmailDeliveryException extends ServiceUnavailableException {
  constructor(readonly deliveryOutcome: EmailDeliveryOutcome) {
    super({
      statusCode: 503,
      reason: 'EMAIL_VERIFICATION_UNAVAILABLE',
      message: 'Verification email is temporarily unavailable',
    });
  }
}

@Injectable()
export class EmailDeliveryService {
  constructor(
    @Optional() private readonly config: ApplicationConfig = environmentConfig,
  ) {}
  async sendVerificationCode(email: string, code: string): Promise<void> {
    const recipient = email.trim().toLowerCase();
    if (recipient.length > 254 || !isEmail(recipient) || !/^\d{6}$/.test(code))
      throw new BadRequestException('Invalid verification email data');

    return this.send(recipient, verificationEmail(code));
  }

  async sendRecoveryLink(email: string, token: string): Promise<void> {
    return this.send(
      email,
      passwordRecoveryEmail(recoveryLink(token, this.config.recoveryEnvironment)),
    );
  }

  async sendPasswordChanged(email: string): Promise<void> {
    return this.send(
      email,
      passwordChangedEmail(`${this.config.recoveryOrigin}/auth`),
    );
  }

  assertConfigured(): void {
    this.configuration();
  }

  private configuration() {
    try {
      return this.config.smtpCredentials();
    } catch {
      throw new EmailDeliveryException('NOT_SENT');
    }
  }

  private async send(
    email: string,
    template: ReturnType<typeof verificationEmail>,
  ) {
    const recipient = email.trim().toLowerCase();
    if (recipient.length > 254 || !isEmail(recipient))
      throw new BadRequestException('Invalid email data');
    const { user, pass } = this.configuration();

    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 10_000);
    try {
      const transport = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user, pass },
        dnsTimeout: 3_000,
        connectionTimeout: 5_000,
        greetingTimeout: 5_000,
        socketTimeout: 5_000,
        tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
        logger: false,
        debug: false,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      try {
        const result = await transport.sendMail({
          from: { name: 'MedConnect', address: user },
          to: { name: '', address: recipient },
          envelope: { from: user, to: [recipient] },
          ...template,
          attachments: [
            {
              filename: 'medconnect-logo.png',
              content: readFileSync(join(__dirname, 'assets', 'logo.png')),
              contentType: 'image/png',
              contentDisposition: 'inline',
              cid: 'medconnect-logo',
            },
          ],
          signal: controller.signal,
        });
        if (!result.accepted.includes(recipient)) {
          throw new EmailDeliveryException(
            result.rejected.includes(recipient) ? 'REJECTED' : 'UNKNOWN',
          );
        }
      } finally {
        transport.close();
      }
    } catch (error) {
      if (error instanceof EmailDeliveryException) throw error;
      // Keep upstream payloads out of exceptions and application logs. Step 3
      // uses only this server-side outcome to finalize a reserved send allowance.
      const failure = error as { code?: string; responseCode?: number } | null;
      if (
        ['EAUTH', 'EDNS', 'ENOTFOUND', 'ETLS', 'ENOENT', 'EACCES'].includes(
          failure?.code ?? '',
        )
      )
        throw new EmailDeliveryException('NOT_SENT');
      if (
        typeof failure?.responseCode === 'number' &&
        failure.responseCode >= 400
      )
        throw new EmailDeliveryException('REJECTED');
      throw new EmailDeliveryException('UNKNOWN');
    } finally {
      clearTimeout(deadline);
    }
  }
}
