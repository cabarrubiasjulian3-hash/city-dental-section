import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { CATEGORY_FIELDS, seedBarangayMonth } from "./monthlyReports.js";
import { TAYABAS_BARANGAYS } from "../lib/barangays.js";
import { getDoctorPatientIds } from "../lib/doctorMatch.js";
import { calcAge } from "../lib/age.js";

const router = Router();
router.use(requireAuth, requireRole("admin", "doctor"));

router.get("/stats", (req, res) => {
  const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  const totalPatients = db.prepare(`SELECT COUNT(*) c FROM users WHERE role='patient'`).get().c;

  const newPatientsThisMonth = db
    .prepare(`SELECT COUNT(*) c FROM users WHERE role='patient' AND strftime('%Y-%m', created_at) = ?`)
    .get(thisMonth).c;

  const recordsThisMonth = db
    .prepare(`SELECT COUNT(*) c FROM dental_records WHERE strftime('%Y-%m', record_date) = ?`)
    .get(thisMonth).c;

  // Real, per-record service counts (from dental_records.procedure — the
  // exact 3 options in the "Add dental record" form: Tooth Extraction,
  // Tooth Consultation, E-Consultation), PLUS completed community
  // activities logged on the Barangay Schedule (Dental Mission / QIK,
  // Toothbrushing Drill / Dental Education). Together these make up the
  // 5 categories on the "Clinic Statistics — Services Rendered" chart, so
  // it always reflects actual patient records + completed barangay visits
  // instead of the separate Monthly Report entry buckets.
  const SERVICE_LABELS = {
    "Tooth Extraction": "Tooth Extraction",
    "Tooth Consultation": "Tooth Consultation",
    "E-Consultation": "E-Consultation / E-Konsulta",
    "Oral Screening": "Oral Screening",
    "Risk Assessment": "Risk Assessment",
    "Oral Prophylaxis": "Oral Prophylaxis",
    "Fluoride Varnish Application": "Fluoride Varnish Application",
    "Counseling": "Counseling",
  };
  const recordCounts = db
    .prepare(`SELECT procedure AS service, COUNT(*) c FROM dental_records GROUP BY procedure`)
    .all();

  const COMMUNITY_ACTIVITIES = ["Dental Mission / QIK", "Toothbrushing Drill / Dental Education"];
  const communityCounts = db
    .prepare(
      `SELECT services AS service, COUNT(*) c FROM barangay_schedule
       WHERE status = 'Completed' AND services IN (${COMMUNITY_ACTIVITIES.map(() => "?").join(",")})
       GROUP BY services`
    )
    .all(...COMMUNITY_ACTIVITIES);

  const servicesRendered = [...recordCounts, ...communityCounts]
    .map((r) => ({ label: SERVICE_LABELS[r.service] || r.service, value: r.c }))
    .sort((a, b) => b.value - a.value);

  const recentRecords = db
    .prepare(
      `SELECT d.id, d.record_date, d.procedure, d.dentist, u.name AS patient_name
       FROM dental_records d JOIN users u ON u.id = d.patient_id
       ORDER BY d.record_date DESC, d.id DESC LIMIT 8`
    )
    .all();

  const barangayMonth = /^\d{4}-\d{2}$/.test(req.query.barangayMonth) ? req.query.barangayMonth : thisMonth;
  seedBarangayMonth(barangayMonth);
  const barangayRows = db
    .prepare(`SELECT * FROM monthly_report_rows WHERE report_month = ? AND scope = 'barangay'`)
    .all(barangayMonth);
  const barangaySummary = barangayRows
    .map((r) => ({
      name: r.scope_name,
      total: CATEGORY_FIELDS.reduce((sum, f) => sum + (r[f] || 0), 0),
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  const barangayGrandTotal = barangaySummary.reduce((sum, r) => sum + r.total, 0);

  function prevMonth(ym) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 2, 1).toISOString().slice(0, 7);
  }
  const lastMonthStr = prevMonth(thisMonth);

  seedBarangayMonth(thisMonth);
  seedBarangayMonth(lastMonthStr);

  const thisRows = db.prepare(`SELECT * FROM monthly_report_rows WHERE report_month = ? AND scope='barangay'`).all(thisMonth);
  const lastRows = db.prepare(`SELECT * FROM monthly_report_rows WHERE report_month = ? AND scope='barangay'`).all(lastMonthStr);

  const totalOf = (rows) => rows.reduce((sum, r) => sum + CATEGORY_FIELDS.reduce((s, f) => s + (r[f] || 0), 0), 0);
  const overallTotalServed = totalOf(thisRows);
  const lastMonthTotal = totalOf(lastRows);
  const vsLastMonthPct = lastMonthTotal ? Math.round(((overallTotalServed - lastMonthTotal) / lastMonthTotal) * 1000) / 10 : null;

  const maleFields = CATEGORY_FIELDS.filter((f) => f.endsWith("_m"));
  const femaleFields = CATEGORY_FIELDS.filter((f) => f.endsWith("_f"));
  const male = thisRows.reduce((sum, r) => sum + maleFields.reduce((s, f) => s + (r[f] || 0), 0), 0);
  const female = thisRows.reduce((sum, r) => sum + femaleFields.reduce((s, f) => s + (r[f] || 0), 0), 0);

  const barangaysReporting = thisRows.filter((r) => CATEGORY_FIELDS.reduce((s, f) => s + (r[f] || 0), 0) > 0).length;
  const barangaysTotal = TAYABAS_BARANGAYS.length;

  const AGE_GROUP_BUCKETS = [
    { label: "Orally Fit Children 12-59 mos", fields: ["orally_fit_m", "orally_fit_f"] },
    { label: "Clients 5 yrs old & above with DMFT", fields: ["dmft_m", "dmft_f"] },
    { label: "Infants 0-11 months (BOHC)", fields: ["infants_m", "infants_f"] },
    { label: "Children 1-4 yrs old (BOHC)", fields: ["children_1_4_m", "children_1_4_f"] },
    { label: "Children 5-9 yrs old (BOHC)", fields: ["children_5_9_m", "children_5_9_f"] },
    { label: "Adolescents 10-14 yrs old (BOHC)", fields: ["adol_10_14_m", "adol_10_14_f"] },
    { label: "Adolescents 15-19 yrs old (BOHC)", fields: ["adol_15_19_m", "adol_15_19_f"] },
    { label: "Adults 20-59 yrs old (BOHC)", fields: ["adults_m", "adults_f"] },
    { label: "Senior citizens 60 yrs old & above (BOHC)", fields: ["senior_m", "senior_f"] },
    { label: "Pregnant Women provided with BOHC", fields: ["pregnant_f"] },
  ];
  const ageGroupBreakdown = AGE_GROUP_BUCKETS.map((b) => ({
    label: b.label,
    value: thisRows.reduce((sum, r) => sum + b.fields.reduce((s, f) => s + (r[f] || 0), 0), 0),
  }));

  const AGE_GROUP_SHORT_LABELS = [
    "Orally Fit 12-59m", "DMFT 5+", "Infants 0-11m", "Children 1-4", "Children 5-9",
    "Adol 10-14", "Adol 15-19", "Adults 20-59", "Seniors 60+", "Pregnant Women",
  ];
  const maleFemalePerAgeGroup = AGE_GROUP_BUCKETS.map((b, i) => {
    const maleField = b.fields.find((f) => f.endsWith("_m"));
    const femaleField = b.fields.find((f) => f.endsWith("_f"));
    return {
      label: AGE_GROUP_SHORT_LABELS[i],
      male: maleField ? thisRows.reduce((sum, r) => sum + (r[maleField] || 0), 0) : 0,
      female: femaleField ? thisRows.reduce((sum, r) => sum + (r[femaleField] || 0), 0) : 0,
    };
  });

  const dentistRows = db.prepare(`SELECT * FROM monthly_report_rows WHERE report_month = ? AND scope='dentist'`).all(thisMonth);

  const ACTIVITY_LABELS = {
    tooth_extraction: "Tooth Extraction",
    consultation: "Tooth Consultation",
    ekonsulta: "E-Consultation / E-Konsulta",
    dental_mission: "Dental Mission / QIK",
  };
  const activityTotals = { tooth_extraction: 0, consultation: 0, ekonsulta: 0, dental_mission: 0 };
  for (const r of dentistRows) {
    if (!(r.activity_type in activityTotals)) continue; // ignore legacy 'consultation_extraction' rows, if any
    activityTotals[r.activity_type] += CATEGORY_FIELDS.reduce((s, f) => s + (r[f] || 0), 0);
  }
  const servicesRenderedByActivity = Object.entries(activityTotals)
    .map(([type, value]) => ({ label: ACTIVITY_LABELS[type], value }))
    .filter((x) => x.value > 0);

  const dentistMap = new Map();
  for (const r of dentistRows) {
    const m = maleFields.reduce((s, f) => s + (r[f] || 0), 0);
    const f = femaleFields.reduce((s, f) => s + (r[f] || 0), 0);
    const cur = dentistMap.get(r.scope_name) || { dentist: r.scope_name, male: 0, female: 0 };
    cur.male += m;
    cur.female += f;
    dentistMap.set(r.scope_name, cur);
  }
  const perDentistOutput = [...dentistMap.values()]
    .map((d) => ({ ...d, total: d.male + d.female }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total);
  const perDentistGrandTotal = perDentistOutput.reduce(
    (acc, d) => ({ male: acc.male + d.male, female: acc.female + d.female, total: acc.total + d.total }),
    { male: 0, female: 0, total: 0 }
  );

  const monthlyTrend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const ym = d.toISOString().slice(0, 7);
    seedBarangayMonth(ym);
    const rows = db.prepare(`SELECT * FROM monthly_report_rows WHERE report_month = ? AND scope='barangay'`).all(ym);
    monthlyTrend.push({ label: d.toLocaleString("en-US", { month: "short" }), value: totalOf(rows) });
  }

  const barangayCoverage = thisRows
    .map((r) => {
      const served = CATEGORY_FIELDS.reduce((s, f) => s + (r[f] || 0), 0);
      const population = r.projected_population || 0;
      return {
        barangay: r.scope_name,
        population,
        served,
        coveragePct: population ? Math.round((served / population) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => (b.coveragePct ?? -1) - (a.coveragePct ?? -1));
  const barangaysWithNoEntries = barangayCoverage.filter((b) => b.served === 0).length;

  // Doctor-only extra: everything above is clinic-wide (same numbers an
  // admin sees), which doesn't tell a doctor anything about their *own*
  // caseload. This adds that, based on the same dentist-name matching used
  // by Patient Management and Messages (see lib/doctorMatch.js).
  let myPatientCount = null;
  let myRecentRecords = null;
  if (req.user.role === "doctor") {
    const myPatientIds = getDoctorPatientIds(db, req.user.name);
    myPatientCount = myPatientIds.size;
    myRecentRecords = myPatientIds.size
      ? db
          .prepare(
            `SELECT d.id, d.record_date, d.procedure, u.name AS patient_name, u.birthdate
             FROM dental_records d JOIN users u ON u.id = d.patient_id
             WHERE d.patient_id IN (${[...myPatientIds].map(() => "?").join(",")})
             ORDER BY d.record_date DESC, d.id DESC LIMIT 8`
          )
          .all(...myPatientIds)
          .map((r) => ({ ...r, patient_age: calcAge(r.birthdate) }))
      : [];
  }

  res.json({
    myPatientCount,
    myRecentRecords,
    totalPatients,
    newPatientsThisMonth,
    recordsThisMonth,
    servicesRendered,
    recentRecords,
    barangayMonth,
    barangaySummary,
    barangayGrandTotal,
    month: thisMonth,
    overallTotalServed,
    male,
    female,
    barangaysReporting,
    barangaysTotal,
    vsLastMonthPct,
    lastMonthTotal,
    ageGroupBreakdown,
    maleFemalePerAgeGroup,
    servicesRenderedByActivity,
    perDentistOutput,
    perDentistGrandTotal,
    monthlyTrend,
    barangayCoverage,
    barangaysWithNoEntries,
  });
});

export default router;