import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types, type InferSchemaType } from 'mongoose';
import { createHash } from 'node:crypto';
import AppointmentSchema, {
  APPOINTMENT_MODEL_NAME,
} from '../../schemas/appointment.model.js';
import { MEMBER } from '../../schemas/member.model.js';
import { MemberStatus, MemberType } from '../../libs/enum/member.enum.js';
import { AppointmentSource } from '../../libs/enum/appointment.enum.js';
import type {
  MemberEntity,
  MemberPrincipal,
} from '../../libs/types/member.types.js';
import { appointmentFields } from '../../libs/types/appointment.types.js';
import type {
  CalendarInput,
  CalendarRangeInput,
  CalendarUpdatesInput,
} from '../../libs/dto/appointment/calendar.input.js';

const MAX_ROWS = 5000;
@Injectable()
export class AppointmentCalendarService {
  constructor(
    @Optional() @InjectConnection() private readonly connection?: Connection,
    @Optional()
    @InjectModel(APPOINTMENT_MODEL_NAME)
    private readonly appointments?: Model<
      InferSchemaType<typeof AppointmentSchema>
    >,
    @Optional()
    @InjectModel(MEMBER)
    private readonly members?: Model<MemberEntity>,
  ) {}

  private range(input: CalendarRangeInput, member: MemberPrincipal) {
    if (
      member.memberType !== MemberType.CLINIC &&
      member.memberType !== MemberType.DOCTOR
    )
      throw new ForbiddenException(
        'Only clinics and doctors can read calendars',
      );
    if (
      !(input.from instanceof Date) ||
      !Number.isFinite(+input.from) ||
      !(input.to instanceof Date) ||
      !Number.isFinite(+input.to) ||
      input.to <= input.from ||
      +input.to - +input.from > 31 * 86400000
    )
      throw new BadRequestException(
        'Choose a calendar window of at most 31 elapsed days',
      );
    if (input.doctorId != null && !/^[a-f\d]{24}$/i.test(input.doctorId))
      throw new BadRequestException('Invalid doctor ID');
    if (
      member.memberType === MemberType.DOCTOR &&
      input.doctorId != null &&
      input.doctorId.toLowerCase() !== String(member._id)
    )
      throw new ForbiddenException('Doctors can read only their own calendar');
    return member.memberType === MemberType.CLINIC
      ? {
          clinicId: member._id,
          ...(input.doctorId
            ? { doctorId: new Types.ObjectId(input.doctorId) }
            : {}),
        }
      : { doctorId: member._id };
  }

  private async snapshot(input: CalendarRangeInput, member: MemberPrincipal) {
    const scope = this.range(input, member);
    if (!this.connection || !this.appointments || !this.members)
      throw new ServiceUnavailableException('Calendar unavailable');
    // Read-only snapshot sessions pin a common committed cluster time across
    // queries, without a write transaction. Explicit cursor timeouts also keep
    // getMore bounded on the installed MongoDB driver.
    const session = await this.connection.startSession({ snapshot: true });
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 10000);
    try {
      const current = await this.members!.findOne({
        _id: member._id,
        memberType: member.memberType,
        memberStatus: MemberStatus.ACTIVE,
        deletedAt: null,
      })
        .select({ _id: 1, authVersion: 1, clinicId: 1, clinicTimezone: 1 })
        .session(session)
        .setOptions({
          readPreference: 'primary',
          timeoutMS: 10000,
          signal: controller.signal,
        })
        .lean()
        .exec();
      if (!current || (current.authVersion ?? 0) !== (member.authVersion ?? 0))
        throw new UnauthorizedException('Invalid access token');
      const rows = await this.appointments!.find({
        ...scope,
        startsAt: { $lt: input.to },
        endsAt: { $gt: input.from },
      })
        .select(appointmentFields)
        .sort({ startsAt: 1, _id: 1 })
        .limit(MAX_ROWS + 1)
        .session(session)
        .setOptions({
          readPreference: 'primary',
          timeoutMS: 10000,
          signal: controller.signal,
        })
        .lean()
        .exec();
      if (rows.length > MAX_ROWS)
        throw new BadRequestException(
          'Calendar is too large; narrow the date range or select a doctor',
        );
      const clinicIds = [...new Set(rows.map((row) => String(row.clinicId)))];
      const ownClinic =
        member.memberType === MemberType.CLINIC
          ? String(member._id)
          : current.clinicId
            ? String(current.clinicId)
            : undefined;
      if (ownClinic) clinicIds.push(ownClinic);
      const clinics = await this.members!.find({
        _id: { $in: clinicIds.map((id) => new Types.ObjectId(id)) },
        memberType: MemberType.CLINIC,
      })
        .select({ _id: 1, clinicTimezone: 1 })
        .session(session)
        .setOptions({
          readPreference: 'primary',
          timeoutMS: 10000,
          signal: controller.signal,
        })
        .lean()
        .exec();
      const timezones = new Map(
        clinics.map((clinic) => [
          String(clinic._id),
          clinic.clinicTimezone ?? null,
        ]),
      );
      const entries = rows.map((row) => ({
        ...row,
        source: row.source ?? AppointmentSource.LEGACY,
        clinicTimezone: timezones.get(String(row.clinicId)) ?? null,
      }));
      const clinicTimezone = ownClinic
        ? (timezones.get(ownClinic) ?? null)
        : null;
      // Hash the entire authorized window, not a timestamp or one page: late
      // commits, removals and changes on later pages cannot be skipped.
      const revision = createHash('sha256')
        .update(
          JSON.stringify([
            String(member._id),
            member.memberType,
            String(scope.doctorId ?? ''),
            input.from.toISOString(),
            input.to.toISOString(),
            clinicTimezone,
            entries,
          ]),
        )
        .digest('hex');
      return { entries, revision, clinicTimezone };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Calendar unavailable');
    } finally {
      clearTimeout(deadline);
      await session.endSession();
    }
  }

  async calendar(input: CalendarInput, member: MemberPrincipal) {
    const limit = input.limit ?? 100,
      after = input.after ?? undefined,
      revision = input.revision ?? undefined;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (after !== undefined && !/^[a-f\d]{24}$/i.test(after)) ||
      (revision !== undefined && !/^[a-f\d]{64}$/.test(revision)) ||
      (after && !revision)
    )
      throw new BadRequestException(
        'Invalid calendar pagination; continuing pages require their revision',
      );
    const state = await this.snapshot(input, member);
    if (revision && revision !== state.revision)
      throw new ConflictException(
        'Calendar changed; restart from the first page',
      );
    const anchor = after
      ? state.entries.findIndex(
          (row) => String(row._id) === after.toLowerCase(),
        )
      : -1;
    if (after && anchor < 0)
      throw new BadRequestException('Invalid calendar cursor');
    const entries = state.entries.slice(anchor + 1, anchor + 1 + limit);
    return {
      ...state,
      entries,
      nextCursor:
        anchor + 1 + limit < state.entries.length
          ? String(entries[entries.length - 1]._id)
          : null,
    };
  }

  async updates(input: CalendarUpdatesInput, member: MemberPrincipal) {
    if (
      input.knownRevision != null &&
      !/^[a-f\d]{64}$/.test(input.knownRevision)
    )
      throw new BadRequestException('Invalid calendar revision');
    const state = await this.snapshot(input, member);
    return {
      revision: state.revision,
      changed: input.knownRevision !== state.revision,
      pollAfterSeconds: 5,
    };
  }
}
