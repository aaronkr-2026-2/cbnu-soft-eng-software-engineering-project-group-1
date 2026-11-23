import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import * as booking from './booking-configuration.js';
import { recoveryWebOrigin } from './recovery-configuration.js';

const environmentKeys = [
  'NODE_ENV',
  'MONGO_URI',
  'MONGO_DEV',
  'MONGO_PROD',
  'JWT_ACCESS_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_SMTP_USER',
  'GOOGLE_SMTP',
  'PASSWORD_RECOVERY_ENABLED',
  'PASSWORD_RESET_WEB_ORIGIN',
  'BOOKING_POLICY_V2_ENABLED',
  'WAITLIST_ENROLLMENT_ENABLED',
  'COMMITMENT_REPLACEMENT_ENABLED',
  'WAITLIST_PROMOTION_ENABLED',
  'WAITLIST_NOTIFICATIONS_ENABLED',
  'WAITLIST_LIFECYCLE_ENABLED',
  'PORT_API',
  'PORT',
  'CORS_ORIGINS',
  'UPLOAD_DIR',
  'LOG_FILE',
] as const;
export type ApplicationEnvironment = Partial<
  Record<(typeof environmentKeys)[number], string>
>;
interface ConfigurationSource {
  get(key: keyof ApplicationEnvironment): string | undefined;
}

/** Typed, uncached reads preserve existing runtime gates and lazy credentials. */
@Injectable()
export class ApplicationConfig implements OnModuleInit {
  constructor(
    @Inject(ConfigService)
    private readonly source: ConfigurationSource = new ConfigService<ApplicationEnvironment>(),
  ) {}

  private environment(): ApplicationEnvironment {
    return Object.fromEntries(
      environmentKeys.map((key) => [key, this.source.get(key)]),
    );
  }
  get production(): boolean {
    return this.source.get('NODE_ENV') === 'production';
  }
  get mongoUri(): string | undefined {
    return (
      this.source.get('MONGO_URI') ??
      this.source.get(this.production ? 'MONGO_PROD' : 'MONGO_DEV')
    )?.trim();
  }
  requireMongoUri(): string {
    const uri = this.mongoUri;
    if (!uri)
      throw new Error(
        'Missing MongoDB configuration. Set MONGO_URI (or MONGO_DEV/MONGO_PROD).',
      );
    if (!/^mongodb(?:\+srv)?:\/\//.test(uri))
      throw new Error('Invalid MongoDB configuration');
    if (this.production && !uri.startsWith('mongodb+srv://'))
      throw new Error(
        'Production MongoDB must use a TLS-enabled mongodb+srv:// connection string.',
      );
    return uri;
  }
  get jwtSecret(): string | undefined {
    return this.source.get('JWT_ACCESS_SECRET');
  }
  requireJwtSecret(): string {
    const secret = this.jwtSecret;
    if (!secret || Buffer.byteLength(secret) < 32)
      throw new Error('JWT_ACCESS_SECRET must contain at least 32 bytes');
    return secret;
  }
  get googleClientId(): string | undefined {
    return this.source.get('GOOGLE_CLIENT_ID')?.trim();
  }
  smtpCredentials(): { user: string; pass: string } {
    const user = this.source.get('GOOGLE_SMTP_USER')?.trim();
    const pass = this.source.get('GOOGLE_SMTP')?.replace(/\s/g, '');
    if (
      !user ||
      !isEmail(user) ||
      user.length > 254 ||
      !/^[a-zA-Z0-9]{16}$/.test(pass ?? '')
    )
      throw new Error(
        'GOOGLE_SMTP_USER and GOOGLE_SMTP must configure Gmail delivery',
      );
    return { user, pass: pass! };
  }
  get recoveryEnabled(): boolean {
    const value = this.source.get('PASSWORD_RECOVERY_ENABLED')?.trim();
    if (!value || value === 'false') return false;
    if (value !== 'true')
      throw new Error('PASSWORD_RECOVERY_ENABLED must be true or false');
    return true;
  }
  get recoveryEnvironment(): Pick<
    ApplicationEnvironment,
    'PASSWORD_RESET_WEB_ORIGIN' | 'NODE_ENV'
  > {
    return {
      PASSWORD_RESET_WEB_ORIGIN: this.source.get('PASSWORD_RESET_WEB_ORIGIN'),
      NODE_ENV: this.source.get('NODE_ENV'),
    };
  }
  get recoveryOrigin(): string {
    return recoveryWebOrigin(this.recoveryEnvironment);
  }
  get bookingEnabled(): boolean {
    return booking.bookingPolicyEnabled(this.environment());
  }
  get enrollmentEnabled(): boolean {
    return booking.waitlistEnrollmentEnabled(this.environment());
  }
  get replacementEnabled(): boolean {
    return booking.commitmentReplacementEnabled(this.environment());
  }
  get promotionEnabled(): boolean {
    return booking.waitlistPromotionEnabled(this.environment());
  }
  get notificationsEnabled(): boolean {
    return booking.waitlistNotificationsEnabled(this.environment());
  }
  get lifecycleEnabled(): boolean {
    return booking.waitlistLifecycleEnabled(this.environment());
  }
  validateBookingFlags(): void {
    void this.bookingEnabled;
    booking.validateWaitlistFlags(this.environment());
  }
  validateWorkerFlags(): void {
    this.validateBookingFlags();
    void this.recoveryEnabled;
  }
  get port(): number {
    const raw =
      this.source.get('PORT_API') ?? this.source.get('PORT') ?? '3000';
    const port = Number(raw);
    if (!raw.trim() || !Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error(
        'PORT_API (or PORT) must be an integer between 0 and 65535',
      );
    return port;
  }
  get corsOrigins(): string[] {
    return (
      this.source.get('CORS_ORIGINS') ??
      'http://localhost:3000,http://localhost:5173'
    )
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
  get uploadDirectory(): string {
    return this.source.get('UPLOAD_DIR') ?? 'uploads';
  }
  get logFile(): string {
    return this.source.get('LOG_FILE') ?? 'logs/medconnect.log';
  }

  // Feature modules can run without a DB in tests; normal bootstrap cannot.
  onModuleInit(): void {
    void this.port;
    this.validateWorkerFlags();
    if (this.mongoUri) {
      this.requireMongoUri();
      this.requireJwtSecret();
    }
  }
  validateStartup(): void {
    this.requireJwtSecret();
    this.requireMongoUri();
    this.onModuleInit();
    if (this.recoveryEnabled) {
      void this.recoveryOrigin;
      this.smtpCredentials();
    }
  }
}

// For import-time model registration, read-only CLIs and independently owned instances.
// No .env files are read here; main loads them before importing AppModule.
export const environmentConfig = new ApplicationConfig();
export function configurationFor(
  env?: ApplicationEnvironment,
): ApplicationConfig {
  return env === undefined
    ? environmentConfig
    : new ApplicationConfig({ get: (key) => env[key] });
}
