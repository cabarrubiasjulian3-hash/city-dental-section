import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "./Modal";
import { useAuth } from "../context/AuthContext";

export default function AdminLoginModal({ isOpen, onClose }) {
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
      onClose();
      navigate("/admin");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="font-display text-xl font-bold text-ink-900 mb-1">Admin Portal</h2>
      <p className="text-sm text-forest-700 mb-6">Restricted access for clinic staff and administrators.</p>

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

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-[#859336] hover:bg-[#6f7c2c] active:bg-[#5c6624] text-white font-semibold rounded-full py-3 transition-colors disabled:opacity-60"
        >
          {busy ? "Logging in…" : "Log in to Admin Portal"}
        </button>
      </form>
    </Modal>
  );
}