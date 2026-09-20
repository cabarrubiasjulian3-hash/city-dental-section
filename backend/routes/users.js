import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { accountGroupSql } from "../lib/accountGroup.js";
import { archivePatient, archiveDoctorAccount } from "../lib/archive.js";

// Admin-only User Management: see the patients and doctors who actually made
// an account (patients with records, and "incoming" patients who signed up
// but don't have any record yet) and delete accounts that shouldn't be there.
// Admin accounts, and patient records the clinic created or imported without
// the person ever signing up (placeholder "@imported.local" emails), are not
// listed.
const router = Router();
router.use(requireAuth, requireRole("admin"));

// GET /api/users — every patient/doctor account, newest first, with how many service
// records each patient has (record_count) and which User Management section
// the server puts each one in (account_group: "staff" | "patients" |
// "incoming" — see lib/accountGroup.js). The page filters/searches this list
// itself, so it's returned in one go (never includes password hashes).
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.role, u.name, u.email, u.barangay, u.created_at,
              u.doctor_status, u.doctor_approved_at,
              (SELECT COUNT(*) FROM dental_records d WHERE d.patient_id = u.id) AS record_count,
              ${accountGroupSql("u")} AS account_group
       FROM users u
       WHERE u.role IN ('patient', 'doctor')
         AND u.email NOT LIKE '%@imported.local'
       ORDER BY u.created_at DESC, u.id DESC`
    )
    .all();
  res.json(rows);
});

// DELETE /api/users/:id — "archives" an account: it moves to the Archive page
// (restorable from there) and the person can no longer log in. Nothing is
// destroyed. A patient goes to the Archive together with their service
// records, vitals, messages and tooth chart, exactly like archiving them from
// Patient Management. Guard rails:
//  - you can't archive your own account, and admin accounts can't be archived here.
router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare(`SELECT id, role, name FROM users WHERE id = ?`).get(id);
  if (!user) return res.status(404).json({ error: "User not found." });

  if (user.id === req.user.id) {
    return res.status(400).json({ error: "You can't archive your own account." });
  }
  if (user.role === "admin") {
    return res.status(403).json({ error: "Admin accounts can't be archived from User Management." });
  }

  if (user.role === "doctor") archiveDoctorAccount(id, req.user);
  else archivePatient(id, req.user);

  res.json({ ok: true, message: `${user.name}'s account was moved to the Archive.` });
});

export default router;