import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // What the SERVER found when it last checked this patient's clinic records
  // (on login, and again every time the portal is opened with a saved
  // session): { hasRecords, recordCount, linkedRecords, message }.
  // `linkedRecords` is true only when that check just linked a clinic record
  // to this account — the patient dashboard uses it to show a one-time notice.
  const [sessionInfo, setSessionInfo] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("cds_user");
    const token = localStorage.getItem("cds_token");
    if (!(stored && token)) {
      setLoading(false);
      return;
    }
    setUser(JSON.parse(stored));

    // Don't just trust the saved session: ask the server again. It confirms
    // the account is still valid and re-checks the patient's records, so
    // someone who stays logged in for days still picks up records the clinic
    // added in the meantime. A 401 means the token/account is no longer
    // good, so log out; any other failure (e.g. server briefly offline)
    // keeps the saved session as-is.
    api
      .get("/auth/me")
      .then((data) => {
        localStorage.setItem("cds_user", JSON.stringify(data.user));
        setUser(data.user);
        setSessionInfo(data.session || null);
      })
      .catch((err) => {
        if (err.status === 401) {
          localStorage.removeItem("cds_token");
          localStorage.removeItem("cds_user");
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const data = await api.post("/auth/login", { email, password });
    localStorage.setItem("cds_token", data.token);
    localStorage.setItem("cds_user", JSON.stringify(data.user));
    setUser(data.user);
    // The server re-checked this patient's clinic records during login.
    setSessionInfo(data.session || null);
    return data.user;
  }

  async function register(payload) {
    const data = await api.post("/auth/register", payload);
    // A doctor sign-up doesn't get logged in immediately — the account
    // still needs admin confirmation, so the backend replies with
    // { pending: true, message } instead of a token/user. Don't try to
    // start a session in that case.
    if (data.pending) return data;
    localStorage.setItem("cds_token", data.token);
    localStorage.setItem("cds_user", JSON.stringify(data.user));
    setUser(data.user);
    setSessionInfo(null);
    // Return the full response (not just the user) so the Signup page can
    // tell the patient whether they were matched to existing dental
    // records on file or are starting with a clean slate.
    return data;
  }

  function logout() {
    localStorage.removeItem("cds_token");
    localStorage.removeItem("cds_user");
    setUser(null);
    setSessionInfo(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, sessionInfo, setSessionInfo, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}