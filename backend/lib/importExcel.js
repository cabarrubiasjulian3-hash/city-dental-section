import ExcelJS from "exceljs";
import bcrypt from "bcryptjs";
import db from "../db.js";
import { applyServiceRecord } from "./reportSync.js";

function toYesNoBool(val) {
  if (val === null || val === undefined) return false;
  const s = String(val).trim().toLowerCase();
  return s === "yes" || s === "true" || s === "1" || s === "y";
}

function cellText(cell) {
  if (!cell) return "";
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v.text !== undefined) return String(v.text).trim(); // rich text
  if (typeof v === "object" && v.result !== undefined) return String(v.result).trim(); // formula
  return String(v).trim();
}

function cellDate(cell) {
  if (!cell) return "";
  const v = cell.value;
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "") || "patient"
  );
}

const fieldAliases = {
  name: ["full name", "name", "patient name"],
  age: ["age"],
  sex: ["sex", "gender"],
  barangay: ["barangay"],
  address: ["address"],
  street: ["street"],
  sitio: ["sitio"],
  landmark: ["landmark"],
  place_of_birth: ["place of birth"],
  date_of_birth: ["date of birth", "birthdate", "birth date"],
  occupation: ["occupation"],
  parent_guardian: [
    "parent / guardian",
    "parent guardian",
    "parent/guardian",
    "guardian",
  ],
  cellphone_no: [
    "cellphone number",
    "cell phone",
    "cell phone number",
    "contact number",
    "mobile number",
  ],
  procedure_date: [
    "date of visit / procedure",
    "date of visit/procedure",
    "procedure date",
    "visit date",
    "date",
  ],
  procedure: ["procedure / service", "procedure/service", "procedure", "service"],
  dentist: ["attending dentist", "dentist"],
  pregnant: ["pregnant"],
  senior: ["senior citizen", "senior"],
  pwd: ["pwd"],
  notes: ["notes"],
};

/**
 * Parses an .xlsx buffer and upserts patients + dental_records from it.
 * This is the single source of truth for "Excel -> database" syncing —
 * used by the manual admin upload route AND the folder auto-watcher,
 * so both behave identically.
 *
 * Matching rule (also reused at patient signup, see routes/auth.js):
 * a row is matched to an existing patient by LOWER(name) + LOWER(barangay).
 */
export async function importWorkbookBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("The workbook has no sheets.");
  }

  let headerRowNum = null;
  let colMap = {};

  for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
    const row = sheet.getRow(r);
    const rowTexts = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      rowTexts[colNumber] = cellText(cell).toLowerCase();
    });
    const hasName = rowTexts.some((t) => t === "full name" || t === "name" || t === "patient name");
    if (hasName) {
      headerRowNum = r;
      for (let c = 1; c < rowTexts.length; c++) {
        const text = rowTexts[c];
        if (!text) continue;
        for (const [field, aliases] of Object.entries(fieldAliases)) {
          if (aliases.includes(text)) colMap[field] = c;
        }
      }
      break;
    }
  }

  if (headerRowNum === null || !colMap.name) {
    throw new Error("Couldn't find a header row with a 'Full Name' column. Use the provided template's column headers.");
  }

  const insertPatient = db.prepare(
    `INSERT INTO users (
       role, name, email, password_hash, birthdate, sex, barangay, address,
       occupation, parent_guardian, cellphone_no, place_of_birth,
       is_pregnant, is_senior_citizen, is_pwd
     )
     VALUES ('patient', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const findByEmail = db.prepare("SELECT * FROM users WHERE email = ? AND role = 'patient'");
  const findByNameBarangay = db.prepare(
    "SELECT * FROM users WHERE role = 'patient' AND LOWER(name) = ? AND LOWER(COALESCE(barangay,'')) = ?"
  );
  const updatePatient = db.prepare(
    `UPDATE users SET sex = COALESCE(?, sex), barangay = COALESCE(?, barangay),
       birthdate = COALESCE(?, birthdate), address = COALESCE(?, address),
       occupation = COALESCE(?, occupation), parent_guardian = COALESCE(?, parent_guardian),
       cellphone_no = COALESCE(?, cellphone_no), place_of_birth = COALESCE(?, place_of_birth),
       is_pregnant = ?, is_senior_citizen = ?, is_pwd = ?
     WHERE id = ?`
  );
  const findDuplicateRecord = db.prepare(
    `SELECT id FROM dental_records WHERE patient_id = ? AND record_date = ? AND LOWER(procedure) = ?`
  );
  const insertRecord = db.prepare(
    `INSERT INTO dental_records
       (patient_id, record_date, procedure, dentist, notes, report_month, report_field, report_barangay, report_dentist)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const findPatientById = db.prepare("SELECT * FROM users WHERE id = ?");

  const placeholderHash = bcrypt.hashSync("Imported123!", 10);
  const currentYear = new Date().getFullYear();
  const CITY_PREFIX = "Tayabas City";

  let created = 0;
  let updated = 0;
  let recordsAdded = 0;
  let skipped = 0;
  const errors = [];

  const runImport = db.transaction(() => {
    for (let r = headerRowNum + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const nameCell = colMap.name ? row.getCell(colMap.name) : null;
      const name = cellText(nameCell);
      if (!name || /\(sample\)/i.test(name)) continue;

      const ageRaw = colMap.age ? cellText(row.getCell(colMap.age)) : "";
      const age = ageRaw && !isNaN(Number(ageRaw)) ? Number(ageRaw) : null;
      const sexRaw = colMap.sex ? cellText(row.getCell(colMap.sex)) : "";
      const sex = sexRaw
        ? sexRaw.toLowerCase().startsWith("m")
          ? "Male"
          : sexRaw.toLowerCase().startsWith("f")
          ? "Female"
          : sexRaw
        : null;
      const barangay = colMap.barangay ? cellText(row.getCell(colMap.barangay)) : "";
      const pregnant = colMap.pregnant ? toYesNoBool(cellText(row.getCell(colMap.pregnant))) : false;
      const pwd = colMap.pwd ? toYesNoBool(cellText(row.getCell(colMap.pwd))) : false;
      let senior = colMap.senior ? toYesNoBool(cellText(row.getCell(colMap.senior))) : false;
      if (!senior && age !== null && age >= 60) senior = true;

      // Prefer an actual Date of Birth column when present; fall back to
      // Jan 1 of the year implied by Age when only Age is given.
      const dobRaw = colMap.date_of_birth ? cellDate(row.getCell(colMap.date_of_birth)) : "";
      const birthdate = dobRaw || (age !== null ? `${currentYear - age}-01-01` : null);

      const occupation = colMap.occupation ? cellText(row.getCell(colMap.occupation)) : "";
      const parentGuardian = colMap.parent_guardian ? cellText(row.getCell(colMap.parent_guardian)) : "";
      const cellphoneNo = colMap.cellphone_no ? cellText(row.getCell(colMap.cellphone_no)) : "";
      const placeOfBirth = colMap.place_of_birth ? cellText(row.getCell(colMap.place_of_birth)) : "";

      // Address: if a single "Address" column exists, use it as-is; otherwise
      // compose it from Street / Sitio / Landmark (this template's columns),
      // prefixed with the city the same way the admin UI stores it.
      const addressColumn = colMap.address ? cellText(row.getCell(colMap.address)) : "";
      const street = colMap.street ? cellText(row.getCell(colMap.street)) : "";
      const sitio = colMap.sitio ? cellText(row.getCell(colMap.sitio)) : "";
      const landmark = colMap.landmark ? cellText(row.getCell(colMap.landmark)) : "";
      const composedStreetPart = [street, sitio, landmark].filter(Boolean).join(", ");
      const streetPart = addressColumn || composedStreetPart;
      // Mirrors the admin UI's withCityPrefix(): always prefixed with the
      // city, since every patient here is from Tayabas City.
      const address = streetPart ? `${CITY_PREFIX}, ${streetPart}` : CITY_PREFIX;

      const procedureDate = colMap.procedure_date ? cellDate(row.getCell(colMap.procedure_date)) : "";
      const procedure = colMap.procedure ? cellText(row.getCell(colMap.procedure)) : "";
      const dentist = colMap.dentist ? cellText(row.getCell(colMap.dentist)) : "";
      const notes = colMap.notes ? cellText(row.getCell(colMap.notes)) : "";

      try {
        let patient = findByNameBarangay.get(name.toLowerCase(), (barangay || "").toLowerCase());

        if (patient) {
          updatePatient.run(
            sex,
            barangay || null,
            birthdate,
            address || null,
            occupation || null,
            parentGuardian || null,
            cellphoneNo || null,
            placeOfBirth || null,
            pregnant ? 1 : 0,
            senior ? 1 : 0,
            pwd ? 1 : 0,
            patient.id
          );
          updated++;
        } else {
          const email = `${slugify(name)}.${slugify(barangay || "brgy")}@imported.local`;
          let finalEmail = email;
          let suffix = 1;
          while (findByEmail.get(finalEmail)) {
            finalEmail = email.replace("@imported.local", `.${suffix}@imported.local`);
            suffix++;
          }
          const info = insertPatient.run(
            name,
            finalEmail,
            placeholderHash,
            birthdate,
            sex,
            barangay || null,
            address || null,
            occupation || null,
            parentGuardian || null,
            cellphoneNo || null,
            placeOfBirth || null,
            pregnant ? 1 : 0,
            senior ? 1 : 0,
            pwd ? 1 : 0
          );
          patient = { id: info.lastInsertRowid };
          created++;
        }

        if (procedure && procedureDate) {
          const dup = findDuplicateRecord.get(patient.id, procedureDate, procedure.toLowerCase());
          if (!dup) {
            // Re-fetch the patient row so the report tally uses the final,
            // merged column values (age/sex/pregnant/senior/barangay) — same
            // as the live "Add service record" flow in dentalRecords.js —
            // instead of just what this one Excel row happened to carry.
            const patientRow = findPatientById.get(patient.id);
            const snapshot = applyServiceRecord({ patient: patientRow, recordDate: procedureDate, dentist });
            insertRecord.run(
              patient.id,
              procedureDate,
              procedure,
              dentist || null,
              notes || null,
              snapshot.report_month,
              snapshot.report_field,
              snapshot.report_barangay,
              snapshot.report_dentist
            );
            recordsAdded++;
          }
        }
      } catch (err) {
        errors.push(`Row ${r} (${name}): ${err.message}`);
        skipped++;
      }
    }
  });

  runImport();

  return { created, updated, records_added: recordsAdded, skipped, errors };
}