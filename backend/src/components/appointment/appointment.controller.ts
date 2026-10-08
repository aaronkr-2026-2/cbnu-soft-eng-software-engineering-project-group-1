import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  MemberAccessGuard,
  type AuthenticatedRequest,
} from '../auth/guards/member-access.guard.js';
import { AppointmentIdDto } from '../../libs/dto/appointment/appointment-id.dto.js';
import { BookAppointmentDto } from '../../libs/dto/appointment/book-appointment.dto.js';
import { AppointmentService } from './appointment.service.js';

@Controller('appointment')
@ApiTags('Appointment')
@ApiBearerAuth()
@UseGuards(MemberAccessGuard)
export class AppointmentController {
  constructor(private readonly appointmentsService: AppointmentService) {}

  @Post('bookAppointment')
  @Header('Cache-Control', 'no-store')
  bookAppointment(
    @Body() input: BookAppointmentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.appointmentsService.bookAppointment(input, request.member);
  }

  @Get('mine')
  @Header('Cache-Control', 'no-store')
  listMine(@Req() request: AuthenticatedRequest) {
    return this.appointmentsService.listMyAppointments(request.member);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  getAppointment(
    @Param() params: AppointmentIdDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.appointmentsService.getAppointment(params.id, request.member);
  }
}
