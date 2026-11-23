import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { AppointmentOutput } from './appointment.js';
@ObjectType()
export class CalendarAppointment extends AppointmentOutput {
  @Field(() => String, { nullable: true }) clinicTimezone?: string;
}
@ObjectType()
export class CalendarPage {
  @Field(() => [CalendarAppointment]) entries: CalendarAppointment[];
  @Field(() => String) revision: string;
  @Field(() => ID, { nullable: true }) nextCursor?: string;
  @Field(() => String, { nullable: true }) clinicTimezone?: string;
}
@ObjectType()
export class CalendarUpdates {
  @Field(() => String) revision: string;
  @Field(() => Boolean) changed: boolean;
  @Field(() => Int) pollAfterSeconds: number;
}
