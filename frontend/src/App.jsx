import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { MessageSquare, UserCog } from "lucide-react";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import PortalLayout from "./components/PortalLayout";
import {
  IconDashboard,
  IconUsers,
  IconCalendar,
  IconReport,
  IconChat,
  IconStaff,
  IconArchive,
} from "./components/icons";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

import PatientDashboard from "./pages/patient/Dashboard";
import PatientProfile from "./pages/patient/Profile";
import PatientBarangaySchedule from "./pages/patient/BarangaySchedule";
import PatientDentalRecord from "./pages/patient/DentalRecord";
import PatientMessages from "./pages/patient/Messages";

import AdminDashboard from "./pages/admin/Dashboard";
import AdminPatients from "./pages/admin/Patients";
import AdminBarangaySchedule from "./pages/admin/BarangaySchedule";
import AdminMonthlyReport from "./pages/admin/MonthlyReport";
import AdminMessages from "./pages/admin/Messages";
import AdminStaff from "./pages/admin/Staff";
import AdminUserManagement from "./pages/admin/UserManagement";
import AdminArchive from "./pages/admin/Archive";

const patientNav = [
  { to: "/patient", end: true, icon: <IconDashboard />, label: "Dashboard" },
  { to: "/patient/profile", icon: <IconUsers />, label: "My Profile" },
  { to: "/patient/barangay-schedule", icon: <IconCalendar />, label: "Barangay Schedule" },
  { to: "/patient/dental-record", icon: <IconReport />, label: "Dental Record" },
  { to: "/patient/messages", icon: <MessageSquare size={18} />, label: "Messages" },
];

const adminNav = [
  { to: "/admin", end: true, icon: <IconDashboard />, label: "Dashboard" },
  { to: "/admin/patients", icon: <IconUsers />, label: "Patient Management" },
  { to: "/admin/barangay-schedule", icon: <IconCalendar />, label: "Barangay Schedule" },
  { to: "/admin/monthly-report", icon: <IconReport />, label: "Reports" },
  // Staff Management is one page: Staff Directory + Doctor Access (no separate Doctor Access item).
  { to: "/admin/staff", icon: <IconStaff />, label: "Staff Management" },
  { to: "/admin/users", icon: <UserCog size={18} />, label: "User Management" },
  { to: "/admin/archive", icon: <IconArchive />, label: "Archive" },
];

// Doctor Portal mirrors the admin portal's pages (same components, passed
// readOnly) so a doctor can preview everything an admin can — except
// "Doctor Access" (managing codes/approvals is an admin-only trust
// decision) and the ability to make edits, which is disabled per-page.
const doctorNav = [
  { to: "/doctor", end: true, icon: <IconDashboard />, label: "Dashboard" },
  { to: "/doctor/patients", icon: <IconUsers />, label: "Patient Management" },
  { to: "/doctor/barangay-schedule", icon: <IconCalendar />, label: "Barangay Schedule" },
  { to: "/doctor/messages", icon: <IconChat />, label: "Messages" },
];

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          {/* Old bookmarks/links to the standalone dark admin-login page now
              land on the landing page instead — Admin Portal sign-in lives
              only in the AdminLoginModal opened from the "Admin Portal"
              button there. */}
          <Route path="/admin/login" element={<Navigate to="/" replace />} />

          <Route
            path="/patient"
            element={
              <ProtectedRoute role="patient">
                <PortalLayout title="City Dental Section" subtitle="Patient Portal" navItems={patientNav} />
              </ProtectedRoute>
            }
          >
            <Route index element={<PatientDashboard />} />
            <Route path="profile" element={<PatientProfile />} />
            <Route path="barangay-schedule" element={<PatientBarangaySchedule />} />
            <Route path="dental-record" element={<PatientDentalRecord />} />
            <Route path="messages" element={<PatientMessages />} />
            {/* Catch-all: any unknown sub-path here (an old renamed page, a
                stale bookmark, a typo) lands on the dashboard instead of a
                blank "no route matched" page. Keep this LAST in the list. */}
            <Route path="*" element={<Navigate to="/patient" replace />} />
          </Route>

          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <PortalLayout title="City Dental Section" subtitle="Admin Portal" navItems={adminNav} />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="patients" element={<AdminPatients />} />
            <Route path="barangay-schedule" element={<AdminBarangaySchedule />} />
            <Route path="monthly-report" element={<AdminMonthlyReport />} />
            <Route path="staff" element={<AdminStaff />} />
            <Route path="users" element={<AdminUserManagement />} />
            {/* Old "Doctor Access" page — merged into the Staff Management page. */}
            <Route path="doctor-access" element={<Navigate to="/admin/staff#doctor-access" replace />} />
            <Route path="archive" element={<AdminArchive />} />
            {/* Catch-all: any unknown sub-path here (an old renamed page, a
                stale bookmark, a typo) lands on the dashboard instead of a
                blank "no route matched" page. Keep this LAST in the list. */}
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>

          {/* Doctor Portal — same page components as Admin. Most stay
              preview-only via readOnly (Patients also allows adding a new
              patient — see its own readOnly handling). Barangay Schedule
              and Messages are NOT read-only for a doctor: they can
              log/edit barangay activities and message their own patients
              (scoped server-side — see routes/messages.js,
              routes/patients.js and lib/doctorMatch.js). Messages exists
              ONLY here — the Admin Portal doesn't have it. Staff
              Management is Admin-only (not in this portal). */}
          <Route
            path="/doctor"
            element={
              <ProtectedRoute role="doctor">
                <PortalLayout title="City Dental Section" subtitle="Doctor Portal" navItems={doctorNav} />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard readOnly />} />
            <Route path="patients" element={<AdminPatients readOnly />} />
            <Route path="barangay-schedule" element={<AdminBarangaySchedule />} />
            <Route path="messages" element={<AdminMessages />} />
            {/* Catch-all: any unknown sub-path here (an old renamed page, a
                stale bookmark, a typo) lands on the dashboard instead of a
                blank "no route matched" page. Keep this LAST in the list. */}
            <Route path="*" element={<Navigate to="/doctor" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}