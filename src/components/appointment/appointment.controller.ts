import { Controller, Get, Header, Param, Req, UseGuards } from '@nestjs/common';
import {
  MemberAccessGuard,
  type AuthenticatedRequest,
} from '../auth/guards/member-access.guard.js';
import { AppointmentIdDto } from '../../libs/dto/appointment/appointment-id.dto.js';
import { AppointmentService } from './appointment.service.js';

@Controller('appointment')
@UseGuards(MemberAccessGuard)
export class AppointmentController {
  constructor(private readonly appointmentsService: AppointmentService) {}

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  getAppointment(
    @Param() params: AppointmentIdDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.appointmentsService.getAppointment(params.id, request.member);
  }
}
