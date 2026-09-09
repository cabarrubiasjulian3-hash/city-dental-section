import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "./Modal";
import { useAuth } from "../context/AuthContext";

export default function LoginModal({ isOpen, onClose, onSwitchToSignup, onForgotPassword }) {
  const [remember, setRemember] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await login(email, password);
      onClose();
      navigate(user.role === "admin" ? "/admin" : "/patient");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="font-display text-xl font-bold text-ink-900 mb-6">Log in</h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

        <div>
          <label className="block text-sm font-semibold text-ink-900 mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-[#c9c9c9] rounded-lg px-3 py-2 outline-none focus:border-forest-700"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink-900 mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-[#c9c9c9] rounded-lg px-3 py-2 outline-none focus:border-forest-700"
          />
        </div>

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-ink-900">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4"
            />
            Remember me
          </label>
          <button type="button" onClick={onForgotPassword} className="text-red-500 hover:underline">
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-[#859336] hover:bg-[#6f7c2c] text-white font-semibold rounded-full py-3 transition-colors disabled:opacity-60"
        >
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="text-center text-sm text-ink-900 mt-5">
        Do not have account?{" "}
        <button type="button" onClick={onSwitchToSignup} className="text-red-500 hover:underline font-medium">
          SignUp Now
        </button>
      </p>
    </Modal>
  );
}