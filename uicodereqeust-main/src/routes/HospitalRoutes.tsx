import { Route } from "react-router-dom";
import { lazy } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

const HospitalPortalPage = lazy(() => import("@/features/hospital/pages/HospitalPortalPage"));
const HospitalNewRequest = lazy(() => import("@/features/hospital/pages/HospitalNewRequest"));
const HospitalAuthorizations = lazy(() => import("@/features/hospital/pages/HospitalAuthorizations"));
const HospitalClaims = lazy(() => import("@/features/hospital/pages/HospitalClaims"));

const SupportMessagesPage = lazy(() => import("@/features/dashboard/pages/SupportMessagesPage"));
const SettingsPage = lazy(() => import("@/features/dashboard/pages/SettingsPage"));

/** All routes available to the Hospital role portal (/dashboard/*) */
export function HospitalRoutes() {
  return (
    <Route
      path="/dashboard"
      element={
        <ProtectedRoute
          allowedRoles={["hospital", "admin", "utilization_manager", "claims"]}
          loginPath="/login"
          fallbackPath="/unauthorized"
        >
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route
        index
        element={
          <ProtectedRoute allowedRoles={["hospital"]} fallbackPath="/unauthorized">
            <HospitalPortalPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="new-request"
        element={
          <ProtectedRoute allowedRoles={["hospital"]} fallbackPath="/unauthorized">
            <HospitalNewRequest />
          </ProtectedRoute>
        }
      />
      <Route
        path="authorizations"
        element={
          <ProtectedRoute allowedRoles={["hospital"]} fallbackPath="/unauthorized">
            <HospitalAuthorizations />
          </ProtectedRoute>
        }
      />
      <Route
        path="claims"
        element={
          <ProtectedRoute allowedRoles={["hospital"]} fallbackPath="/unauthorized">
            <HospitalClaims />
          </ProtectedRoute>
        }
      />
      <Route path="messages" element={<SupportMessagesPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>
  );
}
