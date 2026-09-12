import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "citydental.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('patient','admin','doctor')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  birthdate TEXT,
  sex TEXT,
  address TEXT,
  occupation TEXT,
  barangay TEXT,
  is_pregnant INTEGER NOT NULL DEFAULT 0,
  is_senior_citizen INTEGER NOT NULL DEFAULT 0,
  is_pwd INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// Lightweight migration for databases created before these columns existed.
const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes("barangay")) {
  db.exec("ALTER TABLE users ADD COLUMN barangay TEXT");
}
if (!userColumns.includes("is_pregnant")) {
  db.exec("ALTER TABLE users ADD COLUMN is_pregnant INTEGER NOT NULL DEFAULT 0");
}
if (!userColumns.includes("is_senior_citizen")) {
  db.exec("ALTER TABLE users ADD COLUMN is_senior_citizen INTEGER NOT NULL DEFAULT 0");
}
if (!userColumns.includes("is_pwd")) {
  db.exec("ALTER TABLE users ADD COLUMN is_pwd INTEGER NOT NULL DEFAULT 0");
}
if (!userColumns.includes("surname")) {
  db.exec("ALTER TABLE users ADD COLUMN surname TEXT");
}
if (!userColumns.includes("first_name")) {
  db.exec("ALTER TABLE users ADD COLUMN first_name TEXT");
}
if (!userColumns.includes("middle_name")) {
  db.exec("ALTER TABLE users ADD COLUMN middle_name TEXT");
}
if (!userColumns.includes("place_of_birth")) {
  db.exec("ALTER TABLE users ADD COLUMN place_of_birth TEXT");
}
if (!userColumns.includes("parent_guardian")) {
  db.exec("ALTER TABLE users ADD COLUMN parent_guardian TEXT");
}
if (!userColumns.includes("cellphone_no")) {
  db.exec("ALTER TABLE users ADD COLUMN cellphone_no TEXT");
}

// Individual Patient Treatment Record fields (Membership, Medical History,
// Hospitalization History, Dietary/Social History, Conforme) — mirrors the
// DOH paper form so admin can capture the same data digitally.
const treatmentRecordColumns = {
  is_nhts_pr: "INTEGER NOT NULL DEFAULT 0",
  is_4ps: "INTEGER NOT NULL DEFAULT 0",
  is_indigenous_people: "INTEGER NOT NULL DEFAULT 0",
  philhealth_no: "TEXT",
  sss_no: "TEXT",
  gsis_no: "TEXT",
  allergies: "TEXT",
  has_hypertension_cva: "INTEGER NOT NULL DEFAULT 0",
  has_diabetes_mellitus: "INTEGER NOT NULL DEFAULT 0",
  has_blood_disorders: "INTEGER NOT NULL DEFAULT 0",
  has_cardio_heart_disease: "INTEGER NOT NULL DEFAULT 0",
  has_thyroid_disorders: "INTEGER NOT NULL DEFAULT 0",
  hepatitis: "TEXT",
  malignancy: "TEXT",
  hosp_medical: "TEXT",
  hosp_surgical: "TEXT",
  hosp_blood_transfusion: "TEXT",
  has_tattoo: "INTEGER NOT NULL DEFAULT 0",
  hosp_others: "TEXT",
  diet_sugar_beverages: "TEXT",
  diet_alcohol: "TEXT",
  diet_tobacco: "TEXT",
  diet_betel_nut: "TEXT",
  conforme_name: "TEXT",
};
for (const [col, type] of Object.entries(treatmentRecordColumns)) {
  if (!userColumns.includes(col)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
  }
}

// Doctor accounts: signed up with an admin-issued access code, but stay
// locked out of logging in until an admin explicitly confirms them (see
// routes/doctorAccess.js). doctor_status is only meaningful for role='doctor'
// rows — 'pending' until reviewed, then 'approved' or 'rejected'.
const doctorColumns = {
  doctor_status: "TEXT",
  doctor_access_code: "TEXT",
  doctor_approved_by: "INTEGER",
  doctor_approved_at: "TEXT",
};
for (const [col, type] of Object.entries(doctorColumns)) {
  if (!userColumns.includes(col)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
  }
}

// The `role` column's CHECK constraint was created before the 'doctor' role
// existed. SQLite can't ALTER a CHECK constraint in place, so rebuild the
// table (preserving every column and the data in it) the first time this
// runs against an older database file.
const usersTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get()?.sql || "";
if (usersTableSql && !usersTableSql.includes("'doctor'")) {
  const cols = db.prepare("PRAGMA table_info(users)").all();
  const colDefs = cols.map((c) => {
    if (c.name === "id") return "id INTEGER PRIMARY KEY AUTOINCREMENT";
    if (c.name === "role") return "role TEXT NOT NULL CHECK(role IN ('patient','admin','doctor'))";
    let def = `${c.name} ${c.type}`;
    if (c.name === "email") def += " UNIQUE";
    if (c.notnull) def += " NOT NULL";
    if (c.dflt_value !== null && c.dflt_value !== undefined) {
      // PRAGMA table_info reports expression defaults (e.g. a function call
      // like datetime('now')) without the wrapping parens SQLite's own DDL
      // requires around a non-literal default — add them back, but not for
      // simple literals (quoted strings, numbers, NULL) which don't need
      // and shouldn't get extra parens.
      const isSimpleLiteral = /^(-?\d+(\.\d+)?|'([^']|'')*'|NULL)$/i.test(c.dflt_value);
      def += isSimpleLiteral ? ` DEFAULT ${c.dflt_value}` : ` DEFAULT (${c.dflt_value})`;
    }
    return def;
  });
  const colNames = cols.map((c) => c.name).join(", ");
  db.exec(`CREATE TABLE users_new (${colDefs.join(", ")})`);
  db.exec(`INSERT INTO users_new (${colNames}) SELECT ${colNames} FROM users`);
  db.exec("DROP TABLE users");
  db.exec("ALTER TABLE users_new RENAME TO users");
}

// Access codes an admin generates for a doctor to use at signup. One code
// is meant for one doctor — it's marked 'used' the moment a doctor account
// is created with it (see /auth/register), independent of whether that
// doctor is later approved or rejected.
db.exec(`
CREATE TABLE IF NOT EXISTS access_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'unused' CHECK(status IN ('unused','used','revoked')),
  created_by INTEGER REFERENCES users(id),
  used_by INTEGER REFERENCES users(id),
  used_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

db.exec(`

CREATE TABLE IF NOT EXISTS vitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pulse_rate INTEGER,
  blood_pressure TEXT,
  temperature REAL,
  recorded_at TEXT DEFAULT (datetime('now'))
);

-- Booking-style "appointments" and "billing" tables have been removed: the
-- clinic now logs what actually happened directly against a patient (below),
-- which also drives the e-FHSIS Monthly Report automatically (see
-- lib/reportSync.js), instead of a separate patient-initiated request queue.
CREATE TABLE IF NOT EXISTS dental_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_date TEXT NOT NULL,
  procedure TEXT NOT NULL,
  dentist TEXT,
  notes TEXT,
  -- Snapshot of which Monthly Report bucket this visit was counted under,
  -- set automatically when the record is created/edited, so it can be
  -- reversed precisely if the record is edited again or deleted.
  report_month TEXT,
  report_field TEXT,
  report_barangay TEXT,
  report_dentist TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK(sender IN ('patient','admin')),
  body TEXT NOT NULL,
  sent_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS barangay_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barangay_name TEXT NOT NULL,
  visit_date TEXT NOT NULL,
  time_range TEXT,
  services TEXT,
  location TEXT,
  dentist TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Digitized version of the City Dental Office's monthly e-FHSIS paper reports:
-- one row per (month, dentist-or-barangay, activity type) with a count column
-- for each age/condition category the paper form tracks, split by sex where
-- the paper form splits it (everything except "Pregnant Women", which is
-- female-only on the paper form, hence no pregnant_m column).
CREATE TABLE IF NOT EXISTS monthly_report_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_month TEXT NOT NULL,               -- 'YYYY-MM'
  scope TEXT NOT NULL CHECK(scope IN ('dentist','barangay')),
  scope_name TEXT NOT NULL,                 -- dentist's name, or barangay name
  activity_type TEXT NOT NULL DEFAULT 'consultation_extraction'
    CHECK(activity_type IN ('consultation_extraction','ekonsulta','dental_mission')),
  projected_population INTEGER,             -- barangay rows only; from the projected population column (label shown as "2026" in the UI)
  orally_fit_m INTEGER NOT NULL DEFAULT 0,
  orally_fit_f INTEGER NOT NULL DEFAULT 0,
  dmft_m INTEGER NOT NULL DEFAULT 0,
  dmft_f INTEGER NOT NULL DEFAULT 0,
  infants_m INTEGER NOT NULL DEFAULT 0,
  infants_f INTEGER NOT NULL DEFAULT 0,
  children_1_4_m INTEGER NOT NULL DEFAULT 0,
  children_1_4_f INTEGER NOT NULL DEFAULT 0,
  children_5_9_m INTEGER NOT NULL DEFAULT 0,
  children_5_9_f INTEGER NOT NULL DEFAULT 0,
  adol_10_14_m INTEGER NOT NULL DEFAULT 0,
  adol_10_14_f INTEGER NOT NULL DEFAULT 0,
  adol_15_19_m INTEGER NOT NULL DEFAULT 0,
  adol_15_19_f INTEGER NOT NULL DEFAULT 0,
  adults_m INTEGER NOT NULL DEFAULT 0,
  adults_f INTEGER NOT NULL DEFAULT 0,
  senior_m INTEGER NOT NULL DEFAULT 0,
  senior_f INTEGER NOT NULL DEFAULT 0,
  pregnant_f INTEGER NOT NULL DEFAULT 0,
  UNIQUE(report_month, scope, scope_name, activity_type)
);

-- Forgot-password flow: one row per active recovery attempt.
--  1. /forgot-password/request  -> creates a row with a 6-digit code
--  2. /forgot-password/verify   -> checks the code, then sets reset_token + verified=1
--  3. /forgot-password/reset    -> checks the reset_token, updates the user's password,
--                                   then deletes the row so it can't be reused
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  code_expires_at TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  reset_token TEXT,
  reset_token_expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  schedule TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- One row per tooth, per patient, only once its condition is actually set
-- (a tooth with no row yet is treated as "sound" by default in the API).
CREATE TABLE IF NOT EXISTS tooth_conditions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tooth_number TEXT NOT NULL,
  condition TEXT NOT NULL DEFAULT 'sound'
    CHECK(condition IN ('sound','decayed','filled','for_extraction','missing')),
  treatment_note TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(patient_id, tooth_number)
);
`);

// Lightweight migration for databases created before dental_records grew the
// report_* snapshot columns (used to auto-sync Patient Management with the
// Monthly Report — see lib/reportSync.js).
const dentalRecordColumns = db.prepare("PRAGMA table_info(dental_records)").all().map((c) => c.name);
for (const col of ["report_month", "report_field", "report_barangay", "report_dentist"]) {
  if (!dentalRecordColumns.includes(col)) db.exec(`ALTER TABLE dental_records ADD COLUMN ${col} TEXT`);
}

// Lightweight migration for databases created before barangay_schedule grew
// the target (headcount goal) and status (Upcoming/Ongoing/Completed) columns
// used by the "Barangay Activity Schedule" admin page.
const barangayScheduleColumns = db.prepare("PRAGMA table_info(barangay_schedule)").all().map((c) => c.name);
if (!barangayScheduleColumns.includes("target")) {
  db.exec("ALTER TABLE barangay_schedule ADD COLUMN target INTEGER");
}
if (!barangayScheduleColumns.includes("status")) {
  db.exec("ALTER TABLE barangay_schedule ADD COLUMN status TEXT NOT NULL DEFAULT 'Upcoming'");
}


// "Weekly rotation" rules — e.g. "Dr. Orias is in Camaysa every Monday" —
// so admin doesn't have to re-post the same barangay date every single week.
// The schedule table's GET route fills in real rows from these automatically.
db.exec(`
CREATE TABLE IF NOT EXISTS recurring_barangay_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barangay_name TEXT NOT NULL,
  day_of_week INTEGER NOT NULL, -- 0=Sunday, 1=Monday, ... 6=Saturday
  dentist TEXT,
  services TEXT,
  time_range TEXT,
  location TEXT,
  target INTEGER,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

if (!barangayScheduleColumns.includes("recurring_rule_id")) {
  db.exec("ALTER TABLE barangay_schedule ADD COLUMN recurring_rule_id INTEGER REFERENCES recurring_barangay_schedule(id)");
}

// Old "appointments"/"billing" tables from a previous version of this app —
// drop them if a pre-existing database file still has them.
db.exec("DROP TABLE IF EXISTS appointments");
db.exec("DROP TABLE IF EXISTS billing");

export default db;