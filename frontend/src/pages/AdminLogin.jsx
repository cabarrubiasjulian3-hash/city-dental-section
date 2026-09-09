import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminLogin() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await login(email, password);
      if (user.role !== "admin") {
        setError("This account is not an admin account.");
        setBusy(false);
        return;
      }
      navigate("/admin");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-forest-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <span className="text-2xl">🦷</span>
          <span className="font-display font-bold text-cream-50">City Dental Section</span>
        </Link>
        <div className="bg-forest-900 border border-forest-700 rounded-2xl p-8">
          <h1 className="font-display text-xl font-semibold text-cream-50 mb-1">Admin Portal</h1>
          <p className="text-sm text-cream-100/70 mb-6">Restricted access for clinic staff and administrators.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-cream-100">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-forest-700 bg-forest-950 text-cream-50 px-3 py-2 text-sm outline-none focus:border-clay-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-cream-100">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-forest-700 bg-forest-950 text-cream-50 px-3 py-2 text-sm outline-none focus:border-clay-500"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-clay-500 text-forest-950 font-semibold rounded-full py-2.5 hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {busy ? "Logging in…" : "Log in to Admin Portal"}
            </button>
          </form>
          <p className="text-xs text-cream-100/50 mt-6 text-center">
            Demo credentials: admin@citydental.gov.ph / Admin123!
          </p>
        </div>
      </div>
    </div>
  );
}
