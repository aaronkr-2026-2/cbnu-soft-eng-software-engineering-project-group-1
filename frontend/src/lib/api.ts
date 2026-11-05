import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "./auth";
import type {
  AppointmentRecord,
  AuthMember,
  Member,
  MemberAuthResponse,
  User,
} from "@/types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// Refresh so'rovi interceptor'larsiz ketishi uchun alohida instance
const bare = axios.create({ baseURL: API_URL });

// ---- Member -> User ----
const MEMBER_TYPE_TO_ROLE: Record<string, User["role"]> = {
  USER: "patient",
  DOCTOR: "doctor",
  CLINIC: "hospital_admin",
  ADMIN: "super_admin",
};

export function memberToUser(member: AuthMember, phone = ""): User {
  return {
    id: member._id,
    fullName: member.memberFullName || member.memberNick,
    email: member.memberEmail,
    phone,
    role: MEMBER_TYPE_TO_ROLE[member.memberType] ?? "patient",
  };
}

// ---- Access token'ni refresh qilish (bir vaqtda bitta so'rov) ----
let refreshing: Promise<string | null> | null = null;

export function refreshSession(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const { refreshToken, user, setSession, logout } = useAuthStore.getState();
      if (!refreshToken) {
        logout();
        return null;
      }
      try {
        const { data } = await bare.post<MemberAuthResponse>("/member/refresh", { refreshToken });
        setSession(memberToUser(data.member, user?.phone), data.accessToken, data.refreshToken);
        return data.accessToken;
      } catch {
        logout();
        return null;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401 -> bir marta refresh qilib, so'rovni qayta yuboradi; bo'lmasa logout
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthCall = config?.url?.startsWith("/member/");
    if (error.response?.status === 401 && config && !config._retry && !isAuthCall) {
      config._retry = true;
      const token = await refreshSession();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        return api(config);
      }
    }
    return Promise.reject(error);
  }
);

// ---- Xato xabari ----
export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again.") {
  if (err instanceof ApiError) return err.message;
  const e = err as AxiosError<{ message?: string | string[] }>;
  const msg = e?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (msg) return msg;
  if (e?.code === "ERR_NETWORK") return "Can't reach the server. Is the backend running?";
  return fallback;
}

// ---- GraphQL ----
export async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
  retried = false
): Promise<T> {
  const { data } = await api.post("/graphql", { query, variables });
  if (data.errors?.length) {
    const first = data.errors[0];
    const code = first.extensions?.code as string | undefined;
    if (code === "UNAUTHENTICATED" && !retried) {
      const token = await refreshSession();
      if (token) return gql<T>(query, variables, true);
    }
    throw new ApiError(first.message, code);
  }
  return data.data as T;
}

// ---- Auth (REST) ----
export async function login(email: string, password: string) {
  const { data } = await api.post<MemberAuthResponse>("/member/login", {
    memberEmail: email,
    memberPassword: password,
  });
  return {
    user: memberToUser(data.member),
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
}

export async function register(payload: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  role: "patient" | "doctor" | "hospital_admin";
}) {
  if (payload.role === "doctor") {
    throw new ApiError(
      "Doctor accounts must be linked to an approved clinic and aren't supported by this form yet."
    );
  }
  const memberType = payload.role === "hospital_admin" ? "CLINIC" : "USER";
  const phone = payload.phone.replace(/\s+/g, "");
  const { data } = await api.post<MemberAuthResponse>("/member/signup", {
    memberEmail: payload.email,
    memberPassword: payload.password,
    memberPhone: phone.startsWith("+") ? phone : `+${phone}`,
    memberNick: payload.email.split("@")[0].slice(0, 40).padEnd(2, "_"),
    memberType,
    memberFullName: payload.fullName,
    ...(memberType === "CLINIC" ? { clinicName: payload.fullName } : {}),
  });
  return {
    user: memberToUser(data.member, payload.phone),
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
}

// ---- Member (GraphQL) ----
const MEMBER_FIELDS = `_id memberType memberStatus memberNick memberFullName memberImage
  memberAddress memberDesc clinicId clinicName clinicTimezone doctorClinicStatus doctorSpecializations`;

export async function getMember(id: string) {
  const data = await gql<{ getMember: Member }>(
    `query ($id: ID!) { getMember(id: $id) { ${MEMBER_FIELDS} } }`,
    { id }
  );
  return data.getMember;
}

export async function getClinics() {
  const data = await gql<{ getClinics: Member[] }>(`query { getClinics { ${MEMBER_FIELDS} } }`);
  return data.getClinics;
}

export async function getClinicDoctors(clinicId: string) {
  const data = await gql<{ getClinicDoctors: Member[] }>(
    `query ($clinicId: ID!) { getClinicDoctors(clinicId: $clinicId) { ${MEMBER_FIELDS} } }`,
    { clinicId }
  );
  return data.getClinicDoctors;
}

// ---- Appointment (GraphQL) ----
const APPOINTMENT_FIELDS = `_id doctorId clinicId patientId startsAt endsAt durationMinutes status
  canceledAt createdAt updatedAt
  doctorChangeRequest { type status reason proposedStartsAt proposedEndsAt }`;

export async function getAppointment(id: string) {
  const data = await gql<{ getAppointment: AppointmentRecord }>(
    `query ($id: ID!) { getAppointment(id: $id) { ${APPOINTMENT_FIELDS} } }`,
    { id }
  );
  return data.getAppointment;
}

export async function getMyAppointments() {
  const data = await gql<{ myAppointments: AppointmentRecord[] }>(
    `query { myAppointments { ${APPOINTMENT_FIELDS} } }`
  );
  return data.myAppointments;
}

export async function bookAppointment(input: {
  doctorId: string;
  clinicId: string;
  startsAt: string;
}) {
  const data = await gql<{ bookAppointment: AppointmentRecord }>(
    `mutation ($input: BookAppointmentInput!) { bookAppointment(input: $input) { ${APPOINTMENT_FIELDS} } }`,
    { input }
  );
  return data.bookAppointment;
}

// ---- Health (REST) ----
export async function getHealth() {
  const { data } = await bare.get<{ status: string; database?: string }>("/health/ready", {
    validateStatus: () => true,
  });
  return data;
}
