import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PageLoader } from "@/components/PageLoader";

/**
 * Redirects authenticated users to their role-specific home route.
 * Sends unauthenticated users to /login.
 */
export function RootRedirect() {
  const { session, role, loading } = useAuth();

  if (loading) return <PageLoader />;
  if (!session) return <Navigate to="/login" replace />;

  if (!role) {
    console.error("RootRedirect: Session exists but role is null. Redirecting to login.");
    return <Navigate to="/login" replace />;
  }

  const roleRoutes: Record<string, string> = {
    admin: "/backoffice/admin",
    utilization_manager: "/backoffice/utilization-manager",
    hospital: "/dashboard",
    claims: "/backoffice/claims",
    finance: "/backoffice/finance",
  };

  const destination = roleRoutes[role];
  if (destination) return <Navigate to={destination} replace />;

  return <Navigate to="/login" replace />;
}
