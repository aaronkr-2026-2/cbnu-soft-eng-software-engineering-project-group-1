import { Field, ID, InputType } from '@nestjs/graphql';
import { IsEnum, IsISO8601, IsMongoId, Matches } from 'class-validator';
import { DoctorSpecialization } from '../../enum/member.enum.js';

@InputType('BookAppointmentInput')
export class BookAppointmentDto {
  @Field(() => DoctorSpecialization)
  @IsEnum(DoctorSpecialization)
  specialty: DoctorSpecialization;

  @Field(() => ID)
  @IsMongoId()
  doctorId: string;

  @Field(() => ID)
  @IsMongoId()
  clinicId: string;

  @Field(() => String)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
  )
  startsAt: string;
}
