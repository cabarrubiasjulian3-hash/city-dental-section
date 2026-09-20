import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

// Admin-only User Management: see every account (doctors/staff, patients with
// records, and "incoming" patients who signed up but don't have any record
// yet) and delete accounts that shouldn't be there.
const router = Router();
router.use(requireAuth, requireRole("admin"));

// GET /api/users — every account, newest first, with how many service
// records each patient has (record_count). The page filters/searches this
// list itself, so it's returned in one go (never includes password hashes).
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.role, u.name, u.email, u.barangay, u.created_at,
              u.doctor_status, u.doctor_approved_at,
              (SELECT COUNT(*) FROM dental_records d WHERE d.patient_id = u.id) AS record_count
       FROM users u
       ORDER BY u.created_at DESC, u.id DESC`
    )
    .all();
  res.json(rows);
});

// DELETE /api/users/:id — permanently removes an account that shouldn't exist
// (an unauthorized doctor sign-up, a patient who registered but never got a
// record, …). Guard rails:
//  - you can't delete your own account, and admin accounts can't be deleted here;
//  - a patient WITH service records can't be deleted from here — their records
//    would be destroyed with them, so they must be archived from Patient
//    Management instead (which keeps everything restorable).
router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare(`SELECT id, role, name FROM users WHERE id = ?`).get(id);
  if (!user) return res.status(404).json({ error: "User not found." });

  if (user.id === req.user.id) {
    return res.status(400).json({ error: "You can't delete your own account." });
  }
  if (user.role === "admin") {
    return res.status(403).json({ error: "Admin accounts can't be deleted from User Management." });
  }
  if (user.role === "patient") {
    const { c } = db.prepare(`SELECT COUNT(*) AS c FROM dental_records WHERE patient_id = ?`).get(id);
    if (c > 0) {
      return res.status(409).json({
        error: `${user.name} already has ${c} service record${c === 1 ? "" : "s"}. Archive the patient from Patient Management instead.`,
      });
    }
  }

  // Deleting the row also removes their messages, vitals, tooth chart and
  // password-reset rows (ON DELETE CASCADE). Access codes only point at the
  // user without a cascade, so let go of them first or the delete is refused.
  db.transaction(() => {
    db.prepare(`UPDATE access_codes SET used_by = NULL WHERE used_by = ?`).run(id);
    db.prepare(`UPDATE access_codes SET created_by = NULL WHERE created_by = ?`).run(id);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  })();

  res.json({ ok: true });
});

export default router;