// Fault-injection harness: only the owned disposable integration runner may use it.
// The process is killed after a real durable claim, before its transaction starts.
if (
  process.env.BOOKING_TEST_DISPOSABLE !== '1' ||
  !process.env.MONGO_URI?.startsWith('mongodb://127.0.0.1:')
) {
  throw new Error('Disposable loopback database required');
}
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
async function main() {
  for (const key of [
    'WAITLIST_PROMOTION_ENABLED',
    'WAITLIST_NOTIFICATIONS_ENABLED',
    'WAITLIST_LIFECYCLE_ENABLED',
    'WAITLIST_ENROLLMENT_ENABLED',
    'COMMITMENT_REPLACEMENT_ENABLED',
  ])
    process.env[key] = 'false';
  const { AppModule } = require('../dist/app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const promotion = process.argv[2] === 'promotion';
  const Service = promotion
    ? require('../dist/components/appointment/appointment-promotion.service.js')
        .AppointmentPromotionService
    : require('../dist/components/notification/notification.service.js')
        .NotificationService;
  const worker = app.get(Service);
  Object.assign(process.env, {
    BOOKING_POLICY_V2_ENABLED: 'true',
    WAITLIST_ENROLLMENT_ENABLED: 'true',
    WAITLIST_PROMOTION_ENABLED: 'true',
    WAITLIST_NOTIFICATIONS_ENABLED: 'true',
    WAITLIST_LIFECYCLE_ENABLED: 'true',
  });
  if (process.argv[3] === 'paused')
    process.env.WAITLIST_PROMOTION_ENABLED = 'false';
  if (process.argv[3] === 'claim') {
    const model = promotion ? worker.events : worker.outbox;
    const original = model.findOneAndUpdate.bind(model);
    model.findOneAndUpdate = (...args) => {
      const query = original(...args);
      const execute = query.exec.bind(query);
      query.exec = async (...execArgs) => {
        const row = await execute(...execArgs);
        if (row && args[1]?.$set?.state === 'PROCESSING') {
          process.send({ phase: 'claimed' });
          await new Promise(() => {});
        }
        return row;
      };
      return query;
    };
  }
  const worked = await worker.runOnce();
  await app.close();
  process.send({ phase: 'done', worked }, () => process.disconnect());
}
main().catch(() => {
  process.send?.({ phase: 'error' });
  process.exit(1);
});
