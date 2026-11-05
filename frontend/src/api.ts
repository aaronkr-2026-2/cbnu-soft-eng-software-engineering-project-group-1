import axios from "axios";

const API_URL = "http://localhost:3333";

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const MOCK_AUTH = true;

export async function login(email: string, password: string) {
  return api.post("/member/login", {
    email,
    password,
  });
}

export async function mockLogin(email: string) {
  return Promise.resolve({
    data: {
      user: {
        id: "mock-user-1",
        email,
        name: "Mock User",
      },
      accessToken: "mock-access-token",
    },
  });
}
