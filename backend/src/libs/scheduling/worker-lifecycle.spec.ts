import { SchedulerRegistry } from '@nestjs/schedule';
import { NotificationService } from '../../components/notification/notification.service.js';
import { AppointmentWaitlistLifecycleService } from '../../components/appointment/appointment-waitlist-lifecycle.service.js';
import { AppointmentPromotionService } from '../../components/appointment/appointment-promotion.service.js';
import { BookingPolicyService } from '../../components/booking/booking-policy.service.js';
import { BookingCoordinationService } from '../../components/booking/booking-coordination.service.js';
import { WaitlistService } from '../../components/waitlist/waitlist.service.js';
import { AppointmentService } from '../../components/appointment/appointment.service.js';
import { WorkerScheduler } from './worker-scheduler.service.js';

const factories = [
  [
    'notification',
    (scheduler: WorkerScheduler, policy: BookingPolicyService) => {
      const worker = new NotificationService(scheduler, policy);
      jest.spyOn(worker, 'prepare').mockResolvedValue();
      return worker;
    },
  ],
  [
    'lifecycle',
    (scheduler: WorkerScheduler, policy: BookingPolicyService) =>
      new AppointmentWaitlistLifecycleService(
        scheduler,
        {} as BookingCoordinationService,
        policy,
        {} as WaitlistService,
        {
          prepareLifecycle: jest.fn().mockResolvedValue(undefined),
        } as unknown as AppointmentService,
      ),
  ],
  [
    'promotion',
    (scheduler: WorkerScheduler, policy: BookingPolicyService) =>
      new AppointmentPromotionService(
        scheduler,
        {} as BookingCoordinationService,
        policy,
        {} as WaitlistService,
        {} as AppointmentService,
      ),
  ],
] as const;

describe.each(factories)('%s worker lifecycle', (_name, makeWorker) => {
  let registry: SchedulerRegistry;
  let worker: ReturnType<typeof makeWorker>;
  beforeEach(() => {
    jest.useFakeTimers();
    registry = new SchedulerRegistry();
    worker = makeWorker(new WorkerScheduler(registry), {
      assertMigrated: jest.fn().mockResolvedValue(undefined),
    } as unknown as BookingPolicyService);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('does not register a timer or run when disabled', async () => {
    jest.spyOn(worker, 'isEnabled').mockReturnValue(false);
    const run = jest.spyOn(worker, 'runOnce').mockResolvedValue(false);
    await worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(registry.getTimeouts()).toEqual([]);
    expect(run).not.toHaveBeenCalled();
    await worker.onModuleDestroy();
  });

  it('does not overlap slow work and shutdown drains before returning', async () => {
    jest.spyOn(worker, 'isEnabled').mockReturnValue(true);
    let finish!: () => void;
    const blocked = new Promise<boolean>((resolve) => {
      finish = () => resolve(true);
    });
    const run = jest.spyOn(worker, 'runOnce').mockReturnValue(blocked);
    await worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(999);
    expect(run).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(10_001);
    expect(run).toHaveBeenCalledTimes(1);
    let closed = false;
    const closing = worker.onModuleDestroy().then(() => {
      closed = true;
    });
    await jest.advanceTimersByTimeAsync(5_000);
    expect(closed).toBe(false);
    finish();
    await closing;
    await jest.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(registry.getTimeouts()).toEqual([]);
  });
});
