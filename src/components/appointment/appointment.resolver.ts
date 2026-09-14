import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  MemberAccessGuard,
  type AuthenticatedRequest,
} from '../auth/guards/member-access.guard.js';
import { AppointmentService } from './appointment.service.js';
import { BookAppointmentDto } from '../../libs/dto/appointment/book-appointment.dto.js';
import { AppointmentIdDto } from '../../libs/dto/appointment/appointment-id.dto.js';
import { AppointmentOutput } from '../../libs/dto/appointment/appointment.js';

@Resolver(() => AppointmentOutput)
@UseGuards(MemberAccessGuard)
export class AppointmentResolver {
  constructor(private readonly appointmentService: AppointmentService) {}

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
