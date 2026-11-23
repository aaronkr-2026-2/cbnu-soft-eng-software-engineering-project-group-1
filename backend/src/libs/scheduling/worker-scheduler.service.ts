import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';

export interface WorkerLoop {
  stop(): Promise<void>;
}

/** Completion-driven polling: a slow run never overlaps its next scheduled run. */
@Injectable()
export class WorkerScheduler {
  constructor(private readonly registry: SchedulerRegistry) {}

  start(
    name: string,
    work: () => Promise<unknown>,
    onError: () => void,
    initialDelay = 1_000,
  ): WorkerLoop {
    let stopped = false;
    let running: Promise<void> | undefined;
    const removeTimeout = () => {
      if (this.registry.doesExist('timeout', name))
        this.registry.deleteTimeout(name);
    };
    const schedule = (delay: number) => {
      const timer = setTimeout(() => {
        removeTimeout();
        running = Promise.resolve()
          .then(work)
          .then(() => undefined)
          .catch(onError)
          .finally(() => {
            running = undefined;
            if (!stopped) schedule(1_000);
          });
      }, delay);
      try {
        this.registry.addTimeout(name, timer);
      } catch (error) {
        clearTimeout(timer);
        throw error;
      }
      timer.unref();
    };
    schedule(initialDelay);
    return {
      stop: async () => {
        stopped = true;
        removeTimeout();
        await running;
      },
    };
  }
}
