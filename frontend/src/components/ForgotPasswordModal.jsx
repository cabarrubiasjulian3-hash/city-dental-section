import { useState } from "react";
import Modal from "./Modal";
import { api } from "../lib/api";

const STEP = {
  EMAIL: "email",
  METHOD: "method",
  CODE: "code",
  NEW_PASSWORD: "new_password",
  DONE: "done",
};

export default function ForgotPasswordModal({ isOpen, onClose }) {
  const [step, setStep] = useState(STEP.EMAIL);
  const [email, setEmail] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setStep(STEP.EMAIL);
    setEmail("");
    setMaskedEmail("");
    setCode("");
    setResetToken("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleEmailSubmit(e) {
    e.preventDefault();
    if (!email) return;
    setMaskedEmail(email.replace(/^(.{2}).+(@.+)$/, "$1***$2"));
    setStep(STEP.METHOD);
  }

  async function handleChooseEmail() {
    setLoading(true);
    setError("");
    try {
      const data = await api.post("/auth/forgot-password/request", { email });
      if (data.maskedEmail) setMaskedEmail(data.maskedEmail);
      setStep(STEP.CODE);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api.post("/auth/forgot-password/verify", { email, code });
      setResetToken(data.resetToken);
      setStep(STEP.NEW_PASSWORD);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/forgot-password/reset", { resetToken, newPassword });
      setStep(STEP.DONE);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2 mb-4">{error}</div>}

      {step === STEP.EMAIL && (
        <>
          <h2 className="font-display text-xl font-bold text-ink-900 mb-2">Recover your account</h2>
          <p className="text-sm text-forest-700 mb-6">Enter the email associated with your account.</p>
          <form onSubmit={handleEmailSubmit} className="space-y-5">
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
            <button
              type="submit"
              className="w-full bg-[#859336] hover:bg-[#6f7c2c] text-white font-semibold rounded-full py-3 transition-colors"
            >
              Next
            </button>
          </form>
        </>
      )}

      {step === STEP.METHOD && (
        <>
          <h2 className="font-display text-xl font-bold text-ink-900 mb-2">Choose recovery method</h2>
          <p className="text-sm text-forest-700 mb-6">How do you want to receive your recovery code?</p>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleChooseEmail}
              disabled={loading}
              className="w-full flex items-center gap-3 border border-forest-700 rounded-xl px-4 py-3 text-left hover:bg-forest-50 transition-colors disabled:opacity-60"
            >
              <span className="w-9 h-9 rounded-full bg-forest-800 text-white flex items-center justify-center text-sm shrink-0">
                ✉
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink-900">Email</span>
                <span className="block text-xs text-forest-700">Send code to {maskedEmail}</span>
              </span>
            </button>

            <div className="w-full flex items-center gap-3 border border-[#ddd] rounded-xl px-4 py-3 text-left opacity-50 cursor-not-allowed">
              <span className="w-9 h-9 rounded-full bg-[#999] text-white flex items-center justify-center text-sm shrink-0">
                ☎
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink-900">Phone number</span>
                <span className="block text-xs text-forest-700">Coming soon</span>
              </span>
            </div>

            <div className="w-full flex items-center gap-3 border border-[#ddd] rounded-xl px-4 py-3 text-left opacity-50 cursor-not-allowed">
              <span className="w-9 h-9 rounded-full bg-[#999] text-white flex items-center justify-center text-sm shrink-0">
                ⚿
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink-900">Authenticator app</span>
                <span className="block text-xs text-forest-700">Coming soon</span>
              </span>
            </div>
          </div>

          <button type="button" onClick={() => setStep(STEP.EMAIL)} className="text-sm text-forest-700 hover:underline mt-5">
            ← Back
          </button>
        </>
      )}

      {step === STEP.CODE && (
        <>
          <h2 className="font-display text-xl font-bold text-ink-900 mb-2">Enter your code</h2>
          <p className="text-sm text-forest-700 mb-6">
            We sent a 6-digit code to <span className="font-semibold">{maskedEmail}</span>. It expires in 10 minutes.
          </p>
          <form onSubmit={handleCodeSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-ink-900 mb-1">Recovery code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-full border border-[#c9c9c9] rounded-lg px-3 py-2 text-center text-2xl tracking-[0.5em] outline-none focus:border-forest-700"
                placeholder="------"
              />
            </div>
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full bg-[#859336] hover:bg-[#6f7c2c] text-white font-semibold rounded-full py-3 transition-colors disabled:opacity-60"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
          </form>
          <button type="button" onClick={() => setStep(STEP.METHOD)} className="text-sm text-forest-700 hover:underline mt-5">
            ← Back
          </button>
        </>
      )}

      {step === STEP.NEW_PASSWORD && (
        <>
          <h2 className="font-display text-xl font-bold text-ink-900 mb-2">Set a new password</h2>
          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-ink-900 mb-1">New password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-[#c9c9c9] rounded-lg px-3 py-2 outline-none focus:border-forest-700"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink-900 mb-1">Confirm new password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-[#c9c9c9] rounded-lg px-3 py-2 outline-none focus:border-forest-700"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#859336] hover:bg-[#6f7c2c] text-white font-semibold rounded-full py-3 transition-colors disabled:opacity-60"
            >
              {loading ? "Saving..." : "Save new password"}
            </button>
          </form>
        </>
      )}

      {step === STEP.DONE && (
        <>
          <h2 className="font-display text-xl font-bold text-ink-900 mb-2">Password updated</h2>
          <p className="text-sm text-forest-700 mb-6">You can now log in with your new password.</p>
          <button
            type="button"
            onClick={handleClose}
            className="w-full bg-[#859336] hover:bg-[#6f7c2c] text-white font-semibold rounded-full py-3 transition-colors"
          >
            Close
          </button>
        </>
      )}
    </Modal>
  );
}