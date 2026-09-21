// One-time cleanup: merges clinic-created / Excel-imported patient rows into
// the patient's real login account when they are the same person.
//
// Why it's needed: a patient who signed up under a slightly different name
// than the front desk typed ("Julian A." vs "Julian Keyh A.") was never
// linked, so the clinic's records sat on a separate row and the patient's
// portal showed nothing. routes/auth.js now links these automatically the
// next time the patient logs in — this script does the same for EVERYONE at
// once, so you don't have to wait for each patient to log in again.
//
// It uses exactly the same matching and merge code as the login check
// (lib/patientMatch.js): same surname + compatible first name + same
// birthdate (or same barangay/address when a birthdate is missing).
//
// Run from the backend folder — STOP the backend server first:
//
//   node merge-duplicates.js            preview only, changes nothing
//   node merge-duplicates.js --apply    backs up the database, then merges
//
// It is deliberately cautious. It only merges when the match is
// unambiguous, and only folds in clinic rows that nobody has logged into
// (@imported.local). Anything else is listed under "needs a human look".
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "./db.js";
import {
  isUnclaimedImportedRow,
  findCandidatesByIdentity,
  explainMatch,
  samePerson,
  mergeDuplicateInto,
} from "./lib/patientMatch.js";

const APPLY = process.argv.includes("--apply");

const recordCount = db.prepare("SELECT COUNT(*) AS c FROM dental_records WHERE patient_id = ?");
const accounts = db
  .prepare("SELECT * FROM users WHERE role = 'patient' ORDER BY id")
  .all()
  .filter((u) => !isUnclaimedImportedRow(u));

// 1. For every real account, who could it be a duplicate of?
const found = accounts.map((account) => ({
  account,
  matches: findCandidatesByIdentity(account.id, account).filter((c) => samePerson(account, c)),
}));

// 2. How many accounts claim each clinic row? (A row two accounts both
//    match can't safely go to either one.)
const claimedBy = new Map();
for (const { account, matches } of found) {
  for (const m of matches) claimedBy.set(m.id, [...(claimedBy.get(m.id) || []), account.id]);
}

const label = (u) => `${u.name} (id ${u.id}${u.email ? `, ${u.email}` : ""})`;
const toMerge = [];
const needsLook = [];

for (const { account, matches } of found) {
  if (!matches.length) continue;
  if (matches.length > 1) {
    needsLook.push(`${label(account)} matches ${matches.length} other rows: ${matches.map((m) => `id ${m.id}`).join(", ")}`);
    continue;
  }
  const dup = matches[0];
  if (!isUnclaimedImportedRow(dup)) {
    needsLook.push(`${label(account)} looks like the same person as another LOGIN account, ${label(dup)} — not merged automatically`);
    continue;
  }
  if (claimedBy.get(dup.id).length > 1) {
    needsLook.push(`Clinic row ${label(dup)} matches ${claimedBy.get(dup.id).length} accounts (ids ${claimedBy.get(dup.id).join(", ")})`);
    continue;
  }
  toMerge.push({ account, dup, records: recordCount.get(dup.id).c, why: explainMatch(account, dup) });
}

console.log(APPLY ? "MERGE DUPLICATES — applying changes\n" : "MERGE DUPLICATES — preview only (nothing is changed)\n");
console.log(`Checked ${accounts.length} patient login account(s).\n`);

if (toMerge.length) {
  console.log(`Will merge ${toMerge.length} clinic row(s) into the patient's account:`);
  for (const { account, dup, records, why } of toMerge) {
    console.log(`  • ${label(dup)}  →  ${label(account)}   [${records} dental record(s) move over]`);
    console.log(`      matched because: same surname, compatible first name, ${why}`);
  }
} else {
  console.log("Nothing to merge.");
}

if (needsLook.length) {
  console.log(`\n${needsLook.length} case(s) that need a human look (left untouched):`);
  for (const line of needsLook) console.log(`  ! ${line}`);
}

if (!APPLY) {
  if (toMerge.length) console.log("\nLooks right? Run again with --apply to do it:  node merge-duplicates.js --apply");
  process.exit(0);
}

if (!toMerge.length) process.exit(0);

// Safety net: full copy of the database before touching anything.
const here = path.dirname(fileURLToPath(import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(here, `citydental.db.before-merge-${stamp}`);
db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
console.log(`\nBackup saved: ${path.basename(backupPath)} (${(fs.statSync(backupPath).size / 1024).toFixed(0)} KB)`);

let merged = 0;
const failed = [];
for (const { account, dup } of toMerge) {
  try {
    // Re-read the account: earlier merges never touch it, but this keeps
    // the "fill blanks" step working from the freshest row.
    const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(account.id);
    mergeDuplicateInto(fresh, dup);
    merged++;
  } catch (err) {
    failed.push(`${label(dup)} → ${label(account)}: ${err.message}`);
  }
}

console.log(`\nMerged ${merged} of ${toMerge.length}.`);
if (failed.length) {
  console.log("Could not merge (nothing was changed for these):");
  for (const line of failed) console.log(`  ✗ ${line}`);
}
console.log("Done. Restart the backend and refresh the admin Patient list.");