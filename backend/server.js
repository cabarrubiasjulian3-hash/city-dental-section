import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import db from "./db.js";

import authRoutes from "./routes/auth.js";
import patientRoutes from "./routes/patients.js";
import dentalRecordRoutes from "./routes/dentalRecords.js";
import messageRoutes from "./routes/messages.js";
import staffRoutes from "./routes/staff.js";
import dashboardRoutes from "./routes/dashboard.js";
import barangayScheduleRoutes from "./routes/barangaySchedule.js";
import recurringBarangayScheduleRoutes from "./routes/recurringBarangaySchedule.js";
import monthlyReportRoutes from "./routes/monthlyReports.js";
import toothChartRoutes from "./routes/toothChart.js";
import notificationRoutes from "./routes/notifications.js";
import doctorAccessRoutes from "./routes/doctorAccess.js";
import archiveRoutes from "./routes/archive.js";
import userRoutes from "./routes/users.js";
import { auditDoctorChanges } from "./middleware/auditLog.js";
import { autoCompletePastSchedules } from "./lib/scheduleStatus.js";

const app = express();
app.use(cors());
app.use(express.json());

function bootstrapAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const resetPassword = process.env.BOOTSTRAP_ADMIN_RESET_PASSWORD === "true";

  if (!email && !password) return;
  if (!email || !password) {
    throw new Error("Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL must be a valid email address.");
  }
  if (password.length < 12) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.");
  }

  const existing = db.prepare("SELECT id, role FROM users WHERE LOWER(email) = ?").get(email);
  const passwordHash = bcrypt.hashSync(password, 12);

  if (existing) {
    if (existing.role !== "admin") {
      throw new Error("The bootstrap email already belongs to a non-admin account.");
    }
    if (resetPassword) {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, existing.id);
      console.log("Reset the bootstrap admin password.");
    }
    return;
  }

  db.prepare(
    "INSERT INTO users (role, name, email, password_hash) VALUES ('admin', ?, ?, ?)"
  ).run("City Dental Admin", email, passwordHash);
  console.log("Created the bootstrap admin account.");
}

bootstrapAdmin();

// Logs what doctors change (patient records, barangay schedule) for the notification bell.
app.use("/api", auditDoctorChanges);

// Barangay schedule entries flip to "Completed" on their own once their date
// has passed, or once the end of today's time range (e.g. 5:00 PM) has passed
// (see lib/scheduleStatus.js): before each request (throttled), at startup,
// and every minute for a server that sits idle.
app.use("/api", (req, res, next) => {
  autoCompletePastSchedules();
  next();
});
autoCompletePastSchedules({ force: true });
setInterval(() => autoCompletePastSchedules({ force: true }), 60 * 1000).unref();

app.get("/api/health", (req, res) => res.json({ ok: true, service: "city-dental-section-api" }));

app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/dental-records", dentalRecordRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/barangay-schedule", barangayScheduleRoutes);
app.use("/api/recurring-schedule", recurringBarangayScheduleRoutes);
app.use("/api/monthly-reports", monthlyReportRoutes);
app.use("/api/patients", toothChartRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/doctor-access", doctorAccessRoutes);
app.use("/api/archive", archiveRoutes);
app.use("/api/users", userRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found." }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`City Dental Section API running on http://localhost:${PORT}`));