import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import db from "../db.js";
import { calcAge } from "../lib/age.js";
import { sendRecoveryCodeEmail } from "../lib/mailer.js";
import { requireAuth } from "../middleware/auth.js";
import {
  norm,
  isUnclaimedImportedRow,
  findCandidatesByIdentity,
  samePerson,
  mergeDuplicateInto,
} from "../lib/patientMatch.js";
const router = Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Late-match absorption (runs on every patient login and every /auth/me).
// Registration-time matching (see /register below) only checks ONCE, at
// signup — so it can't help someone who signs up BEFORE the clinic has ever
// logged a visit for them. If an admin later creates a "New Patient Record"
// for that same person, that record gets its own row, leaving the patient's
// dental history stuck on a row they aren't logged in as. This runs the same
// match on every login instead. Only merges when unambiguous (exactly one
// candidate) — this deliberately isn't limited to placeholder/imported rows,
// so it also catches two real accounts that turned out to be the same person.
function absorbLateMatchingRecord(user) {
  if (user.role !== "patient") return false;
  const candidates = findCandidatesByIdentity(user.id, user).filter((c) => samePerson(user, c));
  if (candidates.length !== 1) return false; // none, or ambiguous (2+) — leave alone for a human to check
  try {
    mergeDuplicateInto(user, candidates[0]);
    return true;
  } catch {
    // Don't fail the login over a best-effort cleanup; leave it for later
    // (or for merge-duplicates.js, which reports it).
    return false;
  }
}

// --- Server-side record check (runs on EVERY patient login, and again every
// time the portal is opened with a saved session via GET /auth/me below) ---
// The patient portal must never trust what the browser remembers about
// whether someone "has records": a patient can have a clinic record created
// for them at any time (a walk-in logged by the front desk, an Excel import)
// without ever opening their portal again. So each time, the SERVER:
//   1. tries to link any clinic record that turned out to be theirs
//      (absorbLateMatchingRecord above), then
//   2. counts the dental records now on their account,
// and tells the frontend the result so the portal can show it straight away.
const countDentalRecords = db.prepare("SELECT COUNT(*) AS c FROM dental_records WHERE patient_id = ?");

function checkRecordsOnServer(user) {
  if (user.role !== "patient") return null;
  const linkedRecords = absorbLateMatchingRecord(user);
  const recordCount = countDentalRecords.get(user.id).c;
  return {
    hasRecords: recordCount > 0,
    recordCount,
    linkedRecords,
    message: linkedRecords
      ? recordCount > 0
        ? `We found ${recordCount} dental record${recordCount === 1 ? "" : "s"} from the clinic that belong to you and linked ${recordCount === 1 ? "it" : "them"} to your account.`
        : "We found your clinic record and linked it to your account."
      : null,
  };
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

const claimImportedRow = db.prepare(
  `UPDATE users SET
     email = ?, password_hash = ?,
     birthdate = COALESCE(?, birthdate),
     sex = COALESCE(?, sex),
     address = COALESCE(?, address),
     occupation = COALESCE(?, occupation),
     barangay = COALESCE(?, barangay),
     surname = COALESCE(NULLIF(TRIM(surname), ''), ?),
     first_name = COALESCE(NULLIF(TRIM(first_name), ''), ?),
     middle_name = COALESCE(NULLIF(TRIM(middle_name), ''), ?),
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
    return res.status(409).json({ error: "An account with that email already exists.", code: "ACCOUNT_EXISTS" });
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
  const existingEmail = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email);
  if (existingEmail) {
    return res.status(409).json({
      error: isUnclaimedImportedRow(existingEmail)
        ? "A clinic record already exists for this email. Please contact the front desk."
        : "An account with this email already exists. Please log in instead — or use \"Forgot password?\" if you can't remember your password.",
      code: "ACCOUNT_EXISTS",
    });
  }

  const hash = bcrypt.hashSync(password, 10);
  const age = calcAge(birthdate);
  const seniorCitizen = age !== null && age >= 60 ? 1 : 0;
  const pregnant = is_pregnant ? 1 : 0;
  const pwd = is_pwd ? 1 : 0;

  // Look for this person in the clinic's existing records: same surname,
  // compatible first name (a missing 2nd name is fine — see
  // findCandidatesByIdentity), and agreeing on birthdate — or barangay/address
  // when a birthdate isn't available (see samePerson in lib/patientMatch.js).
  const probe = { name, surname, first_name, middle_name, birthdate, barangay, address, sex };
  const candidates = findCandidatesByIdentity(-1, probe); // -1: this account doesn't exist yet
  const confirmed = candidates.filter((c) => samePerson(probe, c));
  let match = null;
  if (confirmed.length === 1) {
    match = confirmed[0];
  } else if (confirmed.length > 1 && barangay) {
    match = confirmed.find((c) => norm(c.barangay || "") === norm(barangay)) || null;
  } else if (!confirmed.length && candidates.length === 1 && !(birthdate && candidates[0].birthdate)) {
    // Only one possible person and nothing contradicts it.
    match = candidates[0];
  }

  if (match) {
    if (!isUnclaimedImportedRow(match)) {
      return res.status(409).json({
        error:
          "An account already exists for a patient matching this name and barangay in our clinic records. Please log in instead, or contact the front desk if this isn't you.",
        code: "ACCOUNT_EXISTS",
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
      user: publicUser(user),
      matched: true,
      recordCount: countDentalRecords.get(user.id).c,
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
    user: publicUser(user),
    matched: false,
    recordCount: 0,
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
  // Check the clinic's records again on every patient login (see
  // checkRecordsOnServer above) instead of trusting whatever was true when
  // they signed up.
  const session = checkRecordsOnServer(user);
  const token = signToken(user);
  res.json({ token, user: publicUser(user), ...(session ? { session } : {}) });
});

// Re-validates a saved session. A patient who stays logged in (the token
// lasts 7 days) never hits /login again, so the portal calls this every time
// it opens: it confirms the account still exists (e.g. wasn't archived),
// re-runs the same server-side record check as a fresh login, and returns
// the up-to-date user + record status.
router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!user || (user.role === "doctor" && user.doctor_status !== "approved")) {
    return res.status(401).json({ error: "This account is no longer active. Please log in again." });
  }
  const session = checkRecordsOnServer(user);
  res.json({ user: publicUser(user), ...(session ? { session } : {}) });
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