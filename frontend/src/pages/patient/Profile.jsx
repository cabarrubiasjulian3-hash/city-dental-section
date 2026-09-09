import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Card, EmptyState } from "../../components/ui";

export default function PatientProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  function load() {
    api.get(`/patients/${user.id}`).then(setProfile).catch((err) => setError(err.message));
  }
  useEffect(load, [user.id]);

  const rows = profile
    ? [
        { label: "Full name", value: profile.name },
        { label: "Email", value: profile.email },
        { label: "Birthdate", value: profile.birthdate || "—" },
        { label: "Age", value: profile.age ?? "—" },
        { label: "Sex", value: profile.sex || "—" },
        { label: "Barangay", value: profile.barangay || "—" },
        { label: "Address", value: profile.address || "—" },
        { label: "Occupation", value: profile.occupation || "—" },
        { label: "Pregnant", value: profile.is_pregnant ? "Yes" : "No" },
        { label: "Senior citizen", value: profile.is_senior_citizen ? "Yes" : "No" },
        { label: "PWD", value: profile.is_pwd ? "Yes" : "No" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-forest-950">My Profile</h2>
        <p className="text-sm text-forest-700 mt-1">
          This is on file with the clinic. It's view-only here — if anything needs to be corrected or updated
          (name, birthdate, barangay, address, occupation, or pregnant/senior/PWD status), please let the front
          desk or admin staff know and they'll update it for you.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card title="Personal information">
        {profile ? (
          <table className="w-full text-sm max-w-xl">
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-cream-200">
                  <td className="py-2 pr-4 text-forest-700 font-medium whitespace-nowrap w-40">{row.label}</td>
                  <td className="py-2 text-forest-950">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState>Loading…</EmptyState>
        )}
      </Card>
    </div>
  );
}
