import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("cds_user");
    const token = localStorage.getItem("cds_token");
    if (stored && token) {
      setUser(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  async function login(email, password) {
    const data = await api.post("/auth/login", { email, password });
    localStorage.setItem("cds_token", data.token);
    localStorage.setItem("cds_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  async function register(payload) {
    const data = await api.post("/auth/register", payload);
    localStorage.setItem("cds_token", data.token);
    localStorage.setItem("cds_user", JSON.stringify(data.user));
    setUser(data.user);
    // Return the full response (not just the user) so the Signup page can
    // tell the patient whether they were matched to existing dental
    // records on file or are starting with a clean slate.
    return data;
  }

  function logout() {
    localStorage.removeItem("cds_token");
    localStorage.removeItem("cds_user");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
