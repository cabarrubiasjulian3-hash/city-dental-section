import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  // Both roles land on the public landing page when there's no session —
  // same as admin: keeps this in sync with logout's navigate("/") so there
  // is never a race between the two producing two different destinations.
  if (!user) return <Navigate to="/" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;

  return children;
}