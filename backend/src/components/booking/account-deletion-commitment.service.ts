import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Model,
  Types,
  type ClientSession,
  type InferSchemaType,
  type PipelineStage,
} from 'mongoose';
import AppointmentSchema, {
  APPOINTMENT_MODEL_NAME,
} from '../../schemas/appointment.model.js';
import { WAITLIST, WaitlistSchema } from '../../schemas/waitlist.model.js';
import {
  WAITLIST_CLEANUP,
  WaitlistCleanupSchema,
} from '../../schemas/waitlist-cleanup.model.js';
import {
  AppointmentStatus,
  WaitlistStatus,
} from '../../libs/enum/appointment.enum.js';
import { MemberType } from '../../libs/enum/member.enum.js';
import type { MemberPrincipal } from '../../libs/types/member.types.js';
import type { AccountDeletionPageInput } from '../../libs/dto/member/account-deletion.input.js';
import { AccountDeletionException } from './account-deletion-error.js';

type Blocker = {
  _id: Types.ObjectId;
  status: string;
  version?: string;
  startsAt: Date;
  endsAt: Date;
  clinicId: Types.ObjectId;
  doctorId: Types.ObjectId;
};
type Facet = {
  unresolved: object[];
  summary: { count: number }[];
  entries: Blocker[];
};

@Injectable()
export class AccountDeletionCommitmentService {
  constructor(
    @Optional()
    @InjectModel(APPOINTMENT_MODEL_NAME)
    private readonly appointments?: Model<
      InferSchemaType<typeof AppointmentSchema>
    >,
    @Optional()
    @InjectModel(WAITLIST)
    private readonly waitlists?: Model<InferSchemaType<typeof WaitlistSchema>>,
    @Optional()
    @InjectModel(WAITLIST_CLEANUP)
    private readonly cleanup?: Model<
      InferSchemaType<typeof WaitlistCleanupSchema>
    >,
  ) {}

  scope(member: MemberPrincipal) {
    const field = {
      [MemberType.USER]: 'patientId',
      [MemberType.DOCTOR]: 'doctorId',
      [MemberType.CLINIC]: 'clinicId',
      [MemberType.ADMIN]: undefined,
    }[member.memberType];
    if (!field)
      throw new AccountDeletionException(
        'ACCOUNT_DELETION_ROLE_FORBIDDEN',
        403,
      );
    return { [field]: member._id };
  }

  async read(
    member: MemberPrincipal,
    input: AccountDeletionPageInput,
    session: ClientSession,
    asOf: Date,
  ) {
    if (!this.appointments || !this.waitlists || !this.cleanup)
      throw new AccountDeletionException('ACCOUNT_DELETION_UNAVAILABLE', 503);
    const scope = this.scope(member);
    // Sequential queries share the caller's snapshot. MongoDB sessions do not support parallel operations.
    const appointments = await this.page(
      this.appointments,
      scope,
      false,
      input.appointmentAfter,
      input.appointmentLimit ?? 20,
      session,
      asOf,
    );
    const waitlists = await this.page(
      this.waitlists,
      scope,
      true,
      input.waitlistAfter,
      input.waitlistLimit ?? 20,
      session,
      asOf,
    );
    if (appointments.unresolved.length || waitlists.unresolved.length)
      throw new AccountDeletionException(
        'ACCOUNT_DELETION_DATA_UNRESOLVED',
        409,
      );
    return {
      appointmentCount: appointments.summary[0]?.count ?? 0,
      waitlistCount: waitlists.summary[0]?.count ?? 0,
      appointments: this.result(
        appointments.entries,
        input.appointmentLimit ?? 20,
      ),
      waitlists: this.result(waitlists.entries, input.waitlistLimit ?? 20),
    };
  }

  private result(entries: Blocker[], limit: number) {
    return {
      entries: entries.slice(0, limit),
      nextCursor:
        entries.length > limit ? String(entries[limit - 1]._id) : null,
    };
  }

  private async page<T extends object>(
    model: Model<T>,
    scope: Record<string, Types.ObjectId>,
    waitlist: boolean,
    after: string | undefined,
    limit: number,
    session: ClientSession,
    asOf: Date,
  ): Promise<Facet> {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (after !== undefined && !/^[a-f\d]{24}$/i.test(after))
    )
      throw new BadRequestException('Invalid account deletion pagination');
    if (
      after &&
      !(await model
        .exists({ ...scope, _id: new Types.ObjectId(after) })
        .session(session)
        .read('primary')
        .maxTimeMS(5000))
    )
      throw new BadRequestException('Invalid account deletion cursor');
    const statuses = waitlist
      ? [WaitlistStatus.ACTIVE, WaitlistStatus.NOTIFICATION_ONLY]
      : [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];
    const terminal = waitlist
      ? [
          WaitlistStatus.FULFILLED,
          WaitlistStatus.WITHDRAWN,
          WaitlistStatus.EXPIRED,
          WaitlistStatus.INELIGIBLE,
        ]
      : [
          AppointmentStatus.CANCELED,
          AppointmentStatus.COMPLETED,
          AppointmentStatus.NO_SHOW,
        ];
    const valid: object[] = [
      { $in: ['$status', statuses] },
      { $eq: [{ $type: '$startsAt' }, 'date'] },
      { $eq: [{ $type: '$endsAt' }, 'date'] },
      { $gt: ['$endsAt', '$startsAt'] },
      { $eq: [{ $type: '$doctorId' }, 'objectId'] },
      { $eq: [{ $type: '$clinicId' }, 'objectId'] },
    ];
    const pipeline: PipelineStage[] = [
      { $match: { ...scope, status: { $nin: terminal } } },
    ];
    if (waitlist) {
      pipeline.push(
        {
          $set: {
            cleanupKey: {
              $concat: [
                'slot:',
                {
                  $convert: {
                    input: '$doctorId',
                    to: 'string',
                    onError: null,
                    onNull: null,
                  },
                },
                ':',
                {
                  $convert: {
                    input: {
                      $convert: {
                        input: '$startsAt',
                        to: 'long',
                        onError: null,
                        onNull: null,
                      },
                    },
                    to: 'string',
                    onError: null,
                    onNull: null,
                  },
                },
              ],
            },
          },
        },
        {
          $lookup: {
            from: this.cleanup!.collection.name,
            localField: 'cleanupKey',
            foreignField: '_id',
            as: 'cleanup',
          },
        },
        {
          $set: {
            sequenceMax: {
              $cond: [
                { $eq: [{ $size: '$cleanup' }, 0] },
                0,
                { $arrayElemAt: ['$cleanup.sequenceMax', 0] },
              ],
            },
          },
        },
      );
      for (const field of ['queueSequence', 'sequenceMax']) {
        valid.push(
          { $isNumber: `$${field}` },
          { $gte: [`$${field}`, field === 'queueSequence' ? 1 : 0] },
          { $lte: [`$${field}`, Number.MAX_SAFE_INTEGER] },
          {
            $eq: [
              {
                $convert: {
                  input: `$${field}`,
                  to: 'long',
                  onError: null,
                  onNull: null,
                },
              },
              `$${field}`,
            ],
          },
        );
      }
    }
    pipeline.push({ $set: { valid: { $and: valid } } });
    const match: PipelineStage.Match = {
      $match: {
        valid: true,
        [waitlist ? 'startsAt' : 'endsAt']: { $gt: asOf },
        ...(waitlist
          ? { $expr: { $gt: ['$queueSequence', '$sequenceMax'] } }
          : {}),
      },
    };
    pipeline.push({
      $facet: {
        unresolved: [
          { $match: { valid: false } },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        summary: [match, { $count: 'count' }],
        entries: [
          match,
          ...(after
            ? [{ $match: { _id: { $gt: new Types.ObjectId(after) } } }]
            : []),
          { $sort: { _id: 1 } },
          { $limit: limit + 1 },
          {
            $project: {
              _id: 1,
              status: 1,
              version: 1,
              startsAt: 1,
              endsAt: 1,
              clinicId: 1,
              doctorId: 1,
            },
          },
        ],
      },
    });
    const [result] = await model
      .aggregate<Facet>(pipeline)
      .session(session)
      .option({ maxTimeMS: 5000, readPreference: 'primary' })
      .exec();
    return result;
  }
}
