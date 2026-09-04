import { createContext, useContext, useState, type ReactNode } from "react";
import { api } from "../lib/api";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  merchantId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  demoLogin: () => Promise<void>;
  register: (name: string, email: string, password: string, merchantName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem("merqora-user");
    return stored ? JSON.parse(stored) : null;
  });

  function persist(token: string, user: AuthUser) {
    localStorage.setItem("merqora-token", token);
    localStorage.setItem("merqora-user", JSON.stringify(user));
    setUser(user);
  }

  async function login(email: string, password: string) {
    const { data } = await api.post("/auth/login", { email, password });
    persist(data.token, data.user);
  }

  async function demoLogin() {
    const { data } = await api.post("/auth/demo-login");
    persist(data.token, data.user);
  }

  async function register(name: string, email: string, password: string, merchantName: string) {
    const { data } = await api.post("/auth/register", { name, email, password, merchantName });
    persist(data.token, data.user);
  }

  function logout() {
    localStorage.removeItem("merqora-token");
    localStorage.removeItem("merqora-user");
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, demoLogin, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
