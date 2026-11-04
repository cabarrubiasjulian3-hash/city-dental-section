import { useEffect, useState } from "react";
import { Briefcase, CalendarDays, Check, Info, Mail, MapPin, User, X } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { EmptyState } from "../../components/ui";

// "Cabarrubias, Julian Keyh A." -> "Julian Keyh"
function firstNameOf(full) {
  if (!full) return "";
  const afterComma = full.includes(",") ? full.split(",").slice(1).join(",") : full;
  const parts = afterComma.trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && /^[A-Za-z]\.?$/.test(parts[parts.length - 1])) parts.pop();
  return parts.join(" ");
}

// A titled card whose rows each have an icon. Rises in, lifts on hover.
function InfoCard({ title, icon: Icon, delay = 0, rows, className = "" }) {
  return (
    <div
      className={`pf-rise pf-card rounded-2xl border border-cream-200 bg-cream-50 p-5 ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <h3 className="mb-4 flex items-center gap-2.5 font-display text-base font-bold text-forest-950">
        <span className="pf-ico flex h-8 w-8 items-center justify-center rounded-lg bg-leaf-300/50 text-forest-900">
          <Icon size={17} />
        </span>
        {title}
      </h3>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className="pf-rise pf-row flex items-center gap-3 rounded-xl bg-cream-100 px-3 py-2.5"
            style={{ animationDelay: `${delay + 90 + i * 60}ms` }}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cream-200 text-forest-700">
              <r.icon size={15} />
            </span>
            <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-forest-600">{r.label}</span>
            <span className="min-w-0 flex-1 break-words text-sm font-medium text-forest-950">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PatientProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  function load() {
    api.get(`/patients/${user.id}`).then(setProfile).catch((err) => setError(err.message));
  }
  useEffect(load, [user.id]);

  const displayName = firstNameOf(profile?.name || user?.name);
  const initial = (displayName || profile?.name || "?")[0];

  // The three flags the clinic keeps on file — shown as on/off tiles.
  const flags = profile
    ? [
        { label: "Pregnant", on: !!profile.is_pregnant, color: "#c8694b" },
        { label: "Senior citizen", on: !!profile.is_senior_citizen, color: "#5b86a8" },
        { label: "PWD", on: !!profile.is_pwd, color: "#8e6b8f" },
      ]
    : [];
  const activeFlags = flags.filter((f) => f.on);

  const personal = profile
    ? [
        { icon: User, label: "Full name", value: profile.name },
        { icon: CalendarDays, label: "Birthdate", value: profile.birthdate || "—" },
        { icon: User, label: "Age", value: profile.age ?? "—" },
        { icon: User, label: "Sex", value: profile.sex || "—" },
        ...(profile.gender ? [{ icon: User, label: "Gender", value: profile.gender === "Others" && profile.gender_other ? profile.gender_other : profile.gender }] : []),
        { icon: Briefcase, label: "Occupation", value: profile.occupation || "—" },
      ]
    : [];

  const contact = profile
    ? [
        { icon: Mail, label: "Email", value: profile.email || "—" },
        { icon: MapPin, label: "Barangay", value: profile.barangay || "—" },
        { icon: MapPin, label: "Address", value: profile.address || "—" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes pf-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes pf-pop { 0% { transform: scale(0.5) rotate(-10deg); opacity: 0; } 70% { transform: scale(1.1) rotate(3deg); } 100% { transform: none; opacity: 1; } }
        @keyframes pf-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .pf-rise { animation: pf-rise 0.55s cubic-bezier(.2,.8,.2,1) both; }
        .pf-pop { animation: pf-pop 0.6s cubic-bezier(.2,.8,.2,1) both; }
        .pf-float { animation: pf-float 6s ease-in-out infinite; }
        .pf-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .pf-card:hover { transform: translateY(-3px); box-shadow: 0 10px 24px rgb(37 53 34 / 0.1); }
        .pf-card:hover .pf-ico { transform: scale(1.1) rotate(-6deg); }
        .pf-ico { transition: transform 0.2s ease; }
        .pf-row { transition: background-color 0.15s ease, transform 0.15s ease; }
        .pf-row:hover { background-color: rgb(0 0 0 / 0.035); transform: translateX(3px); }
        @media (prefers-reduced-motion: reduce) { .pf-rise, .pf-pop, .pf-float { animation: none !important; } .pf-card, .pf-row, .pf-ico { transition: none !important; } }
        .cds-reduce-motion .pf-rise, .cds-reduce-motion .pf-pop, .cds-reduce-motion .pf-float { animation: none !important; }
        .cds-reduce-motion .pf-card, .cds-reduce-motion .pf-row, .cds-reduce-motion .pf-ico { transition: none !important; }
      `}</style>

      <div>
        <h2 className="font-display text-2xl font-bold text-forest-950">My Profile</h2>
        <p className="mt-1 text-sm text-forest-700">Your information on file with the clinic.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!profile && !error && <EmptyState>Loading…</EmptyState>}

      {profile && (
        <>
          {/* ---------- Banner ---------- */}
          <div className="pf-rise relative overflow-hidden rounded-3xl bg-[#26401e] px-6 py-7 text-[#ebebc2] sm:px-8">
            <span className="pf-float pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-leaf-300/10" />
            <span className="pf-float pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-leaf-300/10" style={{ animationDelay: "1.5s" }} />
            <div className="relative flex flex-wrap items-center gap-5">
              <div className="pf-pop flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-leaf-300 font-display text-4xl font-extrabold text-brand-900">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-2xl font-bold sm:text-3xl">{profile.name}</h3>
                {profile.email && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[#ebebc2]/80">
                    <Mail size={14} /> <span className="truncate">{profile.email}</span>
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.age != null && (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{profile.age} years old</span>
                  )}
                  {profile.sex && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{profile.sex}</span>}
                  {profile.barangay && (
                    <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
                      <MapPin size={12} /> {profile.barangay}
                    </span>
                  )}
                  {activeFlags.map((f) => (
                    <span key={f.label} className="rounded-full bg-[#d9ab4b] px-3 py-1 text-xs font-bold text-forest-950">
                      {f.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ---------- Details ---------- */}
          <div className="grid gap-6 lg:grid-cols-2">
            <InfoCard title="Personal information" icon={User} delay={120} rows={personal} />
            <div className="space-y-6">
              <InfoCard title="Contact & address" icon={MapPin} delay={200} rows={contact} />

              <div className="pf-rise pf-card rounded-2xl border border-cream-200 bg-cream-50 p-5" style={{ animationDelay: "300ms" }}>
                <h3 className="mb-4 flex items-center gap-2.5 font-display text-base font-bold text-forest-950">
                  <span className="pf-ico flex h-8 w-8 items-center justify-center rounded-lg bg-leaf-300/50 text-forest-900">
                    <Check size={17} />
                  </span>
                  Special status
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {flags.map((f, i) => (
                    <div
                      key={f.label}
                      className="pf-rise pf-row flex flex-col items-center gap-2 rounded-xl bg-cream-100 px-2 py-3 text-center"
                      style={{ animationDelay: `${380 + i * 80}ms` }}
                    >
                      <span
                        className="pf-pop flex h-9 w-9 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: f.on ? f.color : "rgb(0 0 0 / 0.07)",
                          color: f.on ? "#fff" : "#7a8a74",
                          animationDelay: `${450 + i * 80}ms`,
                        }}
                      >
                        {f.on ? <Check size={17} /> : <X size={17} />}
                      </span>
                      <span className="text-xs font-semibold text-forest-950">{f.label}</span>
                      <span className="text-[11px] text-forest-600">{f.on ? "Yes" : "No"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ---------- How to update ---------- */}
          <div
            className="pf-rise flex items-start gap-3 rounded-2xl border border-cream-200 bg-leaf-300/20 px-5 py-4 text-sm text-forest-800"
            style={{ animationDelay: "500ms" }}
          >
            <Info size={18} className="mt-0.5 shrink-0 text-forest-700" />
            <p>
              This page is <span className="font-semibold">view-only</span>. If anything needs to be corrected or updated (name,
              birthdate, barangay, address, occupation, or pregnant/senior/PWD status), please let the front desk or admin staff
              know and they'll update it for you.
            </p>
          </div>
        </>
      )}
    </div>
  );
}