import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
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
  @Field(() => MemberSelf, { nullable: true }) member: MemberSelf | null;
  @Field(() => Boolean) requiresLogin: boolean;
  @Field(() => Boolean) imageCleanupPending: boolean;
}

@ObjectType()
export class AccountDeletionEntry {
  @Field(() => ID) id: string;
  @Field(() => String) kind: string;
  @Field(() => String) status: string;
  @Field(() => Date) startsAt: Date;
  @Field(() => Date) endsAt: Date;
  @Field(() => ID) clinicId: string;
  @Field(() => ID) doctorId: string;
  @Field(() => String) clinicName: string;
  @Field(() => String) doctorName: string;
  @Field(() => String) clinicTimezone: string;
  @Field(() => String) permittedAction: string;
  @Field(() => String, { nullable: true }) resolutionReason: string | null;
}

@ObjectType()
export class AccountDeletionPage {
  @Field(() => [AccountDeletionEntry]) entries: AccountDeletionEntry[];
  @Field(() => ID, { nullable: true }) nextCursor: string | null;
}

@ObjectType()
export class AccountDeletionReadiness {
  @Field(() => Date) asOf: Date;
  @Field(() => Boolean) ready: boolean;
  @Field(() => Int) appointmentCount: number;
  @Field(() => Int) waitlistCount: number;
  @Field(() => Int) affiliationImpactCount: number;
  @Field(() => AccountDeletionPage) appointments: AccountDeletionPage;
  @Field(() => AccountDeletionPage) waitlists: AccountDeletionPage;
}
