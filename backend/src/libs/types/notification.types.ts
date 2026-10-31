import type { Types } from 'mongoose';
export type Notice = {
  eventId: string;
  patientId: Types.ObjectId;
  waitlistId: Types.ObjectId;
  type: string;
  doctorId: Types.ObjectId;
  clinicId: Types.ObjectId;
  startsAt: Date;
  endsAt: Date;
  appointmentId?: Types.ObjectId;
  occurredAt: Date;
};
