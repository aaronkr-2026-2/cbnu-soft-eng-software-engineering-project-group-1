import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AvailabilityOverrideType } from '../../enum/appointment.enum.js';
import { DoctorSpecialization } from '../../enum/member.enum.js';

@InputType()
export class WorkingHoursInput {
  @Field(() => Int) @IsInt() @Min(0) @Max(6) weekday: number;
  @Field(() => Int) @IsInt() @Min(0) @Max(1410) startMinute: number;
  @Field(() => Int) @IsInt() @Min(30) @Max(1440) endMinute: number;
}

@InputType()
export class DoctorWeeklyHoursInput {
  @Field(() => ID) @IsMongoId() doctorId: string;
  @Field(() => [WorkingHoursInput])
  @IsArray()
  @ArrayMaxSize(56)
  @ValidateNested({ each: true })
  @Type(() => WorkingHoursInput)
  intervals: WorkingHoursInput[];
}

@InputType()
export class DateOverrideInput {
  @Field(() => AvailabilityOverrideType)
  @IsEnum(AvailabilityOverrideType)
  type: AvailabilityOverrideType;
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1410)
  startMinute?: number;
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(1440)
  endMinute?: number;
}

@InputType()
export class DoctorDateOverridesInput {
  @Field(() => ID) @IsMongoId() doctorId: string;
  @Field() @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @Field(() => [DateOverrideInput])
  @IsArray()
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => DateOverrideInput)
  overrides: DateOverrideInput[];
}

@InputType()
export class AvailableSlotsInput {
  @Field(() => ID) @IsMongoId() doctorId: string;
  @Field(() => ID) @IsMongoId() clinicId: string;
  @Field(() => DoctorSpecialization)
  @IsEnum(DoctorSpecialization)
  specialty: DoctorSpecialization;
  @Field() @Matches(/^\d{4}-\d{2}-\d{2}$/) fromDate: string;
  @Field() @Matches(/^\d{4}-\d{2}-\d{2}$/) toDate: string;
}
