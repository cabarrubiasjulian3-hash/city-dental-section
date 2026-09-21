import db from "../db.js";

export function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Address-specific normalization, on top of norm() above. The "New Patient
// Record" form (admin/Patients.jsx) always prefixes the street address with
// "Tayabas City, " (see CITY_PREFIX there), but a patient's own Signup form
// saves the raw address with no such prefix — so the exact same real-world
// address ends up as two different strings depending on which form entered
// it, and used to make the address side of samePerson() below fail to agree
// even when everything else about the record matched. Stripping the prefix
// here, on both sides, means it no longer matters which form the address
// came from.
const CITY_PREFIX_RE = /^tayabas city,\s*/i;
export function normAddress(s) {
  return norm(s).replace(CITY_PREFIX_RE, "");
}

// Rows created by the Excel importer get a placeholder @imported.local email
// and never had a real password set — they're "on file" but nobody has
// claimed them with a real login yet.
export function isUnclaimedImportedRow(user) {
  return user.email.endsWith("@imported.local");
}

// Identity matching. Names typed by patients and by front-desk staff are
// almost never identical for the same person — the clinic record says
// "Cabarrubias, Julian Keyh A." while the patient signs up as "Julian A." —
// so an exact first-name comparison silently missed real matches and the
// patient's portal stayed empty even though the clinic had their records.
// Instead: candidates are pulled by SURNAME, then the first names only have
// to be COMPATIBLE (every word of the shorter first name appears in the
// longer one: "Julian" fits "Julian Keyh", "Julian Mark" does not), and then
// samePerson() below has to confirm with birthdate / barangay / address.
function nameTokens(s) {
  return norm(s).replace(/[.,]/g, " ").split(" ").filter(Boolean);
}

// The surname column is authoritative; rows that only ever had a composed
// "Surname, First M." name fall back to the part before the comma.
function surnameOf(u) {
  const col = norm(u.surname);
  if (col) return col;
  const n = norm(u.name);
  return n.includes(",") ? n.split(",")[0].trim() : "";
}

// First-name words: from first_name when present, otherwise the words after
// the comma in `name` minus single-letter initials (those are the middle name).
function firstNameTokens(u) {
  if (norm(u.first_name)) return nameTokens(u.first_name);
  const n = norm(u.name);
  if (!n.includes(",")) return [];
  return nameTokens(n.split(",").slice(1).join(" ")).filter((t) => t.length > 1);
}

function firstNamesCompatible(a, b) {
  const ta = firstNameTokens(a);
  const tb = firstNameTokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((t) => long.includes(t));
}

// "Dela Cruz" / "De la Cruz" / "Delacruz" are the same surname: compare with
// spaces and punctuation squashed out.
function squash(s) {
  return norm(s).replace(/[^a-z0-9]/g, "");
}

const findBySurname = db.prepare(
  `SELECT * FROM users
   WHERE role = 'patient' AND id != ?
     AND (
       REPLACE(REPLACE(REPLACE(LOWER(TRIM(COALESCE(surname,''))), ' ', ''), '.', ''), '-', '') = ?
       OR REPLACE(REPLACE(REPLACE(LOWER(SUBSTR(name, 1, INSTR(name || ',', ',') - 1)), ' ', ''), '.', ''), '-', '') = ?
     )`
);

// First letter of the middle name / initial ("A.", "Aquino" -> "a"), or "".
function middleInitial(u) {
  return (norm(u.middle_name).match(/[a-z0-9]/) || [""])[0];
}

// A missing middle name is fine (that's exactly the "walang 2nd name" case),
// but two DIFFERENT initials ("Julian A." vs "Julian B.") mean two people.
function middleInitialsConflict(a, b) {
  const ma = middleInitial(a);
  const mb = middleInitial(b);
  return Boolean(ma && mb && ma !== mb);
}

export function findCandidatesByIdentity(excludeId, probe) {
  const sur = squash(surnameOf(probe));
  if (!sur) return [];
  return findBySurname
    .all(excludeId, sur, sur)
    .filter(
      (c) =>
        squash(surnameOf(c)) === sur && firstNamesCompatible(probe, c) && !middleInitialsConflict(probe, c)
    );
}

// --- Merging a duplicate clinic row into a patient's account ------------
// (used by the per-login check in routes/auth.js AND the one-time cleanup
// script merge-duplicates.js — both must merge in exactly the same way.)
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

// --- Are these two rows the same person? --------------------------------
// Called for candidates that already share a surname, have compatible first
// names (a missing 2nd name is fine: "Julian" = "Julian Keyh") and no
// conflicting middle initial. This decides on the remaining evidence, and
// returns a short human-readable reason (or null) so the cleanup script can
// show WHY it thinks two rows are one person.
//
//  - Both have a birthdate, and it's the same            -> match.
//  - Both have one and it's CLOSE (only one of year /
//    month / day differs, or day and month are swapped —
//    a typo) -> match only if at least 2 of: barangay, address, sex, middle
//    initial also agree ("almost everything matches").
//  - Both have one and it's clearly different            -> NOT the same
//    person (same-surname relatives with similar names exist).
//  - One or both have no birthdate                       -> match if the
//    barangay or the address agrees.
// "Agree" is forgiving about spelling: "Camaysa" = "Camayasa", and
// "Brgy.Camaysa at happy village, Tayabas City" = "Tayabas City, happy village".

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function barangayAgrees(a, b) {
  const clean = (s) => norm(s).replace(/\b(brgy|barangay|brg)\b/g, "").replace(/[^a-z0-9]/g, "");
  const x = clean(a.barangay);
  const y = clean(b.barangay);
  if (!x || !y) return false;
  if (x === y) return true;
  return Math.min(x.length, y.length) >= 5 && editDistance(x, y) <= 2; // typo / missing letter
}

const ADDRESS_NOISE = new Set(["brgy", "barangay", "brg", "tayabas", "city", "quezon", "province", "at", "sa", "st", "street", "purok"]);
function addressTokens(s) {
  return new Set(
    normAddress(s)
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t && !ADDRESS_NOISE.has(t))
  );
}
function addressAgrees(a, b) {
  const x = addressTokens(a.address);
  const y = addressTokens(b.address);
  if (!x.size || !y.size) return false;
  const shared = [...x].filter((t) => y.has(t)).length;
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  return shared === small.size || shared / new Set([...x, ...y]).size >= 0.5; // one contains the other, or half+ overlap
}

function sexAgrees(a, b) {
  return Boolean(norm(a.sex) && norm(b.sex) && norm(a.sex) === norm(b.sex));
}

function middleAgrees(a, b) {
  const ma = middleInitial(a);
  return Boolean(ma && ma === middleInitial(b));
}

function birthdatesClose(x, y) {
  const p = (d) => String(d).slice(0, 10).split("-");
  const [ya, ma, da] = p(x);
  const [yb, mb, db_] = p(y);
  if (!ya || !ma || !da || !yb || !mb || !db_) return false;
  const diff = (ya !== yb) + (ma !== mb) + (da !== db_);
  return diff === 1 || (ya === yb && ma === db_ && da === mb); // one part off, or day/month swapped
}

export function explainMatch(a, b) {
  if (a.birthdate && b.birthdate) {
    if (a.birthdate === b.birthdate) return "same birthdate";
    if (!birthdatesClose(a.birthdate, b.birthdate)) return null;
    const agreeing = [
      barangayAgrees(a, b) && "barangay",
      addressAgrees(a, b) && "address",
      sexAgrees(a, b) && "sex",
      middleAgrees(a, b) && "middle initial",
    ].filter(Boolean);
    return agreeing.length >= 2 ? `birthdate almost the same (${a.birthdate} vs ${b.birthdate}) + same ${agreeing.join(", ")}` : null;
  }
  if (barangayAgrees(a, b)) return "same barangay (no birthdate to compare)";
  if (addressAgrees(a, b)) return "same address (no birthdate to compare)";
  return null;
}

export function samePerson(a, b) {
  return explainMatch(a, b) !== null;
}

// Merge the clinic's duplicate row into the account the patient is logged in
// as. The clinic's row is the front desk's verified data, so its name wins;
// for everything else the patient's own values are kept and only blanks are
// filled in from the clinic's row (medical history, PhilHealth no., etc. —
// nothing the front desk entered gets lost when the duplicate is deleted).
const USER_COLUMNS = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
const NEVER_COPY = new Set([
  "id", "role", "email", "password_hash", "created_at", "created_by_id",
  "doctor_status", "doctor_access_code", "doctor_approved_by", "doctor_approved_at",
  "is_pregnant", "is_pwd", "is_senior_citizen", // the patient's own declaration
]);
const NAME_COLUMNS = ["name", "surname", "first_name", "middle_name"];

function mergeUserFields(user, dup) {
  const updates = {};
  for (const col of USER_COLUMNS) {
    if (NEVER_COPY.has(col)) continue;
    const mine = user[col];
    const theirs = dup[col];
    const theirsHasValue = theirs !== null && theirs !== undefined && String(theirs).trim() !== "";
    if (!theirsHasValue) continue;
    if (NAME_COLUMNS.includes(col)) {
      updates[col] = theirs;
    } else if (mine === null || mine === undefined || String(mine).trim() === "" || (mine === 0 && theirs !== 0)) {
      updates[col] = theirs;
    }
  }
  const cols = Object.keys(updates);
  if (!cols.length) return;
  db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(
    ...cols.map((c) => updates[c]),
    user.id
  );
}

// Moves everything belonging to `dup` (dental records, vitals, tooth chart,
// messages) onto `user`, fills `user`'s blanks from `dup`, then deletes `dup`.
// One transaction: either all of it happens or none of it. THROWS if the
// database refuses (e.g. a tooth_conditions UNIQUE(patient_id, tooth_number)
// collision when both rows already had a condition logged for the same
// tooth) — callers decide what to do about that.
export const mergeDuplicateInto = db.transaction((user, dup) => {
  reassignDentalRecords.run(user.id, dup.id);
  reassignVitals.run(user.id, dup.id);
  reassignToothConditions.run(user.id, dup.id);
  reassignMessages.run(user.id, dup.id);
  mergeUserFields(user, dup);
  deleteDuplicateUser.run(dup.id);
});