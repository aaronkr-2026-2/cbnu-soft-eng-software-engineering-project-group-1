import { Test } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { WorkerSchedulingModule } from './worker-scheduling.module.js';
import { WorkerScheduler } from './worker-scheduler.service.js';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('Completion-driven worker scheduling', () => {
  let registry: SchedulerRegistry;
  let scheduler: WorkerScheduler;
  beforeEach(() => {
    jest.useFakeTimers();
    registry = new SchedulerRegistry();
    scheduler = new WorkerScheduler(registry);
  });
  afterEach(() => {
    for (const name of registry.getTimeouts()) registry.deleteTimeout(name);
    jest.useRealTimers();
  });

  it('waits a full second after a slow run and drains active work on stop', async () => {
    const blocked = deferred();
    const work = jest.fn(() => blocked.promise);
    const loop = scheduler.start('slow', work, jest.fn());
    expect(registry.getTimeout('slow').hasRef()).toBe(false);
    await jest.advanceTimersByTimeAsync(999);
    expect(work).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(work).toHaveBeenCalledTimes(1);
    expect(registry.getTimeouts()).toEqual([]);
    blocked.resolve();
    await jest.advanceTimersByTimeAsync(999);
    expect(work).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(work).toHaveBeenCalledTimes(2);
    await loop.stop();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(work).toHaveBeenCalledTimes(2);
    expect(registry.getTimeouts()).toEqual([]);
  });

  it('stop remains pending until active work finishes and never rearms', async () => {
    const blocked = deferred();
    const work = jest.fn(() => blocked.promise);
    const loop = scheduler.start('drain', work, jest.fn(), 0);
    await jest.advanceTimersByTimeAsync(0);
    let drained = false;
    const stopping = loop.stop().then(() => {
      drained = true;
    });
    await jest.advanceTimersByTimeAsync(5_000);
    expect(drained).toBe(false);
    blocked.resolve();
    await stopping;
    await loop.stop();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(work).toHaveBeenCalledTimes(1);
    expect(registry.getTimeouts()).toEqual([]);
  });

  it.each([false, true])(
    'reschedules after a failure (synchronous: %s)',
    async (sync) => {
      const error = jest.fn();
      const work = jest.fn(() => {
        if (sync) throw new Error('test failure');
        return Promise.reject(new Error('test failure'));
      });
      const loop = scheduler.start('retry', work, error);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(error).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(999);
      expect(work).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(work).toHaveBeenCalledTimes(2);
      await loop.stop();
    },
  );

  it('cancels a pending initial tick', async () => {
    const work = jest.fn();
    const loop = scheduler.start('disabled', work, jest.fn(), 0);
    await loop.stop();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(work).not.toHaveBeenCalled();
    expect(registry.getTimeouts()).toEqual([]);
  });

  it('uses the real Nest scheduler registry and clears scheduled work on app close', async () => {
    const work = jest.fn();
    const module = await Test.createTestingModule({
      imports: [WorkerSchedulingModule],
      providers: [
        {
          provide: 'test-worker',
          inject: [WorkerScheduler],
          useFactory: (service: WorkerScheduler) => {
            let loop: ReturnType<WorkerScheduler['start']>;
            return {
              onModuleInit: () => {
                loop = service.start('nest', work, jest.fn());
              },
              onModuleDestroy: () => loop.stop(),
            };
          },
        },
      ],
    }).compile();
    await module.init();
    expect(module.get(SchedulerRegistry).getTimeouts()).toEqual(['nest']);
    await module.close();
    expect(module.get(SchedulerRegistry).getTimeouts()).toEqual([]);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(work).not.toHaveBeenCalled();
  });
});
