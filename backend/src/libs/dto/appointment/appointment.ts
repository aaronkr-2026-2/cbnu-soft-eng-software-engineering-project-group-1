import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import {
  AppointmentStatus,
  DoctorChangeRequestStatus,
  DoctorChangeRequestType,
} from '../../enum/appointment.enum.js';

@ObjectType('DoctorChangeRequest')
export class DoctorChangeRequestOutput {
  @Field(() => DoctorChangeRequestType) type: DoctorChangeRequestType;
  @Field(() => DoctorChangeRequestStatus) status: DoctorChangeRequestStatus;
  @Field(() => GraphQLISODateTime, { nullable: true }) proposedStartsAt?: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) proposedEndsAt?: Date;
  @Field(() => String, { nullable: true }) reason?: string;
  @Field(() => GraphQLISODateTime, { nullable: true }) requestedAt?: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) reviewedAt?: Date;
  @Field(() => ID, { nullable: true }) reviewedBy?: string;
}

@ObjectType('Appointment')
export class AppointmentOutput {
  @Field(() => ID) _id: string;
  @Field(() => ID) doctorId: string;
  @Field(() => ID) clinicId: string;
  @Field(() => ID) patientId: string;
  @Field(() => GraphQLISODateTime) startsAt: Date;
  @Field(() => GraphQLISODateTime) endsAt: Date;
  @Field(() => Int) durationMinutes: number;
  @Field(() => AppointmentStatus) status: AppointmentStatus;
  @Field(() => DoctorChangeRequestOutput, { nullable: true })
  doctorChangeRequest?: DoctorChangeRequestOutput;
  @Field(() => ID, { nullable: true }) lastChangedBy?: string;
  @Field(() => ID, { nullable: true }) canceledBy?: string;
  @Field(() => GraphQLISODateTime, { nullable: true }) canceledAt?: Date;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  @Field(() => GraphQLISODateTime) updatedAt: Date;
}
