export type UserRole = "patient" | "doctor" | "hospital_admin" | "super_admin";

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface Appointment {
  id: string;
  doctorName: string;
  hospitalName: string;
  specialty: string;
  date: string; // ISO date
  time: string; // "14:30"
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
}

export interface DashboardStats {
  upcomingAppointments: number;
  completedAppointments: number;
  savedHospitals: number;
  averageRatingGiven: number;
}

// ---- Backend (NestJS) shakllari ----
export type MemberType = "USER" | "DOCTOR" | "CLINIC" | "ADMIN";

export interface AuthMember {
  _id: string;
  memberEmail: string;
  memberNick: string;
  memberType: MemberType;
  memberStatus: string;
  memberFullName?: string | null;
  memberImage?: string | null;
  clinicId?: string | null;
  clinicName?: string | null;
  clinicTimezone?: string | null;
  doctorClinicStatus?: string | null;
}

export interface MemberAuthResponse {
  member: AuthMember;
  accessToken: string;
  refreshToken: string;
}

export interface Member {
  _id: string;
  memberType: MemberType;
  memberStatus: string;
  memberNick: string;
  memberFullName?: string | null;
  memberImage?: string | null;
  memberAddress?: string | null;
  memberDesc?: string | null;
  clinicId?: string | null;
  clinicName?: string | null;
  clinicTimezone?: string | null;
  doctorClinicStatus?: string | null;
  doctorSpecializations?: string[] | null;
}

export type AppointmentStatus = "PENDING" | "CONFIRMED" | "CANCELED" | "COMPLETED" | "NO_SHOW";

export interface AppointmentRecord {
  _id: string;
  doctorId: string;
  clinicId: string;
  patientId: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  doctorChangeRequest?: {
    type: "CANCEL" | "RESCHEDULE";
    status: "PENDING" | "APPROVED" | "REJECTED";
    reason?: string | null;
    proposedStartsAt?: string | null;
    proposedEndsAt?: string | null;
  } | null;
  canceledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
