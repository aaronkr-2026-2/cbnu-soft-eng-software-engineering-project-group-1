import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { NotificationService } from '../notification/notification.service.js';
import { WaitlistService } from '../waitlist/waitlist.service.js';
import { AppointmentService } from './appointment.service.js';
import { AppointmentScheduleService } from './appointment-schedule.service.js';
import { NotificationTargetKind } from '../../libs/enum/notification.enum.js';
import type { MemberPrincipal } from '../../libs/types/member.types.js';
@Injectable()
export class AppointmentNotificationService {
  constructor(
    private readonly notifications: NotificationService,
    private readonly waitlists: WaitlistService,
    private readonly appointments: AppointmentService,
    private readonly schedules: AppointmentScheduleService,
  ) {}
  async context(id: string, member: MemberPrincipal) {
    const notification = await this.notifications.get(id, member);
    const base = { notification, checkedAt: new Date(Date.now()) };
    if (notification.type === 'WAITLIST_BOOKING_CREATED') {
      if (!notification.appointmentId)
        return { ...base, targetKind: NotificationTargetKind.UNAVAILABLE };
      try {
        const appointment = await this.appointments.getAppointment(
          String(notification.appointmentId),
          member,
        );
        return {
          ...base,
          checkedAt: new Date(Date.now()),
          targetKind: NotificationTargetKind.APPOINTMENT,
          appointment,
        };
      } catch (error) {
        if (error instanceof NotFoundException)
          return { ...base, targetKind: NotificationTargetKind.UNAVAILABLE };
        throw error;
      }
    }
    let row;
    try {
      row = await this.waitlists.get(String(notification.waitlistId), member);
    } catch (error) {
      if (error instanceof NotFoundException)
        return { ...base, targetKind: NotificationTargetKind.UNAVAILABLE };
      throw error;
    }
    const waitlist = await this.waitlists.view(row, member);
    if (notification.type !== 'SLOT_OPEN_FOR_MANUAL_BOOKING')
      return {
        ...base,
        checkedAt: new Date(Date.now()),
        targetKind: NotificationTargetKind.WAITLIST,
        waitlist,
      };
    try {
      const slot = await this.schedules.getSlotForTarget({
        doctorId: String(row.doctorId),
        clinicId: String(row.clinicId),
        specialty: row.specialty,
        startsAt: row.startsAt.toISOString(),
      });
      return {
        ...base,
        checkedAt: new Date(Date.now()),
        targetKind: slot
          ? NotificationTargetKind.SLOT
          : NotificationTargetKind.UNAVAILABLE,
        waitlist,
        slot,
      };
    } catch (error) {
      // A closed/ineligible target is a known domain result. Database/network
      // failures remain errors, never a false statement about availability.
      if (error instanceof BadRequestException)
        return {
          ...base,
          checkedAt: new Date(Date.now()),
          targetKind: NotificationTargetKind.UNAVAILABLE,
          waitlist,
        };
      throw error;
    }
  }
}
