import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';
import { AppointmentSlotState } from '../../enum/appointment.enum.js';
import { DoctorSpecialization } from '../../enum/member.enum.js';

@ObjectType('AppointmentSlot')
export class AppointmentSlotOutput {
  @Field(() => ID) doctorId: string;
  @Field(() => ID) clinicId: string;
  @Field(() => DoctorSpecialization) specialty: DoctorSpecialization;
  @Field() clinicTimezone: string;
  @Field(() => GraphQLISODateTime) startsAt: Date;
  @Field(() => GraphQLISODateTime) endsAt: Date;
  @Field(() => AppointmentSlotState) state: AppointmentSlotState;
  @Field(() => Boolean) waitlistEligible: boolean;
  @Field(() => Boolean) canJoinWaitlist: boolean;
}
