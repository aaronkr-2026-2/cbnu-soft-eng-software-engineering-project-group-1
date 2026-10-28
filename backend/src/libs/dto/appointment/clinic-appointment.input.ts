import { Field, ID, InputType, OmitType } from '@nestjs/graphql';
import { IsEnum, IsMongoId } from 'class-validator';
import { ClinicBookingSource } from '../../enum/appointment.enum.js';
import { BookAppointmentDto } from './book-appointment.dto.js';

@InputType()
export class ClinicAppointmentInput extends OmitType(BookAppointmentDto, [
  'clinicId',
] as const) {
  @Field(() => ID)
  @IsMongoId()
  patientId: string;

  @Field(() => ClinicBookingSource)
  @IsEnum(ClinicBookingSource)
  source: ClinicBookingSource;
}
