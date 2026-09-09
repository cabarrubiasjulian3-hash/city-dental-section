import bcrypt from "bcryptjs";
import db from "./db.js";

const adminEmail = "admin@citydental.gov.ph";
const existingAdmin = db.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail);

if (!existingAdmin) {
  const hash = bcrypt.hashSync("Admin123!", 10);
  db.prepare(
    `INSERT INTO users (role, name, email, password_hash) VALUES ('admin', ?, ?, ?)`
  ).run("City Dental Admin", adminEmail, hash);
  console.log(`Seeded admin account -> email: ${adminEmail}  password: Admin123!`);
} else {
  console.log("Admin account already exists, skipping.");
}

const staffCount = db.prepare("SELECT COUNT(*) AS c FROM staff").get().c;
if (staffCount === 0) {
  const insert = db.prepare(
    `INSERT INTO staff (name, role, email, phone, schedule) VALUES (?, ?, ?, ?, ?)`
  );
  insert.run("Dr. Sevi Camero", "Dentist", "sevi.camero@citydental.gov.ph", "0917-000-0001", "Mon-Fri, 8AM-5PM");
  insert.run("Dr. Ana Lopez", "Dentist", "ana.lopez@citydental.gov.ph", "0917-000-0002", "Mon, Wed, Fri, 8AM-5PM");
  insert.run("Marites Cruz", "Dental Assistant", "marites.cruz@citydental.gov.ph", "0917-000-0003", "Mon-Fri, 8AM-5PM");
  console.log("Seeded staff records.");
}

const barangayCount = db.prepare("SELECT COUNT(*) AS c FROM barangay_schedule").get().c;
if (barangayCount === 0) {
  const insertB = db.prepare(
    `INSERT INTO barangay_schedule (barangay_name, visit_date, time_range, services, location, dentist, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  insertB.run(
    "Barangay Camayasa",
    "2026-09-02",
    "8:00 AM - 12:00 PM",
    "Tooth extraction, dental cleaning, oral examination",
    "Camayasa Barangay Hall",
    "Dr. Sevi Camero",
    "Bring a valid ID. Priority for senior citizens and children."
  );
  insertB.run(
    "Barangay Ayusan I",
    "2026-09-09",
    "8:00 AM - 12:00 PM",
    "Dental examination, filling",
    "Ayusan I Covered Court",
    "Dr. Ana Lopez",
    "Fasting not required."
  );
  insertB.run(
    "Barangay Lakawan",
    "2026-09-16",
    "1:00 PM - 5:00 PM",
    "Tooth extraction, consultation",
    "Lakawan Health Center",
    "Dr. Sevi Camero",
    null
  );
  insertB.run(
    "Barangay Talolong",
    "2026-09-23",
    "8:00 AM - 12:00 PM",
    "Dental cleaning, filling",
    "Talolong Covered Court",
    "Dr. Ana Lopez",
    "Limited to 40 patients per day."
  );
  console.log("Seeded barangay dental mission schedule.");
}

console.log("Done.");
