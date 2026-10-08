import axios from "axios";
import { useAuthStore } from "./auth";

export const api = axios.create({
  baseURL: "http://72.62.195.195:3333",
  headers: { "Content-Type": "application/json" },
});

// Attach the JWT access token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear session and let the router redirect to /login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);

// ---- Auth endpoints ----
export function login(email: string, password: string) {
  return api.post("/login/", { email, password });
}

export function register(payload: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  role: "patient" | "doctor" | "hospital_admin";
}) {
  return api.post("/auth/register", payload);
}

// ==========================================================
// 🔧 MOCK MODE SWITCH
// true  → Login/Register backendsiz ishlaydi (istalgan email/parol o'tkazadi)
// false → haqiqiy backendga ulanadi (/api/v1/auth/login)
// Backend tayyor bo'lganda shu yerda true ni false ga o'zgartiring.
// ==========================================================
export const MOCK_AUTH = false;

function fakeUser(email: string, fullName = "Aziza Karimova") {
  return {
    id: "mock-user-1",
    fullName,
    email,
    phone: "+998 90 123 45 67",
    role: "patient" as const,
  };
}

export function mockLogin(email: string) {
  return new Promise<{
    data: { user: ReturnType<typeof fakeUser>; accessToken: string };
  }>((resolve) => {
    setTimeout(() => {
      resolve({
        data: { user: fakeUser(email), accessToken: "mock-access-token" },
      });
    }, 400); // simulate network latency
  });
}

export function mockRegister(fullName: string, email: string) {
  return new Promise<{
    data: { user: ReturnType<typeof fakeUser>; accessToken: string };
  }>((resolve) => {
    setTimeout(() => {
      resolve({
        data: {
          user: fakeUser(email, fullName),
          accessToken: "mock-access-token",
        },
      });
    }, 400);
  });
}
