import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  MemberAccessGuard,
  type AuthenticatedRequest,
} from '../auth/guards/member-access.guard.js';
import {
  AvailableSlotsInput,
  DoctorDateOverridesInput,
  DoctorWeeklyHoursInput,
} from '../../libs/dto/appointment/schedule.input.js';
import { AppointmentSlotOutput } from '../../libs/dto/appointment/appointment-slot.js';
import { AppointmentScheduleService } from './appointment-schedule.service.js';

@Resolver()
export class AppointmentScheduleResolver {
  constructor(private readonly schedules: AppointmentScheduleService) {}

  @Query(() => [AppointmentSlotOutput])
  getAvailableSlots(@Args('input') input: AvailableSlotsInput) {
    return this.schedules.getAvailableSlots(input);
  }

  @UseGuards(MemberAccessGuard)
  @Mutation(() => Boolean)
  setDoctorWeeklyHours(
    @Args('input') input: DoctorWeeklyHoursInput,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.schedules.setWeeklyHours(input, req.member);
  }

  @UseGuards(MemberAccessGuard)
  @Mutation(() => Boolean)
  setDoctorDateOverrides(
    @Args('input') input: DoctorDateOverridesInput,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.schedules.setDateOverrides(input, req.member);
  }
}
