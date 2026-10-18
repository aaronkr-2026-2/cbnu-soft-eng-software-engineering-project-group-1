import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  DoctorClinicStatus,
  DoctorSpecialization,
  MemberStatus,
  MemberType,
} from '../../enum/member.enum.js';
import { Location } from '../../enum/location.enum.js';

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
  @Field(() => Location, { nullable: true }) location?: Location;
  @Field(() => ID, { nullable: true }) clinicId?: string;
  @Field(() => String, { nullable: true }) clinicName?: string;
  @Field(() => String, { nullable: true }) clinicTimezone?: string;
  @Field(() => DoctorClinicStatus, { nullable: true })
  doctorClinicStatus?: DoctorClinicStatus;
  @Field(() => [DoctorSpecialization], { nullable: true })
  doctorSpecializations?: DoctorSpecialization[];
}

// Private fields are available only through authenticated self-profile operations.
@ObjectType()
export class MemberSelf extends Member {
  @Field(() => String, { nullable: true }) memberPhone?: string;
  @Field(() => String, { nullable: true }) memberEmail?: string;
  @Field(() => Boolean) canChangePassword: boolean;
}

@ObjectType()
export class MemberUpdateResult {
  @Field(() => MemberSelf) member: MemberSelf;
  @Field(() => Boolean) requiresLogin: boolean;
  @Field(() => Boolean) imageCleanupPending: boolean;
}
