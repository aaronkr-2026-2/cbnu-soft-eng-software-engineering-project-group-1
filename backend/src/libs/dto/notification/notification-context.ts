import { Field, GraphQLISODateTime, ObjectType } from '@nestjs/graphql';
import { NotificationTargetKind } from '../../enum/notification.enum.js';
import { AppointmentOutput } from '../appointment/appointment.js';
import { AppointmentSlotOutput } from '../appointment/appointment-slot.js';
import { WaitlistOutput } from '../waitlist/waitlist.js';
import { NotificationOutput } from './notification.js';
@ObjectType()
export class NotificationContext {
  @Field(() => NotificationOutput) notification: NotificationOutput;
  @Field(() => NotificationTargetKind) targetKind: NotificationTargetKind;
  @Field(() => GraphQLISODateTime) checkedAt: Date;
  @Field(() => AppointmentOutput, { nullable: true })
  appointment?: AppointmentOutput;
  @Field(() => AppointmentSlotOutput, { nullable: true })
  slot?: AppointmentSlotOutput;
  @Field(() => WaitlistOutput, { nullable: true }) waitlist?: WaitlistOutput;
}
