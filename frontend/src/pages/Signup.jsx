import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { TAYABAS_BARANGAYS } from "../lib/barangays";
import { composeFullName } from "../lib/name";
import RoleToggle from "../components/RoleToggle";

const EMPTY_DOCTOR_FORM = { name: "", email: "", password: "", confirmPassword: "", accessCode: "" };

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState("patient");
  const [form, setForm] = useState({
    surname: "",
    first_name: "",
    middle_name: "",
    email: "",
    password: "",
    confirmPassword: "",
    birthdate: "",
    sex: "",
    address: "",
    barangay: "",
    occupation: "",
    is_pregnant: false,
    is_pwd: false,
  });
  const [doctorForm, setDoctorForm] = useState(EMPTY_DOCTOR_FORM);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [doctorPendingMessage, setDoctorPendingMessage] = useState("");

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }
  function updateDoctor(field) {
    return (e) => setDoctorForm((f) => ({ ...f, [field]: e.target.value }));
  }
  function switchRole(next) {
    setRole(next);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // Confirm-password check happens client-side, before we ever hit the
    // API — the backend only ever receives one password field, so there's
    // nothing for it to compare and this has to be caught here.
    const activePassword = role === "doctor" ? doctorForm.password : form.password;
    const activeConfirm = role === "doctor" ? doctorForm.confirmPassword : form.confirmPassword;
    if (activePassword !== activeConfirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      if (role === "doctor") {
        // confirmPassword is only for the client-side check above — strip it
        // out so it's never sent to the API.
        const { confirmPassword, ...doctorPayload } = doctorForm;
        const result = await register({ ...doctorPayload, role: "doctor" });
        setDoctorPendingMessage(result.message);
        return;
      }
      const { confirmPassword, ...patientForm } = form;
      const result = await register({ ...patientForm, name: composeFullName(patientForm) });
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
    <div className="min-h-screen bg-cream-100 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <span className="text-2xl">🦷</span>
          <span className="font-display font-bold text-forest-900">City Dental Section</span>
        </Link>
        <div className="bg-cream-50 border border-cream-200 rounded-2xl p-8">
          {doctorPendingMessage ? (
            <>
              <h1 className="font-display text-xl font-semibold text-forest-950 mb-1">Account created</h1>
              <p className="text-sm text-forest-700 mb-6">{doctorPendingMessage}</p>
              <Link
                to="/login"
                className="block text-center w-full bg-forest-900 text-cream-50 font-semibold rounded-full py-2.5 hover:bg-forest-800 transition-colors"
              >
                Back to log in
              </Link>
            </>
          ) : (
            <>
              <h1 className="font-display text-xl font-semibold text-forest-950 mb-1">
                {role === "doctor" ? "Create your doctor account" : "Create your patient account"}
              </h1>
              <p className="text-sm text-forest-700 mb-6">
                {role === "doctor"
                  ? "You'll need an access code from the City Dental Section admin. After signing up, an admin still needs to confirm your account before you can log in."
                  : "Sign up to view your dental records and your barangay's mission schedule. We'll check your name and barangay against the clinic's records — if you've already had a visit, your existing history will show up automatically; if not, your portal will simply start empty until your first visit is logged."}
              </p>

              <RoleToggle value={role} onChange={switchRole} />

              {role === "doctor" ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Field label="Full Name" required value={doctorForm.name} onChange={updateDoctor("name")} />
                  <Field label="Email" type="email" required value={doctorForm.email} onChange={updateDoctor("email")} />
                  <Field label="Create Password" type="password" required value={doctorForm.password} onChange={updateDoctor("password")} />
                  <Field
                    label="Confirm Password"
                    type="password"
                    required
                    value={doctorForm.confirmPassword}
                    onChange={updateDoctor("confirmPassword")}
                  />
                  <Field
                    label="Access Code (from the clinic admin)"
                    required
                    value={doctorForm.accessCode}
                    onChange={updateDoctor("accessCode")}
                    placeholder="e.g. K3F7-QX2M"
                  />
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full bg-forest-900 text-cream-50 font-semibold rounded-full py-2.5 hover:bg-forest-800 transition-colors disabled:opacity-60"
                  >
                    {busy ? "Creating account…" : "Create account"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSubmit} className="grid sm:grid-cols-2 gap-4">
                  <Field label="Surname" required value={form.surname} onChange={update("surname")} />
                  <Field label="First Name" required value={form.first_name} onChange={update("first_name")} />
                  <Field
                    label="Middle Name (optional — pwede middle initial lang)"
                    placeholder="D. o Dela Cruz"
                    value={form.middle_name}
                    onChange={update("middle_name")}
                    className="sm:col-span-2"
                  />
                  <Field label="Email" type="email" required value={form.email} onChange={update("email")} className="sm:col-span-2" />
                  <Field label="Create Password" type="password" required value={form.password} onChange={update("password")} />
                  <Field
                    label="Confirm Password"
                    type="password"
                    required
                    value={form.confirmPassword}
                    onChange={update("confirmPassword")}
                  />
                  <Field label="Birthdate" type="date" value={form.birthdate} onChange={update("birthdate")} />
                  <div>
                    <label className="text-sm font-medium text-forest-900">Sex</label>
                    <select
                      value={form.sex}
                      onChange={update("sex")}
                      className="mt-1 w-full rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm outline-none focus:border-forest-700"
                    >
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <Field label="Address" value={form.address} onChange={update("address")} className="sm:col-span-2" />
                  <div>
                    <label className="text-sm font-medium text-forest-900">Barangay</label>
                    <input
                      list="barangay-options"
                      value={form.barangay}
                      onChange={update("barangay")}
                      placeholder="e.g. Camayasa"
                      className="mt-1 w-full rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm outline-none focus:border-forest-700"
                    />
                    <datalist id="barangay-options">
                      {TAYABAS_BARANGAYS.map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                  </div>
                  <Field label="Occupation" value={form.occupation} onChange={update("occupation")} />

                  <label className="sm:col-span-2 flex items-center gap-2 text-sm text-forest-900">
                    <input
                      type="checkbox"
                      checked={form.is_pregnant}
                      onChange={(e) => setForm((f) => ({ ...f, is_pregnant: e.target.checked }))}
                      className="rounded border-cream-200"
                    />
                    I am currently pregnant
                  </label>

                  <label className="sm:col-span-2 flex items-center gap-2 text-sm text-forest-900">
                    <input
                      type="checkbox"
                      checked={form.is_pwd}
                      onChange={(e) => setForm((f) => ({ ...f, is_pwd: e.target.checked }))}
                      className="rounded border-cream-200"
                    />
                    I am a Person with Disability (PWD)
                  </label>

                  {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
                  <button
                    type="submit"
                    disabled={busy}
                    className="sm:col-span-2 bg-forest-900 text-cream-50 font-semibold rounded-full py-2.5 hover:bg-forest-800 transition-colors disabled:opacity-60"
                  >
                    {busy ? "Creating account…" : "Create account"}
                  </button>
                </form>
              )}

              <p className="text-sm text-forest-700 mt-6 text-center">
                Already have an account?{" "}
                <Link to="/login" className="font-medium text-forest-900 underline">
                  Log in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, className = "", ...props }) {
  return (
    <div className={className}>
      <label className="text-sm font-medium text-forest-900">{label}</label>
      <input
        {...props}
        className="mt-1 w-full rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm outline-none focus:border-forest-700"
      />
    </div>
  );
}