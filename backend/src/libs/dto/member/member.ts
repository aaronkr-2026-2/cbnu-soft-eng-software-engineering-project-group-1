import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  DoctorClinicStatus,
  DoctorSpecialization,
  MemberStatus,
  MemberType,
} from '../../enum/member.enum.js';

@ObjectType()
export class Member {
  @Field(() => ID) _id: string;
  @Field(() => MemberType) memberType: MemberType;
  @Field(() => MemberStatus) memberStatus: MemberStatus;
  @Field(() => String) memberNick: string;
  @Field(() => String, { nullable: true }) memberFullName?: string;
  @Field(() => String, { nullable: true }) memberImage?: string;
  @Field(() => String, { nullable: true }) memberAddress?: string;
  @Field(() => String, { nullable: true }) memberDesc?: string;
  @Field(() => ID, { nullable: true }) clinicId?: string;
  @Field(() => String, { nullable: true }) clinicName?: string;
  @Field(() => String, { nullable: true }) clinicTimezone?: string;
  @Field(() => DoctorClinicStatus, { nullable: true })
  doctorClinicStatus?: DoctorClinicStatus;
  @Field(() => [DoctorSpecialization], { nullable: true })
  doctorSpecializations?: DoctorSpecialization[];
}
