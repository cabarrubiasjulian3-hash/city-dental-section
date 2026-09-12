import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import db from "../db.js";
import { calcAge } from "../lib/age.js";
import { sendRecoveryCodeEmail } from "../lib/mailer.js";
import { requireAuth } from "../middleware/auth.js";
const router = Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Rows created by the Excel importer get a placeholder @imported.local email
// and never had a real password set — they're "on file" but nobody has
// claimed them with a real login yet.
function isUnclaimedImportedRow(user) {
  return user.email.endsWith("@imported.local");
}

// Best-available identity match for a patient: prefer surname + first name
// (the authoritative columns — admin edits these one at a time via inline
// cells, and PATCH /patients/:id only recomposes `name` if a NEW name is
// sent in that same request, so `name` can silently go stale/out of sync
// with a just-edited surname/first_name). Falls back to the composed `name`
// for rows that only ever had that (Excel imports before separate columns
// existed, or any row with a blank surname/first_name).
const findCandidatesByIdentity = db.prepare(
  `SELECT * FROM users
   WHERE role = 'patient' AND id != ?
     AND (
       (TRIM(COALESCE(surname,'')) != '' AND TRIM(COALESCE(first_name,'')) != ''
        AND LOWER(TRIM(surname)) = ? AND LOWER(TRIM(first_name)) = ?)
       OR LOWER(name) = ?
     )`
);

// --- Late-match absorption (runs on every patient login) ---------------
// Registration-time matching (see /register below) only checks ONCE, at
// signup — so it can't help someone who signs up for a real account BEFORE
// the clinic has ever logged a visit for them. If an admin later creates a
// "New Patient Record" for that same person, that record gets its own new
// row, leaving the patient's dental history stuck on a row they aren't
// logged in as. This runs the same kind of match on every login instead, so
// it's caught the next time they sign in, regardless of which happened first.
//
// Identity is decided on surname+first_name (or composed name as fallback —
// see findCandidatesByIdentity above), plus birthdate or address agreeing
// (whichever side actually has both filled in) — never email. Only merges
// when unambiguous (exactly one candidate) — this deliberately isn't
// limited to placeholder/imported rows, so it also catches two real
// accounts that turned out to be the same person.
const reassignDentalRecords = db.prepare("UPDATE dental_records SET patient_id = ? WHERE patient_id = ?");
const reassignVitals = db.prepare("UPDATE vitals SET patient_id = ? WHERE patient_id = ?");
const reassignToothConditions = db.prepare("UPDATE tooth_conditions SET patient_id = ? WHERE patient_id = ?");
const reassignMessages = db.prepare("UPDATE messages SET patient_id = ? WHERE patient_id = ?");
const deleteDuplicateUser = db.prepare("DELETE FROM users WHERE id = ?");

// True when `a` and `b` are confidently the same person: same identity
// (caller already filtered on that via findCandidatesByIdentity) plus
// agreement on birthdate or address — whichever of the two actually has a
// value on BOTH sides, since an admin's quick "New Patient Record" often
// doesn't have every field filled in.
function samePerson(a, b) {
  const birthdateAgrees = a.birthdate && b.birthdate && a.birthdate === b.birthdate;
  const addressAgrees = a.address && b.address && norm(a.address) === norm(b.address);
  return Boolean(birthdateAgrees || addressAgrees);
}

function absorbLateMatchingRecord(user) {
  if (user.role !== "patient") return;
  const sameIdentity = findCandidatesByIdentity.all(
    user.id,
    norm(user.surname || ""),
    norm(user.first_name || ""),
    norm(user.name)
  );
  const candidates = sameIdentity.filter((c) => samePerson(user, c));
  if (candidates.length !== 1) return; // none, or ambiguous (2+) — leave alone for a human to check

  const dup = candidates[0];
  const merge = db.transaction(() => {
    reassignDentalRecords.run(user.id, dup.id);
    reassignVitals.run(user.id, dup.id);
    reassignToothConditions.run(user.id, dup.id);
    reassignMessages.run(user.id, dup.id);
    deleteDuplicateUser.run(dup.id);
  });
  try {
    merge();
  } catch {
    // e.g. a tooth_conditions UNIQUE(patient_id, tooth_number) collision if
    // both rows somehow already had a condition logged for the same tooth —
    // extremely unlikely for a row nobody has ever logged into, but don't
    // fail the login over a best-effort cleanup; just leave it for later.
  }
}

const claimImportedRow = db.prepare(
  `UPDATE users SET
     email = ?, password_hash = ?,
     birthdate = COALESCE(?, birthdate),
     sex = COALESCE(?, sex),
     address = COALESCE(?, address),
     occupation = COALESCE(?, occupation),
     barangay = COALESCE(?, barangay),
     is_pregnant = ?, is_pwd = ?, is_senior_citizen = ?
   WHERE id = ?`
);

// Patient sign up. Instead of always creating a brand-new, disconnected
// account, this checks whether the clinic's Excel records (imported into
// the `users` table by name + barangay) already have this person on file:
//
//  - Exact match, and that record hasn't been claimed by a login yet
//      -> link this new account to it. Their existing dental history
//         (dental_records tied to that same patient_id) shows up immediately.
//  - Exact match, but it's already claimed by someone else's login
//      -> reject, so two accounts can't both claim one identity.
//  - No match
//      -> create a normal new account with no dental history yet. They are
//         registered on the *website*, but the portal will correctly show
//         "no dental records on file" until a visit puts them in the Excel
//         sheet / gets recorded by the clinic — they aren't yet a "patient"
//         of record just because they made an account.
// Doctor sign up. Unlike a patient account, a doctor account needs two
// separate approvals before it can ever log in:
//   1. A valid, unused access code (an admin generates these — see
//      routes/doctorAccess.js) — proves whoever is signing up was actually
//      given permission to try.
//   2. An admin explicitly confirming the new account afterwards — proves
//      the person really is the doctor they claim to be, not just someone
//      who obtained a leaked code.
// The account is created right away (so admin has something to review and
// approve), but /login refuses it until doctor_status = 'approved'.
function registerDoctor(req, res) {
  const { name, email, password, accessCode } = req.body;
  if (!name || !email || !password || !accessCode) {
    return res.status(400).json({ error: "Name, email, password, and access code are required." });
  }
  const existingEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existingEmail) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const code = db.prepare("SELECT * FROM access_codes WHERE code = ?").get(String(accessCode).trim());
  if (!code || code.status !== "unused") {
    return res.status(400).json({ error: "That access code is invalid or has already been used." });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(
      `INSERT INTO users (role, name, email, password_hash, doctor_status, doctor_access_code)
       VALUES ('doctor', ?, ?, ?, 'pending', ?)`
    )
    .run(name, email, hash, code.code);

  db.prepare("UPDATE access_codes SET status = 'used', used_by = ?, used_at = datetime('now') WHERE id = ?").run(
    info.lastInsertRowid,
    code.id
  );

  res.status(201).json({
    pending: true,
    message:
      "Your account was created using a valid access code, but a clinic administrator still needs to confirm you as a doctor before you can log in. You'll be able to log in once that's done.",
  });
}

router.post("/register", (req, res) => {
  if (req.body.role === "doctor") return registerDoctor(req, res);

  const { name, email, password, birthdate, sex, address, occupation, barangay, is_pregnant, is_pwd, surname, first_name, middle_name } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }
  const existingEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existingEmail) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const hash = bcrypt.hashSync(password, 10);
  const age = calcAge(birthdate);
  const seniorCitizen = age !== null && age >= 60 ? 1 : 0;
  const pregnant = is_pregnant ? 1 : 0;
  const pwd = is_pwd ? 1 : 0;

  // Look for this person in the clinic's existing records — by surname +
  // first name when we have both (far more reliable than the composed
  // "name" string, which can differ in punctuation or middle-name
  // formatting — "A." vs "A" vs left out — even for the same person), or by
  // the composed name otherwise (Excel-imported rows only ever have that
  // single combined column, no separate surname/first_name).
  const candidates = findCandidatesByIdentity.all(
    -1, // no id to exclude yet — this account doesn't exist
    norm(surname || ""),
    norm(first_name || ""),
    norm(name)
  );
  let match = null;
  if (barangay) {
    match = candidates.find((c) => norm(c.barangay || "") === norm(barangay)) || null;
  }
  if (!match && candidates.length === 1) {
    // Unambiguous even without a barangay to narrow it down.
    match = candidates[0];
  }

  if (match) {
    if (!isUnclaimedImportedRow(match)) {
      return res.status(409).json({
        error:
          "An account already exists for a patient matching this name and barangay in our clinic records. Please log in instead, or contact the front desk if this isn't you.",
      });
    }

    claimImportedRow.run(
      email,
      hash,
      birthdate || null,
      sex || null,
      address || null,
      occupation || null,
      barangay || null,
      surname || null,
      first_name || null,
      middle_name || null,
      pregnant,
      pwd,
      seniorCitizen,
      match.id
    );
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(match.id);
    const token = signToken(user);
    return res.status(200).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      matched: true,
      message: "We found your existing dental records on file and linked them to your new account.",
    });
  }

  const info = db
    .prepare(
      `INSERT INTO users (role, name, email, password_hash, birthdate, sex, address, occupation, barangay, surname, first_name, middle_name, is_pregnant, is_senior_citizen, is_pwd)
       VALUES ('patient', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      email,
      hash,
      birthdate || null,
      sex || null,
      address || null,
      occupation || null,
      barangay || null,
      surname || null,
      first_name || null,
      middle_name || null,
      pregnant,
      seniorCitizen,
      pwd
    );

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  const token = signToken(user);
  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    matched: false,
    message: "No existing dental records were found under this name yet. Your account is created — records will appear here once the clinic logs your first visit.",
  });
});

// Login (patient or admin, based on stored role)
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || isUnclaimedImportedRow(user) || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  if (user.role === "doctor" && user.doctor_status !== "approved") {
    if (user.doctor_status === "rejected") {
      return res.status(403).json({
        error: "Your access request was declined. Please contact the clinic administrator.",
      });
    }
    return res.status(403).json({
      error: "Your doctor account is awaiting admin confirmation. Please check back once it's been approved.",
    });
  }
  absorbLateMatchingRecord(user);
  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

function maskEmail(email) {
  return String(email || "").replace(/^(.{2}).+(@.+)$/, "$1***$2");
}

function genCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function genToken() {
  return crypto.randomBytes(32).toString("hex");
}

const CODE_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

function isoInMs(ms) {
  return new Date(Date.now() + ms).toISOString();
}

router.post("/forgot-password/request", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required." });

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (user && !isUnclaimedImportedRow(user)) {
    const code = genCode();
    db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(user.id);
    db.prepare(
      "INSERT INTO password_resets (user_id, code, code_expires_at) VALUES (?, ?, ?)"
    ).run(user.id, code, isoInMs(CODE_TTL_MS));

    try {
      await sendRecoveryCodeEmail(user.email, code);
    } catch (err) {
      console.error("Failed to send recovery email:", err.message);
      return res.status(500).json({ error: "Could not send recovery email. Please try again later." });
    }
  }

  res.json({ maskedEmail: maskEmail(email) });
});

router.post("/forgot-password/verify", (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: "Email and code are required." });

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) return res.status(400).json({ error: "Invalid or expired code." });

  const row = db
    .prepare("SELECT * FROM password_resets WHERE user_id = ? ORDER BY id DESC LIMIT 1")
    .get(user.id);

  if (!row || row.code !== code || new Date(row.code_expires_at) < new Date()) {
    return res.status(400).json({ error: "Invalid or expired code." });
  }

  const resetToken = genToken();
  db.prepare(
    "UPDATE password_resets SET verified = 1, reset_token = ?, reset_token_expires_at = ? WHERE id = ?"
  ).run(resetToken, isoInMs(RESET_TOKEN_TTL_MS), row.id);

  res.json({ resetToken });
});

router.post("/forgot-password/reset", (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) {
    return res.status(400).json({ error: "Reset token and new password are required." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const row = db.prepare("SELECT * FROM password_resets WHERE reset_token = ?").get(resetToken);
  if (
    !row ||
    !row.verified ||
    !row.reset_token_expires_at ||
    new Date(row.reset_token_expires_at) < new Date()
  ) {
    return res.status(400).json({ error: "This reset link has expired. Please start over." });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, row.user_id);
  db.prepare("DELETE FROM password_resets WHERE id = ?").run(row.id);

  res.json({ message: "Password updated successfully." });
});

// Change password for the currently logged-in user (Settings & privacy
// modal in the header profile dropdown) — distinct from the forgot-password
// email flow above, since this one requires knowing the CURRENT password
// rather than proving email ownership.
router.post("/change-password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password are required." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
  res.json({ message: "Password updated successfully." });
});

export default router;