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

export type MemberType = "USER" | "DOCTOR" | "CLINIC";
export type MemberStatus = "ACTIVE" | "SUSPENDED" | "DELETED";
export type DoctorClinicStatus = "NOT_APPLICABLE" | "PENDING" | "APPROVED" | "REJECTED";

export interface MemberProfile {
  _id: string;
  memberType: MemberType;
  memberStatus: MemberStatus;
  memberNick: string | null;
  memberFullName: string | null;
  memberImage: string | null;
  memberAddress: string | null;
  memberDesc: string | null;
  clinicId: string | null;
  clinicName: string | null;
  clinicTimezone: string | null;
  doctorClinicStatus: DoctorClinicStatus;
  doctorSpecializations: string[] | null;
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
