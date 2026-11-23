import { UseGuards } from '@nestjs/common';
import { Args, Context, Query, Resolver } from '@nestjs/graphql';
import {
  MemberAccessGuard,
  type AuthenticatedRequest,
} from '../auth/guards/member-access.guard.js';
import {
  CalendarInput,
  CalendarUpdatesInput,
} from '../../libs/dto/appointment/calendar.input.js';
import {
  CalendarPage,
  CalendarUpdates,
} from '../../libs/dto/appointment/calendar.js';
import { AppointmentCalendarService } from './appointment-calendar.service.js';
@Resolver()
@UseGuards(MemberAccessGuard)
export class AppointmentCalendarResolver {
  constructor(private readonly calendars: AppointmentCalendarService) {}
  @Query(() => CalendarPage)
  myCalendar(
    @Args('input') input: CalendarInput,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.calendars.calendar(input, req.member);
  }
  @Query(() => CalendarUpdates)
  calendarUpdates(
    @Args('input') input: CalendarUpdatesInput,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.calendars.updates(input, req.member);
  }
}
