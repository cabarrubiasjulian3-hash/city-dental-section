import { useEffect, useMemo, useState } from "react";
import { Users, Activity, MapPin, TrendingUp } from "lucide-react";
import { api } from "../../lib/api";
import { StatCard, Card, EmptyState } from "../../components/ui";
import { PieChart, AgeGroupDonutChart, BarChart, DomeBarChart, StackedBarChart, LineChart } from "../../components/Charts";

// How many of the largest barangays get their own pie slice / bar before the
// rest are folded into a single "Other barangays" bucket / cut off.
const PIE_TOP_N = 6;
const BAR_TOP_N = 12;

// "2026-04" -> "APRIL 2026", for the StatCard subtitle under Overall Total Served.
function formatMonthLabel(monthStr) {
  if (!monthStr) return "";
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase();
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [barangayMonth, setBarangayMonth] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    api
      .get(`/dashboard/stats?barangayMonth=${barangayMonth}`)
      .then(setStats)
      .catch(() => {});
  }, [barangayMonth]);

  const pieData = useMemo(() => {
    const list = stats?.barangaySummary ?? [];
    if (!list.length) return [];
    const top = list.slice(0, PIE_TOP_N).map((b) => ({ label: b.name, value: b.total }));
    const restTotal = list.slice(PIE_TOP_N).reduce((sum, b) => sum + b.total, 0);
    return restTotal > 0 ? [...top, { label: "Other barangays", value: restTotal, isOther: true }] : top;
  }, [stats]);

  const barData = useMemo(
    () => (stats?.barangaySummary ?? []).slice(0, BAR_TOP_N).map((b) => ({ label: b.name, value: b.total })),
    [stats]
  );

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-forest-950">Dashboard</h1>
        <p className="text-sm font-medium text-forest-700 mt-1">
          City Dental Office · City of Tayabas, Province of Quezon · {formatMonthLabel(stats.month)} · MONTHLY REPORT
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Overall Total Served"
          value={stats.overallTotalServed}
          subtitle={formatMonthLabel(stats.month)}
          icon={<Users size={16} />}
        />
        <StatCard
          label="Male / Female"
          value={`${stats.male} / ${stats.female}`}
          subtitle="Sub-total M / F"
          icon={<Activity size={16} />}
        />
        <StatCard
          label="Barangays Reporting"
          value={`${stats.barangaysReporting}/${stats.barangaysTotal}`}
          subtitle={`${stats.barangaysTotal - stats.barangaysReporting} with zero entries`}
          icon={<MapPin size={16} />}
        />
        <StatCard
          label="vs. Last Month"
          value={stats.vsLastMonthPct == null ? "—" : `${stats.vsLastMonthPct > 0 ? "+" : ""}${stats.vsLastMonthPct}%`}
          subtitle={
            stats.lastMonthTotal == null
              ? undefined
              : `${stats.lastMonthTotal.toLocaleString()} → ${stats.overallTotalServed.toLocaleString()}`
          }
          icon={<TrendingUp size={16} />}
        />
      </div>

      <Card title="Clinic Statistics — BOHC by Age Group" subtitle={`Recipients served, ${formatMonthLabel(stats.month)}`}>
        {stats.ageGroupBreakdown.some((b) => b.value > 0) ? (
          <AgeGroupDonutChart data={stats.ageGroupBreakdown.filter((b) => b.value > 0)} />
        ) : (
          <EmptyState>Wala pang laman ang BOHC breakdown para sa buwang ito.</EmptyState>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Male vs Female per Age Group" subtitle="Stacked sub-totals as filed in the e-FHSIS form">
          {stats.maleFemalePerAgeGroup?.some((b) => b.male + b.female > 0) ? (
            <StackedBarChart data={stats.maleFemalePerAgeGroup} />
          ) : (
            <EmptyState>Wala pang datos para sa buwang ito.</EmptyState>
          )}
        </Card>

        <Card title="Clinic Statistics — Services Rendered">
          <p className="text-sm text-forest-600 -mt-1 mb-1">Share of total procedures</p>
          {stats.servicesRendered?.length ? (
            <DomeBarChart data={stats.servicesRendered} />
          ) : (
            <EmptyState>No service records logged yet.</EmptyState>
          )}
        </Card>

        <Card title="Recent Service Records">
          {stats.recentRecords.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-forest-700 uppercase text-xs">
                  <th className="py-2">Patient</th>
                  <th className="py-2">Procedure</th>
                  <th className="py-2">Dentist</th>
                  <th className="py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentRecords.map((r) => (
                  <tr key={r.id} className="border-t border-cream-200">
                    <td className="py-2">{r.patient_name}</td>
                    <td className="py-2">{r.procedure}</td>
                    <td className="py-2">{r.dentist || "—"}</td>
                    <td className="py-2">{r.record_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState>No service records logged yet — add one from Patient Management.</EmptyState>
          )}
        </Card>

        <Card title="Per-Dentist Output">
          {stats.perDentistOutput?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-forest-700 uppercase text-xs">
                  <th className="py-2">Dentist</th>
                  <th className="py-2 text-right">M</th>
                  <th className="py-2 text-right">F</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.perDentistOutput.map((d) => (
                  <tr key={d.dentist} className="border-t border-cream-200">
                    <td className="py-2">{d.dentist}</td>
                    <td className="py-2 text-right tabular-nums">{d.male}</td>
                    <td className="py-2 text-right tabular-nums">{d.female}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{d.total}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-forest-900 font-bold">
                  <td className="py-2">Overall total</td>
                  <td className="py-2 text-right tabular-nums">{stats.perDentistGrandTotal.male}</td>
                  <td className="py-2 text-right tabular-nums">{stats.perDentistGrandTotal.female}</td>
                  <td className="py-2 text-right tabular-nums">{stats.perDentistGrandTotal.total}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <EmptyState>Wala pang naka-log na dentist output ngayong buwan.</EmptyState>
          )}
        </Card>

        <Card title="Monthly Trend">
          {stats.monthlyTrend?.some((m) => m.value > 0) ? (
            <LineChart data={stats.monthlyTrend} />
          ) : (
            <EmptyState>Wala pang sapat na datos para sa trend.</EmptyState>
          )}
        </Card>
      </div>

      <Card
        title="Barangay Coverage"
        subtitle="Served vs. Projected Population 2026 — City Dental Section"
        action={
          stats.barangaysWithNoEntries ? (
            <span className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium text-forest-800 bg-leaf-200 border border-leaf-300 rounded-full px-3 py-1 whitespace-nowrap">
              ⚠ {stats.barangaysWithNoEntries} barangays with no entries
            </span>
          ) : null
        }
      >
        {stats.barangayCoverage?.length ? (
          <div className="max-h-96 overflow-y-auto thin-scrollbar pr-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-cream-50">
                <tr className="text-left text-forest-500 uppercase text-xs tracking-wide">
                  <th className="py-2 font-semibold">Barangay</th>
                  <th className="py-2 text-right font-semibold">Pop. 2026</th>
                  <th className="py-2 text-right font-semibold">Served</th>
                  <th className="py-2 pl-6 font-semibold">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {stats.barangayCoverage.map((b) => (
                  <tr key={b.barangay} className="border-t border-cream-200">
                    <td className="py-2.5 font-semibold text-forest-950">{b.barangay}</td>
                    <td className="py-2.5 text-right tabular-nums text-forest-700">{b.population || "—"}</td>
                    <td className="py-2.5 text-right tabular-nums text-forest-700">{b.served}</td>
                    <td className="py-2.5 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 flex-1 rounded-full bg-cream-200">
                          <div
                            className="h-1.5 rounded-full bg-leaf-500"
                            style={{ width: `${Math.min(b.coveragePct ?? 0, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-forest-700 w-12 text-right tabular-nums shrink-0">
                          {b.coveragePct == null ? "—" : `${b.coveragePct}%`}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Wala pang datos ng barangay coverage.</EmptyState>
        )}
      </Card>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display text-lg font-bold text-forest-950">e-FHSIS — By Barangay</h3>
          <p className="text-sm text-forest-700">
            Fed automatically from Patient Management's service records, plus any manual entries on the Monthly
            Report's Barangay tab
            {stats.barangayGrandTotal ? ` — ${stats.barangayGrandTotal} total served across ${stats.barangaySummary.length} barangay(s).` : "."}
          </p>
        </div>
        <input
          type="month"
          value={barangayMonth}
          onChange={(e) => setBarangayMonth(e.target.value)}
          className="rounded-lg border border-cream-200 bg-cream-50 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card title={`Barangay Distribution — Share of Total (${barangayMonth})`}>
          {pieData.length ? (
            <PieChart data={pieData} />
          ) : (
            <EmptyState>
              No barangay data logged for {barangayMonth} yet — log service records on Patient Management, or enter
              counts on the Monthly Report → By Barangay tab.
            </EmptyState>
          )}
        </Card>

        <Card
          title={`Top Barangays by Total Served (${barangayMonth})`}
          action={
            stats.barangaySummary.length > BAR_TOP_N ? (
              <span className="text-xs text-forest-600">+{stats.barangaySummary.length - BAR_TOP_N} more with data</span>
            ) : null
          }
        >
          {barData.length ? <BarChart data={barData} /> : <EmptyState>No barangay data logged for {barangayMonth} yet.</EmptyState>}
        </Card>
      </div>
    </div>
  );
}