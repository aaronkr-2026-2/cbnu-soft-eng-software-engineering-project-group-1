import type {
  NotificationContext,
  PatientNotification,
} from '../types/notification';
import type { Target } from '../types/booking';
import { idPattern } from './booking';
export const notificationIdPattern = /^[a-f\d]{64}$/;
export function notificationTitle(type: string) {
  const titles: Record<string, string> = {
    WAITLIST_JOINED: 'Waitlist enrollment',
    WAITLIST_BOOKING_CREATED: 'Waitlist booking update',
    SLOT_OPEN_FOR_MANUAL_BOOKING: 'An opening was reported',
    WAITLIST_EXPIRED: 'Waitlist closed',
  };
  return titles[type] || 'Care notification';
}
export function notificationStatus(context: NotificationContext) {
  if (context.targetKind === 'APPOINTMENT' && context.appointment)
    return context.appointment.status === 'CONFIRMED'
      ? 'Appointment confirmed at this check'
      : `Appointment status: ${context.appointment.status.toLowerCase().replaceAll('_', ' ')}`;
  if (context.targetKind === 'SLOT' && context.slot)
    return context.slot.state === 'AVAILABLE'
      ? 'Available when checked — not reserved'
      : context.slot.state === 'OCCUPIED'
        ? 'This slot is currently occupied'
        : 'This slot is unavailable';
  if (context.targetKind === 'WAITLIST' && context.waitlist)
    return `Waitlist status: ${context.waitlist.status.toLowerCase().replaceAll('_', ' ')}`;
  return 'This target is no longer available';
}
export function slotBookingLink(target: Target) {
  return `/book?${new URLSearchParams({ clinicId: target.clinicId, doctorId: target.doctorId, specialty: target.specialty, startsAt: target.startsAt })}`;
}
export function ownedCareLink(
  notice: Pick<PatientNotification, 'appointmentId' | 'waitlistId'>,
  kind: 'APPOINTMENT' | 'WAITLIST',
) {
  if (kind === 'APPOINTMENT')
    return notice.appointmentId && idPattern.test(notice.appointmentId)
      ? `/appointments?appointmentId=${notice.appointmentId}`
      : null;
  return idPattern.test(notice.waitlistId)
    ? `/waitlist?waitlistId=${notice.waitlistId}`
    : null;
}
export function linkedBookingTarget(
  query: Record<string, string | string[] | undefined>,
): Target | undefined {
  const { doctorId, clinicId, specialty, startsAt } = query;
  if (
    typeof doctorId !== 'string' ||
    !idPattern.test(doctorId) ||
    typeof clinicId !== 'string' ||
    !idPattern.test(clinicId) ||
    typeof specialty !== 'string' ||
    !/^[A-Z_]{2,80}$/.test(specialty) ||
    typeof startsAt !== 'string' ||
    startsAt.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T/.test(startsAt) ||
    !Number.isFinite(+new Date(startsAt))
  )
    return;
  return {
    doctorId,
    clinicId,
    specialty,
    startsAt: new Date(startsAt).toISOString(),
  };
}
