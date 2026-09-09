import { Router } from "express";
import multer from "multer";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { calcAge } from "../lib/age.js";
import { importWorkbookBuffer } from "../lib/importExcel.js";
import ExcelJS from "exceljs";
import bcrypt from "bcryptjs";

const router = Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function withAge(patient) {
  return { ...patient, age: calcAge(patient.birthdate) };
}

// Admin: list patients (with computed age and visit/record count, so admin
// can see at a glance who's a "New" patient (no record yet) vs a "Returning"
// one and how many times they've been serviced).
//
// A row only shows up here if it's actually a *patient of record*:
//   - a clinic-added / Excel-imported row (placeholder "@imported.local"
//     email, no real login yet) — these are "on file" by definition, so they
//     always show even before any service is logged (that's the point of
//     the "+ New patient record" walk-in row: admin fills it in, then adds
//     service records to it), OR
//   - a real self-registered login account that already has at least one
//     dental_records entry (visit_count > 0) — i.e. they've actually been
//     serviced.
// A real login account with zero dental records (someone who only signed up
// on the website but has never had a visit logged) is intentionally left
// OUT of this list. They still have a normal, working login — they're just
// not shown here yet, because they aren't considered a patient of record
// until the clinic logs their first visit.
router.get("/", requireRole("admin"), (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.birthdate, u.sex, u.address, u.occupation, u.barangay,
              u.surname, u.first_name, u.middle_name, u.place_of_birth, u.parent_guardian,
              u.cellphone_no,
              u.is_pregnant, u.is_senior_citizen, u.is_pwd, u.created_at,
              (SELECT COUNT(*) FROM dental_records d WHERE d.patient_id = u.id) AS visit_count,
              (SELECT d.procedure FROM dental_records d WHERE d.patient_id = u.id
                 ORDER BY d.record_date DESC, d.id DESC LIMIT 1) AS latest_procedure,
              (SELECT d.dentist FROM dental_records d WHERE d.patient_id = u.id
                 ORDER BY d.record_date DESC, d.id DESC LIMIT 1) AS latest_dentist,
              (SELECT COUNT(*) FROM dental_records d WHERE d.patient_id = u.id
                 AND d.procedure = (
                   SELECT d2.procedure FROM dental_records d2 WHERE d2.patient_id = u.id
                     ORDER BY d2.record_date DESC, d2.id DESC LIMIT 1
                 )) AS latest_procedure_visits
       FROM users u
       WHERE u.role = 'patient'
         AND (
           u.email LIKE '%@imported.local'
           OR (SELECT COUNT(*) FROM dental_records d WHERE d.patient_id = u.id) > 0
         )
       ORDER BY u.created_at DESC`
    )
    .all();
  res.json(rows.map(withAge));
});

// Admin: check kung may existing na katulad na patient (name + barangay + age).
// MAHALAGA: ito ay dapat MAUNA sa "/:id" route sa ibaba — kung hindi,
// aakalain ng Express na "check-duplicate" ay isang :id value at hindi na
// mapupunta rito ang request.
router.get("/check-duplicate", requireRole("admin"), (req, res) => {
  const { name, barangay, age } = req.query;
  if (!name) return res.json({ matches: [] });

  const candidates = db
    .prepare(
      `SELECT id, name, barangay, birthdate, sex, email
       FROM users
       WHERE role = 'patient' AND LOWER(name) = ?`
    )
    .all(String(name).trim().toLowerCase());

  const matches = candidates.filter((c) => {
    const sameBarangay = !barangay || (c.barangay || "").toLowerCase() === String(barangay).toLowerCase();
    const calcAge = c.birthdate ? new Date().getFullYear() - new Date(c.birthdate).getFullYear() : null;
    const sameAge = !age || calcAge === Number(age);
    return sameBarangay && sameAge;
  });

  res.json({ matches });
});

// Admin: import patients + dental records from an uploaded Excel file. This is
// a one-off, on-demand action — as soon as it finishes, the imported rows are
// already in the database, so the very next GET /patients (which the frontend
// triggers right after) reflects the new/updated data immediately. There is
// no external drive/folder connection involved.
router.post("/import/xlsx", requireRole("admin"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded. Attach an .xlsx file as 'file'." });
  try {
    const result = await importWorkbookBuffer(req.file.buffer);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || "Could not read that file. Make sure it's a valid .xlsx." });
  }
});

// Admin: export all patient records + dental procedure history to an Excel file
router.get("/export/xlsx", requireRole("admin"), async (req, res) => {
  const patients = db
    .prepare(
      `SELECT id, name, birthdate, sex, address, occupation, barangay, is_pregnant, is_senior_citizen, is_pwd
       FROM users WHERE role = 'patient' ORDER BY name ASC`
    )
    .all();

  const records = db.prepare(`SELECT * FROM dental_records ORDER BY patient_id, record_date ASC`).all();
  const recordsByPatient = new Map();
  for (const r of records) {
    if (!recordsByPatient.has(r.patient_id)) recordsByPatient.set(r.patient_id, []);
    recordsByPatient.get(r.patient_id).push(r);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "City Dental Section";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Patient Records");
  sheet.columns = [
    { header: "Full Name", key: "name", width: 24 },
    { header: "Age", key: "age", width: 8 },
    { header: "Sex", key: "sex", width: 10 },
    { header: "Barangay", key: "barangay", width: 20 },
    { header: "Pregnant", key: "pregnant", width: 10 },
    { header: "Senior Citizen", key: "senior", width: 14 },
    { header: "PWD", key: "pwd", width: 8 },
    { header: "Procedure / Service", key: "procedure", width: 26 },
    { header: "Date of Visit / Procedure", key: "procedure_date", width: 16 },
    { header: "Attending Dentist", key: "dentist", width: 20 },
    { header: "Notes", key: "notes", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F4029" } };

  for (const p of patients) {
    const age = calcAge(p.birthdate);
    const patientRecords = recordsByPatient.get(p.id) || [];
    const base = {
      name: p.name,
      age: age ?? "",
      sex: p.sex || "",
      barangay: p.barangay || "",
      pregnant: p.is_pregnant ? "Yes" : "No",
      senior: p.is_senior_citizen ? "Yes" : "No",
      pwd: p.is_pwd ? "Yes" : "No",
    };
    if (patientRecords.length === 0) {
      sheet.addRow({ ...base, procedure: "", procedure_date: "", dentist: "", notes: "" });
    } else {
      for (const r of patientRecords) {
        sheet.addRow({
          ...base,
          procedure: r.procedure,
          procedure_date: r.record_date,
          dentist: r.dentist || "",
          notes: r.notes || "",
        });
      }
    }
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="patient-records-${new Date().toISOString().slice(0, 10)}.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
});

// Admin: edit a patient's personal information (name, birthdate, sex,
// address, occupation, barangay, pregnant/senior/PWD status, membership,
// medical history, hospitalization history, dietary/social history,
// conforme, and cell phone number) directly, spreadsheet-style, from the
// Patient Management table. Patients no longer edit this themselves —
// their "My Profile" page is view-only.
router.patch("/:id", requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  const {
    name, email, barangay, is_pregnant, is_senior_citizen, is_pwd,
    address, occupation, sex, birthdate, surname, first_name,
    middle_name, place_of_birth, parent_guardian, cellphone_no,
    is_nhts_pr, is_4ps, is_indigenous_people, philhealth_no, sss_no, gsis_no,
    allergies, has_hypertension_cva, has_diabetes_mellitus, has_blood_disorders,
    has_cardio_heart_disease, has_thyroid_disorders, hepatitis, malignancy,
    hosp_medical, hosp_surgical, hosp_blood_transfusion, has_tattoo, hosp_others,
    diet_sugar_beverages, diet_alcohol, diet_tobacco, diet_betel_nut, conforme_name,
  } = req.body;

  const existing = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'patient'").get(id);
  if (!existing) return res.status(404).json({ error: "Patient not found." });

  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: "Name cannot be empty." });
  }
  if (email !== undefined) {
    const trimmedEmail = String(email).trim();
    if (!trimmedEmail) return res.status(400).json({ error: "Email cannot be empty." });
    const dupe = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(trimmedEmail, id);
    if (dupe) return res.status(400).json({ error: "That email is already in use." });
  }

  db.prepare(
    `UPDATE users SET
       name = COALESCE(?, name),
       email = COALESCE(?, email),
       barangay = COALESCE(?, barangay),
       address = COALESCE(?, address),
       occupation = COALESCE(?, occupation),
       sex = COALESCE(?, sex),
       birthdate = COALESCE(?, birthdate),
       surname = COALESCE(?, surname),
       first_name = COALESCE(?, first_name),
       middle_name = COALESCE(?, middle_name),
       place_of_birth = COALESCE(?, place_of_birth),
       parent_guardian = COALESCE(?, parent_guardian),
       cellphone_no = COALESCE(?, cellphone_no),
       is_pregnant = COALESCE(?, is_pregnant),
       is_senior_citizen = COALESCE(?, is_senior_citizen),
       is_pwd = COALESCE(?, is_pwd),
       is_nhts_pr = COALESCE(?, is_nhts_pr),
       is_4ps = COALESCE(?, is_4ps),
       is_indigenous_people = COALESCE(?, is_indigenous_people),
       philhealth_no = COALESCE(?, philhealth_no),
       sss_no = COALESCE(?, sss_no),
       gsis_no = COALESCE(?, gsis_no),
       allergies = COALESCE(?, allergies),
       has_hypertension_cva = COALESCE(?, has_hypertension_cva),
       has_diabetes_mellitus = COALESCE(?, has_diabetes_mellitus),
       has_blood_disorders = COALESCE(?, has_blood_disorders),
       has_cardio_heart_disease = COALESCE(?, has_cardio_heart_disease),
       has_thyroid_disorders = COALESCE(?, has_thyroid_disorders),
       hepatitis = COALESCE(?, hepatitis),
       malignancy = COALESCE(?, malignancy),
       hosp_medical = COALESCE(?, hosp_medical),
       hosp_surgical = COALESCE(?, hosp_surgical),
       hosp_blood_transfusion = COALESCE(?, hosp_blood_transfusion),
       has_tattoo = COALESCE(?, has_tattoo),
       hosp_others = COALESCE(?, hosp_others),
       diet_sugar_beverages = COALESCE(?, diet_sugar_beverages),
       diet_alcohol = COALESCE(?, diet_alcohol),
       diet_tobacco = COALESCE(?, diet_tobacco),
       diet_betel_nut = COALESCE(?, diet_betel_nut),
       conforme_name = COALESCE(?, conforme_name)
     WHERE id = ?`
  ).run(
    name !== undefined ? String(name).trim() : null,
    email !== undefined ? String(email).trim() : null,
    barangay ?? null,
    address ?? null,
    occupation ?? null,
    sex ?? null,
    birthdate ?? null,
    surname ?? null,
    first_name ?? null,
    middle_name ?? null,
    place_of_birth ?? null,
    parent_guardian ?? null,
    cellphone_no ?? null,
    is_pregnant === undefined ? null : is_pregnant ? 1 : 0,
    is_senior_citizen === undefined ? null : is_senior_citizen ? 1 : 0,
    is_pwd === undefined ? null : is_pwd ? 1 : 0,
    is_nhts_pr === undefined ? null : is_nhts_pr ? 1 : 0,
    is_4ps === undefined ? null : is_4ps ? 1 : 0,
    is_indigenous_people === undefined ? null : is_indigenous_people ? 1 : 0,
    philhealth_no ?? null,
    sss_no ?? null,
    gsis_no ?? null,
    allergies ?? null,
    has_hypertension_cva === undefined ? null : has_hypertension_cva ? 1 : 0,
    has_diabetes_mellitus === undefined ? null : has_diabetes_mellitus ? 1 : 0,
    has_blood_disorders === undefined ? null : has_blood_disorders ? 1 : 0,
    has_cardio_heart_disease === undefined ? null : has_cardio_heart_disease ? 1 : 0,
    has_thyroid_disorders === undefined ? null : has_thyroid_disorders ? 1 : 0,
    hepatitis ?? null,
    malignancy ?? null,
    hosp_medical ?? null,
    hosp_surgical ?? null,
    hosp_blood_transfusion ?? null,
    has_tattoo === undefined ? null : has_tattoo ? 1 : 0,
    hosp_others ?? null,
    diet_sugar_beverages ?? null,
    diet_alcohol ?? null,
    diet_tobacco ?? null,
    diet_betel_nut ?? null,
    conforme_name ?? null,
    id
  );

  const patient = db
    .prepare(
      `SELECT id, name, email, birthdate, sex, address, occupation, barangay,
              surname, first_name, middle_name, place_of_birth, parent_guardian, cellphone_no,
              is_pregnant, is_senior_citizen, is_pwd, created_at,
              is_nhts_pr, is_4ps, is_indigenous_people, philhealth_no, sss_no, gsis_no,
              allergies, has_hypertension_cva, has_diabetes_mellitus, has_blood_disorders,
              has_cardio_heart_disease, has_thyroid_disorders, hepatitis, malignancy,
              hosp_medical, hosp_surgical, hosp_blood_transfusion, has_tattoo, hosp_others,
              diet_sugar_beverages, diet_alcohol, diet_tobacco, diet_betel_nut, conforme_name
       FROM users WHERE id = ?`
    )
    .get(id);
  res.json(withAge(patient));
});

// Get a single patient profile (self, or admin viewing anyone)
router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role !== "admin" && req.user.id !== id) {
    return res.status(403).json({ error: "Not authorized." });
  }
  const patient = db
    .prepare(
      `SELECT id, name, email, birthdate, sex, address, occupation, barangay,
              surname, first_name, middle_name, place_of_birth, parent_guardian, cellphone_no,
              is_pregnant, is_senior_citizen, is_pwd, created_at,
              is_nhts_pr, is_4ps, is_indigenous_people, philhealth_no, sss_no, gsis_no,
              allergies, has_hypertension_cva, has_diabetes_mellitus, has_blood_disorders,
              has_cardio_heart_disease, has_thyroid_disorders, hepatitis, malignancy,
              hosp_medical, hosp_surgical, hosp_blood_transfusion, has_tattoo, hosp_others,
              diet_sugar_beverages, diet_alcohol, diet_tobacco, diet_betel_nut, conforme_name
       FROM users WHERE id = ? AND role = 'patient'`
    )
    .get(id);
  if (!patient) return res.status(404).json({ error: "Patient not found." });

  const vitals = db.prepare(`SELECT * FROM vitals WHERE patient_id = ? ORDER BY recorded_at DESC LIMIT 1`).get(id);
  res.json({ ...withAge(patient), vitals: vitals || null });
});

// Admin: delete a patient (and their dependent records, via FK cascade).
router.delete("/:id", requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'patient'").get(id);
  if (!existing) return res.status(404).json({ error: "Patient not found." });
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  res.json({ success: true });
});

// Admin: create a new patient record (e.g. a walk-in, or someone the clinic
// wants on file before they ever sign up). This is a *record*, not yet a
// login-capable account — admin fills in and edits their personal info and
// logs services applied. If this person later signs up on the website with
// a matching name + barangay, their signup links to this same record instead
// of starting a separate, empty one (see routes/auth.js).
router.post("/", requireRole("admin"), (req, res) => {
  const {
    name,
    email,
    birthdate,
    sex,
    barangay,
    address,
    occupation,
    parent_guardian,
    cellphone_no,
  } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Name is required." });

  let trimmedEmail = email && String(email).trim() ? String(email).trim() : null;
  if (!trimmedEmail) {
    trimmedEmail = `${String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "patient"}.${Date.now()}@imported.local`;
  } else {
    const dupe = db.prepare("SELECT id FROM users WHERE email = ?").get(trimmedEmail);
    if (dupe) return res.status(400).json({ error: "That email is already registered." });
  }

  // Placeholder password hash — admin-added rows have no login until the patient
  // signs up themselves with this same email, or an admin resets/sets a password.
  const password_hash = bcrypt.hashSync(Math.random().toString(36).slice(2) + Date.now(), 10);

  const info = db
    .prepare(
      `INSERT INTO users
        (
          role,
          name,
          email,
          password_hash,
          birthdate,
          sex,
          barangay,
          address,
          occupation,
          parent_guardian,
          cellphone_no
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "patient",
      String(name).trim(),
      trimmedEmail,
      password_hash,
      birthdate || null,
      sex || null,
      barangay || null,
      address || null,
      occupation || null,
      parent_guardian || null,
      cellphone_no || null
    );

  const patient = db
    .prepare(
      `SELECT id, name, email, birthdate, sex, address, occupation, barangay, is_pregnant, is_senior_citizen, is_pwd, created_at
       FROM users WHERE id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json(withAge(patient));
});

// Admin: record/update vitals for a patient (a clinical measurement, separate
// from the patient's personal info edited via PATCH /:id above)
router.post("/:id/vitals", requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  const { pulse_rate, blood_pressure, temperature } = req.body;
  const info = db
    .prepare(`INSERT INTO vitals (patient_id, pulse_rate, blood_pressure, temperature) VALUES (?, ?, ?, ?)`)
    .run(id, pulse_rate || null, blood_pressure || null, temperature || null);
  const row = db.prepare("SELECT * FROM vitals WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(row);
});

export default router;