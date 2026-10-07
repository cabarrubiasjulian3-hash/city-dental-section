import { useEffect, useMemo, useState } from "react";
import { Printer, Download } from "lucide-react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../../components/ui";
import { exportOfficialForm } from "./exportOfficialForm";
import { PRINT_SPEC as SPEC } from "./printSpec"; // every print / export size lives in printSpec.js

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

// Short chip labels for the age-group filter.
const GROUP_SHORT = {
  orally_fit: "Orally Fit 12–59mos",
  dmft: "DMFT 5y+",
  infants: "0–11mos",
  children_1_4: "1–4y",
  children_5_9: "5–9y",
  adol_10_14: "10–14y",
  adol_15_19: "15–19y",
  adults: "20–59y",
  senior: "60y+",
  pregnant: "Pregnant",
};

// Parses the exact-age box: "21", "21-24", "21, 23, 24" -> [[21,21],[21,24],...].
// Returns [] for an empty box and null when the text can't be understood.
function parseAgeInput(text) {
  const cleaned = String(text || "").trim().replace(/\s*[-–]\s*/g, "-");
  if (!cleaned) return [];
  const ranges = [];
  for (const tok of cleaned.split(/[,\s]+/).filter(Boolean)) {
    const m = tok.match(/^(\d{1,3})(?:-(\d{1,3}))?$/);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] !== undefined ? Number(m[2]) : a;
    ranges.push([Math.min(a, b), Math.max(a, b)]);
  }
  return ranges;
}

// Total of one row across only the columns currently shown (used when an age
// group / sex filter is on; otherwise the saved row.total is used).
function rowTotal(r, groups) {
  let sum = 0;
  for (const g of groups) for (const f of fieldsFor(g)) sum += r[f] || 0;
  return sum;
}

// groups/filtered let the age-group and sex filters narrow what gets summed.
function sumRows(rows, groups = CATEGORY_GROUPS, filtered = false) {
  const t = emptyTotals();
  for (const r of rows) {
    for (const g of groups) for (const f of fieldsFor(g)) t[f] += r[f] || 0;
    t.total += filtered ? rowTotal(r, groups) : r.total || 0;
  }
  return t;
}

// What the single summary table is grouped by ("category" the rows are assigned to).
const GROUP_BY = [
  { key: "age", label: "Age group", column: "Age group / Indicator" },
  { key: "barangay", label: "Barangay", column: "Barangay" },
  { key: "dentist", label: "Dentist assigned", column: "Dentist" },
  { key: "services", label: "Services", column: "Service" },
];

// Options for the From / To month boxes ("01".."12" -> January..December).
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, "0"),
  label: new Date(2000, i, 1).toLocaleString("en-US", { month: "long" }),
}));

// From "07" to "10" in 2026 -> ["2026-07","2026-08","2026-09","2026-10"].
// Leave "to" empty for just one month. If the two are the wrong way round they
// are swapped, so "October to July" still works.
function monthsBetween(from, to, year) {
  const a = Number(from);
  const b = to ? Number(to) : a;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return Array.from({ length: hi - lo + 1 }, (_, i) => `${year}-${String(lo + i).padStart(2, "0")}`);
}

const monthNameOf = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleString("en-US", { month: "long" }).toUpperCase();

// Names are stored either with or without "Dr." — always show exactly one.
const drName = (n) => `Dr. ${String(n).replace(/^dr\.?\s+/i, "")}`;

// ---------------------------------------------------------------------------
// Chart under the summary table. It reads the very same rows as the table
// (rows = whatever "Group by" is set to, after all filters), so it updates by
// itself whenever a filter, the month or a count changes. Plain SVG — no
// charting library needed.
const CHART_COLORS = ["#16241a", "#3d5c2f", "#6d9750", "#a8874a", "#8bb56c", "#4d6844", "#c98a4b", "#a8e492", "#6b8f71", "#8a9a82", "#25401f", "#c8f0b8"];
const OTHERS_COLOR = "#c7bfa4";
const MALE_COLOR = "#253522";
const FEMALE_COLOR = "#6b9950";

const CHART_TYPES = [
  { key: "bar", label: "Bar graph" },
  { key: "pie", label: "Pie chart" },
  { key: "line", label: "Line graph" },
];
const CHART_MEASURES = [
  { key: "total", label: "Total" },
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "both", label: "Male vs Female" },
];
const CHART_TOP_N = [
  { key: 5, label: "Top 5" },
  { key: 10, label: "Top 10" },
  { key: 15, label: "Top 15" },
  { key: 0, label: "All" },
];

// Round axis maximum so gridlines fall on friendly numbers.
function niceMax(raw) {
  if (raw <= 0) return { max: 4, step: 1 };
  const rough = raw / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const mult = [1, 2, 5, 10].find((n) => n >= rough / mag) || 10;
  const step = Math.max(1, mult * mag);
  return { max: step * 4, step };
}

const clip = (t, n = 20) => (String(t).length > n ? `${String(t).slice(0, n - 1)}…` : String(t));

function AxisChart({ items, series, kind }) {
  const W = 760;
  const H = 340;
  const pad = { t: 18, r: 16, b: 100, l: 42 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const baseY = pad.t + ph;
  const raw = Math.max(1, ...items.flatMap((it) => series.map((s) => it[s.key])));
  const { max, step } = niceMax(raw);
  const ticks = [];
  for (let v = 0; v <= max + 0.001; v += step) ticks.push(v);
  const slot = pw / items.length;
  const yOf = (v) => baseY - (v / max) * ph;
  const showValues = items.length <= 12;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={kind === "bar" ? "Bar graph" : "Line graph"}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={yOf(v)} y2={yOf(v)} stroke="#ece6cf" strokeWidth="1" />
          <text x={pad.l - 6} y={yOf(v) + 3} fontSize="10" textAnchor="end" fill="#4d6844">
            {v}
          </text>
        </g>
      ))}

      {kind === "bar" &&
        items.map((it, i) => {
          const groupW = Math.min(58 * series.length, slot * 0.72);
          const barW = groupW / series.length;
          const x0 = pad.l + i * slot + (slot - groupW) / 2;
          return (
            <g key={it.label}>
              {series.map((s, j) => {
                const v = it[s.key];
                const h = (v / max) * ph;
                return (
                  <g key={s.key}>
                    <rect x={x0 + j * barW} y={baseY - h} width={Math.max(barW - 2, 2)} height={h} rx="3" fill={s.color}>
                      <title>{`${it.label} — ${s.label}: ${v}`}</title>
                    </rect>
                    {showValues && v > 0 && (
                      <text x={x0 + j * barW + barW / 2 - 1} y={baseY - h - 4} fontSize="9" textAnchor="middle" fill="#26401e">
                        {v}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

      {kind === "line" &&
        series.map((s) => (
          <g key={s.key}>
            <polyline
              points={items.map((it, i) => `${pad.l + slot * (i + 0.5)},${yOf(it[s.key])}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {items.map((it, i) => (
              <g key={it.label}>
                <circle cx={pad.l + slot * (i + 0.5)} cy={yOf(it[s.key])} r="4" fill={s.color}>
                  <title>{`${it.label} — ${s.label}: ${it[s.key]}`}</title>
                </circle>
                {showValues && (
                  <text x={pad.l + slot * (i + 0.5)} y={yOf(it[s.key]) - 8} fontSize="9" textAnchor="middle" fill="#26401e">
                    {it[s.key]}
                  </text>
                )}
              </g>
            ))}
          </g>
        ))}

      {items.map((it, i) => {
        const x = pad.l + slot * (i + 0.5);
        return (
          <text key={it.label} x={x} y={baseY + 14} fontSize="10" fill="#2f4029" textAnchor="end" transform={`rotate(-38 ${x} ${baseY + 14})`}>
            <title>{it.label}</title>
            {clip(it.label)}
          </text>
        );
      })}
    </svg>
  );
}

function PieSvg({ slices }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const R = 90;
  const C = 100;
  let angle = -Math.PI / 2;
  const paths = slices.map((sl, i) => {
    const sweep = (sl.value / total) * Math.PI * 2;
    const x1 = C + R * Math.cos(angle);
    const y1 = C + R * Math.sin(angle);
    angle += sweep;
    const x2 = C + R * Math.cos(angle);
    const y2 = C + R * Math.sin(angle);
    const color = sl.isOthers ? OTHERS_COLOR : CHART_COLORS[i % CHART_COLORS.length];
    return { ...sl, color, d: `M${C},${C} L${x1},${y1} A${R},${R} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2},${y2} Z` };
  });
  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg viewBox="0 0 200 200" className="w-52 h-52 shrink-0" role="img" aria-label="Pie chart">
        {paths.length === 1 ? (
          <circle cx={C} cy={C} r={R} fill={paths[0].color} />
        ) : (
          paths.map((p) => (
            <path key={p.label} d={p.d} fill={p.color} stroke="#fbfaf4" strokeWidth="1.5">
              <title>{`${p.label}: ${p.value} (${((p.value / total) * 100).toFixed(1)}%)`}</title>
            </path>
          ))
        )}
      </svg>
      <ul className="space-y-1.5 text-sm w-full min-w-0">
        {paths.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              <span className="truncate text-forest-900" title={p.label}>
                {p.label}
              </span>
            </span>
            <span className="text-forest-700 shrink-0 tabular-nums">
              {p.value} · {((p.value / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A text box with suggestions: type a few letters ("a") and every option that
// contains them is listed; click one (or press Enter for the first) to pick it.
// Emptying the box clears the filter. resetOnSelect is for "add another" boxes
// (the picked items are shown elsewhere, as tags).
function SuggestInput({ value, options, onSelect, placeholder, ariaLabel, width = "w-36", resetOnSelect = false }) {
  const labelOf = (v) => options.find((o) => o.value === v)?.label ?? v ?? "";
  const [text, setText] = useState(resetOnSelect ? "" : labelOf(value));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setText(resetOnSelect ? "" : labelOf(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = text.trim().toLowerCase().replace(/\b(barangay|brgy\.?)\b/g, "").trim();
  const matches = options
    .filter((o) => !q || o.label.toLowerCase().includes(q))
    .sort((a, b) => Number(b.label.toLowerCase().startsWith(q)) - Number(a.label.toLowerCase().startsWith(q)));

  function pick(o) {
    onSelect(o.value);
    setText(resetOnSelect ? "" : o.label);
    setOpen(false);
  }
  function handleChange(e) {
    const t = e.target.value;
    setText(t);
    setOpen(true);
    if (!t.trim() && value && !resetOnSelect) onSelect(""); // emptied the box -> no filter
  }
  function handleBlur() {
    setOpen(false);
    if (resetOnSelect) return setText("");
    const exact = options.find((o) => o.label.toLowerCase() === text.trim().toLowerCase());
    if (exact) {
      if (exact.value !== value) onSelect(exact.value);
      setText(exact.label);
    } else {
      setText(labelOf(value)); // typed something that isn't an option: go back to what's applied
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={text}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (matches[0]) pick(matches[0]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        autoComplete="off"
        className={`${width} rounded-lg border border-cream-200 bg-cream-100 px-2 py-1 text-xs text-forest-950`}
      />
      {open && (
        <ul className="absolute left-0 z-20 mt-1 max-h-48 min-w-full w-max max-w-[16rem] overflow-y-auto rounded-lg border border-cream-200 bg-cream-50 py-1 shadow-lg">
          {matches.length ? (
            matches.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep focus so the click lands before blur
                    pick(o);
                  }}
                  className="block w-full px-2.5 py-1 text-left text-xs text-forest-950 hover:bg-cream-200"
                >
                  {o.label}
                </button>
              </li>
            ))
          ) : (
            <li className="px-2.5 py-1 text-xs text-forest-500">No match</li>
          )}
        </ul>
      )}
    </div>
  );
}

// How the top "Report by ..." card shows the filtered rows.
const REPORT_VIEWS = [
  { key: "table", label: "Table" },
  { key: "bar", label: "Bar graph" },
  { key: "pie", label: "Pie chart" },
  { key: "line", label: "Line graph" },
];

// The filtered rows of the top report card, drawn as a chart instead of a table.
// Separate from SummaryChart below (which has its own controls).
function ReportChartView({ rows, groupBy, kind }) {
  const canSplit = groupBy !== "services"; // services have no male/female split
  const limit = kind === "pie" ? 10 : 15;
  const { items, cut } = useMemo(() => {
    let list = rows.map((r) => ({ label: r.label, m: r.m || 0, f: r.f || 0, total: r.total || 0 }));
    if (groupBy !== "age") list = [...list].sort((a, b) => b.total - a.total); // age groups keep their natural order
    return list.length > limit ? { items: list.slice(0, limit), cut: list.slice(limit) } : { items: list, cut: [] };
  }, [rows, groupBy, limit]);

  const series =
    canSplit && kind !== "pie"
      ? [
          { key: "m", label: "Male", color: MALE_COLOR },
          { key: "f", label: "Female", color: FEMALE_COLOR },
        ]
      : [{ key: "total", label: "Total", color: "#3d5c2f" }];

  const pieSlices = useMemo(() => {
    const sl = items.filter((it) => it.total > 0).map((it) => ({ label: it.label, value: it.total }));
    const others = cut.reduce((sum, it) => sum + it.total, 0);
    if (others > 0) sl.push({ label: `Others (${cut.length})`, value: others, isOthers: true });
    return sl;
  }, [items, cut]);

  const hasData = kind === "pie" ? pieSlices.length > 0 : items.some((it) => series.some((s) => it[s.key] > 0));
  if (!hasData) return <EmptyState>Nothing to chart for these filters yet.</EmptyState>;

  return (
    <div>
      {kind !== "pie" && series.length > 1 && (
        <div className="flex items-center gap-4 mb-2">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs font-semibold text-forest-900">
              <span className="w-3 h-3 inline-block rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {kind === "pie" ? <PieSvg slices={pieSlices} /> : <AxisChart items={items} series={series} kind={kind} />}
      {cut.length > 0 && (
        <p className="text-xs text-forest-500 mt-1">
          Showing the top {items.length} of {items.length + cut.length}
          {kind === "pie" ? " (the rest are grouped as Others)" : ""} — switch to Table to see all of them.
        </p>
      )}
    </div>
  );
}

function SummaryChart({ rows, groupBy, title }) {
  const [type, setType] = useState("bar");
  const [measure, setMeasure] = useState("total");
  const [topN, setTopN] = useState(10);

  const canSplit = groupBy !== "services"; // services have no male/female split
  let m = canSplit ? measure : "total";
  if (type === "pie" && m === "both") m = "total"; // a pie can only show one measure
  const series =
    m === "both"
      ? [
          { key: "m", label: "Male", color: MALE_COLOR },
          { key: "f", label: "Female", color: FEMALE_COLOR },
        ]
      : m === "male"
      ? [{ key: "m", label: "Male", color: MALE_COLOR }]
      : m === "female"
      ? [{ key: "f", label: "Female", color: FEMALE_COLOR }]
      : [{ key: "total", label: "Total", color: "#3d5c2f" }];

  const { items, cut } = useMemo(() => {
    let list = rows.map((r) => ({ label: r.label, m: r.m || 0, f: r.f || 0, total: r.total || 0 }));
    const rankKey = series.length === 1 ? series[0].key : "total";
    if (groupBy !== "age") list = [...list].sort((a, b) => b[rankKey] - a[rankKey]); // age groups keep their natural order
    let rest = [];
    if (topN && list.length > topN) {
      rest = list.slice(topN);
      list = list.slice(0, topN);
    }
    return { items: list, cut: rest };
  }, [rows, groupBy, topN, m]); // eslint-disable-line react-hooks/exhaustive-deps

  const valueKey = series[0].key;
  const pieSlices = useMemo(() => {
    const sl = items.filter((it) => it[valueKey] > 0).map((it) => ({ label: it.label, value: it[valueKey] }));
    const others = cut.reduce((sum, it) => sum + it[valueKey], 0);
    if (others > 0) sl.push({ label: `Others (${cut.length})`, value: others, isOthers: true });
    return sl;
  }, [items, cut, valueKey]);

  const hasData = type === "pie" ? pieSlices.length > 0 : items.some((it) => series.some((s) => it[s.key] > 0));
  const selectCls = "mt-1 block rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm text-forest-950";

  return (
    <Card className="print:hidden" title={title} subtitle="Updates automatically with the table and filters above">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 mb-4">
        <label className="text-xs text-forest-700">
          Chart type
          <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
            {CHART_TYPES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {canSplit && (
          <label className="text-xs text-forest-700">
            Show
            <select value={measure} onChange={(e) => setMeasure(e.target.value)} className={selectCls}>
              {CHART_MEASURES.map((c) => (
                <option key={c.key} value={c.key} disabled={type === "pie" && c.key === "both"}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs text-forest-700">
          How many
          <select value={topN} onChange={(e) => setTopN(Number(e.target.value))} className={selectCls}>
            {CHART_TOP_N.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {type !== "pie" && series.length > 1 && (
          <div className="flex items-center gap-4 pb-2">
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs font-semibold text-forest-900">
                <span className="w-3 h-3 inline-block rounded-sm" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {hasData ? (
        type === "pie" ? (
          <PieSvg slices={pieSlices} />
        ) : (
          <AxisChart items={items} series={series} kind={type} />
        )
      ) : (
        <EmptyState>Nothing to chart for these filters yet.</EmptyState>
      )}
      {type !== "pie" && cut.length > 0 && hasData && (
        <p className="text-xs text-forest-500 mt-1">Showing {items.length} of {items.length + cut.length} — pick "All" in "How many" to see the rest.</p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The paper e-FHSIS forms. Which one gets drawn depends on the report picked:
//   A  Consolidated Monthly (all dentists) and Monthly (one dentist, by
//      activity): one row per dentist / activity with M and F columns.
//   B  Quarterly / Annual / any From–To range (the "overall report"): a
//      Male + Female row for every month, with the sex written inside each
//      cell, one Sub total and one Over all total per month.
//   C  Monthly by Barangay (the "City Dental Section" sheet): one row per
//      barangay with its Projected Population and a Grand Total.
// ---------------------------------------------------------------------------

// Solid colours like the printed form: blue label column, orange figures,
// lavender sub total, green overall total. Change them here if you want them
// lighter or darker — every table below reads from this one list.
const FORM_COLORS = {
  line: "#1c261d", // table borders
  ink: "#0f1a12", // text
  label: "#7FB2E5", // first column (dentist / barangay / month)
  data: "#F4B183", // the figure columns
  sub: "#B5A8E6", // sub total
  total: "#8CC665", // overall / grand total
  plain: "#FFFFFF",
};

const POPULATION_YEAR = 2021; // the year printed on the Barangay form's "Projected Population" column
// Left seal: uses tayabasLogoData.js (embedded copy) when that file sits next to this one,
// otherwise falls back to /tayabaslogo.png in frontend/public. Right seal: frontend/public/logo.png.
const embeddedSeal = Object.values(import.meta.glob("./tayabasLogoData.js", { eager: true }))[0]?.default;
const SEAL_LEFT = embeddedSeal || "/tayabaslogo.png"; // City of Tayabas seal
const SEAL_RIGHT = "/logo.png"; // City Dental Office seal
// Names printed at the bottom of the form.
const SIGNATORIES = {
  preparedBy: { name: "CESAR ANTHONY ORIAS JR., DMD", title: "City Dentist III" },
  notedBy: { name: "HERNANDO C. MARQUEZ, MD, MPH, MPM, DPAMS", title: "City Health Officer" },
};

const FORM_LABELS = {
  orally_fit: "Orally fit children 12–59 mons old oral examination plus orally fit after rehabilitation",
  dmft: "Clients 5 yrs old and above with cases of DMFT",
  infants: "Infants 0–11 months old who received BOHC",
  children_1_4: "Children 1–4 yrs old (12–59 mons) who received BOHC",
  children_5_9: "Children 5–9 yrs old who received BOHC",
  adol_10_14: "A. Adolescents 10–14 yrs old who received BOHC",
  adol_15_19: "B. Adolescents 15–19 yrs old who received BOHC",
  adults: "Adults 20–59 yrs old who received BOHC",
  senior: "Senior citizens 60 yrs old and above who received BOHC",
  pregnant: "Pregnant woman",
};
// Column titles on the Barangay sheet (they're worded a little differently).
const BARANGAY_FORM_LABELS = {
  ...FORM_LABELS,
  orally_fit: "Orally Fit Children 12–59 mos old oral examination plus orally fit after rehabilitation",
  children_1_4: "Children 1–4 yrs old (12–59 months) who received BOHC",
  pregnant: "Preg. Women Provided with BOHC",
  senior: "Senior Citizen 60 years and above provided with BOHC",
};
// The Barangay sheet puts Pregnant Women before Senior Citizens.
const BARANGAY_ORDER = ["orally_fit", "dmft", "infants", "children_1_4", "children_5_9", "adol_10_14", "adol_15_19", "adults", "pregnant", "senior"];

const isAdol = (g) => g.key.startsWith("adol_");
const sexTotal = (t, groups, sex) =>
  groups.reduce((sum, g) => sum + (g.sexes.includes(sex) ? t[`${g.key}_${sex}`] || 0 : 0), 0);

const TH_BASE = "border px-2 py-2 text-center align-middle text-[11px] font-bold leading-tight";
const TD_BASE = "border px-2 py-2 text-center";
const TABLE_STYLE = { color: FORM_COLORS.ink, borderColor: FORM_COLORS.line };
const cellStyle = (kind, extra) => ({ backgroundColor: FORM_COLORS[kind], borderColor: FORM_COLORS.line, ...extra });

// kind = which colour of FORM_COLORS the cell gets.
function Th({ kind, className = "", style, ...rest }) {
  return <th {...rest} className={`${TH_BASE} ${className}`} style={cellStyle(kind, style)} />;
}
function Td({ kind, className = "", style, ...rest }) {
  return <td {...rest} className={`${TD_BASE} ${className}`} style={cellStyle(kind, style)} />;
}

// Numbers get thousands commas (1,012). Zero cells are left blank, like the paper form.
const fmt = (v) => Number(v).toLocaleString("en-US");
const cellVal = (v) => (v ? fmt(v) : "");

// Column widths for PRINTING only (the on-screen table is left as it was): every column gets
// the same share, like the paper form. They are only hints (the table is NOT fixed-layout), so
// if a word is too long for its column - "Pregnant", "Adolescents", "rehabilitation" - that
// column widens by itself and the others give way. The width sits in a CSS variable that only
// the print rules read. fixed = widths (in %) of the first columns, e.g. the name columns.
function ColGroup({ count, fixed = [] }) {
  const rest = (100 - fixed.reduce((a, b) => a + b, 0)) / (count - fixed.length);
  return (
    <colgroup>
      {Array.from({ length: count }, (_, i) => (
        <col key={i} style={{ "--w": `${i < fixed.length ? fixed[i] : rest}%` }} />
      ))}
    </colgroup>
  );
}
const sexCount = (groups) => groups.reduce((n, g) => n + g.sexes.length, 0);

// Header of forms A and B. mf = every age group gets an M and an F column (A);
// otherwise one column per group (B, where the sex is written inside the cells).
function FormHead({ groups, mf, lead }) {
  const adol = groups.filter(isAdol);
  const labelRows = adol.length ? 2 : 1;
  const totalRows = labelRows + (mf ? 1 : 0);
  const colsOf = (g) => (mf ? g.sexes.length : 1);
  return (
    <thead>
      <tr>
        <Th kind="label" rowSpan={totalRows}>{lead}</Th>
        {groups.map((g) => {
          if (isAdol(g)) {
            if (g.key !== adol[0].key) return null;
            return (
              <Th key="adol" kind="data" colSpan={adol.reduce((sum, x) => sum + colsOf(x), 0)}>
                Adolescents who received BOHC
              </Th>
            );
          }
          return (
            <Th key={g.key} kind="data" rowSpan={labelRows} colSpan={colsOf(g)}>
              {FORM_LABELS[g.key]}
            </Th>
          );
        })}
        {mf ? (
          <>
            <Th kind="sub" colSpan={2} rowSpan={labelRows}>Sub total</Th>
            <Th kind="sub" rowSpan={totalRows}>Total</Th>
            <Th kind="total" rowSpan={totalRows}>Overall total</Th>
          </>
        ) : (
          <>
            <Th kind="sub" rowSpan={totalRows}>Sub total</Th>
            <Th kind="total" rowSpan={totalRows}>Over all total</Th>
          </>
        )}
      </tr>
      {adol.length > 0 && (
        <tr>
          {adol.map((g) => (
            <Th key={g.key} kind="data" colSpan={colsOf(g)}>{FORM_LABELS[g.key]}</Th>
          ))}
        </tr>
      )}
      {mf && (
        <tr>
          {groups.flatMap((g) =>
            g.sexes.map((x) => (
              <Th key={`${g.key}_${x}`} kind="data">{x.toUpperCase()}</Th>
            ))
          )}
          <Th kind="sub">M</Th>
          <Th kind="sub">F</Th>
        </tr>
      )}
    </thead>
  );
}

// Form A: Consolidated Monthly (a row per dentist) and Monthly (a row per activity).
function FormTableA({ groups, rows, lead }) {
  const sums = rows.map((r) => {
    const m = sexTotal(r.t, groups, "m");
    const f = sexTotal(r.t, groups, "f");
    return { m, f, total: m + f };
  });
  const overall = sums.reduce((sum, x) => sum + x.total, 0);
  return (
    <table className="w-full min-w-[1100px] border-collapse text-xs" style={TABLE_STYLE}>
      <ColGroup count={sexCount(groups) + 5} fixed={SPEC.colFixed.A} />
      <FormHead groups={groups} mf lead={lead} />
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key}>
            <Td kind="label" className="min-w-[9rem] max-w-[15rem] text-left font-bold">{r.label}</Td>
            {groups.flatMap((g) =>
              g.sexes.map((x) => (
                <Td key={`${g.key}_${x}`} kind="data" className="font-semibold">{cellVal(r.t[`${g.key}_${x}`])}</Td>
              ))
            )}
            <Td kind="sub" className="font-bold text-red-700">{cellVal(sums[i].m)}</Td>
            <Td kind="sub" className="font-bold text-red-700">{cellVal(sums[i].f)}</Td>
            <Td kind="sub" className="font-bold">{cellVal(sums[i].total)}</Td>
            {i === 0 && <Td kind="total" rowSpan={rows.length} className="text-xl font-extrabold">{fmt(overall)}</Td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// "MALE  15" on screen. When printing, the same cell becomes "MALE | 15": a label cell and a value
// cell with a divider between them (the print: classes), like the paper Quarterly form.
function SexCell({ sex, value, strong = false }) {
  return (
    <div className="flex items-center justify-between gap-2 print:items-stretch print:gap-0">
      <span className="text-[9px] font-bold uppercase tracking-wide opacity-70 print:flex print:flex-1 print:items-center print:justify-center">
        {sex === "m" ? "Male" : "Female"}
      </span>
      <span
        className={`${strong ? "font-extrabold" : "font-bold"} print:flex print:w-[40%] print:items-center print:justify-center print:border-l`}
        style={{ borderColor: FORM_COLORS.line }}
      >
        {cellVal(value)}
      </span>
    </div>
  );
}

// Form B: the overall report (Quarterly / Annual / any From–To range).
function FormTableB({ groups, months, sexRows }) {
  const bySex = (t, x) => sexTotal(t, groups, x);
  const monthTotal = (t) => sexRows.reduce((sum, y) => sum + bySex(t, y), 0);
  const grand = months.reduce((sum, mo) => sum + monthTotal(mo.t), 0);
  return (
    <table className="w-full min-w-[1000px] border-collapse text-xs" style={TABLE_STYLE}>
      <ColGroup count={groups.length + 3} />
      <FormHead groups={groups} mf={false} lead="Month" />
      <tbody>
        {months.flatMap((mo) =>
          sexRows.map((x, si) => (
            <tr key={`${mo.key}-${x}`}>
              {si === 0 && (
                <Td kind="label" rowSpan={sexRows.length} className="text-left font-extrabold uppercase whitespace-nowrap">{mo.label}</Td>
              )}
              {groups.map((g) => {
                // Pregnant women only have one (female) figure: one merged cell over both rows.
                if (g.sexes.length === 1 && sexRows.length === 2) {
                  return si === 0 ? (
                    <Td key={g.key} kind="data" rowSpan={2} className="font-bold">{cellVal(mo.t[`${g.key}_${g.sexes[0]}`])}</Td>
                  ) : null;
                }
                return (
                  <Td key={g.key} kind="data" className="sexcell">
                    <SexCell sex={x} value={g.sexes.includes(x) ? mo.t[`${g.key}_${x}`] : null} />
                  </Td>
                );
              })}
              <Td kind="sub" className="sexcell">
                <SexCell sex={x} value={bySex(mo.t, x)} strong />
              </Td>
              {si === 0 && (
                <Td kind="total" rowSpan={sexRows.length} className="text-base font-extrabold">{fmt(monthTotal(mo.t))}</Td>
              )}
            </tr>
          ))
        )}
        <tr>
          <Td kind="plain" colSpan={groups.length + 2} />
          <Td kind="total" className="text-xl font-extrabold">{fmt(grand)}</Td>
        </tr>
      </tbody>
    </table>
  );
}

// Form C: the Barangay sheet (one row per barangay, Projected Population, Grand Total).
function FormTableC({ groups, rows, monthLabel }) {
  const rowSum = (t) => sexTotal(t, groups, "m") + sexTotal(t, groups, "f");
  const colCount = groups.reduce((n, g) => n + g.sexes.length, 0) + 3;
  const totals = emptyTotals();
  let populationSum = 0;
  let grand = 0;
  for (const r of rows) {
    for (const g of groups) for (const f of fieldsFor(g)) totals[f] += r.t[f] || 0;
    populationSum += Number(r.population) || 0;
    grand += rowSum(r.t);
  }
  const num = (v) => (v === null || v === undefined || v === "" ? "" : Number(v).toLocaleString("en-US"));
  return (
    <table className="w-full min-w-[1000px] border-collapse text-xs" style={TABLE_STYLE}>
      <ColGroup count={sexCount(groups) + 3} fixed={SPEC.colFixed.C} />
      <thead>
        <tr>
          <Th kind="label" colSpan={colCount} className="text-xs uppercase tracking-wide">{monthLabel}</Th>
        </tr>
        <tr>
          <Th kind="label" rowSpan={2}>Barangay</Th>
          <Th kind="label" rowSpan={2}>Projected Population {POPULATION_YEAR}</Th>
          {groups.map((g) => (
            <Th key={g.key} kind="data" colSpan={g.sexes.length}>{BARANGAY_FORM_LABELS[g.key]}</Th>
          ))}
          <Th kind="total" rowSpan={2}>Grand Total</Th>
        </tr>
        <tr>
          {groups.flatMap((g) =>
            g.sexes.map((x) => (
              <Th key={`${g.key}_${x}`} kind="data">{x.toUpperCase()}</Th>
            ))
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <Td kind="label" className="text-left font-bold whitespace-nowrap">{r.label}</Td>
            <Td kind="label" className="text-right font-semibold">{num(r.population)}</Td>
            {groups.flatMap((g) =>
              g.sexes.map((x) => (
                <Td key={`${g.key}_${x}`} kind="data" className="font-semibold">{cellVal(r.t[`${g.key}_${x}`])}</Td>
              ))
            )}
            <Td kind="total" className="font-extrabold">{cellVal(rowSum(r.t))}</Td>
          </tr>
        ))}
        <tr>
          <Td kind="sub" className="text-left font-extrabold uppercase">Total</Td>
          <Td kind="sub" className="text-right font-extrabold">{num(populationSum)}</Td>
          {groups.flatMap((g) =>
            g.sexes.map((x) => (
              <Td key={`${g.key}_${x}`} kind="sub" className="font-extrabold">{cellVal(totals[`${g.key}_${x}`])}</Td>
            ))
          )}
          <Td kind="total" className="text-base font-extrabold">{fmt(grand)}</Td>
        </tr>
      </tbody>
    </table>
  );
}

function Seal({ src, alt, style }) {
  return (
    <img
      src={src}
      alt={alt}
      style={{ width: SPEC.seal.size, height: SPEC.seal.size, ...style }}
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden"; // image missing: keep the layout, hide the icon
      }}
      className="hidden print:block object-contain"
    />
  );
}

// On screen only the office name and the report title show. When printing / exporting, the seals
// and the "Republic of the Philippines" lines come back (the `hidden print:block` pieces) so the
// paper copy has the full heading. Sizes for printing are the rep-* classes in PRINT_CSS below
// (numbers in printSpec.js). Seals sit at the top, the same distance in from the left and right
// edge of the table; the office name and the (wide) title are centred and may run under them.
function FormTitle({ model }) {
  return (
    <div className="rep-header relative mb-3 text-forest-950">
      <Seal src={SEAL_LEFT} alt="City of Tayabas seal" style={{ position: "absolute", top: 0, left: SPEC.seal.inset }} />
      <Seal src={SEAL_RIGHT} alt="City Dental Office seal" style={{ position: "absolute", top: 0, right: SPEC.seal.inset }} />
      <div className="text-center leading-snug">
        {model.mode === "C" ? (
          <>
            <p className="rep-small hidden print:block">Tayabas City</p>
            <p className="rep-sec-office text-sm font-semibold">City Dental Office</p>
            <p className="rep-sec-title font-display text-lg font-bold tracking-wide">CITY DENTAL SECTION</p>
          </>
        ) : (
          <>
            <p className="rep-small hidden print:block">Republic of the Philippines</p>
            <p className="rep-small hidden print:block">Province of Quezon</p>
            <p className="rep-small hidden print:block">City of Tayabas</p>
            <p className="rep-office font-display text-lg font-bold">City Dental Office</p>
            <p className="rep-title text-sm font-semibold">
              {model.title} <span className={model.underline ? "font-bold underline" : "rep-period font-bold"}>{model.period}</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Footer (printed copy only): "Prepared by:" at the left, "Noted by:" (overall report) or
// "Submitted to:" further right. Names are centred under their label in regular type, titles under
// them in bold. No signature is printed: raise footer.gap in printSpec.js to leave room to sign.
function FormFooter({ noted }) {
  const F = SPEC.footer;
  const { preparedBy, notedBy } = SIGNATORIES;
  return (
    <div
      className="hidden print:grid text-forest-950 break-inside-avoid"
      style={{ gridTemplateColumns: `${F.leftColumn} 1fr`, marginTop: F.marginTop, fontSize: `${F.font}pt` }}
    >
      <div className="w-fit" style={{ paddingLeft: F.labelIndent }}>
        <p>Prepared by:</p>
        <div className="text-center" style={{ marginTop: F.gap, marginLeft: F.nameIndent }}>
          <p className="whitespace-nowrap">{preparedBy.name}</p>
          <p className="font-bold">{preparedBy.title}</p>
        </div>
      </div>
      <div className="w-fit">
        <p>{noted ? "Noted by:" : "Submitted to:"}</p>
        <div className="text-center" style={{ marginTop: F.gap }}>
          <p className="whitespace-nowrap">{notedBy.name}</p>
          <p className="font-bold">{notedBy.title}</p>
        </div>
      </div>
    </div>
  );
}

function OfficialReport({ model, loading }) {
  if (loading) return <EmptyState>Loading…</EmptyState>;
  if (!model.groups.length) return <EmptyState>No columns to show for these filters.</EmptyState>;
  const hasRows = model.mode === "B" ? model.months.length > 0 : model.rows.length > 0;
  if (!hasRows) return <EmptyState>Nothing to show for these filters.</EmptyState>;
  return (
    <div data-form={model.mode} style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
      <FormTitle model={model} />
      <div className="overflow-x-auto">
        {model.mode === "A" && <FormTableA groups={model.groups} rows={model.rows} lead={model.lead} />}
        {model.mode === "B" && <FormTableB groups={model.groups} months={model.months} sexRows={model.sexRows} />}
        {model.mode === "C" && <FormTableC groups={model.groups} rows={model.rows} monthLabel={model.period} />}
      </div>
      <FormFooter noted={model.mode === "B"} />
    </div>
  );
}

// PRINT LAYOUT. Every number comes from printSpec.js (the Word export reads the same file, so
// printing and exporting always match). Page margin is 0 on purpose: that is what makes
// Chrome / Edge leave out their own date / title / web address / "1/1" text; the real margin is
// the padding on #printable-monthly-report.
const PR = "#printable-monthly-report";
const PAD = SPEC.pagePad;
const TW = SPEC.table.wide; // Quarterly (data-form B)
const TN = SPEC.table.narrow; // Monthly + Barangay (data-form A and C)
const HD = SPEC.header;
const PRINT_CSS = `@media print {
  @page { size: ${SPEC.pageSize}; margin: 0; }
  ${PR} { width: 100%; box-sizing: border-box; padding: ${PAD.top} ${PAD.right} ${PAD.bottom} ${PAD.left}; font-family: ${SPEC.fontFamily}; }
  ${PR} [data-form="A"] { padding-left: ${SPEC.sideInset.A}; padding-right: ${SPEC.sideInset.A}; }
  ${PR} [data-form="B"] { padding-left: ${SPEC.sideInset.B}; padding-right: ${SPEC.sideInset.B}; }
  ${PR} [data-form="C"] { padding-left: ${SPEC.sideInset.C}; padding-right: ${SPEC.sideInset.C}; }
  ${PR} .font-display { font-family: inherit !important; }

  /* heading */
  ${PR} .rep-header { margin-bottom: ${HD.gapAfter} !important; }
  ${PR} .rep-header p { line-height: ${HD.lineHeight} !important; }
  ${PR} .rep-small { font-size: ${HD.small}pt !important; }
  ${PR} .rep-office { font-size: ${HD.office}pt !important; font-weight: 600 !important; }
  ${PR} .rep-title { font-size: ${HD.title}pt !important; font-weight: 400 !important; }
  ${PR} .rep-period { font-weight: 400 !important; }
  ${PR} .rep-sec-office { font-size: ${HD.sectionOffice}pt !important; }
  ${PR} .rep-sec-title { font-size: ${HD.sectionTitle}pt !important; }

  /* table: equal columns that still widen when a word does not fit */
  ${PR} table { min-width: 0 !important; width: 100% !important; }
  ${PR} col { width: var(--w); }
  ${PR} th, ${PR} td { overflow-wrap: break-word; }
  ${PR} .overflow-x-auto { overflow: visible !important; }
  ${PR} tr { break-inside: avoid; }

  /* Monthly + Barangay forms (many columns, smaller type) */
  ${PR} th { padding: ${TN.thPad} !important; font-size: ${TN.th}pt !important; line-height: ${TN.thLine} !important; }
  ${PR} td { padding: ${TN.tdPad} !important; font-size: ${TN.td}pt !important; }
  ${PR} td span.uppercase { font-size: ${TN.tag}pt !important; letter-spacing: 0 !important; }
  ${PR} td.sexcell { padding: 0 !important; }

  /* Quarterly form (bigger type, tall header, taller rows) */
  ${PR} [data-form="B"] th { padding: ${TW.thPad} !important; font-size: ${TW.th}pt !important; line-height: ${TW.thLine} !important; }
  ${PR} [data-form="B"] thead tr:nth-child(2) th { height: ${TW.subHeaderHeight} !important; }
  ${PR} [data-form="B"] td { padding: ${TW.tdPad} !important; font-size: ${TW.td}pt !important; line-height: ${TW.tdLine} !important; }
  ${PR} [data-form="B"] td.sexcell { padding: 0 !important; }
  ${PR} [data-form="B"] td span.uppercase { font-size: ${TW.tag}pt !important; }
  ${PR} [data-form="B"] td.sexcell span { padding-top: ${TW.tagPadY} !important; padding-bottom: ${TW.tagPadY} !important; }

  /* big totals */
  ${PR} td[class*="text-base"] { font-size: ${SPEC.table.base}pt !important; }
  ${PR} td[class*="text-xl"] { font-size: ${SPEC.table.xl}pt !important; }
}`;

// ---------------------------------------------------------------------------
// Bottom of the page: the By Dentist / By Barangay tabs, the filters under them,
// and the report laid out like the paper e-FHSIS form. It loads its own data, so
// it never touches the filters or the report at the top of the page.
// ---------------------------------------------------------------------------
function ReportFormSection({ tab, setTab }) {
  const nowYm = new Date().toISOString().slice(0, 7);
  const [fromMonth, setFromMonth] = useState(nowYm.slice(5, 7)); // "01".."12"
  const [toMonth, setToMonth] = useState(""); // "" = just the one month above
  const [year, setYear] = useState(nowYm.slice(0, 4));
  const [doctor, setDoctor] = useState("");
  const [barangay, setBarangay] = useState("");
  const [sex, setSex] = useState("all"); // "all" | "m" | "f"
  const [ageKeys, setAgeKeys] = useState([]); // age group keys; [] = all
  const [data, setData] = useState([]); // [{ month, dentistRows, barangayRows }]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const thisYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 12 }, (_, i) => String(thisYear + 1 - i)).map((y) => ({ value: y, label: y }));
  const months = useMemo(() => monthsBetween(fromMonth, toMonth, year), [fromMonth, toMonth, year]);
  const multi = months.length > 1;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all(
      months.map((m) =>
        Promise.all([api.get(`/monthly-reports?month=${m}&scope=dentist`), api.get(`/monthly-reports?month=${m}&scope=barangay`)])
      )
    )
      .then((results) => {
        if (!cancelled) setData(results.map(([d, b], i) => ({ month: months[i], dentistRows: d.rows, barangayRows: b.rows })));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [months]);

  const doctorNames = useMemo(() => [...new Set(data.flatMap((md) => md.dentistRows.map((r) => r.scope_name)))], [data]);
  const barangayNames = useMemo(() => [...new Set(data.flatMap((md) => md.barangayRows.map((r) => r.scope_name)))], [data]);

  const groups = useMemo(
    () =>
      CATEGORY_GROUPS.map((g) => ({ ...g, sexes: g.sexes.filter((x) => sex === "all" || x === sex) })).filter(
        (g) => g.sexes.length > 0 && (ageKeys.length === 0 || ageKeys.includes(g.key))
      ),
    [ageKeys, sex]
  );
  const filtered = ageKeys.length > 0 || sex !== "all";
  const anyFilter = Boolean(doctor || barangay || filtered || toMonth);

  const model = useMemo(() => {
    const first = months[0];
    const last = months[months.length - 1];
    const period = multi ? `${monthNameOf(first)}-${monthNameOf(last)} ${year}` : `${monthNameOf(first)}-${year}`;
    const base = { groups, period };
    const rowsOf = (md) =>
      tab === "dentist"
        ? doctor ? md.dentistRows.filter((r) => r.scope_name === doctor) : md.dentistRows
        : barangay ? md.barangayRows.filter((r) => r.scope_name === barangay) : md.barangayRows;

    // Form B — the overall report: a Male/Female row pair for every month.
    if (multi) {
      const title =
        months.length === 12
          ? "Annual Report on Dental Services e-FHSIS –"
          : months.length === 3
          ? "Quarterly Report on Dental Services e-FHSIS –"
          : "Report on Dental Services e-FHSIS –";
      return {
        ...base,
        mode: "B",
        title,
        sexRows: sex === "all" ? ["m", "f"] : [sex],
        months: data.map((md) => ({ key: md.month, label: monthNameOf(md.month), t: sumRows(rowsOf(md), groups, filtered) })),
      };
    }
    const md = data[0];
    if (!md) return { ...base, mode: "A", title: "", lead: "", rows: [] };

    // Form C — the Barangay sheet. (No DMFT column on it, unless picked on purpose.)
    if (tab === "barangay") {
      const cGroups = groups
        .filter((g) => ageKeys.length > 0 || g.key !== "dmft")
        .sort((a, b) => BARANGAY_ORDER.indexOf(a.key) - BARANGAY_ORDER.indexOf(b.key));
      return {
        ...base,
        mode: "C",
        groups: cGroups,
        period: `MONTH OF ${monthNameOf(first)} ${year}`,
        rows: rowsOf(md).map((r) => ({
          key: r.id ?? r.scope_name,
          label: r.scope_name,
          population: r.projected_population,
          t: sumRows([r], cGroups, true),
        })),
      };
    }
    // Form A, one dentist — a row for each of the three activities (always all three, like the paper form).
    if (doctor) {
      const order = ["consultation_extraction", "ekonsulta", "dental_mission"];
      return {
        ...base,
        mode: "A",
        title: "Monthly Report on Dental Services e-FHSIS",
        lead: drName(doctor),
        rows: order.map((type) => ({
          key: type,
          label: ACTIVITY_LABELS[type],
          t: sumRows(rowsOf(md).filter((r) => r.activity_type === type), groups, filtered),
        })),
      };
    }
    // Form A, all dentists — Consolidated.
    const byName = new Map();
    for (const r of md.dentistRows) {
      if (!byName.has(r.scope_name)) byName.set(r.scope_name, []);
      byName.get(r.scope_name).push(r);
    }
    return {
      ...base,
      mode: "A",
      underline: true,
      title: "Consolidated Monthly Report on Dental Services e-FHSIS",
      lead: "",
      rows: [...byName.entries()].map(([name, rows]) => ({ key: name, label: drName(name), t: sumRows(rows, groups, filtered) })),
    };
  }, [tab, doctor, barangay, sex, ageKeys, groups, filtered, multi, months, year, data]);

  function clearAll() {
    setDoctor("");
    setBarangay("");
    setSex("all");
    setAgeKeys([]);
    setToMonth("");
  }

  // Export = an editable Word file (.doc) with the full header (seals) and the
  // Prepared by / Noted by footer. Print is separate (window.print()).
  async function handleExport() {
    setExporting(true);
    try {
      await exportOfficialForm({
        model,
        container: document.getElementById("printable-monthly-report"),
        seals: [SEAL_LEFT, SEAL_RIGHT],
        signatories: SIGNATORIES,
      });
    } catch (e) {
      setError(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
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
      </div>

      {/* Filters under the tabs: one simple list of typeable boxes. */}
      <div className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3 print:hidden">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-forest-950">Filters</p>
          {anyFilter && (
            <button type="button" onClick={clearAll} className="text-xs font-semibold underline text-forest-700 hover:text-forest-950">
              Clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-forest-700">
          <label className="flex items-center gap-1.5">
            Month (from)
            <SuggestInput
              value={fromMonth}
              onSelect={(v) => v && setFromMonth(v)}
              options={MONTH_OPTIONS}
              placeholder="Type month"
              width="w-28"
            />
          </label>

          <label className="flex items-center gap-1.5">
            Month (to)
            <SuggestInput
              value={toMonth}
              onSelect={setToMonth}
              options={MONTH_OPTIONS}
              placeholder="Optional"
              ariaLabel="Month to (optional — leave blank for one month only)"
              width="w-28"
            />
          </label>

          <label className="flex items-center gap-1.5">
            Year
            <SuggestInput value={year} onSelect={(y) => y && setYear(y)} options={yearOptions} placeholder="Year" width="w-20" />
          </label>

          {tab === "dentist" ? (
            <label className="flex items-center gap-1.5">
              Doctor
              <SuggestInput
                value={doctor}
                onSelect={setDoctor}
                options={doctorNames.map((n) => ({ value: n, label: drName(n) }))}
                placeholder="Type doctor"
                width="w-40"
              />
            </label>
          ) : (
            <label className="flex items-center gap-1.5">
              Barangay
              <SuggestInput
                value={barangay}
                onSelect={setBarangay}
                options={barangayNames.map((n) => ({ value: n, label: n }))}
                placeholder="Type barangay"
                width="w-40"
              />
            </label>
          )}

          <label className="flex items-center gap-1.5">
            Sex
            <SuggestInput
              value={sex === "all" ? "" : sex}
              onSelect={(v) => setSex(v || "all")}
              options={[
                { value: "m", label: "Male" },
                { value: "f", label: "Female" },
              ]}
              placeholder="Type sex"
              width="w-24"
            />
          </label>

          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1.5">
              Age group
              <SuggestInput
                value=""
                resetOnSelect
                onSelect={(key) => key && !ageKeys.includes(key) && setAgeKeys((cur) => [...cur, key])}
                options={CATEGORY_GROUPS.filter((g) => !ageKeys.includes(g.key)).map((g) => ({ value: g.key, label: GROUP_SHORT[g.key] }))}
                placeholder="Type age group"
                width="w-36"
              />
            </label>
            {ageKeys.map((key) => (
              <span key={key} className="inline-flex items-center gap-1 rounded-full bg-brand-900 text-brand-50 font-semibold pl-2.5 pr-1.5 py-0.5">
                {GROUP_SHORT[key]}
                <button
                  type="button"
                  onClick={() => setAgeKeys((cur) => cur.filter((k) => k !== key))}
                  aria-label={`Remove ${GROUP_SHORT[key]}`}
                  className="leading-none px-0.5 hover:opacity-70"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
        {multi && (
          <p className="mt-2 text-[11px] text-forest-500">
            Showing {months.length} months: {months.map((m) => monthNameOf(m).charAt(0) + monthNameOf(m).slice(1).toLowerCase()).join(", ")}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 print:hidden">{error}</p>}
      <Card
        title="Report form"
        subtitle="Official e-FHSIS layout · follows the filters above"
        action={
          <div className="flex gap-2 print:hidden">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 bg-cream-200 text-forest-800 text-sm font-semibold rounded-full px-4 py-2 hover:bg-cream-100"
            >
              <Printer size={15} /> Print
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || loading}
              className="inline-flex items-center gap-1.5 bg-brand-900 text-brand-50 text-sm font-semibold rounded-full px-4 py-2 hover:bg-brand-800 disabled:opacity-60"
            >
              <Download size={15} /> {exporting ? "Exporting…" : "Export (editable .doc)"}
            </button>
          </div>
        }
      >
        {/* Only this block prints (see the print rules in index.css). */}
        <div id="printable-monthly-report">
          <style>{PRINT_CSS}</style>
          <OfficialReport model={model} loading={loading} />
        </div>
      </Card>
    </div>
  );
}

export default function AdminMonthlyReport({ readOnly = false }) {
  const [tab, setTab] = useState("dentist");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [dentistRows, setDentistRows] = useState([]);
  const [barangayRows, setBarangayRows] = useState([]);
  const [servicesRendered, setServicesRendered] = useState([]);
  const [error, setError] = useState("");
  // Summary filters: which part to show, and (for Part III) which dentist.
  const [groupBy, setGroupBy] = useState("age");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reportView, setReportView] = useState("table"); // top report card: "table" | "bar" | "pie" | "line"
  const [dentistFilter, setDentistFilter] = useState("");
  // Extra report filters: barangay, age group(s) and sex.
  const [barangayFilter, setBarangayFilter] = useState("");
  const [ageFilter, setAgeFilter] = useState([]); // group keys; [] = all age groups
  const [sexFilter, setSexFilter] = useState("all"); // "all" | "m" | "f"
  // Exact age(s), e.g. "21" or "21-24" or "21, 23, 24". The monthly tallies only
  // store age *groups*, so exact ages are answered from the patient records.
  const [ageText, setAgeText] = useState("");
  const [patients, setPatients] = useState(null);
  const ageRanges = useMemo(() => parseAgeInput(ageText), [ageText]);
  const exactAgeOn = Array.isArray(ageRanges) && ageRanges.length > 0;
  useEffect(() => {
    if (ageText.trim() && patients === null) {
      api.get("/patients").then(setPatients).catch(() => setPatients([]));
    }
  }, [ageText, patients]);
  const agePatients = useMemo(() => {
    if (!exactAgeOn || !patients) return [];
    const lc = (v) => String(v || "").toLowerCase();
    return patients
      .filter((p) => p.age != null && p.age !== "" && ageRanges.some(([lo, hi]) => Number(p.age) >= lo && Number(p.age) <= hi))
      .filter((p) => !barangayFilter || lc(p.barangay) === lc(barangayFilter))
      .filter((p) => !dentistFilter || lc(p.latest_dentist).includes(lc(dentistFilter)))
      .filter((p) => sexFilter === "all" || lc(p.sex).startsWith(sexFilter))
      .sort((a, b) => Number(a.age) - Number(b.age) || String(a.name).localeCompare(String(b.name)));
  }, [patients, exactAgeOn, ageRanges, barangayFilter, dentistFilter, sexFilter]);

  // Columns (age groups x sex) that are currently visible/summed.
  const groups = useMemo(
    () =>
      CATEGORY_GROUPS.map((g) => ({ ...g, sexes: g.sexes.filter((x) => sexFilter === "all" || x === sexFilter) })).filter(
        (g) => g.sexes.length > 0 && (ageFilter.length === 0 || ageFilter.includes(g.key))
      ),
    [ageFilter, sexFilter]
  );
  const filtered = ageFilter.length > 0 || sexFilter !== "all";

  function load() {
    setError("");
    Promise.all([
      api.get(`/monthly-reports?month=${month}&scope=dentist`),
      api.get(`/monthly-reports?month=${month}&scope=barangay`),
      api.get(`/monthly-reports/services-rendered?month=${month}`),
    ])
      .then(([d, b, sr]) => {
        setDentistRows(d.rows);
        setBarangayRows(b.rows);
        setServicesRendered(sr.servicesRendered);
      })
      .catch((err) => setError(err.message));
  }
  useEffect(load, [month]);

  const dentistNames = useMemo(() => [...new Set(dentistRows.map((r) => r.scope_name))], [dentistRows]);
  const shownDentistRows = useMemo(
    () => (dentistFilter ? dentistRows.filter((r) => r.scope_name === dentistFilter) : dentistRows),
    [dentistRows, dentistFilter]
  );
  const shownBarangayRows = useMemo(
    () => (barangayFilter ? barangayRows.filter((r) => r.scope_name === barangayFilter) : barangayRows),
    [barangayRows, barangayFilter]
  );

  const dentistGroups = useMemo(() => {
    const byName = new Map();
    for (const r of shownDentistRows) {
      if (!byName.has(r.scope_name)) byName.set(r.scope_name, []);
      byName.get(r.scope_name).push(r);
    }
    return [...byName.entries()];
  }, [shownDentistRows]);

  const dentistPerDentistTotals = useMemo(
    () => dentistGroups.map(([name, rows]) => ({ name, totals: sumRows(rows, groups, filtered) })),
    [dentistGroups, groups, filtered]
  );
  const grandTotal = useMemo(() => sumRows(shownDentistRows, groups, filtered), [shownDentistRows, groups, filtered]);
  const barangayGrandTotal = useMemo(() => sumRows(shownBarangayRows, groups, filtered), [shownBarangayRows, groups, filtered]);
  // Part I: barangay figures by default; if only a doctor is picked, that doctor's figures.
  const partITotals = !barangayFilter && dentistFilter ? grandTotal : barangayGrandTotal;

  // Filters that are actually visible in the panel for the current "Group by".
  const activeCount = [
    groupBy !== "barangay" && barangayFilter,
    groupBy !== "dentist" && dentistFilter,
    sexFilter !== "all",
    ageText.trim(),
    groupBy !== "age" && ageFilter.length > 0,
  ].filter(Boolean).length;
  const anyFilter = Boolean(barangayFilter || dentistFilter || filtered || ageText.trim());
  function clearFilters() {
    setBarangayFilter("");
    setDentistFilter("");
    setAgeFilter([]);
    setSexFilter("all");
    setAgeText("");
  }
  function toggleAge(key) {
    setAgeFilter((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }
  const notes = [];
  if (barangayFilter && dentistFilter && groupBy === "age") notes.push("Barangay and doctor figures are tallied separately, so age groups show the barangay figures when both are picked.");
  if (barangayFilter && groupBy === "dentist") notes.push("The barangay filter doesn't apply when grouped by dentist (those are counted per doctor).");
  if (dentistFilter && groupBy === "barangay") notes.push("The doctor filter doesn't apply when grouped by barangay (barangay tallies aren't recorded per doctor).");
  if (anyFilter && groupBy === "services") notes.push("Services are counted for the whole month and aren't affected by the other filters.");
  if (exactAgeOn) notes.push("Exact ages come from the patient records, so they're listed in the card below. The table itself only knows age groups — use the chips for that.");

  // The single summary table: one row per item of the chosen category.
  const summary = useMemo(() => {
    const mfOf = (t) => ({
      m: groups.reduce((sum, g) => sum + (g.sexes.includes("m") ? t[`${g.key}_m`] || 0 : 0), 0),
      f: groups.reduce((sum, g) => sum + (g.sexes.includes("f") ? t[`${g.key}_f`] || 0 : 0), 0),
    });
    let rows = [];
    let official = null; // the saved grand total, when there is one
    if (groupBy === "age") {
      rows = groups.map((g) => {
        const m = g.sexes.includes("m") ? partITotals[`${g.key}_m`] || 0 : null;
        const f = g.sexes.includes("f") ? partITotals[`${g.key}_f`] || 0 : null;
        return { key: g.key, label: g.label, m, f, total: (m || 0) + (f || 0) };
      });
      official = partITotals.total;
    } else if (groupBy === "barangay") {
      rows = shownBarangayRows.map((r) => {
        const { m, f } = mfOf(r);
        return { key: r.id ?? r.scope_name, label: r.scope_name, m, f, total: filtered ? rowTotal(r, groups) : r.total };
      });
      official = barangayGrandTotal.total;
    } else if (groupBy === "dentist") {
      rows = dentistPerDentistTotals.map(({ name, totals }) => ({ key: name, label: drName(name), ...mfOf(totals), total: totals.total }));
      official = grandTotal.total;
    } else {
      rows = servicesRendered.map((r) => ({ key: r.label, label: r.label, m: null, f: null, total: r.value }));
    }
    const rowsSum = rows.reduce((sum, r) => sum + (r.total || 0), 0);
    const grand = {
      m: groupBy === "services" ? null : rows.reduce((sum, r) => sum + (r.m || 0), 0),
      f: groupBy === "services" ? null : rows.reduce((sum, r) => sum + (r.f || 0), 0),
      total: !filtered && official !== null ? official : rowsSum,
    };
    return { rows, grand, rowsSum };
  }, [groupBy, groups, filtered, partITotals, shownBarangayRows, barangayGrandTotal, dentistPerDentistTotals, grandTotal, servicesRendered]);

  return (
    <div className="space-y-6">
      {readOnly && (
        <div className="bg-clay-500/10 border border-clay-500 text-forest-900 text-sm rounded-lg px-3 py-2 print:hidden">
          Preview only — doctor accounts can view the Reports page but cannot edit figures.
        </div>
      )}
      <div className="flex items-start justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-forest-950">
            Reports on Dental Services (e-FHSIS)
          </h1>
          <p className="text-sm font-medium text-forest-700 mt-1">
            City Dental Office · City of Tayabas, Province of Quezon · {formatMonthLabel(month)}
          </p>
        </div>
      </div>

      {/* Slim toolbar: the two things you change most (month, group by) plus a
          collapsible "Filters" panel, so it doesn't take space from the data. */}
      <div className="print:hidden rounded-xl border border-cream-200 bg-cream-50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-forest-700">
          <label className="flex items-center gap-1.5">
            Month
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-cream-200 bg-cream-100 px-2 py-1 text-xs text-forest-950"
            />
          </label>

          <label className="flex items-center gap-1.5">
            Group by
            <select
              value={groupBy}
              onChange={(e) => {
                const next = e.target.value;
                setGroupBy(next);
                // Grouping by X makes a filter on X pointless, so drop it.
                if (next === "barangay") setBarangayFilter("");
                if (next === "dentist") setDentistFilter("");
                if (next === "age") setAgeFilter([]);
              }}
              className="rounded-lg border border-cream-200 bg-cream-100 px-2 py-1 text-xs font-semibold text-forest-950"
            >
              {GROUP_BY.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-colors ${
              activeCount ? "bg-brand-900 text-brand-50" : "bg-cream-100 border border-cream-200 text-forest-900 hover:bg-cream-200"
            }`}
          >
            Filters{activeCount ? ` (${activeCount})` : ""} <span aria-hidden="true">{filtersOpen ? "▴" : "▾"}</span>
          </button>

          {anyFilter && (
            <button type="button" onClick={clearFilters} className="font-semibold underline hover:text-forest-950">
              Clear
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="mt-2 pt-2 border-t border-cream-200 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-forest-700">
            {groupBy !== "barangay" && (
              <label className="flex items-center gap-1.5">
                Barangay
                <SuggestInput
                  value={barangayFilter}
                  onSelect={setBarangayFilter}
                  options={barangayRows.map((r) => ({ value: r.scope_name, label: r.scope_name }))}
                  placeholder="Type barangay"
                  width="w-40"
                />
              </label>
            )}
            {groupBy !== "dentist" && (
              <label className="flex items-center gap-1.5">
                Doctor
                <SuggestInput
                  value={dentistFilter}
                  onSelect={setDentistFilter}
                  options={dentistNames.map((n) => ({ value: n, label: drName(n) }))}
                  placeholder="Type doctor"
                  width="w-40"
                />
              </label>
            )}
            <label className="flex items-center gap-1.5">
              Sex
              <SuggestInput
                value={sexFilter === "all" ? "" : sexFilter}
                onSelect={(v) => setSexFilter(v || "all")}
                options={[
                  { value: "m", label: "Male" },
                  { value: "f", label: "Female" },
                ]}
                placeholder="Male / Female"
                width="w-28"
              />
            </label>
            <label className="flex items-center gap-1.5">
              Age
              <input
                type="text"
                inputMode="numeric"
                value={ageText}
                onChange={(e) => setAgeText(e.target.value)}
                placeholder="21 or 21-24"
                aria-label="Type an exact age or age range"
                className="w-28 rounded-lg border border-cream-200 bg-cream-100 px-2 py-1 text-xs text-forest-950"
              />
            </label>
            {ageRanges === null && <span className="text-red-600">Use 21, 21-24 or 21, 23</span>}
            {groupBy !== "age" && (
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="flex items-center gap-1.5">
                  Age group
                  <SuggestInput
                    value=""
                    resetOnSelect
                    onSelect={(key) => key && !ageFilter.includes(key) && toggleAge(key)}
                    options={CATEGORY_GROUPS.filter((g) => !ageFilter.includes(g.key)).map((g) => ({ value: g.key, label: GROUP_SHORT[g.key] }))}
                    placeholder="Type age group"
                    width="w-36"
                  />
                </label>
                {ageFilter.map((key) => (
                  <span key={key} className="inline-flex items-center gap-1 rounded-full bg-brand-900 text-brand-50 font-semibold pl-2.5 pr-1.5 py-0.5">
                    {GROUP_SHORT[key]}
                    <button type="button" onClick={() => toggleAge(key)} aria-label={`Remove ${GROUP_SHORT[key]}`} className="leading-none px-0.5 hover:opacity-70">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <label className="flex items-center gap-1.5">
              View as
              <select
                value={reportView}
                onChange={(e) => setReportView(e.target.value)}
                className="rounded-lg border border-cream-200 bg-cream-100 px-2 py-1 text-xs text-forest-950"
              >
                {REPORT_VIEWS.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {notes.length > 0 && (
          <div className="mt-1.5 text-[11px] leading-snug text-forest-500 space-y-0.5">
            {notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        )}
      </div>

      {exactAgeOn && (
        <Card
          className="print:hidden"
          title={`Patients aged ${ageText.trim()}`}
          subtitle={
            patients === null
              ? "Loading patient records…"
              : `${agePatients.length} patient${agePatients.length === 1 ? "" : "s"} · ${
                  agePatients.filter((p) => String(p.sex || "").toLowerCase().startsWith("m")).length
                } male · ${agePatients.filter((p) => String(p.sex || "").toLowerCase().startsWith("f")).length} female`
          }
        >
          {agePatients.length ? (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-forest-500 uppercase text-xs tracking-wide">
                    <th className="py-2 font-semibold">Name</th>
                    <th className="py-2 font-semibold">Age</th>
                    <th className="py-2 font-semibold">Sex</th>
                    <th className="py-2 font-semibold">Barangay</th>
                    <th className="py-2 font-semibold">Doctor</th>
                    <th className="py-2 font-semibold">Latest procedure</th>
                  </tr>
                </thead>
                <tbody>
                  {agePatients.map((p) => (
                    <tr key={p.id} className="border-t border-cream-200">
                      <td className="py-2 font-medium text-forest-950">{p.name}</td>
                      <td className="py-2 text-forest-700">{p.age}</td>
                      <td className="py-2 text-forest-700">{p.sex || "—"}</td>
                      <td className="py-2 text-forest-700">{p.barangay || "—"}</td>
                      <td className="py-2 text-forest-700">{p.latest_dentist || "—"}</td>
                      <td className="py-2 text-forest-700">{p.latest_procedure || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            patients !== null && <EmptyState>No patients match this age with the current barangay / doctor / sex filters.</EmptyState>
          )}
        </Card>
      )}

      {/* One combined table. The "Group by" pills above decide what the rows
          are: age groups, barangays, dentists or services. */}
      <Card
        className="print:hidden"
        title={`Report by ${GROUP_BY.find((g) => g.key === groupBy).label}`}
        subtitle={`${summary.rows.length} row${summary.rows.length === 1 ? "" : "s"} · ${formatMonthLabel(month)}`}
      >
        {summary.rows.length && reportView !== "table" ? (
          <ReportChartView rows={summary.rows} groupBy={groupBy} kind={reportView} />
        ) : summary.rows.length ? (
          <div className="overflow-auto max-h-[34rem]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-cream-50">
                <tr className="text-left text-forest-500 uppercase text-xs tracking-wide">
                  <th className="py-2 font-semibold">{GROUP_BY.find((g) => g.key === groupBy).column}</th>
                  <th className="py-2 font-semibold text-right">Male</th>
                  <th className="py-2 font-semibold text-right">Female</th>
                  <th className="py-2 font-semibold text-right">Total</th>
                  <th className="py-2 font-semibold text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((r) => (
                  <tr key={r.key} className="border-t border-cream-200">
                    <td className="py-2 text-forest-950">{r.label}</td>
                    <td className="py-2 text-right text-forest-700">{r.m === null ? "—" : r.m}</td>
                    <td className="py-2 text-right text-forest-700">{r.f === null ? "—" : r.f}</td>
                    <td className="py-2 text-right font-semibold text-forest-950">{r.total}</td>
                    <td className="py-2 text-right text-forest-500">
                      {summary.rowsSum ? ((r.total / summary.rowsSum) * 100).toFixed(1) : "0.0"}%
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-brand-900 font-bold text-forest-950 sticky bottom-0 bg-cream-50">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{summary.grand.m === null ? "—" : summary.grand.m}</td>
                  <td className="py-2 text-right">{summary.grand.f === null ? "—" : summary.grand.f}</td>
                  <td className="py-2 text-right">{summary.grand.total}</td>
                  <td className="py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>
            {groupBy === "services"
              ? "No service records logged this month yet."
              : groupBy === "dentist"
              ? "No dentists match — add one in Staff Management or clear the filters."
              : "Nothing to show for these filters."}
          </EmptyState>
        )}
      </Card>

      <SummaryChart
        rows={summary.rows}
        groupBy={groupBy}
        title={`Chart — by ${GROUP_BY.find((g) => g.key === groupBy).label}`}
      />

      <ReportFormSection tab={tab} setTab={setTab} />

      {error && <p className="text-sm text-red-600 print:hidden">{error}</p>}
    </div>
  );
}