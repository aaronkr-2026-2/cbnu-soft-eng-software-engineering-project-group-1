import { UseGuards } from '@nestjs/common';
import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  MemberAccessGuard,
  type AuthenticatedRequest,
} from '../auth/guards/member-access.guard.js';
import { AppointmentService } from './appointment.service.js';
import { BookAppointmentDto } from '../../libs/dto/appointment/book-appointment.dto.js';
import { AppointmentIdDto } from '../../libs/dto/appointment/appointment-id.dto.js';
import { AppointmentOutput } from '../../libs/dto/appointment/appointment.js';
import { ClinicAppointmentInput } from '../../libs/dto/appointment/clinic-appointment.input.js';
import { AppointmentOutcome } from '../../libs/enum/appointment.enum.js';

@Resolver(() => AppointmentOutput)
@UseGuards(MemberAccessGuard)
export class AppointmentResolver {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Mutation(() => AppointmentOutput)
  createClinicAppointment(
    @Args('input') input: ClinicAppointmentInput,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.appointmentService.createClinicAppointment(input, req.member);
  }

  @Mutation(() => AppointmentOutput)
  cancelAppointment(
    @Args('id', { type: () => ID }) id: string,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.appointmentService.cancelAppointment(id, req.member);
  }

  @Mutation(() => AppointmentOutput)
  setAppointmentOutcome(
    @Args('id', { type: () => ID }) id: string,
    @Args('outcome', { type: () => AppointmentOutcome })
    outcome: AppointmentOutcome,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.appointmentService.setAppointmentOutcome(
      id,
      outcome,
      req.member,
    );
  }

  @Mutation(() => AppointmentOutput)
  bookAppointment(
    @Args('input') input: BookAppointmentDto,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.appointmentService.bookAppointment(input, req.member);
  }

  @Query(() => AppointmentOutput)
  getAppointment(
    @Args() args: AppointmentIdDto,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.appointmentService.getAppointment(args.id, req.member);
  }
}
