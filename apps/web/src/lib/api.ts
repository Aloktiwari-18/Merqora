import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const api = axios.create({ baseURL: `${API_URL}/api` });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("merqora-token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("merqora-token");
      localStorage.removeItem("merqora-user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export function generateIdempotencyKey() {
  return `idem_${crypto.randomUUID()}`;
}

export function formatPaise(paise: number | undefined | null): string {
  if (paise === undefined || paise === null) return "₹0";
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function extractErrorMessage(err: unknown): string {
  const anyErr = err as any;
  return anyErr?.response?.data?.error?.message || anyErr?.message || "Something went wrong. Please try again.";
}
