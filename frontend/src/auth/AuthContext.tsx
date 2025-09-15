import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { apiFetch } from "../lib/api";
import type { User } from "./types";

type AuthContextType = {
  authed: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  authed: false,
  user: null,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const authed = !!user;

  useEffect(() => {
    const access = localStorage.getItem("access_token");
    const cachedUser = localStorage.getItem("user");
    if (access && cachedUser) {
      try {
        setUser(JSON.parse(cachedUser));
      } catch {
        localStorage.removeItem("user");
      }
      apiFetch("/auth/me", { auth: true }).then(async (r) => {
        if (r.ok) {
          const fresh = (await r.json()) as User;
          setUser(fresh);
          localStorage.setItem("user", JSON.stringify(fresh));
        } else {
          //   localStorage.removeItem("access_token");
          //   localStorage.removeItem("refresh_token");
          //   localStorage.removeItem("user");
          setUser(null);
        }
      });
    }
  }, []);

  const login = async (email: string, password: string) => {
    if (!email || !password) throw new Error("Email and password are required");

    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      let message = "Login failed";
      try {
        const data = await res.json();
        message = data?.detail || data?.error || JSON.stringify(data);
      } catch {}
      throw new Error(message);
    }

    const data = await res.json();
    const { access, refresh, user } = data;

    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", refresh);
    localStorage.setItem("user", JSON.stringify(user));
    setUser(user);
  };

  const logout = async () => {
    const refresh = localStorage.getItem("refresh_token");
    const access = localStorage.getItem("access_token");

    if (access && refresh) {
      await apiFetch("/auth/logout", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ refresh }),
      }).catch(() => {});
    }

    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    setUser(null);
  };

  const value = useMemo(
    () => ({ authed, user, login, logout }),
    [authed, user]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
