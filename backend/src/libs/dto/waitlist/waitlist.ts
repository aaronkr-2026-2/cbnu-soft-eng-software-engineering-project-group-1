import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { CommitmentKind, WaitlistStatus } from '../../enum/appointment.enum.js';
import { DoctorSpecialization } from '../../enum/member.enum.js';
import { AppointmentOutput } from '../appointment/appointment.js';

@ObjectType('WaitlistEntry')
export class WaitlistOutput {
  @Field(() => ID) _id: string;
  @Field(() => ID) patientId: string;
  @Field(() => ID) doctorId: string;
  @Field(() => ID) clinicId: string;
  @Field(() => DoctorSpecialization) specialty: DoctorSpecialization;
  @Field(() => GraphQLISODateTime) startsAt: Date;
  @Field(() => GraphQLISODateTime) endsAt: Date;
  @Field(() => WaitlistStatus) status: WaitlistStatus;
  @Field() version: string;
  @Field(() => Boolean) automaticBookingConsent: boolean;
  @Field(() => GraphQLISODateTime) consentedAt: Date;
  @Field() consentPolicyVersion: string;
  @Field(() => Int, { nullable: true }) queueSequence?: number;
  @Field(() => Int, { nullable: true }) queuePosition?: number;
  @Field(() => ID, { nullable: true }) appointmentId?: string;
  @Field(() => String, { nullable: true }) closedReason?: string;
  @Field(() => Boolean) automaticBookingEligible: boolean;
  @Field(() => Boolean) automaticBookingEnabled: boolean;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  @Field(() => GraphQLISODateTime) updatedAt: Date;
}

@ObjectType()
export class WaitlistPage {
  @Field(() => [WaitlistOutput]) entries: WaitlistOutput[];
  @Field(() => ID, { nullable: true }) nextCursor?: string;
}

@ObjectType()
export class CommitmentResult {
  @Field(() => CommitmentKind) kind: CommitmentKind;
  @Field(() => AppointmentOutput, { nullable: true })
  appointment?: AppointmentOutput;
  @Field(() => WaitlistOutput, { nullable: true }) waitlist?: WaitlistOutput;
}
