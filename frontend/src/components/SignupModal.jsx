import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "./Modal";
import { useAuth } from "../context/AuthContext";
import { TAYABAS_BARANGAYS } from "../lib/barangays";
import { composeFullName } from "../lib/name";

export default function SignupModal({ isOpen, onClose, onSwitchToLogin }) {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    surname: "",
    first_name: "",
    middle_name: "",
    email: "",
    password: "",
    birthdate: "",
    sex: "",
    address: "",
    barangay: "",
    occupation: "",
    is_pregnant: false,
    is_pwd: false,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      // Same composeFullName() the admin's New Patient Record form uses, so
      // the name we submit is byte-for-byte the same format the clinic's
      // existing records are stored in — that's what lets the backend
      // auto-match this signup to a record the front desk already logged.
      const result = await register({ ...form, name: composeFullName(form) });
      onClose();
      navigate("/patient", {
        state: { welcome: { matched: result.matched, message: result.message } },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} wide>
      <h2 className="font-display text-xl font-bold text-ink-900 mb-1">Create your patient account</h2>
      <p className="text-sm text-forest-700 mb-6">
        Sign up to view your dental records and your barangay's mission schedule. We'll check your name and
        barangay against the clinic's records — if you've already had a visit, your existing history will show
        up automatically; if not, your portal will simply start empty until your first visit is logged.
      </p>

      <form onSubmit={handleSubmit} className="grid sm:grid-cols-2 gap-4">
        <ModalField label="Surname" required value={form.surname} onChange={update("surname")} />
        <ModalField label="First Name" required value={form.first_name} onChange={update("first_name")} />
        <ModalField
          label="Middle Name (optional — pwede middle initial lang)"
          placeholder="D. o Dela Cruz"
          value={form.middle_name}
          onChange={update("middle_name")}
          className="sm:col-span-2"
        />
        <ModalField label="Email" type="email" required value={form.email} onChange={update("email")} className="sm:col-span-2" />
        <ModalField label="Password" type="password" required value={form.password} onChange={update("password")} className="sm:col-span-2" />
        <ModalField label="Birthdate" type="date" value={form.birthdate} onChange={update("birthdate")} />

        <div>
          <label className="block text-sm font-semibold text-ink-900 mb-1">Sex</label>
          <select
            value={form.sex}
            onChange={update("sex")}
            className="w-full border border-[#c9c9c9] rounded-lg px-3 py-2 outline-none focus:border-forest-700"
          >
            <option value="">Select</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>

        <ModalField label="Address" value={form.address} onChange={update("address")} className="sm:col-span-2" />

        <div>
          <label className="block text-sm font-semibold text-ink-900 mb-1">Barangay</label>
          <input
            list="barangay-options-modal"
            value={form.barangay}
            onChange={update("barangay")}
            placeholder="e.g. Camayasa"
            className="w-full border border-[#c9c9c9] rounded-lg px-3 py-2 outline-none focus:border-forest-700"
          />
          <datalist id="barangay-options-modal">
            {TAYABAS_BARANGAYS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>

        <ModalField label="Occupation" value={form.occupation} onChange={update("occupation")} />

        <label className="sm:col-span-2 flex items-center gap-2 text-sm text-ink-900">
          <input
            type="checkbox"
            checked={form.is_pregnant}
            onChange={(e) => setForm((f) => ({ ...f, is_pregnant: e.target.checked }))}
            className="w-4 h-4"
          />
          I am currently pregnant
        </label>

        <label className="sm:col-span-2 flex items-center gap-2 text-sm text-ink-900">
          <input
            type="checkbox"
            checked={form.is_pwd}
            onChange={(e) => setForm((f) => ({ ...f, is_pwd: e.target.checked }))}
            className="w-4 h-4"
          />
          I am a Person with Disability (PWD)
        </label>

        {error && <div className="sm:col-span-2 bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

        <button
          type="submit"
          disabled={busy}
          className="sm:col-span-2 bg-[#859336] hover:bg-[#6f7c2c] active:bg-[#5c6624] text-white font-semibold rounded-full py-3 transition-colors disabled:opacity-60"
        >
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-ink-900 mt-5">
        Already have an account?{" "}
        <button type="button" onClick={onSwitchToLogin} className="text-red-500 hover:underline font-medium">
          Log in
        </button>
      </p>
    </Modal>
  );
}

function ModalField({ label, className = "", ...props }) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-ink-900 mb-1">{label}</label>
      <input
        {...props}
        className="w-full border border-[#c9c9c9] rounded-lg px-3 py-2 outline-none focus:border-forest-700"
      />
    </div>
  );
}