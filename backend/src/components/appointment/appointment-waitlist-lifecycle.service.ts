import {
  Injectable,
  Logger,
  Optional,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type InferSchemaType } from 'mongoose';
import {
  APPOINTMENT_EVENT,
  AppointmentEventSchema,
} from '../../schemas/appointment-event.model.js';
import {
  WaitlistStatus,
  AppointmentEventType,
} from '../../libs/enum/appointment.enum.js';
import { DoctorSpecialization } from '../../libs/enum/member.enum.js';
import { BookingCoordinationService } from '../booking/booking-coordination.service.js';
import { BookingPolicyService } from '../booking/booking-policy.service.js';
import { waitlistLifecycleEnabled } from '../booking/booking.config.js';
import { WaitlistService } from '../waitlist/waitlist.service.js';
import { AppointmentService } from './appointment.service.js';
@Injectable()
export class AppointmentWaitlistLifecycleService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    AppointmentWaitlistLifecycleService.name,
  );
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<boolean>;
  private stopped = false;
  constructor(
    private readonly coordination: BookingCoordinationService,
    private readonly policy: BookingPolicyService,
    private readonly waitlists: WaitlistService,
    private readonly appointments: AppointmentService,
    @Optional()
    @InjectModel(APPOINTMENT_EVENT)
    private readonly events?: Model<
      InferSchemaType<typeof AppointmentEventSchema>
    >,
  ) {}
  isEnabled() {
    return waitlistLifecycleEnabled();
  }
  async onModuleInit() {
    if (this.isEnabled()) {
      await this.policy.assertMigrated();
      await this.appointments.prepareLifecycle();
      this.schedule();
    }
  }
  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }
  private schedule() {
    this.timer = setTimeout(() => {
      this.running = this.poll()
        .catch(() => {
          this.logger.error('WAITLIST_LIFECYCLE_RETRY');
          return false;
        })
        .finally(() => {
          this.running = undefined;
          if (!this.stopped) this.schedule();
        });
    }, 1000);
    this.timer.unref();
  }
  private async poll() {
    let worked = false;
    for (let n = 0; n < 25 && !this.stopped; n++) {
      if (!(await this.runOnce())) break;
      worked = true;
    }
    return worked;
  }
  async runOnce() {
    if (!this.isEnabled() || this.stopped || !this.events) return false;
    await this.policy.assertMigrated();
    await this.appointments.prepareLifecycle();
    const now = new Date(Date.now());
    const event = await this.events
      .findOne({
        type: AppointmentEventType.SLOT_RELEASED,
        startsAt: { $lt: new Date(+now + 48 * 3600_000) },
        $or: [
          { state: { $in: ['PENDING', 'DEFERRED'] } },
          { state: 'PROCESSING', leaseUntil: { $lte: now } },
        ],
      })
      .sort({ occurredAt: 1, _id: 1 })
      .lean()
      .exec();
    if (event) {
      await this.coordination.run(
        { doctorIds: [event.doctorId], patientIds: [], slots: [event] },
        async (tx) => {
          await this.policy.assertMigrated(tx.session);
          const current = await this.events!.findOne({
            _id: event._id,
            $or: [
              { state: { $in: ['PENDING', 'DEFERRED'] } },
              {
                state: 'PROCESSING',
                leaseUntil: { $lte: new Date(Date.now()) },
              },
            ],
          })
            .session(tx.session)
            .lean()
            .exec();
          if (!current) return;
          const gate = await tx.slotState(current);
          let result = 'STALE';
          if (gate.generation === current.slotGeneration) {
            const head = await this.waitlists.openingCandidate(current, tx);
            const specialty = current.specialty ?? head?.specialty;
            const available =
              +current.startsAt > Date.now() &&
              !(await this.appointments.isSlotOccupied(current, tx)) &&
              Object.values(DoctorSpecialization).includes(
                specialty as DoctorSpecialization,
              ) &&
              (await this.appointments.canReopenSlot(
                { ...current, specialty: specialty as DoctorSpecialization },
                tx,
              ));
            if (available)
              await this.waitlists.notifyOpening(current, current._id, tx);
            if (gate.allocationPending)
              await tx.resolveSlot(current, gate.generation);
            result = available ? 'MANUAL_NOTIFIED' : 'UNAVAILABLE';
          }
          await this.events!.updateOne(
            { _id: current._id },
            {
              $set: {
                state: 'PROCESSED',
                result,
                processedAt: new Date(Date.now()),
              },
              $unset: {
                claimToken: 1,
                leaseUntil: 1,
                nextAttemptAt: 1,
                lastFailureCode: 1,
              },
            },
            { session: tx.session },
          );
        },
      );
      return true;
    }
    const job = await this.waitlists.cleanupTarget();
    const candidate = job
      ? await this.waitlists.cleanupCandidate(job)
      : await this.waitlists.timedCandidate(now);
    if (!candidate) {
      if (!job) return false;
      await this.coordination.run(
        { doctorIds: [job.doctorId], patientIds: [], slots: [job] },
        (tx) => this.waitlists.finishCleanup(job, tx),
      );
      return true;
    }
    await this.coordination.run(
      {
        doctorIds: [candidate.doctorId],
        patientIds: [candidate.patientId],
        slots: [candidate],
      },
      async (tx) => {
        await this.policy.assertMigrated(tx.session);
        const row = await this.waitlists.lifecycleCurrent(candidate, tx);
        if (!row) return;
        if (job || +row.startsAt <= Date.now())
          await this.waitlists.close(
            row,
            WaitlistStatus.EXPIRED,
            tx,
            undefined,
            job ? 'SLOT_TAKEN' : 'SLOT_STARTED',
          );
        else if (
          row.status === WaitlistStatus.ACTIVE &&
          +row.startsAt - Date.now() < 48 * 3600_000
        )
          await this.waitlists.notificationOnly(row, tx);
      },
    );
    return true;
  }
}
