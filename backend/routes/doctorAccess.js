import { Router } from "express";
import crypto from "crypto";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// Every route here is admin-only: generating access codes and approving/
// rejecting doctor accounts are both trust decisions that only the clinic
// administrator should be able to make.
router.use(requireAuth, requireRole("admin"));

// 8-character codes like "K3F7-QX2M" — short enough for the admin to read
// out loud or send over SMS/Messenger to the doctor, without being an
// easily-guessable short PIN.
function genAccessCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid mix-ups
  let raw = "";
  for (let i = 0; i < 8; i++) raw += chars[crypto.randomInt(0, chars.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

// GET /doctor-access/codes — list every access code ever generated, most
// recent first, with who created it and (if used) which doctor account used it.
router.get("/codes", (req, res) => {
  const rows = db
    .prepare(
      `SELECT ac.id, ac.code, ac.status, ac.created_at, ac.used_at,
              creator.name AS created_by_name,
              doctor.id AS used_by_id, doctor.name AS used_by_name, doctor.doctor_status AS used_by_status
       FROM access_codes ac
       LEFT JOIN users creator ON creator.id = ac.created_by
       LEFT JOIN users doctor ON doctor.id = ac.used_by
       ORDER BY ac.id DESC`
    )
    .all();
  res.json(rows);
});

// POST /doctor-access/codes — generate a brand-new unused code.
router.post("/codes", (req, res) => {
  let code;
  // Extremely unlikely to collide, but guard against it anyway since `code`
  // is UNIQUE.
  for (let attempt = 0; attempt < 5; attempt++) {
    code = genAccessCode();
    const exists = db.prepare("SELECT 1 FROM access_codes WHERE code = ?").get(code);
    if (!exists) break;
  }
  const info = db
    .prepare("INSERT INTO access_codes (code, status, created_by) VALUES (?, 'unused', ?)")
    .run(code, req.user.id);
  const row = db.prepare("SELECT * FROM access_codes WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(row);
});

// DELETE /doctor-access/codes/:id — remove a code. Allowed for "unused" codes
// (the accidental-click case) and "revoked" ones (leftover rows from before
// this endpoint did a hard delete — there's nothing to preserve about those
// either). A "used" code stays, since it's tied to a real doctor account and
// deleting it would orphan that link.
router.delete("/codes/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM access_codes WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Access code not found." });
  if (row.status === "used") {
    return res.status(400).json({ error: "A used code can't be deleted — it's tied to a doctor account." });
  }
  db.prepare("DELETE FROM access_codes WHERE id = ?").run(row.id);
  res.json({ message: "Access code deleted." });
});

// GET /doctor-access/doctors — every doctor account (pending, approved, or
// rejected), for the admin's review list.
router.get("/doctors", (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, name, email, doctor_status, doctor_access_code, doctor_approved_at, created_at,
              (SELECT name FROM users approver WHERE approver.id = users.doctor_approved_by) AS approved_by_name
       FROM users WHERE role = 'doctor' ORDER BY id DESC`
    )
    .all();
  res.json(rows);
});

// POST /doctor-access/doctors/:id/approve — the second gate: even with a
// valid access code, this doctor can't log in until an admin does this.
router.post("/doctors/:id/approve", (req, res) => {
  const doctor = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'doctor'").get(req.params.id);
  if (!doctor) return res.status(404).json({ error: "Doctor account not found." });
  db.prepare(
    "UPDATE users SET doctor_status = 'approved', doctor_approved_by = ?, doctor_approved_at = datetime('now') WHERE id = ?"
  ).run(req.user.id, doctor.id);
  res.json({ message: "Doctor account approved." });
});

// POST /doctor-access/doctors/:id/reject — declines the account. It stays
// in the table (for a record of who applied) but can never log in.
router.post("/doctors/:id/reject", (req, res) => {
  const doctor = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'doctor'").get(req.params.id);
  if (!doctor) return res.status(404).json({ error: "Doctor account not found." });
  db.prepare(
    "UPDATE users SET doctor_status = 'rejected', doctor_approved_by = ?, doctor_approved_at = datetime('now') WHERE id = ?"
  ).run(req.user.id, doctor.id);
  res.json({ message: "Doctor account rejected." });
});

export default router;