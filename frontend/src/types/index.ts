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
