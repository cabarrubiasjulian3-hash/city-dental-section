import { useEffect, useMemo, useState } from "react";
import { Printer, Download } from "lucide-react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../../components/ui";
import EditableCell from "../../components/EditableCell";
import { LineChart } from "../../components/Charts";

// Same category columns, same order, as the paper e-FHSIS form. "pregnant"
// only has an "f" sex because the paper form only has a female column for
// Pregnant Women.
const CATEGORY_GROUPS = [
  { key: "orally_fit", label: "Orally Fit 12–59mos (+ rehab)", sexes: ["m", "f"] },
  { key: "dmft", label: "Clients 5y+ w/ DMFT", sexes: ["m", "f"] },
  { key: "infants", label: "Infants 0–11mos BOHC", sexes: ["m", "f"] },
  { key: "children_1_4", label: "Children 1–4y BOHC", sexes: ["m", "f"] },
  { key: "children_5_9", label: "Children 5–9y BOHC", sexes: ["m", "f"] },
  { key: "adol_10_14", label: "Adolescents 10–14y BOHC", sexes: ["m", "f"] },
  { key: "adol_15_19", label: "Adolescents 15–19y BOHC", sexes: ["m", "f"] },
  { key: "adults", label: "Adults 20–59y BOHC", sexes: ["m", "f"] },
  { key: "senior", label: "Senior Citizens 60y+ BOHC", sexes: ["m", "f"] },
  { key: "pregnant", label: "Pregnant Women", sexes: ["f"] },
];

const ACTIVITY_LABELS = {
  consultation_extraction: "Consultation / Tooth Extraction",
  ekonsulta: "E-KUNSULTA",
  dental_mission: "Dental Mission / QIK / Senior Citizen Toothbrushing Drill / Dental Education",
};

function fieldsFor(group) {
  return group.sexes.map((s) => `${group.key}_${s}`);
}

// "2026-04" -> "APRIL 2026", for the report banner subtitle.
function formatMonthLabel(monthStr) {
  if (!monthStr) return "";
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase();
}

function emptyTotals() {
  const t = {};
  for (const g of CATEGORY_GROUPS) for (const f of fieldsFor(g)) t[f] = 0;
  t.total = 0;
  return t;
}

function sumRows(rows) {
  const t = emptyTotals();
  for (const r of rows) {
    for (const g of CATEGORY_GROUPS) for (const f of fieldsFor(g)) t[f] += r[f] || 0;
    t.total += r.total || 0;
  }
  return t;
}

function GroupHeaderRows() {
  return (
    <>
      <tr>
        <th className="px-2 py-1 text-left sticky left-0 bg-brand-900" rowSpan={2}>
          &nbsp;
        </th>
        {CATEGORY_GROUPS.map((g) => (
          <th key={g.key} colSpan={g.sexes.length} className="px-2 py-1 text-center border-l border-forest-700 align-bottom">
            {g.label}
          </th>
        ))}
        <th className="px-2 py-1 text-center border-l border-forest-700" rowSpan={2}>
          Total
        </th>
      </tr>
      <tr>
        {CATEGORY_GROUPS.flatMap((g) =>
          g.sexes.map((s) => (
            <th key={`${g.key}_${s}`} className="px-1 py-1 text-center border-l border-forest-700 font-normal">
              {s.toUpperCase()}
            </th>
          ))
        )}
      </tr>
    </>
  );
}

function EditableRow({ row, rowLabel, onSaveField, editable = true }) {
  return (
    <tr className="border-t border-cream-200">
      <td className="px-2 py-1.5 font-medium text-forest-950 sticky left-0 bg-cream-50 whitespace-nowrap">{rowLabel}</td>
      {CATEGORY_GROUPS.flatMap((g) =>
        g.sexes.map((s) => {
          const field = `${g.key}_${s}`;
          return (
            <td key={field} className="px-1 py-1 border-l border-cream-200 text-center w-16">
              {editable ? (
                <EditableCell
                  value={String(row[field] ?? 0)}
                  type="number"
                  onSave={(v) => onSaveField(row, field, v)}
                  className="text-center"
                />
              ) : (
                <span className="text-forest-700">{row[field] ?? 0}</span>
              )}
            </td>
          );
        })
      )}
      <td className="px-2 py-1.5 text-center border-l border-cream-200 font-semibold text-forest-950">{row.total}</td>
    </tr>
  );
}

function TotalsRow({ label, totals }) {
  return (
    <tr className="border-t-2 border-brand-900 bg-cream-200 font-semibold">
      <td className="px-2 py-1.5 sticky left-0 bg-cream-200 whitespace-nowrap">{label}</td>
      {CATEGORY_GROUPS.flatMap((g) =>
        g.sexes.map((s) => (
          <td key={`${g.key}_${s}`} className="px-1 py-1.5 border-l border-cream-300 text-center">
            {totals[`${g.key}_${s}`]}
          </td>
        ))
      )}
      <td className="px-2 py-1.5 text-center border-l border-cream-300">{totals.total}</td>
    </tr>
  );
}

export default function AdminMonthlyReport({ readOnly = false }) {
  const [tab, setTab] = useState("dentist");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [dentistRows, setDentistRows] = useState([]);
  const [barangayRows, setBarangayRows] = useState([]);
  const [servicesRendered, setServicesRendered] = useState([]);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    setError("");
    Promise.all([
      api.get(`/monthly-reports?month=${month}&scope=dentist`),
      api.get(`/monthly-reports?month=${month}&scope=barangay`),
      api.get(`/monthly-reports/services-rendered?month=${month}`),
      api.get(`/monthly-reports/trend?month=${month}`),
    ])
      .then(([d, b, sr, tr]) => {
        setDentistRows(d.rows);
        setBarangayRows(b.rows);
        setServicesRendered(sr.servicesRendered);
        setTrend(tr.trend);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [month]);

  const dentistGroups = useMemo(() => {
    const byName = new Map();
    for (const r of dentistRows) {
      if (!byName.has(r.scope_name)) byName.set(r.scope_name, []);
      byName.get(r.scope_name).push(r);
    }
    return [...byName.entries()];
  }, [dentistRows]);

  const dentistPerDentistTotals = useMemo(
    () => dentistGroups.map(([name, rows]) => ({ name, totals: sumRows(rows) })),
    [dentistGroups]
  );
  const consolidatedByActivity = useMemo(() => {
    const byActivity = new Map();
    for (const r of dentistRows) {
      if (!byActivity.has(r.activity_type)) byActivity.set(r.activity_type, []);
      byActivity.get(r.activity_type).push(r);
    }
    return [...byActivity.entries()].map(([activity, rows]) => ({ activity, totals: sumRows(rows) }));
  }, [dentistRows]);
  const grandTotal = useMemo(() => sumRows(dentistRows.length ? dentistRows : []), [dentistRows]);
  const barangayGrandTotal = useMemo(() => sumRows(barangayRows), [barangayRows]);

  async function saveField(row, field, value) {
    setError("");
    try {
      const updated = await api.patch(`/monthly-reports/${row.id}`, { [field]: value });
      const apply = (list) => list.map((r) => (r.id === row.id ? updated : r));
      if (row.scope === "dentist") setDentistRows(apply);
      else setBarangayRows(apply);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <fieldset disabled={readOnly} style={{ display: "contents" }}>
    <div className="space-y-6">
      {readOnly && (
        <div className="bg-clay-500/10 border border-clay-500 text-forest-900 text-sm rounded-lg px-3 py-2 print:hidden">
          Preview only — doctor accounts can view the Monthly Report but cannot edit figures.
        </div>
      )}
      <div className="flex items-start justify-between flex-wrap gap-3 print:mb-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-forest-950">
            Monthly Report on Dental Services (e-FHSIS)
          </h1>
          <p className="text-sm font-medium text-forest-700 mt-1">
            City Dental Office · City of Tayabas, Province of Quezon · {formatMonthLabel(month)}
          </p>
        </div>
      </div>

      {/* Printable summary — Parts I–III + Trend, matching the paper e-FHSIS
          layout. This is for on-screen viewing only; Print / Export prints
          the By Dentist / By Barangay tab instead (see below), so it's
          hidden from the print output here. */}
      <div className="grid lg:grid-cols-2 gap-5 print:hidden">
        <Card title="Part I — Recipients of Basic Oral Health Care (BOHC)" subtitle="Tally per age group, by sex">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-forest-500 uppercase text-xs tracking-wide">
                <th className="py-2 font-semibold">Age Group / Indicator</th>
                <th className="py-2 font-semibold text-right">Male</th>
                <th className="py-2 font-semibold text-right">Female</th>
                <th className="py-2 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORY_GROUPS.map((g) => {
                const m = g.sexes.includes("m") ? barangayGrandTotal[`${g.key}_m`] || 0 : null;
                const f = barangayGrandTotal[`${g.key}_f`] || 0;
                return (
                  <tr key={g.key} className="border-t border-cream-200">
                    <td className="py-2 text-forest-900">{g.label}</td>
                    <td className="py-2 text-right text-forest-700">{m === null ? "—" : m}</td>
                    <td className="py-2 text-right text-forest-700">{f}</td>
                    <td className="py-2 text-right font-semibold text-forest-950">{(m || 0) + f}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-brand-900 font-bold text-forest-950">
                <td className="py-2">Sub-total</td>
                <td className="py-2 text-right">
                  {CATEGORY_GROUPS.reduce((sum, g) => sum + (g.sexes.includes("m") ? barangayGrandTotal[`${g.key}_m`] || 0 : 0), 0)}
                </td>
                <td className="py-2 text-right">
                  {CATEGORY_GROUPS.reduce((sum, g) => sum + (barangayGrandTotal[`${g.key}_f`] || 0), 0)}
                </td>
                <td className="py-2 text-right">{barangayGrandTotal.total}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        <div className="space-y-5">
          <Card title="Part II — Services Rendered" subtitle={`${servicesRendered.reduce((s, r) => s + r.value, 0).toLocaleString()} total procedures`}>
            {servicesRendered.length ? (
              <div className="space-y-3">
                {servicesRendered.map((r) => {
                  const total = servicesRendered.reduce((s, x) => s + x.value, 0);
                  const pct = total ? ((r.value / total) * 100).toFixed(1) : "0.0";
                  return (
                    <div key={r.label} className="flex items-center justify-between text-sm">
                      <span className="text-forest-900">{r.label}</span>
                      <span className="text-right">
                        <span className="font-bold text-forest-950">{r.value}</span>{" "}
                        <span className="text-forest-500">{pct}%</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState>No service records logged this month yet.</EmptyState>
            )}
          </Card>

          <Card title="Part III — Per-Dentist Output" subtitle="Consolidated monthly report">
            {dentistPerDentistTotals.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-forest-500 uppercase text-xs tracking-wide">
                    <th className="py-2 font-semibold">Dentist</th>
                    <th className="py-2 font-semibold text-right">M</th>
                    <th className="py-2 font-semibold text-right">F</th>
                    <th className="py-2 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dentistPerDentistTotals.map(({ name, totals }) => (
                    <tr key={name} className="border-t border-cream-200">
                      <td className="py-2 font-medium text-forest-950">Dr. {name}</td>
                      <td className="py-2 text-right text-forest-700">
                        {CATEGORY_GROUPS.reduce((sum, g) => sum + (g.sexes.includes("m") ? totals[`${g.key}_m`] || 0 : 0), 0)}
                      </td>
                      <td className="py-2 text-right text-forest-700">
                        {CATEGORY_GROUPS.reduce((sum, g) => sum + (totals[`${g.key}_f`] || 0), 0)}
                      </td>
                      <td className="py-2 text-right font-semibold text-forest-950">{totals.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState>No dentists on Staff Management yet.</EmptyState>
            )}
          </Card>
        </div>
      </div>

      <Card title="Trend" subtitle="Total clients served, last 6 months" className="print:hidden">
        {trend.some((m) => m.value > 0) ? (
          <LineChart data={trend} />
        ) : (
          <EmptyState>Not enough data yet for a trend.</EmptyState>
        )}
      </Card>

      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <p className="text-sm text-forest-700 max-w-2xl">
          Digitized version of the City Dental Office's monthly report — enter counts cell-by-cell like the paper
          form, per dentist or per barangay. Subtotals and the overall total are calculated for you.
        </p>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex gap-2">
          <button
            onClick={() => setTab("dentist")}
            className={`text-sm font-semibold rounded-full px-4 py-2 ${
              tab === "dentist" ? "bg-brand-900 text-brand-50" : "bg-cream-200 text-forest-800"
            }`}
          >
            By Dentist
          </button>
          <button
            onClick={() => setTab("barangay")}
            className={`text-sm font-semibold rounded-full px-4 py-2 ${
              tab === "barangay" ? "bg-brand-900 text-brand-50" : "bg-cream-200 text-forest-800"
            }`}
          >
            By Barangay
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 bg-cream-200 text-forest-800 text-sm font-semibold rounded-full px-4 py-2 hover:bg-cream-300"
          >
            <Printer size={15} /> Print
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 bg-brand-900 text-brand-50 text-sm font-semibold rounded-full px-4 py-2 hover:bg-brand-800"
          >
            <Download size={15} /> Export official form
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <EmptyState>Loading…</EmptyState>}

      {/* id="printable-monthly-report" hooks into the site-wide print rules
          (see index.css) that hide everything else on the page and reveal
          just this block — same mechanism the Patients page print uses.
          Only one of the two tabs below is ever mounted at a time, so
          whichever one is on screen is what prints. */}
      <div id="printable-monthly-report">
      {!loading && tab === "dentist" && (
        <div className="space-y-6">
          {dentistGroups.length === 0 && (
            <EmptyState>No dentists on Staff Management yet — add one there to start logging this month's report.</EmptyState>
          )}

          {dentistGroups.map(([name, rows]) => (
            <Card key={name} title={`Dr. ${name}`} className="print:break-after-page">
              <div className="overflow-x-auto">
                <table className="text-xs w-full min-w-[1400px]">
                  <thead className="bg-brand-900 text-brand-50">
                    <GroupHeaderRows />
                  </thead>
                  <tbody>
                    {rows
                      .slice()
                      .sort((a, b) => ["consultation_extraction", "ekonsulta", "dental_mission"].indexOf(a.activity_type) - ["consultation_extraction", "ekonsulta", "dental_mission"].indexOf(b.activity_type))
                      .map((r) => (
                        <EditableRow key={r.id} row={r} rowLabel={ACTIVITY_LABELS[r.activity_type]} onSaveField={saveField} editable={!readOnly} />
                      ))}
                    <TotalsRow label="Subtotal" totals={dentistPerDentistTotals.find((d) => d.name === name)?.totals ?? emptyTotals()} />
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          {dentistGroups.length > 0 && (
            <Card title="Consolidated (all dentists this month)">
              <div className="overflow-x-auto">
                <table className="text-xs w-full min-w-[1400px]">
                  <thead className="bg-brand-900 text-brand-50">
                    <GroupHeaderRows />
                  </thead>
                  <tbody>
                    {consolidatedByActivity.map(({ activity, totals }) => (
                      <tr key={activity} className="border-t border-cream-200">
                        <td className="px-2 py-1.5 font-medium text-forest-950 sticky left-0 bg-cream-50 whitespace-nowrap">
                          {ACTIVITY_LABELS[activity]}
                        </td>
                        {CATEGORY_GROUPS.flatMap((g) =>
                          g.sexes.map((s) => (
                            <td key={`${g.key}_${s}`} className="px-1 py-1.5 border-l border-cream-200 text-center">
                              {totals[`${g.key}_${s}`]}
                            </td>
                          ))
                        )}
                        <td className="px-2 py-1.5 text-center border-l border-cream-200 font-semibold">{totals.total}</td>
                      </tr>
                    ))}
                    <TotalsRow label="Overall Total" totals={grandTotal} />
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {!loading && tab === "barangay" && (
        <Card title={`All 66 barangays — ${month}`}>
          <div className="overflow-x-auto">
            <table className="text-xs w-full min-w-[1600px]">
              <thead className="bg-brand-900 text-brand-50">
                <tr>
                  <th className="px-2 py-1 text-left sticky left-0 bg-brand-900" rowSpan={2}>
                    Barangay
                  </th>
                  <th className="px-2 py-1 text-center border-l border-forest-700" rowSpan={2}>
                    Proj. Pop. 2026
                  </th>
                  {CATEGORY_GROUPS.map((g) => (
                    <th key={g.key} colSpan={g.sexes.length} className="px-2 py-1 text-center border-l border-forest-700 align-bottom">
                      {g.label}
                    </th>
                  ))}
                  <th className="px-2 py-1 text-center border-l border-forest-700" rowSpan={2}>
                    Grand Total
                  </th>
                </tr>
                <tr>
                  {CATEGORY_GROUPS.flatMap((g) =>
                    g.sexes.map((s) => (
                      <th key={`${g.key}_${s}`} className="px-1 py-1 text-center border-l border-forest-700 font-normal">
                        {s.toUpperCase()}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {barangayRows.map((r) => (
                  <tr key={r.id} className="border-t border-cream-200">
                    <td className="px-2 py-1.5 font-medium text-forest-950 sticky left-0 bg-cream-50 whitespace-nowrap">
                      {r.scope_name}
                    </td>
                    <td className="px-1 py-1 border-l border-cream-200 text-center w-20">
                      <EditableCell
                        value={String(r.projected_population ?? "")}
                        type="number"
                        placeholder="—"
                        onSave={(v) => saveField(r, "projected_population", v)}
                        className="text-center"
                      />
                    </td>
                    {CATEGORY_GROUPS.flatMap((g) =>
                      g.sexes.map((s) => {
                        const field = `${g.key}_${s}`;
                        return (
                          <td key={field} className="px-1 py-1 border-l border-cream-200 text-center w-16">
                            <EditableCell
                              value={String(r[field] ?? 0)}
                              type="number"
                              onSave={(v) => saveField(r, field, v)}
                              className="text-center"
                            />
                          </td>
                        );
                      })
                    )}
                    <td className="px-2 py-1.5 text-center border-l border-cream-200 font-semibold text-forest-950">{r.total}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-brand-900 bg-cream-200 font-semibold">
                  <td className="px-2 py-1.5 sticky left-0 bg-cream-200">Grand Total</td>
                  <td className="px-1 py-1.5 border-l border-cream-300"></td>
                  {CATEGORY_GROUPS.flatMap((g) =>
                    g.sexes.map((s) => (
                      <td key={`${g.key}_${s}`} className="px-1 py-1.5 border-l border-cream-300 text-center">
                        {barangayGrandTotal[`${g.key}_${s}`]}
                      </td>
                    ))
                  )}
                  <td className="px-2 py-1.5 text-center border-l border-cream-300">{barangayGrandTotal.total}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
      </div>
    </div>
    </fieldset>
  );
}