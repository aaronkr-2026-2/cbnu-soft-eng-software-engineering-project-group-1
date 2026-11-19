import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  Equals,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CommitmentKind, WaitlistStatus } from '../../enum/appointment.enum.js';
import { BookAppointmentDto } from '../appointment/book-appointment.dto.js';

@InputType()
export class JoinWaitlistInput extends BookAppointmentDto {
  @Field(() => Boolean) @Equals(true) automaticBookingConsent: boolean;
}

@InputType()
export class CommitmentDestinationInput extends BookAppointmentDto {
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @Equals(true)
  automaticBookingConsent?: boolean;
}

@InputType()
export class ReplaceCommitmentInput {
  @Field(() => CommitmentKind)
  @IsEnum(CommitmentKind)
  originalKind: CommitmentKind;
  @Field(() => ID) @IsMongoId() originalId: string;
  @Field() @IsUUID() originalVersion: string;
  @Field(() => CommitmentKind)
  @IsEnum(CommitmentKind)
  destinationKind: CommitmentKind;
  @Field(() => CommitmentDestinationInput)
  @ValidateNested()
  @Type(() => CommitmentDestinationInput)
  destination: CommitmentDestinationInput;
}

@InputType()
export class MyWaitlistInput {
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsMongoId()
  after?: string;
  @Field(() => Int, { defaultValue: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
  @Field(() => WaitlistStatus, { nullable: true })
  @IsOptional()
  @IsEnum(WaitlistStatus)
  status?: WaitlistStatus;
}
