import { useEffect, useMemo, useState } from "react";
import { Users, Activity, MapPin, TrendingUp } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { StatCard, Card, EmptyState } from "../../components/ui";
import { AgeGroupDonutChart, BarChart, DomeBarChart, GroupedBarChart, LineChart, AnimatedNumber } from "../../components/Charts";

// How many of the largest barangays get a bar before the rest are cut off
const BAR_TOP_N = 12;

// "2026-04" -> "APRIL 2026", for the StatCard subtitle under Overall Total Served.
function formatMonthLabel(monthStr) {
  if (!monthStr) return "";
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase();
}

const nf = (n) => Number(n || 0).toLocaleString();

// One KPI tile. `hero` = the dark main number; `tone` colours the small trend chip.
function KpiCard({ label, icon, hero = false, children, footer }) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        hero ? "border-brand-900 bg-brand-900 text-brand-50" : "border-cream-200 bg-cream-50"
      }`}
    >
      {hero && <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/5" />}
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-semibold uppercase tracking-wide ${hero ? "text-brand-50/70" : "text-forest-600"}`}>{label}</p>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            hero ? "bg-white/15 text-brand-50" : "bg-cream-200 text-forest-900"
          }`}
        >
          {icon}
        </span>
      </div>
      <div className={`mt-3 font-display text-3xl font-extrabold tabular-nums leading-none ${hero ? "" : "text-forest-950"}`}>
        {children}
      </div>
      {footer && <div className={`mt-3 text-xs ${hero ? "text-brand-50/70" : "text-forest-600"}`}>{footer}</div>}
    </div>
  );
}

// Grey shimmer blocks shown while the numbers are loading.
function DashboardSkeleton() {
  const block = "animate-pulse rounded-2xl bg-cream-200/70";
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <div className={`${block} h-8 w-48`} />
        <div className={`${block} h-4 w-96 max-w-full`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-32`} />
        ))}
      </div>
      <div className={`${block} h-72`} />
      <div className="grid gap-6 md:grid-cols-2">
        <div className={`${block} h-80`} />
        <div className={`${block} h-80`} />
      </div>
    </div>
  );
}

export default function AdminDashboard({ readOnly = false }) {
  // Nothing here mutates data (just a month filter), so readOnly is accepted
  // for a consistent prop signature across doctor-mirrored admin pages but
  // has no effect on this page.
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [barangayMonth, setBarangayMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reloadKey, setReloadKey] = useState(0);
  const [coverageFilter, setCoverageFilter] = useState("all"); // all | with | none
  const [coverageSearch, setCoverageSearch] = useState("");

  useEffect(() => {
    setLoadError("");
    api
      .get(`/dashboard/stats?barangayMonth=${barangayMonth}`)
      .then(setStats)
      // Surface the actual error instead of leaving the page blank with no
      // explanation — a silently-swallowed failure here used to mean the
      // whole dashboard looked empty with nothing telling you why.
      .catch((err) => setLoadError(err.message || "Could not load the dashboard."));
  }, [barangayMonth, reloadKey]);

  const barData = useMemo(
    () => (stats?.barangaySummary ?? []).slice(0, BAR_TOP_N).map((b) => ({ label: b.name, value: b.total })),
    [stats]
  );

  const coverageRows = useMemo(() => {
    const q = coverageSearch.trim().toLowerCase();
    return (stats?.barangayCoverage ?? []).filter((b) => {
      if (coverageFilter === "with" && !b.served) return false;
      if (coverageFilter === "none" && b.served) return false;
      return !q || b.barangay.toLowerCase().includes(q);
    });
  }, [stats, coverageFilter, coverageSearch]);
  // Bars are drawn relative to the best-covered barangay, so small percentages are still visible.
  const maxCoverage = useMemo(
    () => Math.max(1, ...(stats?.barangayCoverage ?? []).map((b) => b.coveragePct ?? 0)),
    [stats]
  );

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-display text-lg font-bold text-red-800">Could not load the dashboard</p>
        <p className="mt-1 text-sm text-red-700">{loadError}</p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="mt-4 rounded-full bg-brand-900 px-5 py-2 text-sm font-semibold text-brand-50 hover:bg-brand-800"
        >
          Try again
        </button>
      </div>
    );
  }
  if (!stats) return <DashboardSkeleton />;

  const total = stats.overallTotalServed || 0;
  const malePct = total ? Math.round((stats.male / total) * 100) : 0;
  const reportingPct = stats.barangaysTotal ? Math.round((stats.barangaysReporting / stats.barangaysTotal) * 100) : 0;
  const delta = stats.vsLastMonthPct;
  const up = delta != null && delta > 0;
  const down = delta != null && delta < 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-forest-950">Dashboard</h1>
        <p className="mt-1 text-sm font-medium text-forest-700">
          City Dental Office · City of Tayabas, Province of Quezon · {formatMonthLabel(stats.month)} · MONTHLY REPORT
        </p>
      </div>

      {/* ---- KPI row: the first (dark) card is the headline number ---- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          hero
          label="Overall Total Served"
          icon={<Users size={16} />}
          footer={formatMonthLabel(stats.month)}
        >
          <AnimatedNumber value={total} />
        </KpiCard>

        <KpiCard
          label="Male / Female"
          icon={<Activity size={16} />}
          footer={
            <div>
              <div className="flex h-2 overflow-hidden rounded-full bg-cream-200">
                <div className="h-2 bg-[#1f4d2e] transition-all duration-700" style={{ width: `${malePct}%` }} />
                <div className="h-2 flex-1 bg-[#e0b95c]" />
              </div>
              <div className="mt-1.5 flex justify-between tabular-nums">
                <span>Male {malePct}%</span>
                <span>Female {total ? 100 - malePct : 0}%</span>
              </div>
            </div>
          }
        >
          <AnimatedNumber value={stats.male} /> <span className="text-forest-500">/</span> <AnimatedNumber value={stats.female} />
        </KpiCard>

        <KpiCard
          label="Barangays Reporting"
          icon={<MapPin size={16} />}
          footer={
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-cream-200">
                <div className="h-2 rounded-full bg-[#40916c] transition-all duration-700" style={{ width: `${reportingPct}%` }} />
              </div>
              <p className="mt-1.5">{stats.barangaysTotal - stats.barangaysReporting} with zero entries</p>
            </div>
          }
        >
          <AnimatedNumber value={stats.barangaysReporting} />
          <span className="text-xl text-forest-500">/{stats.barangaysTotal}</span>
        </KpiCard>

        <KpiCard
          label="vs. Last Month"
          icon={<TrendingUp size={16} />}
          footer={
            stats.lastMonthTotal == null
              ? "No data for last month"
              : `${nf(stats.lastMonthTotal)} → ${nf(stats.overallTotalServed)}`
          }
        >
          {delta == null ? (
            "—"
          ) : (
            <span className={`inline-flex items-center gap-1.5 ${up ? "text-[#2d6a4f]" : down ? "text-[#b5503a]" : ""}`}>
              <span aria-hidden="true" className="text-xl">
                {up ? "▲" : down ? "▼" : "■"}
              </span>
              {up ? "+" : ""}
              {delta}%
            </span>
          )}
        </KpiCard>
      </div>

      {/* Doctor portal only: the four clinic-wide totals above come first, then this. */}
      {user?.role === "doctor" && (
        <Card title="My Patients" subtitle="Based on your name as the attending dentist on their records">
          <div className="flex items-center gap-6">
            <StatCard label="My Patients" value={stats.myPatientCount ?? 0} icon={<Users size={16} />} />
            <div className="min-w-0 flex-1">
              {stats.myRecentRecords?.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-forest-700">
                      <th className="py-1">Patient</th>
                      <th className="py-1">Procedure</th>
                      <th className="py-1">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.myRecentRecords.map((r) => (
                      <tr key={r.id} className="border-t border-cream-200">
                        <td className="py-1.5">{r.patient_name}</td>
                        <td className="py-1.5">{r.procedure}</td>
                        <td className="py-1.5">{r.record_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState>
                  No patients found under your name yet. Ask the admin to confirm your name matches the "dentist"
                  entered on their records.
                  {stats.myDoctorNameDebug && (
                    <div className="mt-2 font-mono text-xs text-forest-600">
                      Matching against your account name: {stats.myDoctorNameDebug}
                    </div>
                  )}
                  {stats.allDentistValuesDebug?.length > 0 && (
                    <div className="mt-2 font-mono text-xs text-forest-600">
                      "dentist" values currently on file: {stats.allDentistValuesDebug.join(", ")}
                    </div>
                  )}
                </EmptyState>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card title="Clinic Statistics — BOHC by Age Group" subtitle={`Recipients served, ${formatMonthLabel(stats.month)} · hover a slice or a row to focus it`}>
        {stats.ageGroupBreakdown.some((b) => b.value > 0) ? (
          <AgeGroupDonutChart data={stats.ageGroupBreakdown.filter((b) => b.value > 0)} />
        ) : (
          <EmptyState>Wala pang laman ang BOHC breakdown para sa buwang ito.</EmptyState>
        )}
      </Card>

      {/* Two charts side by side, then two compact cards, then the wide table: no half-empty rows. */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="h-full min-w-0" title="Male vs Female per Age Group" subtitle="Side-by-side counts as filed in the e-FHSIS form">
          {stats.maleFemalePerAgeGroup?.some((b) => b.male + b.female > 0) ? (
            <GroupedBarChart data={stats.maleFemalePerAgeGroup} />
          ) : (
            <EmptyState>Wala pang datos para sa buwang ito.</EmptyState>
          )}
        </Card>

        <Card className="h-full min-w-0" title="Clinic Statistics — Services Rendered" subtitle="Share of total procedures">
          {stats.servicesRendered?.length ? (
            <DomeBarChart data={stats.servicesRendered} />
          ) : (
            <EmptyState>No service records logged yet.</EmptyState>
          )}
        </Card>

        <Card className="h-full" title="Monthly Trend" subtitle="People served per month">
          {stats.monthlyTrend?.some((m) => m.value > 0) ? (
            <LineChart data={stats.monthlyTrend} />
          ) : (
            <EmptyState>Wala pang sapat na datos para sa trend.</EmptyState>
          )}
        </Card>

        <Card className="h-full" title="Per-Dentist Output" subtitle={formatMonthLabel(stats.month)}>
          {stats.perDentistOutput?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-forest-700">
                  <th className="py-2">Dentist</th>
                  <th className="py-2 text-right">M</th>
                  <th className="py-2 text-right">F</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="w-1/4 py-2 pl-4" aria-label="Share" />
                </tr>
              </thead>
              <tbody>
                {stats.perDentistOutput.map((d) => {
                  const share = stats.perDentistGrandTotal.total ? (d.total / stats.perDentistGrandTotal.total) * 100 : 0;
                  return (
                    <tr key={d.dentist} className="border-t border-cream-200">
                      <td className="py-2.5 font-medium text-forest-950">{d.dentist}</td>
                      <td className="py-2.5 text-right tabular-nums">{nf(d.male)}</td>
                      <td className="py-2.5 text-right tabular-nums">{nf(d.female)}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">{nf(d.total)}</td>
                      <td className="py-2.5 pl-4">
                        <div className="h-2 rounded-full bg-cream-200" title={`${share.toFixed(1)}% of all procedures`}>
                          <div className="h-2 rounded-full bg-[#4c9a5a]" style={{ width: `${share}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-forest-900 font-bold">
                  <td className="py-2.5">Overall total</td>
                  <td className="py-2.5 text-right tabular-nums">{nf(stats.perDentistGrandTotal.male)}</td>
                  <td className="py-2.5 text-right tabular-nums">{nf(stats.perDentistGrandTotal.female)}</td>
                  <td className="py-2.5 text-right tabular-nums">{nf(stats.perDentistGrandTotal.total)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          ) : (
            <EmptyState>Wala pang naka-log na dentist output ngayong buwan.</EmptyState>
          )}
        </Card>
      </div>

      {/* Recent records and the barangay ranking sit side by side. */}
      <div className="grid gap-6 md:grid-cols-2">
      <Card className="h-full min-w-0" title="Recent Service Records" subtitle="Latest procedures logged in Patient Management">
        {stats.recentRecords.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-forest-700">
                  <th className="py-2">Patient</th>
                  <th className="py-2">Procedure</th>
                  <th className="py-2">Dentist</th>
                  <th className="py-2 text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentRecords.map((r) => (
                  <tr key={r.id} className="border-t border-cream-200">
                    <td className="py-2.5 font-medium text-forest-950">{r.patient_name}</td>
                    <td className="py-2.5">
                      <span className="rounded-full bg-cream-200 px-2.5 py-0.5 text-xs font-semibold text-forest-800">{r.procedure}</span>
                    </td>
                    <td className="py-2.5 text-forest-700">{r.dentist || "—"}</td>
                    <td className="py-2.5 text-right tabular-nums text-forest-700">
                      {new Date(r.record_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>No service records logged yet — add one from Patient Management.</EmptyState>
        )}
      </Card>

      <Card
        className="h-full min-w-0"
        title={<>Top Barangays by Total Served <span className="whitespace-nowrap">({barangayMonth})</span></>}
        subtitle={
          stats.barangayGrandTotal
            ? `${nf(stats.barangayGrandTotal)} total across ${stats.barangaySummary.length} barangay(s) · from Patient Management and Reports → By Barangay`
            : "From Patient Management and Reports → By Barangay"
        }
        action={
          <div className="flex shrink-0 flex-col items-end gap-1">
            <input
              type="month"
              aria-label="Month"
              value={barangayMonth}
              onChange={(e) => setBarangayMonth(e.target.value)}
              className="rounded-lg border border-cream-200 bg-cream-50 px-2.5 py-1.5 text-xs text-forest-950"
            />
            {stats.barangaySummary.length > BAR_TOP_N && (
              <span className="text-xs text-forest-600">+{stats.barangaySummary.length - BAR_TOP_N} more with data</span>
            )}
          </div>
        }
      >
        {barData.length ? <BarChart data={barData} /> : <EmptyState>No barangay data logged for {barangayMonth} yet.</EmptyState>}
      </Card>
      </div>

      <Card
        title="Barangay Coverage"
        subtitle="Served vs. Projected Population 2026 — City Dental Section. Bars are scaled to the best-covered barangay."
        action={
          stats.barangaysWithNoEntries ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-leaf-300 bg-leaf-200 px-3 py-1 text-xs font-medium text-forest-800">
              ⚠ {stats.barangaysWithNoEntries} barangays with no entries
            </span>
          ) : null
        }
      >
        {stats.barangayCoverage?.length ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {[
                ["all", "All"],
                ["with", "With entries"],
                ["none", "No entries"],
              ].map(([key, text]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCoverageFilter(key)}
                  aria-pressed={coverageFilter === key}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    coverageFilter === key
                      ? "border-brand-900 bg-brand-900 text-brand-50"
                      : "border-cream-200 bg-cream-50 text-forest-800 hover:bg-cream-200"
                  }`}
                >
                  {text}
                </button>
              ))}
              <input
                value={coverageSearch}
                onChange={(e) => setCoverageSearch(e.target.value)}
                placeholder="Search barangay…"
                className="ml-auto w-44 rounded-full border border-cream-200 bg-cream-50 px-3 py-1 text-xs"
              />
            </div>
            <div className="thin-scrollbar max-h-96 overflow-y-auto pr-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-cream-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-forest-500">
                    <th className="py-2 font-semibold">Barangay</th>
                    <th className="py-2 text-right font-semibold">Pop. 2026</th>
                    <th className="py-2 text-right font-semibold">Served</th>
                    <th className="py-2 pl-6 font-semibold">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {coverageRows.map((b) => (
                    <tr key={b.barangay} className="border-t border-cream-200">
                      <td className="py-2.5 font-semibold text-forest-950">{b.barangay}</td>
                      <td className="py-2.5 text-right tabular-nums text-forest-700">{b.population ? nf(b.population) : "—"}</td>
                      <td className="py-2.5 text-right tabular-nums text-forest-700">
                        {b.served ? nf(b.served) : <span className="text-forest-400">0</span>}
                      </td>
                      <td className="py-2.5 pl-6">
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 rounded-full bg-cream-200">
                            <div
                              className={`h-2 rounded-full transition-[width] duration-700 ${b.served ? "bg-[#40916c]" : ""}`}
                              style={{ width: `${((b.coveragePct ?? 0) / maxCoverage) * 100}%` }}
                            />
                          </div>
                          <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-forest-800">
                            {b.coveragePct == null ? "—" : `${b.coveragePct}%`}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!coverageRows.length && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState>No barangay matches.</EmptyState>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState>Wala pang datos ng barangay coverage.</EmptyState>
        )}
      </Card>
    </div>
  );
}