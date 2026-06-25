import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
  fallbackPath?: string;
  loginPath?: string;
}

export function ProtectedRoute({ children, allowedRoles, fallbackPath, loginPath = "/login" }: ProtectedRouteProps) {
  const { session, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    // Persist current path to sessionStorage for post-login restore (handles page reload)
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("ronsberger-intended-path", location.pathname + location.search);
    }
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  // If role is loaded but empty, it means they aren't assigned in user_roles
  if (!role && !loading) {
    console.error("USER ERROR: No role assigned in user_roles table for this ID.");
    return <Navigate to={loginPath} replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    // Correctly redirect to the user's intended base path if they hit a restricted area
    if (fallbackPath) return <Navigate to={fallbackPath} replace />;
    if (role === "hospital") return <Navigate to="/dashboard" replace />;
    if (role === "claims") return <Navigate to="/backoffice/claims" replace />;
    if (role === "admin") return <Navigate to="/backoffice/admin" replace />;
    if (role === "finance") return <Navigate to="/backoffice/finance" replace />;
    return <Navigate to="/backoffice/utilization-manager" replace />;
  }

  return <>{children}</>;
}
