import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../../components/ui";
import ToothChart from "../../components/ToothChart";
import EditableCell, { SEX_OPTIONS } from "../../components/EditableCell";
import { SERVICE_OPTIONS, visitsRequiredFor, computeRecordStatuses } from "../../lib/services";
import { REPORT_FIELD_LABELS } from "../../lib/reportFieldLabels";
import { TAYABAS_BARANGAYS } from "../../lib/barangays";
import { composeFullName } from "../../lib/name";

const BARANGAY_OPTIONS = [
  { value: "", label: "Select barangay" },
  ...TAYABAS_BARANGAYS.map((brgy) => ({ value: brgy, label: `Barangay ${brgy}` })),
];

const YES_NO = [
  { value: "false", label: "No" },
  { value: "true", label: "Yes" },
];

// Labels for the "Other Patient Information (Membership)" checkboxes, in the
// same order as the DOH paper form.
const MEMBERSHIP_FIELDS = [
  { field: "is_nhts_pr", label: "NHTS-PR" },
  { field: "is_4ps", label: "4Ps" },
  { field: "is_indigenous_people", label: "Indigenous People (IP)" },
];

// Boolean checkbox fields for Medical History (the ones without a
// "please specify" text box).
const MEDICAL_HISTORY_BOOL_FIELDS = [
  { field: "has_hypertension_cva", label: "Hypertension / CVA" },
  { field: "has_diabetes_mellitus", label: "Diabetes Mellitus" },
  { field: "has_blood_disorders", label: "Blood Disorders" },
  { field: "has_cardio_heart_disease", label: "Cardiovascular / Heart Diseases" },
  { field: "has_thyroid_disorders", label: "Thyroid Disorders" },
];

// Full set of fields collected up front in the "New Patient Record" modal —
// mirrors every field editable later in the Individual Patient Treatment
// Record below, so a walk-in can be fully registered in one sitting instead
// of piecemeal. Vitals are intentionally excluded (they're a separate,
// repeatable log — see "Save vitals" — not part of the one-time record).
const EMPTY_NEW_PATIENT_FORM = {
  // Basic info — surname/first/middle name are combined into "name" on
  // submit (see composeFullName), since the backend "name" column is what
  // actually gets created / searched / displayed in the list.
  surname: "",
  first_name: "",
  middle_name: "",
  birthdate: "",
  place_of_birth: "",
  sex: "",
  barangay: "",
  address: "",
  occupation: "",
  parent_guardian: "",
  cellphone_no: "",
  // Membership
  is_nhts_pr: "false",
  is_4ps: "false",
  is_indigenous_people: "false",
  philhealth_no: "",
  sss_no: "",
  gsis_no: "",
  // Medical history
  allergies: "",
  has_hypertension_cva: "false",
  has_diabetes_mellitus: "false",
  has_blood_disorders: "false",
  has_cardio_heart_disease: "false",
  has_thyroid_disorders: "false",
  hepatitis: "",
  malignancy: "",
  // History of previous hospitalization
  hosp_medical: "",
  hosp_surgical: "",
  hosp_blood_transfusion: "",
  has_tattoo: "false",
  hosp_others: "",
  // Dietary habits / social history
  diet_sugar_beverages: "",
  diet_alcohol: "",
  diet_tobacco: "",
  diet_betel_nut: "",
  // Conforme
  conforme_name: "",
  // Initial visit / service — required before the patient can actually be
  // created. Mirrors the "Add Records" fields (date, service, dentist,
  // notes) so every patient starts with at least one dental record instead
  // of sitting with 0 visits (see statusFor below for how this feeds the
  // Completed / Not Completed / Pending status pill).
  initial_record_date: "",
  initial_procedure: "",
  initial_dentist: "",
  initial_notes: "",
};

// Every patient in this system is from Tayabas City, so the admin never
// types it — only street/sitio/landmark. The full "Tayabas City, ..."
// string is still what's stored/searched/exported, we just hide the
// city part from the input and add it back on save.
const CITY_PREFIX = "Tayabas City";

function stripCityPrefix(address) {
  if (!address) return "";
  const prefix = `${CITY_PREFIX}, `;
  return address.startsWith(prefix) ? address.slice(prefix.length) : address;
}

function withCityPrefix(streetPart) {
  const trimmed = (streetPart || "").trim();
  return trimmed ? `${CITY_PREFIX}, ${trimmed}` : CITY_PREFIX;
}

// Full, human-readable one-line address combining barangay + city + street,
// e.g. "Barangay Camaysa, Tayabas City at ilayang Camaysa happy village" —
// shown as a preview under the editable Barangay/Address fields so the
// admin can see the complete address as it will appear on the record.
function composeDisplayAddress(barangay, address) {
  const brgyPart = barangay ? `Barangay ${barangay}, ` : "";
  const streetPart = stripCityPrefix(address);
  return `${brgyPart}${CITY_PREFIX}${streetPart ? ` at ${streetPart}` : ""}`;
}

// surname/first_name/middle_name ARE real columns on the patient record
// (editable later in the Individual Patient Treatment Record below), so
// they get sent to the backend as plain string fields — just not as part
// of the POST /patients "basic fields" step, since that step only needs
// the composed "name".
const NAME_PART_FIELDS = ["surname", "first_name", "middle_name"];

// Fields sent as booleans (stored is_*/has_* columns) — everything else in
// the New Patient form is sent as-is (string or null).
const NEW_PATIENT_BOOL_FIELDS = [
  "is_nhts_pr",
  "is_4ps",
  "is_indigenous_people",
  "has_hypertension_cva",
  "has_diabetes_mellitus",
  "has_blood_disorders",
  "has_cardio_heart_disease",
  "has_thyroid_disorders",
  "has_tattoo",
];

// The basic fields the POST /patients (create) route accepts directly.
// Everything else in the form is saved right after, via PATCH /patients/:id,
// which already accepts the full field set.
const NEW_PATIENT_BASIC_FIELDS = [
  "name",
  "birthdate",
  "sex",
  "barangay",
  "address",
  "occupation",
  "parent_guardian",
  "cellphone_no",
];

// The initial-visit fields (see EMPTY_NEW_PATIENT_FORM comment above) — these
// don't belong to the patient record at all, they become the first row in
// /dental-records once the patient is created, so they're kept out of both
// NEW_PATIENT_BASIC_FIELDS (POST /patients body) and the generic PATCH loop.
const INITIAL_RECORD_FIELDS = ["initial_record_date", "initial_procedure", "initial_dentist", "initial_notes"];

export default function AdminPatients() {
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showDetails, setShowDetails] = useState(true);
  const [records, setRecords] = useState([]);
  const [dentists, setDentists] = useState([]);
  const [newRecord, setNewRecord] = useState({ record_date: "", procedure: "", dentist: "", notes: "" });
  const [addingRecord, setAddingRecord] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState("");
  const [rowError, setRowError] = useState("");
  const [addingRow, setAddingRow] = useState(false);
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("search") || "");

  // The global header search bar (PortalLayout.jsx) navigates here with
  // ?search=... via router navigate(), which does NOT remount this page if
  // we're already on it — so the initial useState above only catches the
  // FIRST search. This effect re-syncs the search box whenever the URL's
  // search param changes (including subsequent searches from the header
  // while already on this page).
  useEffect(() => {
    setSearch(searchParams.get("search") || "");
  }, [searchParams]);
  // Holds an array of possibly-matching existing patients (name+barangay+age)
  // when the admin is editing name/barangay/birthdate on a row. Null = no
  // warning shown.
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [vitalsForm, setVitalsForm] = useState({ blood_pressure: "", pulse_rate: "", temperature: "" });
  const [savingVitals, setSavingVitals] = useState(false);

  // New Patient Record modal (opened via the "+ New patient record" button).
  // Collects the full intake form up front, with a duplicate check before
  // the record is actually created.
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState(EMPTY_NEW_PATIENT_FORM);
  const [checkingNewPatient, setCheckingNewPatient] = useState(false);
  const [newPatientMatches, setNewPatientMatches] = useState([]);
  // Set only when the admin explicitly clicks "Continue new record" on a
  // shown duplicate warning — createNewPatient below requires this before
  // it will create a second, separate patient row for someone who already
  // has one. Reset any time the name/barangay fields change afterward, so a
  // stale confirmation from a DIFFERENT person's name can't silently let a
  // new duplicate through.
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);

  function loadPatients() {
    api.get("/patients").then(setPatients).catch(() => {});
  }
  useEffect(loadPatients, []);

  // Dentist dropdown is driven by Staff Management — anyone on file there
  // whose role contains "dentist" (e.g. "Dentist", "Dental Officer III").
  // Kept in its own effect so it refreshes independently of the patient list.
  useEffect(() => {
    api
      .get("/staff")
      .then((staff) => setDentists(staff.filter((s) => (s.role || "").toLowerCase().includes("dentist"))))
      .catch(() => {});
  }, []);

  // Build the <select> options for a dentist field. Always offers everyone
  // currently in Staff Management with a "Dentist" role, plus a blank
  // "unassigned" choice. If the record's existing value isn't one of those
  // (e.g. the staff member was since removed, or it's old free-text data),
  // it's kept as a one-off extra option so the value isn't silently lost.
  function dentistOptions(currentValue) {
    const opts = [{ value: "", label: "Unassigned" }, ...dentists.map((d) => ({ value: d.name, label: d.name }))];
    if (currentValue && !dentists.some((d) => d.name === currentValue)) {
      opts.push({ value: currentValue, label: `${currentValue} (not in Staff Management)` });
    }
    return opts;
  }

  // Status shown as a colored pill in the patient list. Based on the most
  // recently logged procedure and how many times that exact procedure has
  // been logged for this patient:
  //   - no visits yet at all                              -> "Pending"
  //   - latest procedure logged fewer times than required
  //     (e.g. a 2-visit service the patient hasn't returned for) -> "Not Completed"
  //   - latest procedure has reached its required visit count   -> "Completed"
  // Visit-count numbers come straight from the /patients list query
  // (latest_procedure / latest_procedure_visits) so this stays accurate
  // without needing every record for every patient on this screen.
  const STATUS_STYLES = {
    Completed: "bg-leaf-200 text-forest-900",
    "Not Completed": "bg-forest-900 text-cream-50",
    Pending: "bg-cream-200 text-forest-700",
  };

  function statusFor(patient) {
    if (!patient.visit_count) return "Pending";
    const required = visitsRequiredFor(patient.latest_procedure);
    const done = patient.latest_procedure_visits || 0;
    return done >= required ? "Completed" : "Not Completed";
  }

  // Per-record Completed / Not Completed status for the currently open
  // patient's Individual Patient Treatment Record table below (see
  // computeRecordStatuses in lib/services.js for the 4-month-interval rule).
  // Recomputed only when the loaded records list actually changes.
  const recordStatuses = useMemo(() => computeRecordStatuses(records), [records]);

  // Opens the details card for a patient. Fetches the full profile (which
  // includes the latest vitals reading and all Individual Patient Treatment
  // Record fields) rather than relying on the row object from the list,
  // which only carries a subset of columns.
  async function openPatient(p) {
    setShowDetails(true);
    setDuplicateWarning(null);
    try {
      const full = await api.get(`/patients/${p.id}`);
      setSelected(full);
      setVitalsForm({
        blood_pressure: full.vitals?.blood_pressure || "",
        pulse_rate: full.vitals?.pulse_rate || "",
        temperature: full.vitals?.temperature || "",
      });
    } catch (err) {
      setRowError(err.message);
      setSelected(p);
    }
    const recs = await api.get(`/dental-records?patient_id=${p.id}`);
    setRecords(recs);
  }

  // "+ New patient record" button opens the modal. Resets the form each
  // time so leftover values from a previous attempt don't carry over.
  function addRow() {
    setNewPatientForm(EMPTY_NEW_PATIENT_FORM);
    setNewPatientMatches([]);
    setConfirmedDuplicate(false);
    setShowNewPatientForm(true);
    setRowError("");
  }

  // Runs after the New Patient Record form's name/birthdate/barangay fields
  // lose focus, so the admin sees a warning before submitting a duplicate.
  async function checkNewPatientDuplicate() {
    const fullName = composeFullName(newPatientForm);
    if (!fullName) {
      setNewPatientMatches([]);
      return;
    }

    setCheckingNewPatient(true);

    try {
      const response = await api.get(
        `/patients/check-duplicate?name=${encodeURIComponent(fullName)}&barangay=${encodeURIComponent(
          newPatientForm.barangay || ""
        )}&age=`
      );

      setNewPatientMatches(response.matches || []);
    } catch (error) {
      setRowError(error.message);
    } finally {
      setCheckingNewPatient(false);
    }
  }

  // Submits the New Patient Record modal. Creates the patient with the
  // basic fields the create route accepts (name is composed from
  // surname/first_name/middle_name), then immediately PATCHes every
  // remaining field collected in the form (name parts, membership, medical
  // history, hospitalization, dietary/social, conforme) so the whole intake
  // form is saved in one submit. Finally opens the newly created patient's
  // details.
  async function createNewPatient(event) {
    event.preventDefault();

    // Hard stop even if the button's disabled state was somehow bypassed
    // (e.g. pressing Enter in a field) — Add Records (date + service) is
    // required before a patient record can be created.
    if (!newPatientForm.initial_record_date || !newPatientForm.initial_procedure) {
      setRowError("Please fill in the date and select a service in \"Add Records\" before creating the patient record.");
      return;
    }

    // Duplicate check is normally triggered onBlur of the name/barangay
    // fields, but that can be skipped entirely (paste + click Submit without
    // ever leaving the field, browser autofill, etc.) — which is exactly how
    // a patient who already signed up for a real account could end up with
    // a second, disconnected record here, with their dental visit attached
    // to the WRONG row (the one they aren't logged in as). So: always run a
    // fresh check right here, and hard-block creation unless the admin has
    // explicitly clicked "Continue new record" for the name currently on
    // screen (confirmedDuplicate — reset on every subsequent name/barangay
    // edit, see setNewPatientField).
    if (!confirmedDuplicate) {
      const fullName = composeFullName(newPatientForm);
      setCheckingNewPatient(true);
      try {
        const response = await api.get(
          `/patients/check-duplicate?name=${encodeURIComponent(fullName)}&barangay=${encodeURIComponent(
            newPatientForm.barangay || ""
          )}&age=`
        );
        const matches = response.matches || [];
        setNewPatientMatches(matches);
        if (matches.length > 0) {
          setRowError(
            "May existing record na ang pasyenteng ito — buksan yun sa halip, o pindutin ang \"Continue new record\" sa babala sa itaas kung sigurado kang ibang tao talaga sila."
          );
          return;
        }
      } catch (error) {
        setRowError(error.message);
        return;
      } finally {
        setCheckingNewPatient(false);
      }
    }

    setAddingRow(true);
    setRowError("");

    try {
      const basicBody = {};
      for (const field of NEW_PATIENT_BASIC_FIELDS) {
        if (field === "name") continue;
        basicBody[field] = newPatientForm[field] ? newPatientForm[field] : null;
      }
      basicBody.name = composeFullName(newPatientForm);
      basicBody.address = withCityPrefix(newPatientForm.address);

      const created = await api.post("/patients", basicBody);

      const restBody = {};
      for (const [field, value] of Object.entries(newPatientForm)) {
        if (NEW_PATIENT_BASIC_FIELDS.includes(field)) continue;
        if (INITIAL_RECORD_FIELDS.includes(field)) continue;
        if (NAME_PART_FIELDS.includes(field)) {
          restBody[field] = value || null;
          continue;
        }
        restBody[field] = NEW_PATIENT_BOOL_FIELDS.includes(field) ? value === "true" : value || null;
      }
      const updated = await api.patch(`/patients/${created.id}`, restBody);

      // Log the first visit right away so the patient never sits at 0 visits
      // (which used to leave it stuck showing "Pending" / made the Status
      // column meaningless). Required fields are enforced below by disabling
      // the submit button, so this should always have a date + procedure.
      await api.post("/dental-records", {
        patient_id: created.id,
        record_date: newPatientForm.initial_record_date,
        procedure: newPatientForm.initial_procedure,
        dentist: newPatientForm.initial_dentist,
        notes: newPatientForm.initial_notes,
      });

      setPatients((currentPatients) => [
        { ...updated, visit_count: 1, latest_procedure: newPatientForm.initial_procedure, latest_procedure_visits: 1 },
        ...currentPatients,
      ]);
      setShowNewPatientForm(false);
      await openPatient(updated);
    } catch (error) {
      setRowError(error.message);
    } finally {
      setAddingRow(false);
    }
  }

  // Checks the backend for an existing patient with the same name + barangay
  // + age. Called after saving the name/barangay/birthdate fields so the
  // admin gets warned before accidentally creating a duplicate record.
  async function checkForDuplicates(patient) {
    if (!patient?.name) return;
    try {
      const result = await api.get(
        `/patients/check-duplicate?name=${encodeURIComponent(patient.name)}&barangay=${encodeURIComponent(
          patient.barangay || ""
        )}&age=${patient.age ?? ""}`
      );
      const others = result.matches.filter((m) => m.id !== patient.id);
      setDuplicateWarning(others.length ? others : null);
    } catch {
      // Huwag i-block ang normal na pag-save kung nag-fail lang ang duplicate check.
    }
  }

  async function savePatientField(patient, field, value) {
    setRowError("");
    try {
      const body = { [field]: field.startsWith("is_") || field.startsWith("has_") ? value === "true" : value };
      const updated = await api.patch(`/patients/${patient.id}`, body);
      setPatients((list) => list.map((p) => (p.id === patient.id ? { ...p, ...updated } : p)));
      if (selected?.id === patient.id) setSelected((s) => ({ ...s, ...updated }));
      if (["name", "barangay", "birthdate"].includes(field)) {
        checkForDuplicates(updated);
      }
    } catch (err) {
      setRowError(err.message);
    }
  }

  async function deleteRow(patient) {
    if (!window.confirm(`Remove ${patient.name}'s account? This cannot be undone.`)) return;
    setRowError("");
    try {
      await api.del(`/patients/${patient.id}`);
      setPatients((list) => list.filter((p) => p.id !== patient.id));
      if (selected?.id === patient.id) setSelected(null);
    } catch (err) {
      setRowError(err.message);
    }
  }

  async function addServiceRecord(e) {
    e.preventDefault();
    if (!newRecord.record_date || !newRecord.procedure) return;
    setAddingRecord(true);
    try {
      const row = await api.post("/dental-records", { ...newRecord, patient_id: selected.id });
      setRecords((list) => [row, ...list]);
      setNewRecord({ record_date: "", procedure: "", dentist: "", notes: "" });
      setPatients((list) =>
        list.map((p) =>
          p.id === selected.id
            ? {
                ...p,
                visit_count: (p.visit_count || 0) + 1,
                latest_procedure: newRecord.procedure,
                latest_procedure_visits: p.latest_procedure === newRecord.procedure ? (p.latest_procedure_visits || 0) + 1 : 1,
              }
            : p
        )
      );
    } finally {
      setAddingRecord(false);
    }
  }

  async function saveRecordField(record, field, value) {
    const updated = await api.patch(`/dental-records/${record.id}`, { [field]: value });
    setRecords((list) => list.map((r) => (r.id === record.id ? updated : r)));
  }

  async function deleteRecord(record) {
    if (!window.confirm("Remove this service record?")) return;
    await api.del(`/dental-records/${record.id}`);
    setRecords((list) => list.filter((r) => r.id !== record.id));
    setPatients((list) =>
      list.map((p) => (p.id === selected.id ? { ...p, visit_count: Math.max(0, (p.visit_count || 0) - 1) } : p))
    );
  }

  // Logs a new vitals reading for the currently-open patient (Vital Signs
  // box in the Individual Patient Treatment Record). Uses the existing
  // POST /patients/:id/vitals endpoint — each save is a new history row,
  // and the form below always shows the most recent one.
  async function saveVitals(e) {
    e.preventDefault();
    if (!selected) return;
    setSavingVitals(true);
    try {
      const saved = await api.post(`/patients/${selected.id}/vitals`, vitalsForm);
      setSelected((s) => ({ ...s, vitals: saved }));
    } catch (err) {
      setRowError(err.message);
    } finally {
      setSavingVitals(false);
    }
  }

  async function exportExcel() {
    setExporting(true);
    setExportError("");
    try {
      await api.download("/patients/export/xlsx", "patient-records.xlsx");
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function importExcel(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const result = await api.upload("/patients/import/xlsx", file);
      setImportResult(result);
      loadPatients(); // reload immediately so the imported/updated rows show up right away
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
      e.target.value = ""; // allow re-selecting the same file next time
    }
  }

  function printTable() {
    window.print();
  }

  // Small helper for the New Patient modal's plain controlled inputs —
  // updates one field of newPatientForm.
  function setNewPatientField(field, value) {
    setNewPatientForm((form) => ({ ...form, [field]: value }));
    // Any edit to the fields that feed the duplicate check invalidates a
    // previous "continue anyway" confirmation and any stale match result —
    // both were about whatever name/barangay was on screen before this edit.
    if (["surname", "first_name", "middle_name", "barangay", "birthdate"].includes(field)) {
      setConfirmedDuplicate(false);
      setNewPatientMatches([]);
    }
  }

  const filtered = search.trim()
    ? patients.filter((p) =>
        [p.name, p.email, p.barangay, p.address, p.occupation, p.latest_dentist]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(search.trim().toLowerCase()))
      )
    : patients;

  return (
    <div className="patient-page space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-patient-table, #printable-patient-table * { visibility: visible; }
          #printable-patient-table { position: absolute; left: 0; top: 0; width: 100%; }
          #printable-patient-table button, #printable-patient-table input, #printable-patient-table select { display: none !important; }
        }
      `}</style>

      {/* ---------- STEP 1: header ---------- */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-bold text-forest-950">Patient Records</h2>
          <p className="text-sm text-forest-700 mt-1">
            Oral Health Card entries · City Dental Office, City of Tayabas
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end flex-wrap">
            <button
              onClick={addRow}
              disabled={addingRow}
              className="bg-forest-900 text-cream-50 text-sm font-semibold rounded-full px-4 py-2 hover:bg-forest-800 disabled:opacity-60"
            >
              {addingRow ? "Adding…" : "+ New patient record"}
            </button>
            <button
              onClick={printTable}
              className="patient-action bg-cream-50 border border-forest-900 text-forest-900"
            >
              🖨 Print
            </button>
            <label className="patient-action bg-cream-50 border border-forest-900 text-forest-900 cursor-pointer">
              {importing ? "Importing…" : "⬆ Import from Excel"}
              <input
                type="file"
                accept=".xlsx"
                onChange={importExcel}
                disabled={importing}
                className="hidden"
              />
            </label>
            <button
              onClick={exportExcel}
              disabled={exporting}
              className="patient-action bg-forest-900 text-cream-50 disabled:opacity-60"
            >
              {exporting ? "Preparing file…" : "⬇ Export to Excel"}
            </button>
          </div>
          {exportError && <p className="text-xs text-red-600 mt-1">{exportError}</p>}
          {importError && <p className="text-xs text-red-600 mt-1">{importError}</p>}
          {importResult && (
            <p className="text-xs text-forest-700 mt-1">
              Imported: {importResult.created} new, {importResult.updated} updated,{" "}
              {importResult.records_added} procedure record(s) added
              {importResult.skipped ? `, ${importResult.skipped} row(s) skipped` : ""}. Table below is already up to
              date.
            </p>
          )}
        </div>
      </div>

      {/* ---------- New Patient Record modal (full intake form) ---------- */}
      {showNewPatientForm && (
        <div className="patient-modal-backdrop print-hidden">
          <form onSubmit={createNewPatient} className="patient-modal space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-forest-950">New Patient Record</h3>
                <p className="mt-1 text-xs text-forest-700">
                  Complete the Individual Patient Treatment Record before saving the patient.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewPatientForm(false)}
                className="text-xl text-forest-700"
              >
                ×
              </button>
            </div>

            {rowError && (
              <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-300 rounded-lg px-3 py-2">
                ⚠ {rowError}
              </p>
            )}

            {/* Basic info */}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-forest-700">
                Surname *
                <input
                  required
                  className="patient-input"
                  value={newPatientForm.surname}
                  onChange={(e) => setNewPatientField("surname", e.target.value)}
                  onBlur={checkNewPatientDuplicate}
                />
              </label>

              <label className="text-xs text-forest-700">
                First Name *
                <input
                  required
                  className="patient-input"
                  value={newPatientForm.first_name}
                  onChange={(e) => setNewPatientField("first_name", e.target.value)}
                  onBlur={checkNewPatientDuplicate}
                />
              </label>

              <label className="text-xs text-forest-700">
                Middle Name <span className="text-forest-500">(optional — pwede middle initial lang)</span>
                <input
                  className="patient-input"
                  placeholder="D. o Dela Cruz"
                  value={newPatientForm.middle_name}
                  onChange={(e) => setNewPatientField("middle_name", e.target.value)}
                  onBlur={checkNewPatientDuplicate}
                />
              </label>

              <label className="text-xs text-forest-700">
                Date of Birth
                <input
                  type="date"
                  className="patient-input"
                  value={newPatientForm.birthdate}
                  onChange={(e) => setNewPatientField("birthdate", e.target.value)}
                  onBlur={checkNewPatientDuplicate}
                />
              </label>

              <label className="text-xs text-forest-700">
                Place of Birth <span className="text-forest-500">(optional)</span>
                <input
                  className="patient-input"
                  value={newPatientForm.place_of_birth}
                  onChange={(e) => setNewPatientField("place_of_birth", e.target.value)}
                />
              </label>

              <label className="text-xs text-forest-700">
                Sex
                <select
                  className="patient-input"
                  value={newPatientForm.sex}
                  onChange={(e) => setNewPatientField("sex", e.target.value)}
                >
                  <option value="">Select sex</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </label>

              <label className="text-xs text-forest-700 sm:col-span-2">
                Address
                <div className="mt-1.5 flex gap-2 items-center">
                  <select
                    className="shrink-0 rounded-[10px] border border-[#ddd8c6] bg-white px-3 py-2.5 text-sm text-forest-950 basis-2/5"
                    value={newPatientForm.barangay}
                    onChange={(e) => setNewPatientField("barangay", e.target.value)}
                    onBlur={checkNewPatientDuplicate}
                  >
                    <option value="">Select barangay</option>
                    {TAYABAS_BARANGAYS.map((brgy) => (
                      <option key={brgy} value={brgy}>
                        Barangay {brgy}
                      </option>
                    ))}
                  </select>
                  <span className="shrink-0 text-sm text-forest-600">Tayabas City,</span>
                  <input
                    className="flex-1 rounded-[10px] border border-[#ddd8c6] bg-white px-3 py-2.5 text-sm"
                    placeholder="Street / Sitio / Landmark"
                    value={newPatientForm.address}
                    onChange={(e) => setNewPatientField("address", e.target.value)}
                  />
                </div>
              </label>

              <label className="text-xs text-forest-700">
                Occupation
                <input
                  className="patient-input"
                  value={newPatientForm.occupation}
                  onChange={(e) => setNewPatientField("occupation", e.target.value)}
                />
              </label>

              <label className="text-xs text-forest-700">
                Parent / Guardian <span className="text-forest-500">(optional)</span>
                <input
                  className="patient-input"
                  value={newPatientForm.parent_guardian}
                  onChange={(e) => setNewPatientField("parent_guardian", e.target.value)}
                />
              </label>

              <label className="text-xs text-forest-700">
                Cellphone Number <span className="text-forest-500">(optional)</span>
                <input
                  className="patient-input"
                  value={newPatientForm.cellphone_no}
                  onChange={(e) => setNewPatientField("cellphone_no", e.target.value)}
                />
              </label>
            </div>

            {checkingNewPatient && <p className="text-xs text-forest-700">Checking existing patient records...</p>}

            {newPatientMatches.length > 0 && (
              <div className="duplicate-alert">
                <strong>May existing record na ang patient na ito.</strong>
                <p className="mt-1">
                  {newPatientMatches[0].name}
                  {newPatientMatches[0].barangay ? ` — ${newPatientMatches[0].barangay}` : ""}
                </p>
                <div className="mt-2 flex gap-3 text-xs">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      openPatient(newPatientMatches[0]);
                      setShowNewPatientForm(false);
                    }}
                  >
                    Buksan ang existing record
                  </button>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setConfirmedDuplicate(true);
                    }}
                  >
                    Continue new record
                  </button>
                </div>
              </div>
            )}

            {/* Membership */}
            <div className="border-t border-cream-200 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-forest-700 mb-2">
                Other Patient Information (Membership)
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {MEMBERSHIP_FIELDS.map(({ field, label }) => (
                  <label key={field} className="text-xs text-forest-700">
                    {label}
                    <select
                      className="patient-input"
                      value={newPatientForm[field]}
                      onChange={(e) => setNewPatientField(field, e.target.value)}
                    >
                      {YES_NO.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label className="text-xs text-forest-700">
                  PhilHealth No.
                  <input
                    className="patient-input"
                    value={newPatientForm.philhealth_no}
                    onChange={(e) => setNewPatientField("philhealth_no", e.target.value)}
                  />
                </label>
                <label className="text-xs text-forest-700">
                  SSS No.
                  <input
                    className="patient-input"
                    value={newPatientForm.sss_no}
                    onChange={(e) => setNewPatientField("sss_no", e.target.value)}
                  />
                </label>
                <label className="text-xs text-forest-700">
                  GSIS No.
                  <input
                    className="patient-input"
                    value={newPatientForm.gsis_no}
                    onChange={(e) => setNewPatientField("gsis_no", e.target.value)}
                  />
                </label>
              </div>
            </div>

            {/* Medical History */}
            <div className="border-t border-cream-200 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-forest-700 mb-2">Medical History</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-forest-700 sm:col-span-3">
                  Allergies (please specify)
                  <input
                    className="patient-input"
                    placeholder="None"
                    value={newPatientForm.allergies}
                    onChange={(e) => setNewPatientField("allergies", e.target.value)}
                  />
                </label>
                {MEDICAL_HISTORY_BOOL_FIELDS.map(({ field, label }) => (
                  <label key={field} className="text-xs text-forest-700">
                    {label}
                    <select
                      className="patient-input"
                      value={newPatientForm[field]}
                      onChange={(e) => setNewPatientField(field, e.target.value)}
                    >
                      {YES_NO.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label className="text-xs text-forest-700">
                  Hepatitis (please specify type)
                  <input
                    className="patient-input"
                    placeholder="None"
                    value={newPatientForm.hepatitis}
                    onChange={(e) => setNewPatientField("hepatitis", e.target.value)}
                  />
                </label>
                <label className="text-xs text-forest-700">
                  Malignancy (please specify)
                  <input
                    className="patient-input"
                    placeholder="None"
                    value={newPatientForm.malignancy}
                    onChange={(e) => setNewPatientField("malignancy", e.target.value)}
                  />
                </label>
              </div>
            </div>

            {/* History of Previous Hospitalization */}
            <div className="border-t border-cream-200 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-forest-700 mb-2">
                History of Previous Hospitalization
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-forest-700">
                  Medical (last admission &amp; cause)
                  <input
                    className="patient-input"
                    placeholder="None"
                    value={newPatientForm.hosp_medical}
                    onChange={(e) => setNewPatientField("hosp_medical", e.target.value)}
                  />
                </label>
                <label className="text-xs text-forest-700">
                  Surgical (post-operative)
                  <input
                    className="patient-input"
                    placeholder="None"
                    value={newPatientForm.hosp_surgical}
                    onChange={(e) => setNewPatientField("hosp_surgical", e.target.value)}
                  />
                </label>
                <label className="text-xs text-forest-700">
                  Blood Transfusion (month &amp; year)
                  <input
                    className="patient-input"
                    placeholder="None"
                    value={newPatientForm.hosp_blood_transfusion}
                    onChange={(e) => setNewPatientField("hosp_blood_transfusion", e.target.value)}
                  />
                </label>
                <label className="text-xs text-forest-700">
                  Tattoo
                  <select
                    className="patient-input"
                    value={newPatientForm.has_tattoo}
                    onChange={(e) => setNewPatientField("has_tattoo", e.target.value)}
                  >
                    {YES_NO.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-forest-700 sm:col-span-2">
                  Others (please specify)
                  <input
                    className="patient-input"
                    placeholder="None"
                    value={newPatientForm.hosp_others}
                    onChange={(e) => setNewPatientField("hosp_others", e.target.value)}
                  />
                </label>
              </div>
            </div>

            {/* Dietary Habits / Social History */}
            <div className="border-t border-cream-200 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-forest-700 mb-2">
                Dietary Habits / Social History
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-forest-700">
                  Sugar Sweetened Beverages / Food (amount, frequency &amp; duration)
                  <input
                    className="patient-input"
                    placeholder="None"
                    value={newPatientForm.diet_sugar_beverages}
                    onChange={(e) => setNewPatientField("diet_sugar_beverages", e.target.value)}
                  />
                </label>
                <label className="text-xs text-forest-700">
                  Use of Alcohol (amount, frequency &amp; duration)
                  <input
                    className="patient-input"
                    placeholder="None"
                    value={newPatientForm.diet_alcohol}
                    onChange={(e) => setNewPatientField("diet_alcohol", e.target.value)}
                  />
                </label>
                <label className="text-xs text-forest-700">
                  Use of Tobacco (amount, frequency &amp; duration)
                  <input
                    className="patient-input"
                    placeholder="None"
                    value={newPatientForm.diet_tobacco}
                    onChange={(e) => setNewPatientField("diet_tobacco", e.target.value)}
                  />
                </label>
                <label className="text-xs text-forest-700">
                  Betel Nut Chewing (amount, frequency &amp; duration)
                  <input
                    className="patient-input"
                    placeholder="None"
                    value={newPatientForm.diet_betel_nut}
                    onChange={(e) => setNewPatientField("diet_betel_nut", e.target.value)}
                  />
                </label>
              </div>
            </div>

            {/* Initial visit / service — required. A patient can't be created
                without this: it's what gets posted to /dental-records right
                after creation, so the row never starts at 0 visits. */}
            <div className="add-record-section border-t border-cream-200 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-forest-700 mb-2">
                Add Records <span className="text-red-600">*</span>
              </p>
              <p className="text-xs text-forest-700 mb-2">
                A date and service are required before the new patient record can be created.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  required
                  value={newPatientForm.initial_record_date}
                  onChange={(e) => setNewPatientField("initial_record_date", e.target.value)}
                  className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
                />
                <select
                  required
                  value={newPatientForm.initial_procedure}
                  onChange={(e) => setNewPatientField("initial_procedure", e.target.value)}
                  className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
                >
                  {SERVICE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.value === ""}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  value={newPatientForm.initial_dentist}
                  onChange={(e) => setNewPatientField("initial_dentist", e.target.value)}
                  className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
                >
                  {dentistOptions(newPatientForm.initial_dentist).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Notes"
                  value={newPatientForm.initial_notes}
                  onChange={(e) => setNewPatientField("initial_notes", e.target.value)}
                  className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
                />
              </div>
              {(!newPatientForm.initial_record_date || !newPatientForm.initial_procedure) && (
                <p className="mt-2 text-xs font-medium text-red-600">
                  ⚠ Please fill in the date and select a service before creating the patient record.
                </p>
              )}
            </div>

            {/* Conforme */}
            <div className="border-t border-cream-200 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-forest-700 mb-2">Conforme</p>
              <label className="text-xs text-forest-700">
                Patient's / Guardian's Name and Signature
                <input
                  className="patient-input"
                  placeholder="Type full name to confirm"
                  value={newPatientForm.conforme_name}
                  onChange={(e) => setNewPatientField("conforme_name", e.target.value)}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-cream-200 pt-3">
              <button
                type="button"
                onClick={() => setShowNewPatientForm(false)}
                className="rounded-full border border-forest-900 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                disabled={
                  addingRow || checkingNewPatient || !newPatientForm.initial_record_date || !newPatientForm.initial_procedure
                }
                className="rounded-full bg-forest-900 px-4 py-2 text-sm font-semibold text-cream-50 disabled:opacity-60"
                title={
                  !newPatientForm.initial_record_date || !newPatientForm.initial_procedure
                    ? "Fill in the date and service in 'Add Records' before creating the record."
                    : undefined
                }
              >
                {addingRow ? "Creating..." : checkingNewPatient ? "Checking…" : "Create patient record"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---------- STEP 4: 2-column grid — list (left) + summary/tooth chart (right) ---------- */}
      {/* items-stretch (grid's default) makes both cards the same height —
          whichever column has less content just gets a taller card, so the
          two boxes line up evenly side by side. */}
      <div className="grid lg:grid-cols-2 gap-5 items-stretch">
        <div id="printable-patient-table" className="h-full">
          <Card
            className="h-full flex flex-col"
            title={`All Patients — ${filtered.length}${search ? ` of ${patients.length}` : ""} records`}
            action={
              <div className="flex items-center gap-2 print:hidden">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or barangay"
                  className="rounded-full bg-cream-100 border border-cream-300 text-forest-950 text-xs px-3 py-1.5 w-48 focus:outline-none focus:border-forest-700"
                />
              </div>
            }
          >
            {rowError && <p className="text-xs text-red-600 mb-2 print:hidden">{rowError}</p>}

            {duplicateWarning && (
              <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-3 py-2 mb-2 print:hidden">
                ⚠ May kahalintulad nang record: <strong>{duplicateWarning[0].name}</strong>
                {duplicateWarning[0].barangay ? ` (${duplicateWarning[0].barangay})` : ""}.{" "}
                <button
                  className="underline ml-2"
                  onClick={() => {
                    openPatient(duplicateWarning[0]);
                    setDuplicateWarning(null);
                  }}
                >
                  Buksan ang existing record
                </button>
                {" · "}
                <button className="underline" onClick={() => setDuplicateWarning(null)}>
                  Ituloy pa rin
                </button>
              </div>
            )}

            {filtered.length ? (
              <div className="max-h-[430px] overflow-y-auto">
                <table className="w-full text-sm min-w-0]">
                  <thead className="sticky top-0 bg-cream-50 z-10">
                    <tr className="text-left text-forest-700 uppercase text-xs">
                      <th className="py-2 px-2">Patient</th>
                      <th className="py-2 px-2">Brgy.</th>
                      <th className="py-2 px-2">Age/Sex</th>
                      <th className="py-2 px-2 text-center">DMFT</th>
                      <th className="py-2 px-2">Status</th>
                      <th className="py-2 px-2 print:hidden"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr
                        key={p.id}
                        className={`border-t border-cream-200 align-top cursor-pointer ${
                          selected?.id === p.id ? "bg-cream-100" : ""
                        }`}
                        onClick={() => openPatient(p)}
                      >
                        <td className="px-2 py-2">
                          <p className="font-semibold text-forest-950">{p.name}</p>
                          <p className="text-xs text-forest-500">TC-{String(p.id).padStart(4, "0")}</p>
                        </td>
                        <td className="px-2 py-2 text-forest-700">{p.barangay || "—"}</td>
                        <td className="px-2 py-2 text-forest-700">
                          {p.age ?? "—"}/{p.sex ? p.sex[0] : "—"}
                        </td>
                        <td className="px-2 py-2 text-center text-forest-700">{p.visit_count || 0}</td>
                        <td className="px-2 py-2">
                          <span
                            className={`inline-block text-xs font-semibold rounded-full px-3 py-1 whitespace-nowrap ${
                              STATUS_STYLES[statusFor(p)]
                            }`}
                          >
                            {statusFor(p)}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right whitespace-nowrap print:hidden">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteRow(p);
                            }}
                            className="text-xs text-red-600 underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>{search ? "No patients match that search." : "No registered patients yet."}</EmptyState>
            )}
          </Card>
        </div>
        <Card className="print:hidden h-full flex flex-col">
          {selected ? (
            <div className="space-y-5">
              <div>
                <EditableCell
                  value={selected.name}
                  placeholder="Patient name"
                  onSave={(v) => savePatientField(selected, "name", v)}
                  className="font-display text-xl font-bold text-forest-950"
                />
                <p className="text-sm text-forest-500 mt-0.5">
                  TC-{String(selected.id).padStart(4, "0")}
                  {records[0]?.dentist ? ` · Dr. ${records[0].dentist}` : ""}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-cream-100 rounded-xl px-5 py-4">
                  <p className="text-xs uppercase tracking-wide text-forest-700">Barangay</p>
                  <EditableCell
                    value={selected.barangay}
                    placeholder="Barangay"
                    onSave={(v) => savePatientField(selected, "barangay", v)}
                    className="font-semibold text-forest-950 text-lg"
                  />
                </div>
                <div className="bg-cream-100 rounded-xl px-5 py-4">
                  <p className="text-xs uppercase tracking-wide text-forest-700">Last visit</p>
                  <p className="font-semibold text-forest-950 text-lg">
                    {records[0]?.record_date ? new Date(records[0].record_date).toLocaleDateString() : "—"}
                  </p>
                </div>
              </div>

              <ToothChart patientId={selected.id} isAdmin />
            </div>
          ) : (
            <EmptyState>Click a patient on the left to view their chart.</EmptyState>
          )}
        </Card>
      </div>

      {/* ---------- STEP 5/6: full Individual Patient Treatment Record ---------- */}
      <Card title="Individual Patient Treatment Record" className="print:hidden">
        {selected ? (
          <div className="space-y-4">
            {showDetails && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-forest-700">
                  Republic of the Philippines · Department of Health · {selected.name} (TC-
                  {String(selected.id).padStart(4, "0")})
                </p>

                {/* Basic demographic fields — editable pill chips */}
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="bg-cream-100 rounded-xl px-3 py-1.5 inline-block w-fit">
                    <p className="text-[10px] uppercase tracking-wide text-forest-700">Surname</p>
                    <EditableCell
                      value={selected.surname}
                      placeholder="Surname"
                      onSave={(v) => savePatientField(selected, "surname", v)}
                      className="font-semibold text-forest-950"
                    />
                  </div>
                  <div className="bg-cream-100 rounded-xl px-3 py-1.5 inline-block w-fit">
                    <p className="text-[10px] uppercase tracking-wide text-forest-700">First Name</p>
                    <EditableCell
                      value={selected.first_name}
                      placeholder="First name"
                      onSave={(v) => savePatientField(selected, "first_name", v)}
                      className="font-semibold text-forest-950"
                    />
                  </div>
                  <div className="bg-cream-100 rounded-xl px-3 py-1.5 inline-block w-fit">
                    <p className="text-[10px] uppercase tracking-wide text-forest-700">Middle Name</p>
                    <EditableCell
                      value={selected.middle_name}
                      placeholder="Middle name"
                      onSave={(v) => savePatientField(selected, "middle_name", v)}
                      className="font-semibold text-forest-950"
                    />
                  </div>

                  <div className="bg-cream-100 rounded-xl px-3 py-1.5 inline-block w-fit">
                    <p className="text-[10px] uppercase tracking-wide text-forest-700">Date of Birth</p>
                    <EditableCell
                      value={selected.birthdate}
                      type="date"
                      onSave={(v) => savePatientField(selected, "birthdate", v)}
                      className="font-semibold text-forest-950"
                    />
                  </div>
                  <div className="bg-cream-100 rounded-xl px-3 py-1.5 inline-block w-fit">
                    <p className="text-[10px] uppercase tracking-wide text-forest-700">Place of Birth</p>
                    <EditableCell
                      value={selected.place_of_birth}
                      placeholder="Place of birth"
                      onSave={(v) => savePatientField(selected, "place_of_birth", v)}
                      className="font-semibold text-forest-950"
                    />
                  </div>
                  <div className="bg-cream-100 rounded-xl px-3 py-1.5 inline-block w-fit">
                    <p className="text-[10px] uppercase tracking-wide text-forest-700">Age / Sex</p>
                    <div className="flex items-center gap-1 font-semibold text-forest-950">
                      <span>{selected.age ?? "—"}</span>
                      <span>/</span>
                      <EditableCell
                        value={selected.sex || ""}
                        type="select"
                        options={SEX_OPTIONS}
                        onSave={(v) => savePatientField(selected, "sex", v)}
                      />
                    </div>
                  </div>

                  <div className="bg-cream-100 rounded-xl px-3 py-1.5 inline-block w-fit">
                    <p className="text-[10px] uppercase tracking-wide text-forest-700">Address</p>
                    <div className="flex items-center gap-1 font-semibold text-forest-950">
                      <EditableCell
                        value={selected.barangay}
                        type="select"
                        options={BARANGAY_OPTIONS}
                        onSave={(v) => savePatientField(selected, "barangay", v)}
                      />
                      <span className="font-normal text-xs text-forest-600 shrink-0">Tayabas City,</span>
                      <EditableCell
                        value={stripCityPrefix(selected.address)}
                        placeholder="Street / Sitio / Landmark"
                        onSave={(v) => savePatientField(selected, "address", withCityPrefix(v))}
                      />
                    </div>
                    <p className="text-[11px] font-normal text-forest-500 mt-0.5">
                      {composeDisplayAddress(selected.barangay, selected.address)}
                    </p>
                  </div>
                  <div className="bg-cream-100 rounded-xl px-3 py-1.5 inline-block w-fit">
                    <p className="text-[10px] uppercase tracking-wide text-forest-700">Occupation</p>
                    <EditableCell
                      value={selected.occupation}
                      placeholder="Occupation"
                      onSave={(v) => savePatientField(selected, "occupation", v)}
                      className="font-semibold text-forest-950"
                    />
                  </div>
                  <div className="bg-cream-100 rounded-xl px-3 py-1.5 inline-block w-fit">
                    <p className="text-[10px] uppercase tracking-wide text-forest-700">Parent / Guardian</p>
                    <EditableCell
                      value={selected.parent_guardian}
                      placeholder="Parent or guardian's name (optional)"
                      onSave={(v) => savePatientField(selected, "parent_guardian", v)}
                      className="font-semibold text-forest-950"
                    />
                  </div>
                  <div className="bg-cream-100 rounded-xl px-3 py-1.5 inline-block w-fit">
                    <p className="text-[10px] uppercase tracking-wide text-forest-700">Cell Phone Number</p>
                    <EditableCell
                      value={selected.cellphone_no}
                      placeholder="e.g. 09XX XXX XXXX (optional)"
                      onSave={(v) => savePatientField(selected, "cellphone_no", v)}
                      className="font-semibold text-forest-950"
                    />
                  </div>
                </div>

                {/* Box 1: Other Patient Information (Membership) + Vital Signs */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="bg-white border border-cream-200 rounded-2xl p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-forest-700 mb-2">
                      Other Patient Information (Membership)
                    </p>
                    {MEMBERSHIP_FIELDS.map(({ field, label }) => (
                      <div
                        key={field}
                        className="flex justify-between items-baseline py-2 border-b border-dashed border-cream-200"
                      >
                        <span className="text-forest-600 text-sm shrink-0">{label}</span>
                        <EditableCell
                          value={String(!!selected[field])}
                          type="select"
                          options={YES_NO}
                          onSave={(v) => savePatientField(selected, field, v)}
                        />
                      </div>
                    ))}
                    <div className="flex justify-between items-baseline py-2 border-b border-dashed border-cream-200">
                      <span className="text-forest-600 text-sm shrink-0">PhilHealth No.</span>
                      <EditableCell
                        value={selected.philhealth_no}
                        placeholder="PhilHealth No."
                        onSave={(v) => savePatientField(selected, "philhealth_no", v)}
                      />
                    </div>
                    <div className="flex justify-between items-baseline py-2 border-b border-dashed border-cream-200">
                      <span className="text-forest-600 text-sm shrink-0">SSS No.</span>
                      <EditableCell
                        value={selected.sss_no}
                        placeholder="SSS No."
                        onSave={(v) => savePatientField(selected, "sss_no", v)}
                      />
                    </div>
                    <div className="flex justify-between items-baseline py-2 last:border-0">
                      <span className="text-forest-600 text-sm shrink-0">GSIS No.</span>
                      <EditableCell
                        value={selected.gsis_no}
                        placeholder="GSIS No."
                        onSave={(v) => savePatientField(selected, "gsis_no", v)}
                      />
                    </div>
                  </div>

                  <div className="bg-white border border-cream-200 rounded-2xl p-5 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-forest-700">Vital Signs</p>
                    <p className="text-xs text-forest-500">
                      Latest reading
                      {selected.vitals?.recorded_at ? ` — ${new Date(selected.vitals.recorded_at).toLocaleString()}` : ""}
                    </p>
                    <form onSubmit={saveVitals} className="grid grid-cols-2 gap-2">
                      <input
                        placeholder="Blood Pressure"
                        value={vitalsForm.blood_pressure}
                        onChange={(e) => setVitalsForm((f) => ({ ...f, blood_pressure: e.target.value }))}
                        className="rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        placeholder="Pulse Rate"
                        value={vitalsForm.pulse_rate}
                        onChange={(e) => setVitalsForm((f) => ({ ...f, pulse_rate: e.target.value }))}
                        className="rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        placeholder="Temperature"
                        value={vitalsForm.temperature}
                        onChange={(e) => setVitalsForm((f) => ({ ...f, temperature: e.target.value }))}
                        className="col-span-2 rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm"
                      />
                      <button
                        disabled={savingVitals}
                        className="col-span-2 bg-forest-900 text-cream-50 text-xs font-semibold rounded-full py-2 hover:bg-forest-800 disabled:opacity-60"
                      >
                        {savingVitals ? "Saving…" : "Save vitals"}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Box 2: Medical History + History of Previous Hospitalization */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="bg-white border border-cream-200 rounded-2xl p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-forest-700 mb-2">
                      Medical History
                    </p>
                    <div className="flex justify-between items-baseline py-2 border-b border-dashed border-cream-200">
                      <span className="text-forest-600 text-sm shrink-0">Allergies</span>
                      <EditableCell
                        value={selected.allergies}
                        placeholder="None"
                        onSave={(v) => savePatientField(selected, "allergies", v)}
                      />
                    </div>
                    {MEDICAL_HISTORY_BOOL_FIELDS.map(({ field, label }) => (
                      <div
                        key={field}
                        className="flex justify-between items-baseline py-2 border-b border-dashed border-cream-200"
                      >
                        <span className="text-forest-600 text-sm shrink-0">{label}</span>
                        <EditableCell
                          value={String(!!selected[field])}
                          type="select"
                          options={YES_NO}
                          onSave={(v) => savePatientField(selected, field, v)}
                        />
                      </div>
                    ))}
                    <div className="flex justify-between items-baseline py-2 border-b border-dashed border-cream-200">
                      <span className="text-forest-600 text-sm shrink-0">Hepatitis</span>
                      <EditableCell
                        value={selected.hepatitis}
                        placeholder="None"
                        onSave={(v) => savePatientField(selected, "hepatitis", v)}
                      />
                    </div>
                    <div className="flex justify-between items-baseline py-2 last:border-0">
                      <span className="text-forest-600 text-sm shrink-0">Malignancy</span>
                      <EditableCell
                        value={selected.malignancy}
                        placeholder="None"
                        onSave={(v) => savePatientField(selected, "malignancy", v)}
                      />
                    </div>
                  </div>

                  <div className="bg-white border border-cream-200 rounded-2xl p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-forest-700 mb-2">
                      History of Previous Hospitalization
                    </p>
                    <div className="flex justify-between items-baseline py-2 border-b border-dashed border-cream-200">
                      <span className="text-forest-600 text-sm shrink-0">Medical</span>
                      <EditableCell
                        value={selected.hosp_medical}
                        placeholder="None"
                        onSave={(v) => savePatientField(selected, "hosp_medical", v)}
                      />
                    </div>
                    <div className="flex justify-between items-baseline py-2 border-b border-dashed border-cream-200">
                      <span className="text-forest-600 text-sm shrink-0">Surgical</span>
                      <EditableCell
                        value={selected.hosp_surgical}
                        placeholder="None"
                        onSave={(v) => savePatientField(selected, "hosp_surgical", v)}
                      />
                    </div>
                    <div className="flex justify-between items-baseline py-2 border-b border-dashed border-cream-200">
                      <span className="text-forest-600 text-sm shrink-0">Blood Transfusion</span>
                      <EditableCell
                        value={selected.hosp_blood_transfusion}
                        placeholder="None"
                        onSave={(v) => savePatientField(selected, "hosp_blood_transfusion", v)}
                      />
                    </div>
                    <div className="flex justify-between items-baseline py-2 border-b border-dashed border-cream-200">
                      <span className="text-forest-600 text-sm shrink-0">Tattoo</span>
                      <EditableCell
                        value={String(!!selected.has_tattoo)}
                        type="select"
                        options={YES_NO}
                        onSave={(v) => savePatientField(selected, "has_tattoo", v)}
                      />
                    </div>
                    <div className="flex justify-between items-baseline py-2 last:border-0">
                      <span className="text-forest-600 text-sm shrink-0">Others</span>
                      <EditableCell
                        value={selected.hosp_others}
                        placeholder="None"
                        onSave={(v) => savePatientField(selected, "hosp_others", v)}
                      />
                    </div>
                  </div>
                </div>

                {/* Box 3: Dietary Habits / Social History + Conforme */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="bg-white border border-cream-200 rounded-2xl p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-forest-700 mb-2">
                      Dietary Habits / Social History
                    </p>
                    <div className="flex justify-between items-baseline py-2 border-b border-dashed border-cream-200">
                      <span className="text-forest-600 text-sm shrink-0">Sugar Sweetened Beverages / Food</span>
                      <EditableCell
                        value={selected.diet_sugar_beverages}
                        placeholder="None"
                        onSave={(v) => savePatientField(selected, "diet_sugar_beverages", v)}
                      />
                    </div>
                    <div className="flex justify-between items-baseline py-2 border-b border-dashed border-cream-200">
                      <span className="text-forest-600 text-sm shrink-0">Use of Alcohol</span>
                      <EditableCell
                        value={selected.diet_alcohol}
                        placeholder="None"
                        onSave={(v) => savePatientField(selected, "diet_alcohol", v)}
                      />
                    </div>
                    <div className="flex justify-between items-baseline py-2 border-b border-dashed border-cream-200">
                      <span className="text-forest-600 text-sm shrink-0">Use of Tobacco</span>
                      <EditableCell
                        value={selected.diet_tobacco}
                        placeholder="None"
                        onSave={(v) => savePatientField(selected, "diet_tobacco", v)}
                      />
                    </div>
                    <div className="flex justify-between items-baseline py-2 last:border-0">
                      <span className="text-forest-600 text-sm shrink-0">Betel Nut Chewing</span>
                      <EditableCell
                        value={selected.diet_betel_nut}
                        placeholder="None"
                        onSave={(v) => savePatientField(selected, "diet_betel_nut", v)}
                      />
                    </div>
                  </div>

                  {/* Conforme — distinct tan background + signature line */}
                  <div className="bg-cream-200 rounded-2xl p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-forest-700 mb-4">Conforme</p>
                    <div className="border-t border-forest-900 pt-2 mt-8">
                      <EditableCell
                        value={selected.conforme_name || selected.name}
                        placeholder="Type full name to confirm"
                        onSave={(v) => savePatientField(selected, "conforme_name", v)}
                        className="font-semibold text-forest-950"
                      />
                      <p className="text-xs text-forest-600 mt-1">Patient's / Guardian's Name and Signature</p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDetails(false)}
                  className="text-xs text-forest-700 hover:underline"
                >
                  Hide details
                </button>
              </div>
            )}

            <p className="text-xs text-forest-700">
              Click any value above to edit it directly. This is the record of what the clinic actually did for this
              patient — each service row below is also auto-tallied into the Monthly Report, by this patient's
              barangay and the attending dentist.
            </p>
            {dentists.length === 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No dentists on file yet — add one under Staff Management (role "Dentist") to populate this dropdown.
              </p>
            )}
            {records.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-forest-700 uppercase text-xs">
                      <th className="py-2 px-2">Date</th>
                      <th className="py-2 px-2">Procedure</th>
                      <th className="py-2 px-2">Status</th>
                      <th className="py-2 px-2">Dentist</th>
                      <th className="py-2 px-2">Notes</th>
                      <th className="py-2 px-2">Counted in Report As</th>
                      <th className="py-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} className="border-t border-cream-200">
                        <td className="px-2 py-1">
                          <EditableCell value={r.record_date} type="date" onSave={(v) => saveRecordField(r, "record_date", v)} />
                        </td>
                        <td className="px-2 py-1">
                          <EditableCell
                            value={r.procedure}
                            type="select"
                            options={SERVICE_OPTIONS}
                            onSave={(v) => saveRecordField(r, "procedure", v)}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                              STATUS_STYLES[recordStatuses.get(r.id)] || STATUS_STYLES["Not Completed"]
                            }`}
                          >
                            {recordStatuses.get(r.id) || "Not Completed"}
                          </span>
                        </td>
                        <td className="px-2 py-1">
                          <EditableCell
                            value={r.dentist || ""}
                            type="select"
                            options={dentistOptions(r.dentist)}
                            onSave={(v) => saveRecordField(r, "dentist", v)}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <EditableCell value={r.notes} placeholder="Notes" onSave={(v) => saveRecordField(r, "notes", v)} />
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {r.report_field ? (
                            <span className="text-forest-700">
                              {REPORT_FIELD_LABELS[r.report_field] || r.report_field} · {r.report_month}
                            </span>
                          ) : (
                            <span className="text-forest-400 italic">
                              Not counted — add birthdate &amp; sex
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <button onClick={() => deleteRecord(r)} className="text-xs text-red-600 underline">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-forest-700">No service records yet.</p>
            )}

            <div className="add-record-section">
              <h3>Add Records</h3>
              <p>
                For a returning patient, simply add a new visit, procedure, notes, and vital signs.
              </p>
            </div>

            <form onSubmit={addServiceRecord} className="grid grid-cols-2 gap-2 border-t border-cream-200 pt-4">
              <input
                type="date"
                required
                value={newRecord.record_date}
                onChange={(e) => setNewRecord((f) => ({ ...f, record_date: e.target.value }))}
                className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
              />
              <select
                required
                value={newRecord.procedure}
                onChange={(e) => setNewRecord((f) => ({ ...f, procedure: e.target.value }))}
                className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
              >
                {SERVICE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.value === ""}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={newRecord.dentist}
                onChange={(e) => setNewRecord((f) => ({ ...f, dentist: e.target.value }))}
                className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
              >
                {dentistOptions(newRecord.dentist).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                placeholder="Notes"
                value={newRecord.notes}
                onChange={(e) => setNewRecord((f) => ({ ...f, notes: e.target.value }))}
                className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
              />
              <button
                disabled={addingRecord}
                className="col-span-2 bg-forest-900 text-cream-50 text-sm font-semibold rounded-full py-2 hover:bg-forest-800 disabled:opacity-60"
              >
                {addingRecord ? "Adding…" : "+ Add service record"}
              </button>
            </form>
          </div>
        ) : (
          <EmptyState>Click a patient on the left to view and log services applied.</EmptyState>
        )}
      </Card>
    </div>
  );
}