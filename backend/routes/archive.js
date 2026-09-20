import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { restoreEntry } from "../lib/archive.js";

const router = Router();
// The Archive page is part of the Admin Portal only.
router.use(requireAuth, requireRole("admin"));

// GET /api/archive — everything that's been "deleted", newest first. The
// full JSON snapshot (`data`) is never sent to the browser, only the
// summary the Archive page needs.
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, entity_type, entity_id, label, detail, archived_by_name, archived_by_role, archived_at
       FROM archive ORDER BY id DESC LIMIT 1000`
    )
    .all();
  res.json(rows);
});

// POST /api/archive/:id/restore — put an archived item back where it was.
router.post("/:id/restore", (req, res) => {
  try {
    const result = restoreEntry(Number(req.params.id));
    if (!result) return res.status(404).json({ error: "Archived item not found." });
    res.json({ ok: true, ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

export default router;