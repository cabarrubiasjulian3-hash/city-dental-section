import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { TAYABAS_BARANGAYS } from "../lib/barangays.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

// The category count columns, in the same left-to-right order as the paper
// e-FHSIS form. "pregnant_f" has no "_m" counterpart because the paper form
// only has a female column for Pregnant Women.
export const CATEGORY_FIELDS = [
  "orally_fit_m", "orally_fit_f",
  "dmft_m", "dmft_f",
  "infants_m", "infants_f",
  "children_1_4_m", "children_1_4_f",
  "children_5_9_m", "children_5_9_f",
  "adol_10_14_m", "adol_10_14_f",
  "adol_15_19_m", "adol_15_19_f",
  "adults_m", "adults_f",
  "senior_m", "senior_f",
  "pregnant_f",
];

const ACTIVITY_TYPES = ["consultation_extraction", "ekonsulta", "dental_mission"];

// Total-count SQL expression reused by the trend endpoint below.
const TOTAL_SQL = CATEGORY_FIELDS.join(" + ");

function withTotal(row) {
  const total = CATEGORY_FIELDS.reduce((sum, f) => sum + (row[f] || 0), 0);
  return { ...row, total };
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

// Seed zero-value rows for every dentist currently in Staff Management (one
// row per activity type) for the given month, if they don't already exist.
// The report roster is driven entirely by Staff Management now — there's no
// separate "add a dentist" step here, so a new hire shows up on the very
// next month they're added as staff.
function seedDentistMonth(month) {
  const dentists = db
    .prepare(`SELECT name FROM staff WHERE lower(role) LIKE '%dentist%' ORDER BY name`)
    .all()
    .map((r) => r.name);

  const insert = db.prepare(
    `INSERT OR IGNORE INTO monthly_report_rows (report_month, scope, scope_name, activity_type) VALUES (?, 'dentist', ?, ?)`
  );
  for (const name of dentists) {
    for (const activity of ACTIVITY_TYPES) {
      insert.run(month, name, activity);
    }
  }
}

// Seed zero-value rows for all 66 official barangays for the given month, if
// they don't already exist. Each barangay is a single row (no activity-type
// split, matching the paper form's per-barangay summary sheet).
export function seedBarangayMonth(month) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO monthly_report_rows (report_month, scope, scope_name, activity_type) VALUES (?, 'barangay', ?, 'consultation_extraction')`
  );
  for (const name of TAYABAS_BARANGAYS) {
    insert.run(month, name);
  }
}

// GET /api/monthly-reports?month=YYYY-MM&scope=dentist|barangay
router.get("/", (req, res) => {
  const month = req.query.month || currentMonth();
  const scope = req.query.scope === "barangay" ? "barangay" : "dentist";

  if (scope === "dentist") seedDentistMonth(month);
  else seedBarangayMonth(month);

  const rows = db
    .prepare(`SELECT * FROM monthly_report_rows WHERE report_month = ? AND scope = ?`)
    .all(month, scope);

  if (scope === "barangay") {
    // Keep the official barangay order rather than alphabetical-by-insert.
    const order = new Map(TAYABAS_BARANGAYS.map((name, i) => [name, i]));
    rows.sort((a, b) => (order.get(a.scope_name) ?? 999) - (order.get(b.scope_name) ?? 999));
  } else {
    const activityOrder = new Map(ACTIVITY_TYPES.map((a, i) => [a, i]));
    rows.sort(
      (a, b) =>
        a.scope_name.localeCompare(b.scope_name) ||
        (activityOrder.get(a.activity_type) ?? 9) - (activityOrder.get(b.activity_type) ?? 9)
    );
  }

  res.json({ month, scope, rows: rows.map(withTotal) });
});

// POST /api/monthly-reports/dentists and DELETE /dentists/:name were removed —
// the dentist roster for this report is now read straight from Staff
// Management (see seedDentistMonth above), so there's nothing to add/remove
// here anymore. Manage dentists on the Staff page instead.

// GET /api/monthly-reports/services-rendered?month=YYYY-MM
// Part II of the printable report: real per-record service counts for that
// month specifically — Tooth Extraction / Tooth Consultation / E-Consultation
// straight from dental_records, plus completed Dental Mission / QIK and
// Toothbrushing Drill / Dental Education visits from the Barangay Schedule.
// Mirrors the Dashboard's "Services Rendered" chart, but scoped to one month.
const SERVICE_LABELS = {
  "Tooth Extraction": "Tooth Extraction",
  "Tooth Consultation": "Tooth Consultation",
  "E-Consultation": "E-Consultation / E-Konsulta",
};
const COMMUNITY_ACTIVITIES = ["Dental Mission / QIK", "Toothbrushing Drill / Dental Education"];

router.get("/services-rendered", (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : currentMonth();

  const recordCounts = db
    .prepare(
      `SELECT procedure AS service, COUNT(*) c FROM dental_records
       WHERE strftime('%Y-%m', record_date) = ? GROUP BY procedure`
    )
    .all(month);

  const communityCounts = db
    .prepare(
      `SELECT services AS service, COUNT(*) c FROM barangay_schedule
       WHERE status = 'Completed' AND strftime('%Y-%m', visit_date) = ?
       AND services IN (${COMMUNITY_ACTIVITIES.map(() => "?").join(",")})
       GROUP BY services`
    )
    .all(month, ...COMMUNITY_ACTIVITIES);

  const servicesRendered = [...recordCounts, ...communityCounts]
    .map((r) => ({ label: SERVICE_LABELS[r.service] || r.service, value: r.c }))
    .sort((a, b) => b.value - a.value);

  res.json({ month, servicesRendered });
});

// GET /api/monthly-reports/trend?month=YYYY-MM
// Total clients served (from the official 66-barangay tally) for the given
// month and the 5 months before it — powers the "Trend" chart on the
// printable report.
router.get("/trend", (req, res) => {
  const endMonth = /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : currentMonth();
  const [endY, endM] = endMonth.split("-").map(Number);

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(endY, endM - 1 - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const totalFor = db.prepare(
    `SELECT COALESCE(SUM(${TOTAL_SQL}), 0) AS total FROM monthly_report_rows WHERE report_month = ? AND scope = 'barangay'`
  );

  const trend = months.map((m) => {
    seedBarangayMonth(m);
    const { total } = totalFor.get(m);
    const label = new Date(`${m}-01T00:00:00`).toLocaleString("en-US", { month: "short" });
    return { label, value: total };
  });

  res.json({ month: endMonth, trend });
});

// PATCH /api/monthly-reports/:id — update one or more category counts (or
// projected_population for a barangay row) on a single row.
router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM monthly_report_rows WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: "Report row not found." });

  const allowedFields = [...CATEGORY_FIELDS, "projected_population"];
  const updates = [];
  const values = [];
  for (const field of allowedFields) {
    if (field in req.body) {
      const n = Number(req.body[field]);
      updates.push(`${field} = ?`);
      values.push(Number.isFinite(n) && n >= 0 ? Math.round(n) : 0);
    }
  }
  if (!updates.length) return res.status(400).json({ error: "No valid fields to update." });

  values.push(id);
  db.prepare(`UPDATE monthly_report_rows SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  const row = db.prepare(`SELECT * FROM monthly_report_rows WHERE id = ?`).get(id);
  res.json(withTotal(row));
});

export default router;