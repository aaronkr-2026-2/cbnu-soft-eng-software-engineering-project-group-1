import { IsMongoId } from 'class-validator';

export class AppointmentIdDto {
  @IsMongoId()
  id: string;
}
