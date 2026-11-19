import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import type { GoogleIdentity } from '../../libs/types/member.types.js';

@Injectable()
export class GoogleAuthService {
  private readonly client = new OAuth2Client();

  constructor(private readonly jwt: JwtService) {}

  async createNonce(): Promise<string> {
    this.clientId();
    return this.jwt.signAsync(
      {
        tokenType: 'google_nonce',
        nonce: randomBytes(32).toString('base64url'),
      },
      {
        algorithm: 'HS256',
        issuer: 'medconnect',
        audience: 'medconnect-api',
        expiresIn: 300,
      },
    );
  }

  async verify(idToken: string, nonce?: string): Promise<GoogleIdentity> {
    const audience = this.clientId();
    try {
      if (!nonce) throw new Error('Missing nonce');
      const challenge = await this.jwt.verifyAsync<Record<string, unknown>>(
        nonce,
        {
          algorithms: ['HS256'],
          issuer: 'medconnect',
          audience: 'medconnect-api',
        },
      );
      if (
        challenge.tokenType !== 'google_nonce' ||
        typeof challenge.nonce !== 'string'
      )
        throw new Error('Invalid nonce');
      const ticket = await this.client.verifyIdToken({ idToken, audience });
      const payload = ticket.getPayload();
      // The library verifies signature, audience, issuer, and expiry.
      if (
        typeof payload?.sub !== 'string' ||
        !payload.sub ||
        (payload as typeof payload & { nonce?: string }).nonce !== nonce
      )
        throw new Error('Invalid Google identity');
      return {
        sub: payload.sub,
        ...(payload.email && payload.email_verified === true
          ? { email: payload.email.trim().toLowerCase() }
          : {}),
        name: payload.name,
        picture: payload.picture,
      };
    } catch (error) {
      if (error && typeof error === 'object') {
        const failure = error as {
          code?: string;
          response?: { status?: number };
        };
        if (
          [
            'ENOTFOUND',
            'ETIMEDOUT',
            'ECONNRESET',
            'ECONNREFUSED',
            'EAI_AGAIN',
          ].includes(failure.code ?? '') ||
          (failure.response?.status ?? 0) >= 500
        ) {
          throw new ServiceUnavailableException(
            'Google sign-in is temporarily unavailable',
          );
        }
      }
      // Never expose provider payloads, credentials, or library error messages.
      throw new UnauthorizedException('Invalid Google sign-in');
    }
  }

  private clientId(): string {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId)
      throw new ServiceUnavailableException('Google sign-in is not configured');
    return clientId;
  }
}
