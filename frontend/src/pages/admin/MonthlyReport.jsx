import { useEffect, useMemo, useState } from "react";
import { Printer, Download } from "lucide-react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../../components/ui";
import EditableCell from "../../components/EditableCell";

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

function GroupHeaderRows({ groups }) {
  return (
    <>
      <tr>
        <th className="px-2 py-1 text-left sticky left-0 bg-brand-900" rowSpan={2}>
          &nbsp;
        </th>
        {groups.map((g) => (
          <th key={g.key} colSpan={g.sexes.length} className="px-2 py-1 text-center border-l border-forest-700 align-bottom">
            {g.label}
          </th>
        ))}
        <th className="px-2 py-1 text-center border-l border-forest-700" rowSpan={2}>
          Total
        </th>
      </tr>
      <tr>
        {groups.flatMap((g) =>
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

function EditableRow({ row, rowLabel, onSaveField, groups, filtered, editable = true }) {
  return (
    <tr className="border-t border-cream-200">
      <td className="px-2 py-1.5 font-medium text-forest-950 sticky left-0 bg-cream-50 whitespace-nowrap">{rowLabel}</td>
      {groups.flatMap((g) =>
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
      <td className="px-2 py-1.5 text-center border-l border-cream-200 font-semibold text-forest-950">{filtered ? rowTotal(row, groups) : row.total}</td>
    </tr>
  );
}

function TotalsRow({ label, totals, groups }) {
  return (
    <tr className="border-t-2 border-brand-900 bg-cream-200 font-semibold">
      <td className="px-2 py-1.5 sticky left-0 bg-cream-200 whitespace-nowrap">{label}</td>
      {groups.flatMap((g) =>
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

// What the single summary table is grouped by ("category" the rows are assigned to).
const GROUP_BY = [
  { key: "age", label: "Age group", column: "Age group / Indicator" },
  { key: "barangay", label: "Barangay", column: "Barangay" },
  { key: "dentist", label: "Dentist assigned", column: "Dentist" },
  { key: "services", label: "Services", column: "Service" },
];

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

export default function AdminMonthlyReport({ readOnly = false }) {
  const [tab, setTab] = useState("dentist");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [dentistRows, setDentistRows] = useState([]);
  const [barangayRows, setBarangayRows] = useState([]);
  const [servicesRendered, setServicesRendered] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Summary filters: which part to show, and (for Part III) which dentist.
  const [groupBy, setGroupBy] = useState("age");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reportView, setReportView] = useState("table"); // top report card: "table" | "bar" | "pie" | "line"
  const [showEntry, setShowEntry] = useState(false); // editable per-dentist / per-barangay tables
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
    setLoading(true);
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
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
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
  const visibleDentistTotals = dentistPerDentistTotals;
  const consolidatedByActivity = useMemo(() => {
    const byActivity = new Map();
    for (const r of shownDentistRows) {
      if (!byActivity.has(r.activity_type)) byActivity.set(r.activity_type, []);
      byActivity.get(r.activity_type).push(r);
    }
    return [...byActivity.entries()].map(([activity, rows]) => ({ activity, totals: sumRows(rows, groups, filtered) }));
  }, [shownDentistRows, groups, filtered]);
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
  const filterText = [
    barangayFilter && `Barangay: ${barangayFilter}`,
    dentistFilter && `Doctor: ${drName(dentistFilter)}`,
    ageText.trim() && `Exact age: ${ageText.trim()}`,
    ageFilter.length > 0 && `Age: ${CATEGORY_GROUPS.filter((g) => ageFilter.includes(g.key)).map((g) => GROUP_SHORT[g.key]).join(", ")}`,
    sexFilter !== "all" && `Sex: ${sexFilter === "m" ? "Male" : "Female"}`,
  ]
    .filter(Boolean)
    .join(" · ");
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

  function printForm() {
    // The paper-form tables are what prints, so make sure they're on screen first.
    setShowEntry(true);
    setTimeout(() => window.print(), 200);
  }

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
    <div className="space-y-6">
      {readOnly && (
        <div className="bg-clay-500/10 border border-clay-500 text-forest-900 text-sm rounded-lg px-3 py-2 print:hidden">
          Preview only — doctor accounts can view the Reports page but cannot edit figures.
        </div>
      )}
      <div className="flex items-start justify-between flex-wrap gap-3 print:mb-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-forest-950">
            Reports on Dental Services (e-FHSIS)
          </h1>
          <p className="text-sm font-medium text-forest-700 mt-1">
            City Dental Office · City of Tayabas, Province of Quezon · {formatMonthLabel(month)}
          </p>
          {filterText && <p className="hidden print:block text-xs text-forest-700 mt-1">Filters — {filterText}</p>}
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

      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <button
            type="button"
            onClick={() => setShowEntry((v) => !v)}
            aria-expanded={showEntry}
            className="text-sm font-semibold rounded-full px-4 py-2 bg-cream-200 text-forest-800 hover:bg-cream-300"
          >
            {showEntry ? "Hide" : "Show"} entry tables (edit counts)
          </button>
          {showEntry && (
            <p className="text-sm text-forest-700 max-w-2xl mt-2">
              Digitized version of the City Dental Office's monthly report — enter counts cell-by-cell like the paper
              form, per dentist or per barangay. Subtotals and the overall total are calculated for you.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={printForm}
            className="inline-flex items-center gap-1.5 bg-cream-200 text-forest-800 text-sm font-semibold rounded-full px-4 py-2 hover:bg-cream-300"
          >
            <Printer size={15} /> Print
          </button>
          <button
            onClick={printForm}
            className="inline-flex items-center gap-1.5 bg-brand-900 text-brand-50 text-sm font-semibold rounded-full px-4 py-2 hover:bg-brand-800"
          >
            <Download size={15} /> Export official form
          </button>
        </div>
      </div>

      {showEntry && (
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
      </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <EmptyState>Loading…</EmptyState>}

      {/* id="printable-monthly-report" hooks into the site-wide print rules
          (see index.css) that hide everything else on the page and reveal
          just this block — same mechanism the Patients page print uses.
          Only one of the two tabs below is ever mounted at a time, so
          whichever one is on screen is what prints. */}
      {/* Only the editable tables are locked for doctors — the filters, tabs
          and Print stay usable. */}
      <fieldset disabled={readOnly} style={{ display: "contents" }}>
      <div id="printable-monthly-report">
      {showEntry && !loading && tab === "dentist" && (
        <div className="space-y-6">
          {dentistGroups.length === 0 && (
            <EmptyState>No dentists on Staff Management yet — add one there to start logging this month's report.</EmptyState>
          )}

          {dentistGroups.map(([name, rows]) => (
            <Card key={name} title={drName(name)} className="print:break-after-page">
              <div className="overflow-x-auto">
                <table className="text-xs w-full min-w-[1400px]">
                  <thead className="bg-brand-900 text-brand-50">
                    <GroupHeaderRows groups={groups} />
                  </thead>
                  <tbody>
                    {rows
                      .slice()
                      .sort((a, b) => ["consultation_extraction", "ekonsulta", "dental_mission"].indexOf(a.activity_type) - ["consultation_extraction", "ekonsulta", "dental_mission"].indexOf(b.activity_type))
                      .map((r) => (
                        <EditableRow key={r.id} row={r} rowLabel={ACTIVITY_LABELS[r.activity_type]} onSaveField={saveField} editable={!readOnly} groups={groups} filtered={filtered} />
                      ))}
                    <TotalsRow label="Subtotal" totals={dentistPerDentistTotals.find((d) => d.name === name)?.totals ?? emptyTotals()} groups={groups} />
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
                    <GroupHeaderRows groups={groups} />
                  </thead>
                  <tbody>
                    {consolidatedByActivity.map(({ activity, totals }) => (
                      <tr key={activity} className="border-t border-cream-200">
                        <td className="px-2 py-1.5 font-medium text-forest-950 sticky left-0 bg-cream-50 whitespace-nowrap">
                          {ACTIVITY_LABELS[activity]}
                        </td>
                        {groups.flatMap((g) =>
                          g.sexes.map((s) => (
                            <td key={`${g.key}_${s}`} className="px-1 py-1.5 border-l border-cream-200 text-center">
                              {totals[`${g.key}_${s}`]}
                            </td>
                          ))
                        )}
                        <td className="px-2 py-1.5 text-center border-l border-cream-200 font-semibold">{totals.total}</td>
                      </tr>
                    ))}
                    <TotalsRow label="Overall Total" totals={grandTotal} groups={groups} />
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {showEntry && !loading && tab === "barangay" && (
        <Card title={barangayFilter ? `${barangayFilter} — ${month}` : `All 66 barangays — ${month}`}>
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
                  {groups.map((g) => (
                    <th key={g.key} colSpan={g.sexes.length} className="px-2 py-1 text-center border-l border-forest-700 align-bottom">
                      {g.label}
                    </th>
                  ))}
                  <th className="px-2 py-1 text-center border-l border-forest-700" rowSpan={2}>
                    Grand Total
                  </th>
                </tr>
                <tr>
                  {groups.flatMap((g) =>
                    g.sexes.map((s) => (
                      <th key={`${g.key}_${s}`} className="px-1 py-1 text-center border-l border-forest-700 font-normal">
                        {s.toUpperCase()}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {shownBarangayRows.map((r) => (
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
                    {groups.flatMap((g) =>
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
                    <td className="px-2 py-1.5 text-center border-l border-cream-200 font-semibold text-forest-950">{filtered ? rowTotal(r, groups) : r.total}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-brand-900 bg-cream-200 font-semibold">
                  <td className="px-2 py-1.5 sticky left-0 bg-cream-200">Grand Total</td>
                  <td className="px-1 py-1.5 border-l border-cream-300"></td>
                  {groups.flatMap((g) =>
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
      </fieldset>
    </div>
  );
}