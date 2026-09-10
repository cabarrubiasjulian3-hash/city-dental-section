import "dotenv/config";
import express from "express";
import cors from "cors";

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

const app = express();
app.use(cors());
app.use(express.json());

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

app.use((req, res) => res.status(404).json({ error: "Not found." }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`City Dental Section API running on http://localhost:${PORT}`));