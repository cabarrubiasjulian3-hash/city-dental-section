// Small, dependency-free chart primitives (SVG + CSS) so the dashboard doesn't need a charting
// library. Every chart is hoverable (tooltip / highlight) and animates in once.

import { useEffect, useMemo, useRef, useState } from "react";

// Calm greens first (the biggest slices get the rich greens), with gold / clay / brown only as small
// accents. Dark and light alternate so neighbouring slices can still be told apart.
const PALETTE = [
  "#2f6f4f",
  "#d9ab4b",
  "#5b86a8",
  "#a8cf8f",
  "#c8694b",
  "#3a9188",
  "#8e6b8f",
  "#1f4a3a",
  "#e3955a",
  "#7fbf9d",
];
const OTHER_COLOR = "#c7bfa4";

export function colorFor(index, isOther = false) {
  return isOther ? OTHER_COLOR : PALETTE[index % PALETTE.length];
}

const nf = (n) => Number(n || 0).toLocaleString();
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Turns true one frame after mount, so bars / rings can transition from 0 to their real size.
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setM(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return m;
}

// A number that counts up to its value (used by the dashboard KPI cards).
export function AnimatedNumber({ value, duration = 900, format = nf }) {
  const [shown, setShown] = useState(reducedMotion() ? value : 0);
  useEffect(() => {
    if (reducedMotion() || typeof value !== "number") {
      setShown(value);
      return;
    }
    let raf;
    const start = performance.now();
    const from = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{typeof shown === "number" ? format(shown) : shown}</>;
}

// Floating tooltip that follows the pointer inside a `relative` wrapper.
function useTip() {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const show = (e, content) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, content });
  };
  const hide = () => setTip(null);
  return { ref, tip, show, hide };
}

function Tip({ tip }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg bg-brand-900 px-2.5 py-1.5 text-xs font-medium text-brand-50 shadow-lg whitespace-nowrap"
      style={{ left: tip.x, top: tip.y - 10 }}
    >
      {tip.content}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Ring: the shared engine of the pie and the donut (a pie is just a ring as thick as its radius).
// ---------------------------------------------------------------------------------------------
function Ring({ items, size, thickness, active, onActive, children }) {
  const mounted = useMounted();
  const total = items.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - thickness / 2;
  const C = 2 * Math.PI * r;
  const gap = items.length > 1 ? 2 : 0;
  let cursor = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90" role="img" aria-label="Chart">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} className="stroke-cream-200" />
        {items.map((d, i) => {
          const len = (d.value / total) * C;
          const seg = (
            <circle
              key={d.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={active === i ? thickness + 6 : thickness}
              strokeDasharray={`${mounted ? Math.max(0, len - gap) : 0} ${C}`}
              strokeDashoffset={-cursor}
              style={{
                transition: "stroke-dasharray 0.8s cubic-bezier(.2,.8,.2,1), stroke-width .15s, opacity .15s",
                opacity: active == null || active === i ? 1 : 0.35,
                cursor: "pointer",
              }}
              onMouseEnter={() => onActive(i)}
              onMouseLeave={() => onActive(null)}
            />
          );
          cursor += len;
          return seg;
        })}
      </svg>
      {children && (
        <div
          className="pointer-events-none absolute flex flex-col items-center justify-center text-center"
          style={{ inset: thickness + 6 }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// Legend row shared by the pie and the donut: dot, label, share bar, value and percentage.
function LegendList({ items, total, active, onActive }) {
  return (
    <ul className="w-full min-w-0 space-y-1">
      {items.map((d, i) => {
        const pct = total ? (d.value / total) * 100 : 0;
        return (
          <li
            key={d.label}
            onMouseEnter={() => onActive(i)}
            onMouseLeave={() => onActive(null)}
            className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors ${
              active === i ? "bg-cream-200" : ""
            } ${active != null && active !== i ? "opacity-60" : ""}`}
          >
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="min-w-0 flex-1 truncate text-forest-900" title={d.label}>
              {d.label}
            </span>
            <span className="shrink-0 tabular-nums font-semibold text-forest-950">{nf(d.value)}</span>
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-forest-600">{pct.toFixed(1)}%</span>
          </li>
        );
      })}
    </ul>
  );
}

// Fixed colour per BOHC age-group category (keyed by label so filtering zero rows out upstream
// doesn't shift anyone's colour).
const AGE_GROUP_COLORS = {
  "Orally Fit Children 12-59 mos": "#7fbf9d",
  "Clients 5 yrs old & above with DMFT": "#1f4a3a",
  "Infants 0-11 months (BOHC)": "#e3955a",
  "Children 1-4 yrs old (BOHC)": "#a8cf8f",
  "Children 5-9 yrs old (BOHC)": "#c8694b",
  "Adolescents 10-14 yrs old (BOHC)": "#3a9188",
  "Adolescents 15-19 yrs old (BOHC)": "#5b86a8",
  "Adults 20-59 yrs old (BOHC)": "#2f6f4f",
  "Senior citizens 60 yrs old & above (BOHC)": "#d9ab4b",
  "Pregnant Women provided with BOHC": "#8e6b8f",
};

// Donut with the big total in the middle ("Clinic Statistics — BOHC by Age Group"). Hover a slice
// or a legend row to highlight it; the middle then shows that category.
export function AgeGroupDonutChart({ data, size = 230, thickness = 38, centerLabel = "This Month" }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const [active, setActive] = useState(null);
  if (!total) return null;
  const items = data.map((d, i) => ({ ...d, color: d.color || AGE_GROUP_COLORS[d.label] || colorFor(i) }));
  const a = active != null ? items[active] : null;
  return (
    <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center">
      <Ring items={items} size={size} thickness={thickness} active={active} onActive={setActive}>
        <span className="text-3xl font-extrabold leading-tight tabular-nums text-forest-950">
          {nf(a ? a.value : total)}
        </span>
        <span className="line-clamp-2 max-w-[9rem] text-xs font-medium leading-tight text-forest-700">
          {a ? `${a.label} · ${((a.value / total) * 100).toFixed(1)}%` : centerLabel}
        </span>
      </Ring>
      <LegendList items={items} total={total} active={active} onActive={setActive} />
    </div>
  );
}

export function PieChart({ data, size = 176 }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const [active, setActive] = useState(null);
  if (!total) return null;
  const items = data.map((d, i) => ({ ...d, color: d.color || colorFor(i, d.isOther) }));
  const a = active != null ? items[active] : null;
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <Ring items={items} size={size} thickness={size / 2} active={active} onActive={setActive} />
      <div className="w-full min-w-0">
        <p className="mb-1 h-5 px-2 text-xs font-semibold text-forest-700">
          {a ? `${a.label}: ${nf(a.value)} (${((a.value / total) * 100).toFixed(1)}%)` : `${nf(total)} total`}
        </p>
        <div className="max-h-[22rem] overflow-y-auto pr-1">
          <LegendList items={items} total={total} active={active} onActive={setActive} />
        </div>
      </div>
    </div>
  );
}

// Fixed dark-to-light green palette for the BOHC-by-age-group donut, cycled
// in the SAME order as the category list (not sorted by value) — matches
// the reference design's look, and reuses the app's existing forest/leaf
// theme colors so it stays consistent with the rest of the UI.
const BOHC_GREENS = [
  "#16241a", // Orally Fit Children
  "#253522", // Clients w/ DMFT — forest-900
  "#4d6844", // Infants — forest-600
  "#6d9750", // Children 1-4
  "#a8e492", // Children 5-9 — leaf-300 (bright accent)
  "#8a6d3b", // Adolescents 10-14 (olive/tan accent)
  "#1c2618", // Adolescents 15-19 — forest-950
  "#2f4029", // Adults 20-59 — forest-800
  "#537a3c", // Senior citizens
  "#c8f0b8", // Pregnant Women — leaf-200 (lightest)
];
const DONUT_CARD_BG = "#b7e6a0"; // soft mint-green card background behind the ring

// Donut ("ring") chart with a big total number + caption centered in the
// hole, sitting inside a rounded, soft-green card — matches the "BOHC by
// Age Group" reference design. The legend on the right is dot + label only
// (no counts), same as the reference; hover a dot's label for the count.
export function DonutChart({ data, size = 208, thickness = 34, centerLabel = "This Month" }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (!total) return null;

  let cursor = 0;
  const stops = data.map((d, i) => {
    const startPct = (cursor / total) * 100;
    cursor += d.value;
    const endPct = (cursor / total) * 100;
    const color = d.color || BOHC_GREENS[i % BOHC_GREENS.length];
    return `${color} ${startPct}% ${endPct}%`;
  });
  const holeSize = size - thickness * 2;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="rounded-[2rem] p-7 shrink-0" style={{ backgroundColor: DONUT_CARD_BG }}>
        <div
          className="relative rounded-full flex items-center justify-center"
          style={{ width: size, height: size, background: `conic-gradient(${stops.join(", ")})` }}
          role="img"
          aria-label="Donut chart"
        >
          <div
            className="absolute rounded-full flex flex-col items-center justify-center text-center"
            style={{ width: holeSize, height: holeSize, backgroundColor: DONUT_CARD_BG }}
          >
            <span className="text-2xl sm:text-3xl font-extrabold text-forest-950 tabular-nums leading-tight">
              {total.toLocaleString()}
            </span>
            <span className="text-xs sm:text-sm text-forest-800">{centerLabel}</span>
          </div>
        </div>
      </div>
      <ul className="space-y-2.5 text-sm w-full min-w-0">
        {data.map((d, i) => {
          const color = d.color || BOHC_GREENS[i % BOHC_GREENS.length];
          return (
            <li key={d.label} className="flex items-center gap-2.5" title={`${d.value.toLocaleString()}`}>
              <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-forest-900">{d.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Horizontal bars (Top Barangays): one calm colour, rank number, value and share; bars grow in.
export function BarChart({ data, max, showRank = true, showShare = false, rankOffset = 0 }) {
  const mounted = useMounted();
  const barMax = max ?? Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => {
        const pct = Math.round((d.value / barMax) * 100);
        return (
          <div key={d.label} className="group" title={`${d.label}: ${nf(d.value)} (${((d.value / total) * 100).toFixed(1)}% of the list)`}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-baseline gap-2">
                {showRank && <span className="w-5 shrink-0 text-right text-xs tabular-nums text-forest-500">{i + 1 + rankOffset}</span>}
                <span className="truncate font-medium text-forest-900">{d.label}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-forest-950">
                {nf(d.value)}
                {showShare && <span className="ml-2 inline-block w-12 text-right text-xs font-normal text-forest-600">{((d.value / total) * 100).toFixed(1)}%</span>}
              </span>
            </div>
            <div className={`${showRank ? "ml-7" : ""} h-2.5 rounded-full bg-cream-200`}>
              <div
                className="h-2.5 rounded-full transition-[width,filter] duration-700 ease-out group-hover:brightness-110"
                style={{
                  width: mounted ? `${pct}%` : "0%",
                  backgroundColor: d.color || (i + rankOffset < 3 ? "#1f3d2b" : "#4c9a5a"),
                  transitionDelay: `${i * 40}ms`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const MALE_COLOR = "#1f4d2e";
const FEMALE_COLOR = "#e0b95c";

// "Nice" axis maximum + tick step so gridlines land on round-ish numbers.
function niceAxisMax(rawMax, ticks = 4) {
  if (rawMax <= 0) return { max: ticks, step: 1 };
  const roughStep = rawMax / ticks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  const allowed = [1, 2, 4, 5, 8, 10];
  const multiple = allowed.find((n) => n >= residual) || 10;
  const step = multiple * magnitude;
  return { max: step * ticks, step };
}

function roundedTopRectPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

// Rounded/"dome" bar chart (Services Rendered): share of total above each bar, full label below
// (wraps, never cut in the middle of a word), count + share on hover.
export function DomeBarChart({ data, maxHeight = 200, maxBarWidth = 108 }) {
  const mounted = useMounted();
  const { ref, tip, show, hide } = useTip();
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (!total) return null;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const maxValue = sorted[0].value;
  const DOME = ["#16241a", "#25401f", "#3d5c2f", "#537a3c", "#6d9750", "#8bb56c", "#a9cf8e"];
  // Spread the dark -> light shades over however many bars there are (no repeats, even with 10+).
  const shade = (i) => {
    const p = sorted.length > 1 ? (i / (sorted.length - 1)) * (DOME.length - 1) : 0;
    const k = Math.min(DOME.length - 2, Math.floor(p));
    const f = p - k;
    const hex = (c) => [1, 3, 5].map((j) => parseInt(c.slice(j, j + 2), 16));
    const [x, y] = [hex(DOME[k]), hex(DOME[k + 1])];
    return `rgb(${x.map((v, j) => Math.round(v + (y[j] - v) * f)).join(",")})`;
  };
  const many = sorted.length > 8; // too narrow for flat labels: tilt them

  return (
    <div ref={ref} className={`relative flex items-end justify-between gap-1.5 pt-2 ${many ? "overflow-x-auto pl-14" : ""}`} style={{ minHeight: maxHeight + (many ? 180 : 84) }}>
      <Tip tip={tip} />
      {sorted.map((d, i) => {
        const pct = (d.value / total) * 100;
        const heightPx = Math.max(28, (d.value / maxValue) * maxHeight);
        const color = d.color || shade(i);
        return (
          <div
            key={d.label}
            className="flex min-w-0 flex-1 basis-0 flex-col items-center"
            onMouseMove={(e) => show(e, `${d.label}: ${nf(d.value)} (${pct.toFixed(1)}%)`)}
            onMouseLeave={hide}
          >
            <span className="mb-1.5 whitespace-nowrap text-[11px] font-semibold tabular-nums text-forest-800 sm:text-xs">
              {pct.toFixed(1)}%
            </span>
            <div
              className="mx-auto w-full cursor-pointer transition-[height,filter,transform] duration-700 ease-out hover:-translate-y-1 hover:brightness-125"
              style={{
                maxWidth: maxBarWidth,
                height: mounted ? heightPx : 0,
                backgroundColor: color,
                borderTopLeftRadius: 999,
                borderTopRightRadius: 999,
                transitionDelay: `${i * 50}ms`,
              }}
            />
            {many ? (
              <div className="relative mt-2 h-36 w-full" title={d.label}>
                <span className="absolute right-1/2 top-0 origin-top-right -rotate-[55deg] block max-w-[130px] truncate pr-0.5 text-[11px] font-medium text-forest-950">
                  {d.label}
                </span>
              </div>
            ) : (
              <div className="-mx-1 mt-3 min-h-[3em] w-[calc(100%+0.5rem)] px-0 text-center text-[10px] font-medium leading-tight tracking-tight text-forest-950 [overflow-wrap:normal] [word-break:normal]">
                {d.label}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Vertical stacked bars (Male vs Female per age group), with a Y axis, totals above the bars,
// hover tooltip, and a legend that carries the overall M / F totals.
export function StackedBarChart({ data, maleLabel = "Male", femaleLabel = "Female" }) {
  const mounted = useMounted();
  const { ref, tip, show, hide } = useTip();
  const width = 560;
  const height = 310;
  const padding = { top: 22, right: 8, bottom: 70, left: 36 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const rawMax = Math.max(...data.map((d) => d.male + d.female), 1);
  const { max: axisMax, step } = niceAxisMax(rawMax);
  const ticks = [];
  for (let v = 0; v <= axisMax + 0.001; v += step) ticks.push(Math.round(v));

  const slot = plotWidth / data.length;
  const barWidth = Math.min(40, slot * 0.6);
  const baseY = padding.top + plotHeight;
  const maleTotal = data.reduce((s, d) => s + d.male, 0);
  const femaleTotal = data.reduce((s, d) => s + d.female, 0);

  return (
    <div ref={ref} className="relative">
      <Tip tip={tip} />
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Male vs Female per age group">
        {ticks.map((v) => {
          const y = baseY - (v / axisMax) * plotHeight;
          return (
            <g key={v}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="currentColor" strokeWidth="1" strokeDasharray={v === 0 ? "" : "3 4"} className="text-cream-200" />
              <text x={padding.left - 8} y={y + 4} fontSize="11" textAnchor="end" fill="currentColor" className="text-forest-600">
                {v}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const x = padding.left + i * slot + (slot - barWidth) / 2;
          const k = mounted ? 1 : 0;
          const maleH = (d.male / axisMax) * plotHeight * k;
          const femaleH = (d.female / axisMax) * plotHeight * k;
          const labelX = x + barWidth / 2;
          const labelY = baseY + 14;
          const t = `${d.label} — ${maleLabel}: ${d.male}, ${femaleLabel}: ${d.female} (total ${d.male + d.female})`;
          return (
            <g
              key={d.label}
              className="cursor-pointer"
              onMouseMove={(e) => show(e, t)}
              onMouseLeave={hide}
              style={{ transition: "opacity .15s" }}
            >
              <rect x={padding.left + i * slot} y={padding.top} width={slot} height={plotHeight} fill="transparent" />
              {maleH > 0 && (
                <path
                  d={d.female > 0 ? `M${x},${baseY} V${baseY - maleH} H${x + barWidth} V${baseY} Z` : roundedTopRectPath(x, baseY - maleH, barWidth, maleH, 6)}
                  fill={MALE_COLOR}
                  style={{ transition: "d .7s" }}
                />
              )}
              {femaleH > 0 && <path d={roundedTopRectPath(x, baseY - maleH - femaleH, barWidth, femaleH, 6)} fill={FEMALE_COLOR} />}
              {d.male + d.female > 0 && mounted && (
                <text x={labelX} y={baseY - maleH - femaleH - 6} fontSize="11" fontWeight="600" textAnchor="middle" fill="currentColor" className="text-forest-900">
                  {d.male + d.female}
                </text>
              )}
              <text
                x={labelX}
                y={labelY}
                fontSize="11"
                fill="currentColor"
                className="text-forest-800"
                textAnchor="end"
                transform={`rotate(-35 ${labelX} ${labelY})`}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-center gap-6">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-forest-900">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: MALE_COLOR }} />
          {maleLabel} <span className="font-normal tabular-nums text-forest-600">{nf(maleTotal)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-forest-900">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: FEMALE_COLOR }} />
          {femaleLabel} <span className="font-normal tabular-nums text-forest-600">{nf(femaleTotal)}</span>
        </span>
      </div>
    </div>
  );
}

// Male and Female side by side for each group, so the two can be compared directly (a stacked bar
// makes the top segment hard to read because it does not start from the baseline).
export function GroupedBarChart({ data, maleLabel = "Male", femaleLabel = "Female" }) {
  const mounted = useMounted();
  const { ref, tip, show, hide } = useTip();
  const width = 560;
  const height = 310;
  const padding = { top: 22, right: 8, bottom: 70, left: 36 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const rawMax = Math.max(...data.flatMap((d) => [d.male, d.female]), 1);
  const { max: axisMax, step } = niceAxisMax(rawMax);
  const ticks = [];
  for (let v = 0; v <= axisMax + 0.001; v += step) ticks.push(Math.round(v));
  const slot = plotWidth / data.length;
  const barWidth = Math.min(22, slot * 0.34);
  const gap = 3;
  const baseY = padding.top + plotHeight;
  const maleTotal = data.reduce((s, d) => s + d.male, 0);
  const femaleTotal = data.reduce((s, d) => s + d.female, 0);
  return (
    <div ref={ref} className="relative">
      <Tip tip={tip} />
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Male vs Female per age group">
        {ticks.map((v) => {
          const y = baseY - (v / axisMax) * plotHeight;
          return (
            <g key={v}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="currentColor" strokeWidth="1" strokeDasharray={v === 0 ? "" : "3 4"} className="text-cream-200" />
              <text x={padding.left - 8} y={y + 4} fontSize="11" textAnchor="end" fill="currentColor" className="text-forest-600">{v}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const cx = padding.left + i * slot + slot / 2;
          const k = mounted ? 1 : 0;
          const mh = (d.male / axisMax) * plotHeight * k;
          const fh = (d.female / axisMax) * plotHeight * k;
          const xm = cx - barWidth - gap / 2;
          const xf = cx + gap / 2;
          const labelY = baseY + 14;
          const t = `${d.label} — ${maleLabel}: ${d.male}, ${femaleLabel}: ${d.female} (total ${d.male + d.female})`;
          return (
            <g key={d.label} className="cursor-pointer" onMouseMove={(e) => show(e, t)} onMouseLeave={hide}>
              <rect x={padding.left + i * slot} y={padding.top} width={slot} height={plotHeight} fill="transparent" />
              {mh > 0 && <path d={roundedTopRectPath(xm, baseY - mh, barWidth, mh, 5)} fill={MALE_COLOR} />}
              {fh > 0 && <path d={roundedTopRectPath(xf, baseY - fh, barWidth, fh, 5)} fill={FEMALE_COLOR} />}
              {mounted && d.male > 0 && slot > 40 && (
                <text x={xm + barWidth / 2} y={baseY - mh - 5} fontSize="10" fontWeight="600" textAnchor="middle" fill="currentColor" className="text-forest-900">{d.male}</text>
              )}
              {mounted && d.female > 0 && slot > 40 && (
                <text x={xf + barWidth / 2} y={baseY - fh - 5} fontSize="10" fontWeight="600" textAnchor="middle" fill="currentColor" className="text-forest-900">{d.female}</text>
              )}
              <text x={cx + 6} y={labelY} fontSize="11" fill="currentColor" className="text-forest-800" textAnchor="end" transform={`rotate(-35 ${cx + 6} ${labelY})`}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-center gap-6">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-forest-900">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: MALE_COLOR }} />
          {maleLabel} <span className="font-normal tabular-nums text-forest-600">{nf(maleTotal)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-forest-900">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: FEMALE_COLOR }} />
          {femaleLabel} <span className="font-normal tabular-nums text-forest-600">{nf(femaleTotal)}</span>
        </span>
      </div>
    </div>
  );
}

// Trend line with a soft area under it, gridlines, a value on every point and a hover tooltip.
export function LineChart({ data, height = 230 }) {
  const mounted = useMounted();
  const { ref, tip, show, hide } = useTip();
  const width = 560;
  const pad = { top: 26, right: 22, bottom: 30, left: 42 };
  const rawMax = Math.max(...data.map((d) => d.value), 1);
  const { max, step } = niceAxisMax(rawMax, 4);
  const stepX = data.length > 1 ? (width - pad.left - pad.right) / (data.length - 1) : 0;
  const x = (i) => pad.left + i * stepX;
  const y = (v) => height - pad.bottom - (v / max) * (height - pad.top - pad.bottom);
  const pts = data.map((d, i) => [x(i), y(d.value)]);
  const line = pts.map(([px, py]) => `${px},${py}`).join(" ");
  const area = `M${pts[0][0]},${height - pad.bottom} L${line.replace(/ /g, " L")} L${pts[pts.length - 1][0]},${height - pad.bottom} Z`;
  const ticks = [];
  for (let v = 0; v <= max + 0.001; v += step) ticks.push(Math.round(v));
  const last = data.length - 1;

  return (
    <div ref={ref} className="relative">
      <Tip tip={tip} />
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Line chart">
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4c9a5a" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#4c9a5a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke="currentColor" strokeDasharray={v === 0 ? "" : "3 4"} className="text-cream-200" />
            <text x={pad.left - 8} y={y(v) + 4} fontSize="11" textAnchor="end" fill="currentColor" className="text-forest-600">
              {v}
            </text>
          </g>
        ))}
        <g style={{ opacity: mounted ? 1 : 0, transition: "opacity .8s ease" }}>
          <path d={area} fill="url(#trend-fill)" />
          <polyline points={line} fill="none" stroke="#2f5d3a" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        </g>
        {data.map((d, i) => (
          <g key={d.label}>
            <circle cx={x(i)} cy={y(d.value)} r={i === last ? 6 : 4.5} fill="currentColor" className="text-forest-900" stroke="white" strokeWidth="2" />
            {data.length <= 12 && (
              <text x={x(i)} y={y(d.value) - 11} fontSize="11" fontWeight={i === last ? 700 : 500} textAnchor="middle" fill="currentColor" className="text-forest-900">
                {nf(d.value)}
              </text>
            )}
            <text x={x(i)} y={height - 8} fontSize="11" textAnchor="middle" fill="currentColor" className="text-forest-700">
              {d.label}
            </text>
            <circle
              cx={x(i)}
              cy={y(d.value)}
              r="16"
              fill="transparent"
              className="cursor-pointer"
              onMouseMove={(e) => show(e, `${d.label}: ${nf(d.value)}`)}
              onMouseLeave={hide}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Treemap: every item is a box whose area is its share of the total. Handles
// dozens of categories (e.g. all barangays) where a pie turns into slivers.
// Layout is squarified in a fixed virtual space and positioned in percent,
// so it stays fluid without measuring the container.
// ---------------------------------------------------------------------------
const TM_W = 480;
const TM_H = 400;

function squarify(data, W, H) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const scale = (W * H) / total;
  const nodes = data.map((d) => ({ ...d, area: d.value * scale }));
  const out = [];
  let x = 0, y = 0, w = W, h = H;
  let row = [];
  const sum = (r) => r.reduce((a, n) => a + n.area, 0);
  const worst = (r, side) => {
    const s = sum(r);
    const mx = Math.max(...r.map((n) => n.area));
    const mn = Math.min(...r.map((n) => n.area));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const flush = () => {
    const s = sum(row);
    if (w >= h) {
      const cw = s / h;
      let cy = y;
      row.forEach((n) => { const nh = n.area / cw; out.push({ ...n, x, y: cy, w: cw, h: nh }); cy += nh; });
      x += cw; w -= cw;
    } else {
      const rh = s / w;
      let cx = x;
      row.forEach((n) => { const nw = n.area / rh; out.push({ ...n, x: cx, y, w: nw, h: rh }); cx += nw; });
      y += rh; h -= rh;
    }
    row = [];
  };
  let i = 0;
  while (i < nodes.length) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, nodes[i]], side) <= worst(row, side)) { row.push(nodes[i]); i++; }
    else flush();
  }
  if (row.length) flush();
  return out;
}

// deep forest -> mid green -> sage -> pale: biggest boxes darkest.
const TM_STOPS = [[31, 74, 58], [64, 145, 108], [168, 207, 143], [226, 238, 208]];
function tmColor(t) {
  const p = Math.min(0.999, Math.max(0, t)) * (TM_STOPS.length - 1);
  const k = Math.floor(p), f = p - k;
  const c = TM_STOPS[k].map((v, j) => Math.round(v + (TM_STOPS[k + 1][j] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function TreemapChart({ data, height = TM_H }) {
  const [active, setActive] = useState(null);
  const items = useMemo(() => [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value), [data]);
  const total = items.reduce((s, d) => s + d.value, 0);
  const cells = useMemo(() => (total ? squarify(items, TM_W, TM_H) : []), [items, total]);
  if (!total) return null;
  const a = active != null ? cells[active] : null;
  return (
    <div>
      <p className="mb-2 h-5 px-1 text-xs font-semibold text-forest-700">
        {a ? `${a.label}: ${nf(a.value)} (${((a.value / total) * 100).toFixed(1)}%)` : `${nf(total)} total · ${cells.length} barangays — hover a box for details`}
      </p>
      <div className="relative w-full overflow-hidden rounded-xl" style={{ height }}>
        {cells.map((c, i) => {
          const t = cells.length > 1 ? i / (cells.length - 1) : 0;
          const dark = t < 0.5;
          const showName = c.w > 56 && c.h > 30;
          const showVal = showName && c.h > 52;
          return (
            <div
              key={c.label}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              title={`${c.label}: ${nf(c.value)}`}
              className="absolute p-0.5 transition-opacity duration-150"
              style={{
                left: `${(c.x / TM_W) * 100}%`,
                top: `${(c.y / TM_H) * 100}%`,
                width: `${(c.w / TM_W) * 100}%`,
                height: `${(c.h / TM_H) * 100}%`,
                opacity: active == null || active === i ? 1 : 0.55,
              }}
            >
              <div
                className="h-full w-full overflow-hidden rounded-md px-1.5 py-1 leading-tight"
                style={{ backgroundColor: tmColor(t), color: dark ? "#f4f1e4" : "#1a3a2a" }}
              >
                {showName && <p className="truncate text-[11px] font-semibold">{c.label}</p>}
                {showVal && <p className="text-[11px] tabular-nums opacity-80">{nf(c.value)}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}