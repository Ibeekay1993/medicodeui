import { Route } from "react-router-dom";
import { lazy } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

const DashboardHome = lazy(() => import("@/features/dashboard/pages/DashboardHome"));
const RequestsPage = lazy(() => import("@/features/dashboard/pages/RequestsPage"));
const SupportMessagesPage = lazy(() => import("@/features/dashboard/pages/SupportMessagesPage"));
const WhatsAppPage = lazy(() => import("@/features/dashboard/pages/WhatsAppPage"));
const ReportsPage = lazy(() => import("@/features/dashboard/pages/ReportsPage"));
const SettingsPage = lazy(() => import("@/features/dashboard/pages/SettingsPage"));

/** All routes available to the Utilization Manager role (/backoffice/utilization-manager/*) */
export function UtilizationRoutes() {
  return (
    <Route
      path="/backoffice/utilization-manager"
      element={
        <ProtectedRoute
          allowedRoles={["utilization_manager"]}
          loginPath="/login"
          fallbackPath="/unauthorized"
        >
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route index element={<DashboardHome />} />
      <Route path="requests" element={<RequestsPage />} />
      <Route path="messages" element={<SupportMessagesPage />} />
      <Route path="whatsapp" element={<WhatsAppPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>
  );
}
