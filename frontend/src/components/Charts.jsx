// Small, dependency-free chart primitives (CSS conic-gradient pie + div bar
// chart) so the dashboard doesn't need a charting library. Colors cycle
// through the app's forest/clay theme palette.

const PALETTE = [
  "#14231a", // near-black forest
  "#2f4a2f", // dark hunter green
  "#4caf50", // bright leaf green
  "#8a9a82", // sage / gray-green
  "#a9825c", // warm brown accent
  "#6d9750", // medium green
  "#8bb56c", // soft green
  "#c8f0b8", // pale leaf green
];
const OTHER_COLOR = "#c7bfa4";

export function colorFor(index, isOther = false) {
  return isOther ? OTHER_COLOR : PALETTE[index % PALETTE.length];
}

// Shades from dark forest green down to a light sage, used for the dome bar
// chart so the biggest share is darkest and it fades out as values shrink —
// matches the "Services Rendered" reference design (rounded/arch-top bars).
const DOME_GREENS = ["#16241a", "#25401f", "#3d5c2f", "#537a3c", "#6d9750", "#8bb56c", "#a9cf8e"];

// Rounded/"dome" bar chart: each bar's top is a full semicircle, height is
// proportional to its share of the total, with the % printed above and the
// label below. Bars are sorted largest-first, like the reference design.
// All bars share one row: each takes an equal flexible slice of the
// available width (capped at maxBarWidth on wide screens) and shrinks
// together as more bars are added, instead of wrapping onto a new row.
export function DomeBarChart({ data, maxHeight = 200, maxBarWidth = 108 }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (!total) return null;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const maxValue = sorted[0].value;

  return (
    <div className="flex items-end justify-between gap-1.5 sm:gap-3 pt-2" style={{ minHeight: maxHeight + 70 }}>
      {sorted.map((d, i) => {
        const pct = total ? (d.value / total) * 100 : 0;
        const heightPx = maxValue ? Math.max(28, (d.value / maxValue) * maxHeight) : 28;
        const color = d.color || DOME_GREENS[i % DOME_GREENS.length];
        return (
          <div key={d.label} className="flex flex-col items-center flex-1 min-w-0 basis-0">
            <span className="text-[10px] sm:text-xs italic text-forest-500 mb-2 whitespace-nowrap">
              {pct.toFixed(1)}%
            </span>
            <div
              className="w-full mx-auto"
              style={{
                maxWidth: maxBarWidth,
                height: heightPx,
                backgroundColor: color,
                borderTopLeftRadius: 999,
                borderTopRightRadius: 999,
              }}
            />
            {/* A block element (not <span>, which ignores width since it's
                inline) so the label actually wraps inside its own column.
                line-clamp-2 keeps every label the same height (2 lines,
                wrapping only at word boundaries — no mid-word breaks) so all
                columns line up evenly; the title attribute shows the full
                name on hover if it gets truncated. */}
            <div
              title={d.label}
              className="text-[9px] sm:text-[11px] text-forest-950 text-center mt-3 leading-tight w-full px-0.5 line-clamp-2 min-h-[2.4em]"
            >
              {d.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Fixed color per BOHC age-group category (keyed by label, not array
// position, so filtering out zero-value categories upstream doesn't shift
// anyone's color) — matches the reference "donut + big center total"
// design for the Clinic Statistics — BOHC by Age Group card.
const AGE_GROUP_COLORS = {
  "Orally Fit Children 12-59 mos": "#16241a",
  "Clients 5 yrs old & above with DMFT": "#25401f",
  "Infants 0-11 months (BOHC)": "#5c6b3a",
  "Children 1-4 yrs old (BOHC)": "#4d6844",
  "Children 5-9 yrs old (BOHC)": "#7ed957",
  "Adolescents 10-14 yrs old (BOHC)": "#a8874a",
  "Adolescents 15-19 yrs old (BOHC)": "#101c14",
  "Adults 20-59 yrs old (BOHC)": "#3d5c2f",
  "Senior citizens 60 yrs old & above (BOHC)": "#6b8f71",
  "Pregnant Women provided with BOHC": "#8bb56c",
};

// Donut chart with a big bold total in the center, set inside a rounded
// light-green card — the "Clinic Statistics — BOHC by Age Group" design.
// A dedicated component (rather than a PieChart variant) since the look —
// fixed per-category colors, donut hole, center total, card background —
// is specific to this one section; PieChart elsewhere (e.g. Barangay
// Distribution) is unaffected.
export function AgeGroupDonutChart({ data, size = 220, thickness = 46, centerLabel = "This Month" }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (!total) return null;

  let cursor = 0;
  const stops = data.map((d) => {
    const startPct = (cursor / total) * 100;
    cursor += d.value;
    const endPct = (cursor / total) * 100;
    const color = d.color || AGE_GROUP_COLORS[d.label] || OTHER_COLOR;
    return `${color} ${startPct}% ${endPct}%`;
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div
        className="bg-leaf-200 rounded-[2rem] shrink-0 flex items-center justify-center"
        style={{ width: size + 48, height: size + 48 }}
      >
        <div className="relative" style={{ width: size, height: size }}>
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: `conic-gradient(${stops.join(", ")})` }}
            role="img"
            aria-label="Donut chart"
          />
          <div
            className="absolute rounded-full bg-leaf-200 flex flex-col items-center justify-center text-center"
            style={{ inset: thickness }}
          >
            <span className="text-3xl font-extrabold text-brand-900 leading-tight">
              {total.toLocaleString()}
            </span>
            <span className="text-sm font-medium text-brand-800">{centerLabel}</span>
          </div>
        </div>
      </div>
      <ul className="space-y-1.5 text-sm w-full min-w-0">
        {data.map((d) => {
          const color = d.color || AGE_GROUP_COLORS[d.label] || OTHER_COLOR;
          return (
            <li key={d.label} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="truncate text-forest-900">{d.label}</span>
              </span>
              <span className="text-forest-700 shrink-0 tabular-nums">{d.value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PieChart({ data, size = 176 }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (!total) return null;

  let cursor = 0;
  const stops = data.map((d, i) => {
    const startPct = (cursor / total) * 100;
    cursor += d.value;
    const endPct = (cursor / total) * 100;
    const color = d.color || colorFor(i, d.isOther);
    return `${color} ${startPct}% ${endPct}%`;
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div
        className="rounded-full shrink-0 ring-4 ring-cream-50"
        style={{ width: size, height: size, background: `conic-gradient(${stops.join(", ")})` }}
        role="img"
        aria-label="Pie chart"
      />
      <ul className="space-y-1.5 text-sm w-full min-w-0">
        {data.map((d, i) => {
          const pct = total ? Math.round((d.value / total) * 100) : 0;
          const color = d.color || colorFor(i, d.isOther);
          return (
            <li key={d.label} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="truncate text-forest-900">{d.label}</span>
              </span>
              <span className="text-forest-700 shrink-0 tabular-nums">
                {d.value} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>
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

export function BarChart({ data, max }) {
  const barMax = max ?? Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const pct = Math.round((d.value / barMax) * 100);
        const color = d.color || colorFor(i, d.isOther);
        return (
          <div key={d.label}>
            <div className="flex justify-between text-sm mb-1 gap-2">
              <span className="font-medium truncate text-forest-900">{d.label}</span>
              <span className="text-forest-700 shrink-0 tabular-nums">{d.value}</span>
            </div>
            <div className="h-2 rounded-full bg-cream-200">
              <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const MALE_COLOR = "#253522";   // forest-900
const FEMALE_COLOR = "#6b9950"; // leaf-ish green, matches the e-FHSIS reference chart

// "Nice" axis maximum + tick step so gridlines land on round-ish numbers
// (20/40/50/80/100 * 10^n) instead of raw fractions of the data max.
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

// Path for a rectangle with only its top-left/top-right corners rounded —
// used for the topmost segment of each stacked bar so its tip is rounded
// while the rest of the stack stays square (matches the reference chart).
function roundedTopRectPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

// Vertical stacked bar chart: Male (dark green) on the bottom, Female
// (lighter green) stacked on top, a Y-axis with gridlines, rotated X-axis
// category labels, and a centered legend below — matches the e-FHSIS
// "Male vs Female per Age Group" reference chart.
export function StackedBarChart({ data, maleLabel = "Male", femaleLabel = "Female" }) {
  const width = 760;
  const height = 340;
  const padding = { top: 12, right: 12, bottom: 78, left: 36 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const rawMax = Math.max(...data.map((d) => d.male + d.female), 1);
  const { max: axisMax, step } = niceAxisMax(rawMax);
  const ticks = [];
  for (let v = 0; v <= axisMax + 0.001; v += step) ticks.push(Math.round(v));

  const slot = plotWidth / data.length;
  const barWidth = Math.min(46, slot * 0.5);
  const baseY = padding.top + plotHeight;
  const barRadius = 5;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Male vs Female per age group">
        {ticks.map((v) => {
          const y = baseY - (v / axisMax) * plotHeight;
          return (
            <g key={v}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="currentColor" strokeWidth="1" className="text-cream-200" />
              <text x={padding.left - 8} y={y + 3} fontSize="10" textAnchor="end" fill="currentColor" className="text-forest-600">
                {v}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const x = padding.left + i * slot + (slot - barWidth) / 2;
          const maleH = (d.male / axisMax) * plotHeight;
          const femaleH = (d.female / axisMax) * plotHeight;
          const labelX = x + barWidth / 2;
          const labelY = baseY + 12;
          return (
            <g key={d.label}>
              {/* Male segment: square top only when it's the topmost (no female value) */}
              {d.female > 0 ? (
                <rect x={x} y={baseY - maleH} width={barWidth} height={maleH} fill={MALE_COLOR} />
              ) : maleH > 0 ? (
                <path d={roundedTopRectPath(x, baseY - maleH, barWidth, maleH, barRadius)} fill={MALE_COLOR} />
              ) : null}
              {/* Female segment: always the tip of the stack when present, so its top is rounded */}
              {femaleH > 0 && (
                <path
                  d={roundedTopRectPath(x, baseY - maleH - femaleH, barWidth, femaleH, barRadius)}
                  fill={FEMALE_COLOR}
                />
              )}
              <text
                x={labelX}
                y={labelY}
                fontSize="9.5"
                fill="currentColor"
                className="text-forest-800"
                textAnchor="end"
                transform={`rotate(-40 ${labelX} ${labelY})`}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-center gap-6 mt-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-forest-900">
          <span className="w-3 h-3 inline-block" style={{ backgroundColor: MALE_COLOR }} />
          {maleLabel}
        </span>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-forest-900">
          <span className="w-3 h-3 inline-block" style={{ backgroundColor: FEMALE_COLOR }} />
          {femaleLabel}
        </span>
      </div>
    </div>
  );
}

export function LineChart({ data, height = 180 }) {
  const width = 560;
  const padding = 32;
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;
  const toY = (v) => height - padding - (v / max) * (height - padding * 2);
  const points = data.map((d, i) => `${padding + i * stepX},${toY(d.value)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Line chart">
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="currentColor" strokeWidth="1" className="text-cream-200" />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-forest-600" />
      {data.map((d, i) => (
        <circle key={d.label} cx={padding + i * stepX} cy={toY(d.value)} r="4" fill="currentColor" className="text-forest-900" />
      ))}
      {data.map((d, i) => (
        <text key={d.label} x={padding + i * stepX} y={height - 8} fontSize="10" textAnchor="middle" fill="currentColor" className="text-forest-800">
          {d.label}
        </text>
      ))}
    </svg>
  );
}