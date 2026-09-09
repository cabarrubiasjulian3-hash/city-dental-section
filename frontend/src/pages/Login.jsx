import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
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
      navigate(user.role === "admin" ? "/admin" : "/patient");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <span className="text-2xl">🦷</span>
          <span className="font-display font-bold text-forest-900">City Dental Section</span>
        </Link>
        <div className="bg-cream-50 border border-cream-200 rounded-2xl p-8">
          <h1 className="font-display text-xl font-semibold text-forest-950 mb-1">Welcome back</h1>
          <p className="text-sm text-forest-700 mb-6">Log in to manage your appointments and records.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-forest-900">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm outline-none focus:border-forest-700"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-forest-900">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm outline-none focus:border-forest-700"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-forest-900 text-cream-50 font-semibold rounded-full py-2.5 hover:bg-forest-800 transition-colors disabled:opacity-60"
            >
              {busy ? "Logging in…" : "Log in"}
            </button>
          </form>

          <p className="text-sm text-forest-700 mt-6 text-center">
            Don't have an account?{" "}
            <Link to="/signup" className="font-medium text-forest-900 underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
