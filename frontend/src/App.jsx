import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
} from "./components/icons";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

import PatientDashboard from "./pages/patient/Dashboard";
import PatientProfile from "./pages/patient/Profile";
import PatientBarangaySchedule from "./pages/patient/BarangaySchedule";
import PatientDentalRecord from "./pages/patient/DentalRecord";
import PatientSupport from "./pages/patient/Support";

import AdminDashboard from "./pages/admin/Dashboard";
import AdminPatients from "./pages/admin/Patients";
import AdminBarangaySchedule from "./pages/admin/BarangaySchedule";
import AdminMonthlyReport from "./pages/admin/MonthlyReport";
import AdminMessages from "./pages/admin/Messages";
import AdminStaff from "./pages/admin/Staff";

const patientNav = [
  { to: "/patient", end: true, icon: <IconDashboard />, label: "Dashboard" },
  { to: "/patient/profile", icon: <IconUsers />, label: "My Profile" },
  { to: "/patient/barangay-appointments", icon: <IconCalendar />, label: "Barangay Appointments" },
  { to: "/patient/dental-record", icon: <IconReport />, label: "Dental Record" },
  { to: "/patient/support", icon: <IconChat />, label: "Support" },
];

const adminNav = [
  { to: "/admin", end: true, icon: <IconDashboard />, label: "Dashboard" },
  { to: "/admin/patients", icon: <IconUsers />, label: "Patient Management" },
  { to: "/admin/barangay-schedule", icon: <IconCalendar />, label: "Barangay Schedule" },
  { to: "/admin/monthly-report", icon: <IconReport />, label: "Monthly Report" },
  { to: "/admin/messages", icon: <IconChat />, label: "Messages" },
  { to: "/admin/staff", icon: <IconStaff />, label: "Staff Management" },
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
            <Route path="barangay-appointments" element={<PatientBarangaySchedule />} />
            <Route path="dental-record" element={<PatientDentalRecord />} />
            <Route path="support" element={<PatientSupport />} />
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
            <Route path="messages" element={<AdminMessages />} />
            <Route path="staff" element={<AdminStaff />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}