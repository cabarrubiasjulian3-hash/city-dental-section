import jwt from "jsonwebtoken";
import db from "../db.js";

// Keeps a log of what DOCTORS change on patient records, so the admin's
// notification bell can say "Dr. Ana Lopez updated a patient record".
//
// It watches the requests instead of touching each route: mount it ONCE in
// server.js, AFTER express.json() and BEFORE the routes —
//     app.use("/api", auditDoctorChanges);
// It only ever reads the request; it never changes or blocks anything, and it
// only writes a log row after the route answered with a success status.

export function ensureActivityLogTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER,
      actor_name TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      patient_id INTEGER,
      patient_name TEXT,
      detail TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
  `);
}
ensureActivityLogTable();

const patientById = () => db.prepare(`SELECT id, name FROM users WHERE id = ? AND role = 'patient'`);

// Works out WHAT is being changed BEFORE the route runs (after a delete/
// archive the row is gone), or returns null for requests we don't log.
function describe(req) {
  const parts = req.path.split("/").filter(Boolean); // e.g. ["patients", "5", "vitals"]
  const [root, second, third, fourth] = parts;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const changedFields = Object.keys(body).join(", ");

  if (root === "patients") {
    if (req.method === "POST" && !second) {
      return { action: "created_patient", patientName: body.name || null, patientFromResponse: true };
    }
    if (req.method === "POST" && second === "import") {
      return { action: "imported_patients" };
    }
    const patientId = Number(second);
    if (!patientId) return null;
    const patient = patientById().get(patientId);
    const base = { patientId, patientName: patient?.name || null };
    if (req.method === "PATCH" && !third) return { ...base, action: "updated_patient", detail: changedFields };
    if (req.method === "DELETE" && !third) return { ...base, action: "archived_patient" };
    if (req.method === "POST" && third === "vitals") return { ...base, action: "logged_vitals" };
    if (req.method === "PATCH" && third === "tooth-chart") {
      return { ...base, action: "updated_oral_chart", detail: `tooth ${fourth} → ${body.condition || "?"}` };
    }
    return null;
  }

  if (root === "dental-records") {
    if (req.method === "POST" && !second) {
      const patient = patientById().get(Number(body.patient_id));
      return {
        action: "added_service_record",
        patientId: patient?.id ?? null,
        patientName: patient?.name || null,
        detail: [body.procedure, body.record_date].filter(Boolean).join(" · "),
      };
    }
    const recordId = Number(second);
    if (!recordId) return null;
    const record = db
      .prepare(
        `SELECT r.patient_id, r.procedure, u.name AS patient_name
         FROM dental_records r LEFT JOIN users u ON u.id = r.patient_id WHERE r.id = ?`
      )
      .get(recordId);
    const base = { patientId: record?.patient_id ?? null, patientName: record?.patient_name || null };
    if (req.method === "PATCH") return { ...base, action: "updated_service_record", detail: [record?.procedure, changedFields].filter(Boolean).join(" · ") };
    if (req.method === "DELETE") return { ...base, action: "archived_service_record", detail: record?.procedure || "" };
  }
  return null;
}

export function auditDoctorChanges(req, res, next) {
  try {
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return next();
    const root = req.path.split("/").filter(Boolean)[0];
    if (root !== "patients" && root !== "dental-records") return next();

    // Same token the routes use; if it's missing/invalid the route itself
    // will reject the request, so there's nothing to log.
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return next();
    const user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    if (user.role !== "doctor") return next();

    const info = describe(req);
    if (!info) return next();

    // Remember the response body (the new patient's id comes from it).
    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      res.locals.auditBody = payload;
      return originalJson(payload);
    };

    res.on("finish", () => {
      try {
        if (res.statusCode < 200 || res.statusCode >= 300) return;
        let patientId = info.patientId ?? null;
        let patientName = info.patientName ?? null;
        if (info.patientFromResponse && res.locals.auditBody) {
          patientId = res.locals.auditBody.id ?? null;
          patientName = res.locals.auditBody.name || patientName;
        }
        db.prepare(
          `INSERT INTO activity_log (actor_id, actor_name, actor_role, action, patient_id, patient_name, detail)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(user.id, user.name, user.role, info.action, patientId, patientName, info.detail || null);
      } catch {
        /* logging must never break a request */
      }
    });
  } catch {
    /* bad token / anything unexpected: just skip logging */
  }
  next();
}