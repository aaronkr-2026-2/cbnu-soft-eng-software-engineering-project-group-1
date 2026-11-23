import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  configurationFor,
  environmentConfig,
  ApplicationConfig,
  type ApplicationEnvironment,
} from './application-config.service.js';
import { ApplicationConfigModule } from './application-config.module.js';
import { NotificationService } from '../../components/notification/notification.service.js';
import { BookingPolicyService } from '../../components/booking/booking-policy.service.js';
import { WorkerScheduler } from '../scheduling/worker-scheduler.service.js';
import { SchedulerRegistry } from '@nestjs/schedule';

const valid = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  MONGO_URI: 'mongodb://localhost/synthetic',
};

describe('Typed application configuration', () => {
  it('keeps defaults and disabled features independent of optional credentials', () => {
    const config = configurationFor({
      ...valid,
      GOOGLE_SMTP: 'invalid-private-value',
      GOOGLE_CLIENT_ID: '',
    });
    expect(() => config.validateStartup()).not.toThrow();
    expect(config.port).toBe(3000);
    expect(config.corsOrigins).toEqual([
      'http://localhost:3000',
      'http://localhost:5173',
    ]);
    expect(config.logFile).toBe('logs/medconnect.log');
    expect(config.uploadDirectory).toBe('uploads');
    expect([
      config.bookingEnabled,
      config.enrollmentEnabled,
      config.replacementEnabled,
      config.promotionEnabled,
      config.notificationsEnabled,
      config.lifecycleEnabled,
      config.recoveryEnabled,
    ]).toEqual(Array(7).fill(false));
  });

  it('supports database-free feature modules but requires database and signing key at bootstrap', () => {
    expect(() => configurationFor({}).onModuleInit()).not.toThrow();
    expect(() => configurationFor({}).validateStartup()).toThrow(
      'JWT_ACCESS_SECRET',
    );
    expect(() =>
      configurationFor({
        JWT_ACCESS_SECRET: valid.JWT_ACCESS_SECRET,
      }).validateStartup(),
    ).toThrow('Missing MongoDB');
  });

  it('preserves override precedence, whitespace and production URI selection', () => {
    const config = configurationFor({
      ...valid,
      NODE_ENV: 'production',
      MONGO_URI: ' mongodb+srv://override/synthetic ',
      MONGO_PROD: 'mongodb+srv://prod/synthetic',
      MONGO_DEV: 'mongodb://dev/synthetic',
      PORT_API: '1234',
      PORT: '5678',
    });
    expect(config.requireMongoUri()).toBe('mongodb+srv://override/synthetic');
    expect(config.port).toBe(1234);
    expect(config.production).toBe(true);
    expect(
      configurationFor({ MONGO_URI: '', MONGO_DEV: valid.MONGO_URI }).mongoUri,
    ).toBe('');
    expect(
      configurationFor({ NODE_ENV: 'production', MONGO_DEV: valid.MONGO_URI })
        .mongoUri,
    ).toBeUndefined();
    expect(configurationFor({ PORT: '5678' }).port).toBe(5678);
    expect(configurationFor({ PORT_API: '0' }).port).toBe(0);
  });

  it.each(['', 'invalid-private-value', '-1', '65536', '1.5', 'Infinity'])(
    'rejects invalid selected port without reflecting its value (%s)',
    (value) => {
      expect(
        () => configurationFor({ PORT_API: value, PORT: '3000' }).port,
      ).toThrow('PORT_API (or PORT) must be an integer');
      try {
        void configurationFor({ PORT_API: value }).port;
      } catch (error) {
        if (value === 'invalid-private-value')
          expect(String(error)).not.toContain(value);
      }
    },
  );

  it.each([
    'BOOKING_POLICY_V2_ENABLED',
    'WAITLIST_ENROLLMENT_ENABLED',
    'WAITLIST_PROMOTION_ENABLED',
    'WAITLIST_NOTIFICATIONS_ENABLED',
    'WAITLIST_LIFECYCLE_ENABLED',
    'COMMITMENT_REPLACEMENT_ENABLED',
    'PASSWORD_RECOVERY_ENABLED',
  ] as const)('rejects malformed %s without including its value', (key) => {
    const config = configurationFor({
      ...valid,
      [key]: 'private-invalid-value',
    });
    expect(() => config.validateStartup()).toThrow('true or false');
    try {
      config.validateStartup();
    } catch (error) {
      expect(String(error)).not.toContain('private-invalid-value');
    }
  });

  it('preserves strict booking flags, recovery trimming and rollout dependencies', () => {
    expect(
      configurationFor({ PASSWORD_RECOVERY_ENABLED: ' true ' }).recoveryEnabled,
    ).toBe(true);
    expect(
      configurationFor({ PASSWORD_RECOVERY_ENABLED: ' ' }).recoveryEnabled,
    ).toBe(false);
    expect(
      () =>
        configurationFor({ BOOKING_POLICY_V2_ENABLED: ' true ' })
          .bookingEnabled,
    ).toThrow('true or false');
    expect(() =>
      configurationFor({
        WAITLIST_ENROLLMENT_ENABLED: 'true',
      }).validateWorkerFlags(),
    ).toThrow('requires booking');
    const enabled: ApplicationEnvironment = {
      BOOKING_POLICY_V2_ENABLED: 'true',
      WAITLIST_ENROLLMENT_ENABLED: 'true',
      COMMITMENT_REPLACEMENT_ENABLED: 'true',
      WAITLIST_PROMOTION_ENABLED: 'true',
      WAITLIST_NOTIFICATIONS_ENABLED: 'true',
      WAITLIST_LIFECYCLE_ENABLED: 'true',
    };
    expect(() => configurationFor(enabled).validateWorkerFlags()).not.toThrow();
    expect(configurationFor(enabled).promotionEnabled).toBe(true);
    expect(() =>
      configurationFor({
        ...enabled,
        WAITLIST_NOTIFICATIONS_ENABLED: 'false',
      }).validateWorkerFlags(),
    ).toThrow('requires booking');
  });

  it('validates enabled recovery prerequisites and retains lazy SMTP validation otherwise', () => {
    const config = {
      ...valid,
      PASSWORD_RECOVERY_ENABLED: 'true',
      PASSWORD_RESET_WEB_ORIGIN: 'https://example.test',
      GOOGLE_SMTP_USER: 'sender@example.test',
      GOOGLE_SMTP: 'abcd efgh ijkl mnop',
    };
    expect(() => configurationFor(config).validateStartup()).not.toThrow();
    expect(configurationFor(config).smtpCredentials()).toEqual({
      user: 'sender@example.test',
      pass: 'abcdefghijklmnop',
    });
    expect(() =>
      configurationFor({
        ...config,
        PASSWORD_RESET_WEB_ORIGIN: 'https://private-value.test/path',
      }).validateStartup(),
    ).toThrow('origin is unavailable');
    expect(() =>
      configurationFor({
        ...config,
        GOOGLE_SMTP: 'private-value',
      }).validateStartup(),
    ).toThrow('configure Gmail');
  });

  it.each([
    { ...valid, JWT_ACCESS_SECRET: 'private-short-secret' },
    { ...valid, MONGO_URI: 'private-invalid-uri' },
    { ...valid, NODE_ENV: 'production' },
  ])(
    'uses static validation errors for secret-bearing configuration',
    (env) => {
      expect(() => configurationFor(env).validateStartup()).toThrow();
      try {
        configurationFor(env).validateStartup();
      } catch (error) {
        expect(String(error)).not.toContain(env.JWT_ACCESS_SECRET);
        expect(String(error)).not.toContain(env.MONGO_URI);
      }
    },
  );

  it('reads through Nest ConfigService and allows isolated injection without process fallback', async () => {
    const values: ApplicationEnvironment = {
      PORT_API: '4321',
      WAITLIST_NOTIFICATIONS_ENABLED: 'false',
    };
    const isolated = {
      get: jest.fn((key: keyof ApplicationEnvironment) => values[key]),
    };
    const module = await Test.createTestingModule({
      imports: [ApplicationConfigModule],
    })
      .overrideProvider(ConfigService)
      .useValue(isolated)
      .compile();
    try {
      await module.init();
      const config = module.get(ApplicationConfig);
      expect(config.port).toBe(4321);
      expect(config.jwtSecret).toBeUndefined();
      expect(isolated.get).toHaveBeenCalledWith('PORT_API');
      const worker = new NotificationService(
        new WorkerScheduler(new SchedulerRegistry()),
        {} as BookingPolicyService,
        undefined,
        undefined,
        undefined,
        config,
      );
      expect(worker.isEnabled()).toBe(false);
    } finally {
      await module.close();
    }
  });

  it('keeps live environment reads uncached while explicit environments stay isolated', () => {
    const previous = process.env.PORT_API;
    try {
      process.env.PORT_API = '4321';
      expect(environmentConfig.port).toBe(4321);
      expect(configurationFor({}).port).toBe(3000);
      process.env.PORT_API = '5432';
      expect(environmentConfig.port).toBe(5432);
    } finally {
      if (previous === undefined) delete process.env.PORT_API;
      else process.env.PORT_API = previous;
    }
  });
});
