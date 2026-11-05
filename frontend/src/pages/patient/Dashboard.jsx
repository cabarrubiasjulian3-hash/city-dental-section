import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Briefcase,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Gauge,
  Info,
  MapPin,
  Stethoscope,
  Thermometer,
  User,
} from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { EmptyState } from "../../components/ui";
import { AnimatedNumber } from "../../components/Charts";

// "Cabarrubias, Julian Keyh A." -> "Julian Keyh" (drops the surname and a trailing middle initial).
function firstNameOf(full) {
  if (!full) return "";
  const afterComma = full.includes(",") ? full.split(",").slice(1).join(",") : full;
  const parts = afterComma.trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && /^[A-Za-z]\.?$/.test(parts[parts.length - 1])) parts.pop();
  return parts.join(" ");
}

function dayDiff(dateStr, todayStr) {
  return Math.round((Date.parse(`${dateStr}T00:00:00Z`) - Date.parse(`${todayStr}T00:00:00Z`)) / 864e5);
}

function whenLabel(diff) {
  if (diff === 0) return "Today!";
  if (diff === 1) return "Tomorrow";
  if (diff > 1) return `In ${diff} days`;
  if (diff === -1) return "Yesterday";
  return `${Math.abs(diff)} days ago`;
}

function monthDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    month: d.toLocaleDateString("en-US", { month: "short" }),
    day: d.getDate(),
    weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
  };
}

// Small shared pieces — a card shell that rises in, and an icon bubble.
function Panel({ title, icon: Icon, action, delay = 0, className = "", children }) {
  return (
    <div className={`pd-rise pd-card rounded-2xl border border-cream-200 bg-cream-50 p-5 ${className}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2.5 font-display text-base font-bold text-forest-950">
          {Icon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-leaf-300/50 text-forest-900">
              <Icon size={17} />
            </span>
          )}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function SeeMore({ to }) {
  return (
    <Link to={to} className="pd-more inline-flex items-center gap-0.5 text-xs font-semibold text-forest-800 hover:text-forest-950">
      See more <ChevronRight size={14} className="pd-more-arrow" />
    </Link>
  );
}

export default function PatientDashboard() {
  const { user, sessionInfo, setSessionInfo } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [records, setRecords] = useState([]);
  // Notice banner. Comes from either:
  //  - sign-up (passed through navigate state), or
  //  - the server's record check on login / when the portal was opened —
  //    only shown when that check just linked a clinic record to this account.
  const [welcome, setWelcome] = useState(location.state?.welcome || null);
  useEffect(() => {
    if (sessionInfo?.linkedRecords && sessionInfo.message) {
      setWelcome({ matched: true, message: sessionInfo.message });
    }
  }, [sessionInfo]);
  function dismissWelcome() {
    setWelcome(null);
    setSessionInfo?.(null);
  }

  useEffect(() => {
    api.get(`/patients/${user.id}`).then(setProfile).catch(() => {});
    api.get("/barangay-schedule").then(setSchedules).catch(() => {});
    api.get("/dental-records").then(setRecords).catch(() => {});
  }, [user.id]);

  const today = new Date().toISOString().slice(0, 10);
  // Soonest date that is today or later (works whatever order the API returns).
  const nextSchedule = useMemo(
    () =>
      schedules
        .filter((s) => s.visit_date >= today)
        .sort((a, b) => a.visit_date.localeCompare(b.visit_date))[0],
    [schedules, today]
  );

  const totalVisits = records.length;
  const extractionCount = records.filter((r) => /extract|bunot|hilas/i.test(r.procedure || "")).length;
  const lastVisit = records[0]?.record_date || null; // records come back sorted DESC by date

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const displayName = firstNameOf(profile?.name || user?.name);
  const missionDiff = nextSchedule ? dayDiff(nextSchedule.visit_date, today) : null;
  const lastVisitDiff = lastVisit ? dayDiff(lastVisit, today) : null;
  const nextDate = nextSchedule ? monthDay(nextSchedule.visit_date) : null;

  const stats = [
    { label: "Total Recorded Visits", value: totalVisits, hint: "Since you started with us", Icon: ClipboardList, color: "#2f6f4f" },
    { label: "Tooth Extractions", value: extractionCount, hint: "Teeth removed so far", Icon: Stethoscope, color: "#c8694b" },
    {
      label: "Last Visit",
      value: lastVisit || "—",
      hint: lastVisitDiff !== null ? whenLabel(lastVisitDiff) : "No visit yet",
      Icon: CalendarDays,
      color: "#5b86a8",
      isDate: true,
    },
  ];

  const vitals = profile?.vitals
    ? [
        { label: "Pulse Rate", value: profile.vitals.pulse_rate ? `${profile.vitals.pulse_rate} bpm` : "—", Icon: Activity, color: "#c8694b" },
        { label: "Blood Pressure", value: profile.vitals.blood_pressure || "—", Icon: Gauge, color: "#5b86a8" },
        { label: "Temperature", value: profile.vitals.temperature ? `${profile.vitals.temperature} °C` : "—", Icon: Thermometer, color: "#d9ab4b" },
      ]
    : [];

  const infoRows = profile
    ? [
        { Icon: CalendarDays, text: profile.birthdate || "No birthdate on file" },
        { Icon: User, text: profile.sex || "—" },
        { Icon: MapPin, text: profile.address || "No address on file" },
        ...(profile.occupation ? [{ Icon: Briefcase, text: profile.occupation }] : []),
      ]
    : [];

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes pd-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes pd-pop { 0% { transform: scale(0.5) rotate(-10deg); opacity: 0; } 70% { transform: scale(1.1) rotate(3deg); } 100% { transform: none; opacity: 1; } }
        @keyframes pd-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes pd-bar { from { width: 0; } }
        @keyframes pd-ping { 0% { box-shadow: 0 0 0 0 rgb(201 162 39 / 0.55); } 70% { box-shadow: 0 0 0 10px rgb(201 162 39 / 0); } 100% { box-shadow: 0 0 0 0 rgb(201 162 39 / 0); } }
        @keyframes pd-wave { 0%, 60%, 100% { transform: rotate(0); } 10%, 30% { transform: rotate(16deg); } 20%, 40% { transform: rotate(-8deg); } 50% { transform: rotate(10deg); } }
        .pd-rise { animation: pd-rise 0.55s cubic-bezier(.2,.8,.2,1) both; }
        .pd-pop { animation: pd-pop 0.6s cubic-bezier(.2,.8,.2,1) both; }
        .pd-float { animation: pd-float 6s ease-in-out infinite; }
        .pd-bar { animation: pd-bar 1s cubic-bezier(.2,.8,.2,1) 0.3s both; }
        .pd-ping { animation: pd-ping 2s ease-out infinite; }
        .pd-wave { display: inline-block; transform-origin: 70% 70%; animation: pd-wave 2.4s ease-in-out 0.8s 1; }
        .pd-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .pd-card:hover { transform: translateY(-3px); box-shadow: 0 10px 24px rgb(37 53 34 / 0.1); }
        .pd-card:hover .pd-ico { transform: scale(1.1) rotate(-6deg); }
        .pd-ico { transition: transform 0.2s ease; }
        .pd-row { transition: background-color 0.15s ease, transform 0.15s ease; }
        .pd-row:hover { transform: translateX(3px); }
        .pd-row .pd-arrow { transition: transform 0.15s ease, opacity 0.15s ease; opacity: 0.4; }
        .pd-row:hover .pd-arrow { transform: translateX(3px); opacity: 1; }
        .pd-more .pd-more-arrow { transition: transform 0.15s ease; }
        .pd-more:hover .pd-more-arrow { transform: translateX(3px); }
        @media (prefers-reduced-motion: reduce) { .pd-rise, .pd-pop, .pd-float, .pd-bar, .pd-ping, .pd-wave { animation: none !important; } .pd-card, .pd-row { transition: none !important; } }
        .cds-reduce-motion .pd-rise, .cds-reduce-motion .pd-pop, .cds-reduce-motion .pd-float, .cds-reduce-motion .pd-bar, .cds-reduce-motion .pd-ping, .cds-reduce-motion .pd-wave { animation: none !important; }
        .cds-reduce-motion .pd-card, .cds-reduce-motion .pd-row { transition: none !important; }
      `}</style>

      {/* ---------- Hero ---------- */}
      <div className="pd-rise relative overflow-hidden rounded-3xl bg-[#26401e] px-6 py-7 text-[#ebebc2] sm:px-8">
        <span className="pd-float pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-leaf-300/10" />
        <span className="pd-float pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-leaf-300/10" style={{ animationDelay: "1.5s" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="pd-pop flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-leaf-300 font-display text-3xl font-extrabold text-brand-900">
              {(displayName || user?.name || "?")[0]}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[#ebebc2]/80">
                {greeting} <span className="pd-wave">👋</span>
              </p>
              <h2 className="truncate font-display text-2xl font-bold sm:text-3xl">{displayName || "Welcome"}</h2>
              <p className="mt-1 max-w-xl text-sm text-[#ebebc2]/80">
                Your dental profile and records at a glance. Full details are in{" "}
                <Link to="/patient/profile" className="font-semibold underline underline-offset-2 hover:text-white">
                  My Profile
                </Link>{" "}
                (view-only — the front desk updates it for you).
              </p>
            </div>
          </div>
          {nextSchedule && (
            <Link
              to="/patient/barangay-schedule"
              className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur transition-colors hover:bg-white/20"
            >
              <span className={`${missionDiff <= 7 ? "pd-ping" : ""} h-2.5 w-2.5 rounded-full bg-[#d9ab4b]`} />
              <span className="text-left leading-tight">
                <span className="block text-[11px] uppercase tracking-wide text-[#ebebc2]/70">Next dental mission</span>
                <span className="block text-sm font-semibold">
                  {nextSchedule.barangay_name} · {whenLabel(missionDiff)}
                </span>
              </span>
              <ChevronRight size={16} />
            </Link>
          )}
        </div>
      </div>

      {welcome && (
        <div
          className={`pd-rise rounded-2xl border px-5 py-3 text-sm flex items-start justify-between gap-4 ${
            welcome.matched
              ? "bg-green-50 border-green-200 text-green-900"
              : "bg-cream-100 border-cream-200 text-forest-800"
          }`}
        >
          <p>{welcome.message}</p>
          <button onClick={dismissWelcome} className="text-xs underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* ---------- Stats ---------- */}
      {totalVisits > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {stats.map((c, i) => (
            <div
              key={c.label}
              className={`pd-rise pd-card min-w-0 rounded-2xl border border-cream-200 bg-cream-50 p-3 sm:p-5 ${i === 2 ? "col-span-2 sm:col-span-1" : ""}`}
              style={{ animationDelay: `${120 + i * 90}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] sm:text-xs font-semibold uppercase max-sm:leading-tight tracking-wide text-forest-600">{c.label}</p>
                <span
                  className="pd-ico pd-pop flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${c.color}22`, color: c.color, animationDelay: `${250 + i * 90}ms` }}
                >
                  <c.Icon size={18} />
                </span>
              </div>
              <p className={`mt-2 font-display font-extrabold leading-none tabular-nums text-forest-950 ${c.isDate ? "text-2xl" : "text-3xl"}`}>
                {c.isDate ? c.value : <AnimatedNumber value={c.value} />}
              </p>
              <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-cream-200">
                <span className="pd-bar block h-1.5 rounded-full" style={{ width: "100%", backgroundColor: c.color, opacity: 0.85 }} />
              </span>
              <p className="mt-1.5 text-xs text-forest-600">{c.hint}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="pd-rise flex items-center gap-3 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-sm font-medium text-red-600">
          <Info size={18} className="shrink-0" />
          You don't have any dental records on file yet.
        </div>
      )}

      {/* ---------- Next mission + vitals ---------- */}
      <div className="grid gap-6 md:grid-cols-2">
        <Panel
          title="Next Barangay Dental Mission"
          icon={MapPin}
          delay={200}
          action={<SeeMore to="/patient/barangay-schedule" />}
        >
          {nextSchedule ? (
            <div className="flex items-stretch gap-4">
              <div className="flex w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#26401e] py-3 text-[#ebebc2]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-leaf-300">{nextDate.month}</span>
                <span className="font-display text-3xl font-extrabold leading-none">{nextDate.day}</span>
                <span className="mt-1 text-[10px] text-[#ebebc2]/70">{nextDate.weekday.slice(0, 3)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    missionDiff === 0 ? "bg-[#d9ab4b] text-forest-950" : "bg-leaf-300/60 text-forest-900"
                  }`}
                >
                  {whenLabel(missionDiff)}
                </span>
                <p className="mt-1.5 font-display text-lg font-semibold text-forest-950">{nextSchedule.barangay_name}</p>
                {nextSchedule.time_range && (
                  <p className="mt-0.5 text-sm text-forest-700">🕗 {nextSchedule.time_range}</p>
                )}
                {nextSchedule.services && <p className="mt-1.5 text-sm text-forest-800">🦷 {nextSchedule.services}</p>}
              </div>
            </div>
          ) : (
            <EmptyState>No upcoming barangay schedules posted yet.</EmptyState>
          )}
          {nextSchedule && (
            <Link
              to="/patient/barangay-schedule"
              className="pd-row mt-5 flex items-center justify-center gap-1.5 rounded-xl border border-forest-900/20 bg-cream-100 py-2.5 text-sm font-semibold text-forest-900 hover:bg-cream-200"
            >
              <CalendarDays size={15} /> View full schedule <ChevronRight size={15} className="pd-arrow" />
            </Link>
          )}
        </Panel>

        <Panel title="Vitals" icon={Activity} delay={290}>
          {profile?.vitals ? (
            <div className="space-y-2.5">
              {vitals.map((v, i) => (
                <div
                  key={v.label}
                  className="pd-rise pd-row flex items-center gap-3 rounded-xl bg-cream-100 px-3 py-2.5"
                  style={{ animationDelay: `${380 + i * 90}ms` }}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${v.color}22`, color: v.color }}>
                    <v.Icon size={17} />
                  </span>
                  <span className="flex-1 text-sm text-forest-700">{v.label}</span>
                  <span className="font-semibold tabular-nums text-forest-950">{v.value}</span>
                </div>
              ))}
              {profile.vitals.recorded_at && (
                <p className="pt-0.5 text-right text-[11px] text-forest-500">
                  Updated {new Date(profile.vitals.recorded_at).toLocaleDateString()}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cream-200 text-forest-600">
                <Activity size={22} />
              </span>
              <p className="text-sm text-forest-600">No vitals recorded yet.</p>
            </div>
          )}
        </Panel>

        {/* ---------- Profile + records ---------- */}
        <Panel title="Patient Record Summary" icon={User} delay={380}>
          {profile ? (
            <div className="flex gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-leaf-300 to-cream-200 font-display text-2xl font-extrabold text-forest-900">
                {(profile.name?.includes(",") ? profile.name.split(",")[1].trim()[0] : profile.name?.[0]) || "🙂"}
              </div>
              <div className="min-w-0 space-y-1.5">
                <p className="font-display font-semibold text-forest-950">{profile.name}</p>
                {infoRows.map(({ Icon, text }, i) => (
                  <p key={i} className="flex items-start gap-2 text-sm text-forest-700">
                    <Icon size={14} className="mt-0.5 shrink-0 text-forest-500" />
                    <span className="min-w-0 break-words">{text}</span>
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState>Loading…</EmptyState>
          )}
        </Panel>

        <Panel title="Dental Records" icon={ClipboardList} delay={470} action={<SeeMore to="/patient/dental-record" />}>
          {records.length ? (
            <div className="space-y-2">
              {records.slice(0, 3).map((r, i) => (
                // Clickable: opens that record (with the tooth chart) on the Dental Record page.
                <button
                  key={r.id}
                  type="button"
                  onClick={() => navigate("/patient/dental-record", { state: { openRecordId: r.id } })}
                  className="pd-rise pd-row flex w-full items-center gap-3 rounded-xl bg-cream-100 px-3 py-2.5 text-left hover:bg-cream-200"
                  style={{ animationDelay: `${560 + i * 90}ms` }}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-leaf-300/50 text-forest-900">
                    <Stethoscope size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-forest-950">{r.procedure}</span>
                    <span className="block text-xs text-forest-600">{r.record_date}</span>
                  </span>
                  <ChevronRight size={16} className="pd-arrow shrink-0 text-forest-700" />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState>No dental records on file yet.</EmptyState>
          )}
        </Panel>
      </div>
    </div>
  );
}