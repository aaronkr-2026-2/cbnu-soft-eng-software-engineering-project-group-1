import {
  Injectable,
  Optional,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type InferSchemaType } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  APPOINTMENT_EVENT,
  AppointmentEventSchema,
} from '../../schemas/appointment-event.model.js';
import {
  AppointmentEventType,
  AppointmentSource,
  SlotReleaseMode,
  WaitlistStatus,
} from '../../libs/enum/appointment.enum.js';
import type { BookingTransaction } from '../../libs/types/booking.types.js';
import { waitlistPromotionEnabled } from '../booking/booking.config.js';
import { BookingCoordinationService } from '../booking/booking-coordination.service.js';
import { BookingPolicyService } from '../booking/booking-policy.service.js';
import { WaitlistService } from '../waitlist/waitlist.service.js';
import { AppointmentService } from './appointment.service.js';
import {
  PromotionCutoff,
  PromotionIneligible,
} from './appointment-promotion-error.js';

type ReleaseEvent = InferSchemaType<typeof AppointmentEventSchema>;
const LEASE_MS = 30_000;
const CANDIDATES_PER_CLAIM = 25;

@Injectable()
export class AppointmentPromotionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AppointmentPromotionService.name);
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private running?: Promise<boolean>;
  constructor(
    private readonly coordination: BookingCoordinationService,
    private readonly policy: BookingPolicyService,
    private readonly waitlists: WaitlistService,
    private readonly appointments: AppointmentService,
    @Optional()
    @InjectModel(APPOINTMENT_EVENT)
    private readonly events?: Model<ReleaseEvent>,
  ) {}

  // No HTTP/GraphQL entry point. Delivery readiness remains a release gate;
  // integration tests replace this method to exercise the real worker safely.
  isEnabled() {
    return waitlistPromotionEnabled();
  }

  onModuleInit() {
    if (this.isEnabled()) this.schedule();
  }
  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }
  private schedule() {
    this.timer = setTimeout(() => {
      this.running = this.runOnce()
        .catch(() => {
          this.logger.error('WAITLIST_PROMOTION_POLL_FAILED');
          return false;
        })
        .finally(() => {
          this.running = undefined;
          if (!this.stopped) this.schedule();
        });
    }, 1000);
    this.timer.unref();
  }

  async runOnce(): Promise<boolean> {
    if (!this.isEnabled() || !this.events || this.stopped) return false;
    await this.policy.assertReady();
    await this.appointments.prepareLifecycle();
    await this.waitlists.prepare();
    const now = new Date(Date.now());
    const claimToken = randomUUID();
    const event = await this.events
      .findOneAndUpdate(
        {
          type: AppointmentEventType.SLOT_RELEASED,
          releaseMode: {
            $in: [SlotReleaseMode.QUEUE, SlotReleaseMode.UNAVAILABLE],
          },
          $or: [
            {
              state: 'PENDING',
              $or: [
                { nextAttemptAt: { $exists: false } },
                { nextAttemptAt: { $lte: now } },
              ],
            },
            { state: 'PROCESSING', leaseUntil: { $lte: now } },
          ],
        },
        {
          $set: {
            state: 'PROCESSING',
            claimToken,
            leaseUntil: new Date(+now + LEASE_MS),
          },
          $inc: { attempts: 1 },
        },
        { sort: { occurredAt: 1, _id: 1 }, returnDocument: 'after' },
      )
      .lean()
      .exec();
    if (!event) return false;
    try {
      for (let n = 0; n < CANDIDATES_PER_CLAIM; n++) {
        if (!this.isEnabled()) break;
        const candidate = await this.waitlists.firstForPromotion(event);
        const result = await this.coordination.run(
          {
            doctorIds: [event.doctorId],
            patientIds: candidate ? [candidate.patientId] : [],
            slots: [event],
          },
          async (tx) => {
            if (!(await this.fence(event, tx))) return 'DONE';
            await this.policy.assertReady(tx.session);
            const gate = await tx.slotState(event);
            if (
              !gate.allocationPending ||
              gate.generation !== event.slotGeneration
            ) {
              await this.finish(event, tx, 'PROCESSED', 'STALE');
              return 'DONE';
            }
            if (await this.appointments.isSlotOccupied(event, tx)) {
              await tx.resolveSlot(event, gate.generation);
              await this.finish(event, tx, 'PROCESSED', 'OCCUPIED');
              return 'DONE';
            }
            if (+event.startsAt - Date.now() < 48 * 3600_000) {
              const head = await this.waitlists.openingCandidate(event, tx);
              if (
                head &&
                +event.startsAt > Date.now() &&
                (await this.appointments.canReopenSlot(head, tx))
              )
                await this.waitlists.notifyOpening(event, event._id, tx);
              await tx.resolveSlot(event, gate.generation);
              await this.finish(
                event,
                tx,
                'DEFERRED',
                +event.startsAt <= Date.now()
                  ? 'SLOT_STARTED'
                  : 'MANUAL_CUTOFF',
              );
              return 'DONE';
            }
            const first = await this.waitlists.firstForPromotion(event, tx);
            if (String(first?._id) !== String(candidate?._id)) return 'NEXT';
            if (!first) {
              await tx.resolveSlot(event, gate.generation);
              await this.finish(event, tx, 'PROCESSED', 'QUEUE_EMPTY');
              return 'DONE';
            }
            let principal;
            try {
              principal = await this.appointments.checkPromotionEligibility(
                first,
                tx,
                gate.generation,
              );
            } catch (error) {
              if (!(error instanceof PromotionIneligible)) throw error;
              await this.waitlists.close(
                first,
                WaitlistStatus.INELIGIBLE,
                tx,
                undefined,
                error.reason,
              );
              return 'NEXT';
            }
            const appointment = await this.appointments.bookInTransaction(
              {
                doctorId: String(first.doctorId),
                clinicId: String(first.clinicId),
                specialty: first.specialty,
                startsAt: first.startsAt.toISOString(),
              },
              first.patientId,
              principal,
              AppointmentSource.WAITLIST,
              tx,
              undefined,
              undefined,
              true,
              gate.generation,
            );
            await this.events!.create(
              [
                {
                  _id: `waitlist-booked:${first._id}:${appointment._id}`,
                  type: AppointmentEventType.WAITLIST_BOOKING_CREATED,
                  waitlistId: first._id,
                  appointmentId: appointment._id,
                  appointmentVersion: appointment.version,
                  appointmentStatus: appointment.status,
                  patientId: first.patientId,
                  doctorId: first.doctorId,
                  clinicId: first.clinicId,
                  actorId: first.patientId,
                  startsAt: first.startsAt,
                  endsAt: first.endsAt,
                  occurredAt: new Date(Date.now()),
                },
              ],
              { session: tx.session },
            );
            // Check the actual allocation time after all writes too. Throwing
            // aborts appointment, fulfillment and notification before handoff.
            if (+event.startsAt - Date.now() < 48 * 3600_000)
              throw new PromotionCutoff();
            await tx.resolveSlot(event, gate.generation);
            await this.finish(event, tx, 'PROCESSED', 'PROMOTED');
            return 'DONE';
          },
        );
        if (result === 'DONE') return true;
      }
      await this.retry(event, 'BATCH_LIMIT', 1000);
    } catch (error) {
      if (error instanceof PromotionCutoff) {
        await this.coordination.run(
          { doctorIds: [event.doctorId], patientIds: [], slots: [event] },
          async (tx) => {
            if (!(await this.fence(event, tx))) return;
            const gate = await tx.slotState(event);
            if (
              !gate.allocationPending ||
              gate.generation !== event.slotGeneration
            ) {
              await this.finish(event, tx, 'PROCESSED', 'STALE');
              return;
            }
            const head = await this.waitlists.openingCandidate(event, tx);
            if (
              head &&
              +event.startsAt > Date.now() &&
              (await this.appointments.canReopenSlot(head, tx))
            )
              await this.waitlists.notifyOpening(event, event._id, tx);
            await tx.resolveSlot(event, gate.generation);
            await this.finish(event, tx, 'DEFERRED', 'MANUAL_CUTOFF');
          },
        );
      } else {
        await this.retry(
          event,
          'WORKER_RETRY',
          Math.min(60_000, 1000 * 2 ** Math.min(event.attempts ?? 1, 6)),
        );
      }
    }
    return true;
  }

  private async fence(event: ReleaseEvent, tx: BookingTransaction) {
    const now = new Date(Date.now());
    return this.events!.findOneAndUpdate(
      {
        _id: event._id,
        state: 'PROCESSING',
        claimToken: event.claimToken,
        leaseUntil: { $gt: now },
      },
      { $set: { leaseUntil: new Date(+now + LEASE_MS) } },
      { session: tx.session, returnDocument: 'after' },
    )
      .lean()
      .exec();
  }
  private async finish(
    event: ReleaseEvent,
    tx: BookingTransaction,
    state: 'PROCESSED' | 'DEFERRED',
    result: string,
  ) {
    await this.events!.updateOne(
      { _id: event._id, claimToken: event.claimToken, state: 'PROCESSING' },
      {
        $set: { state, result, processedAt: new Date(Date.now()) },
        $unset: {
          claimToken: 1,
          leaseUntil: 1,
          nextAttemptAt: 1,
          lastFailureCode: 1,
        },
      },
      { session: tx.session },
    );
  }
  private async retry(event: ReleaseEvent, code: string, delay: number) {
    await this.events!.updateOne(
      { _id: event._id, claimToken: event.claimToken, state: 'PROCESSING' },
      {
        $set: {
          state: 'PENDING',
          lastFailureCode: code,
          nextAttemptAt: new Date(Date.now() + delay),
        },
        $unset: { claimToken: 1, leaseUntil: 1 },
      },
    );
  }
}
