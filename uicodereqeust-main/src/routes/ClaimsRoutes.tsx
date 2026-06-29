import { Route, Navigate } from "react-router-dom";
import { lazy } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

const DashboardHome = lazy(() => import("@/features/dashboard/pages/DashboardHome"));
const ClaimsAnalysisPage = lazy(() => import("@/pages/claims/ClaimsAnalysisPage"));
const ClaimsPortalPage = lazy(() => import("@/pages/claims/ClaimsPortalPage"));
const ClaimsReportsPage = lazy(() => import("@/pages/claims/ClaimsReportsPage"));
const PaymentsLayout = lazy(() => import("@/features/payments/components/PaymentsLayout"));
const AwaitingPaymentPage = lazy(() => import("@/features/payments/pages/AwaitingPaymentPage"));
const BatchesPage = lazy(() => import("@/features/payments/pages/BatchesPage"));
const PaidClaimsPage = lazy(() => import("@/features/payments/pages/PaidClaimsPage"));
const SupportMessagesPage = lazy(() => import("@/features/dashboard/pages/SupportMessagesPage"));
const SettingsPage = lazy(() => import("@/features/dashboard/pages/SettingsPage"));

/** All routes available to the Claims role backoffice (/backoffice/claims/*) */
export function ClaimsRoutes() {
  return (
    <Route
      path="/backoffice/claims"
      element={
        <ProtectedRoute
          allowedRoles={["claims", "admin"]}
          loginPath="/login"
          fallbackPath="/unauthorized"
        >
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route index element={<DashboardHome />} />
      <Route path="analysis" element={<ClaimsAnalysisPage />} />
      <Route path="all" element={<ClaimsPortalPage />} />
      <Route path="requests" element={<Navigate to="/backoffice/claims/all" replace />} />
      <Route path="payments" element={<PaymentsLayout />}>
        <Route index element={<Navigate to="awaiting" replace />} />
        <Route path="awaiting" element={<AwaitingPaymentPage />} />
        <Route path="batches" element={<BatchesPage />} />
        <Route path="paid" element={<PaidClaimsPage />} />
      </Route>
      <Route path="messages" element={<SupportMessagesPage />} />
      <Route path="reports" element={<ClaimsReportsPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>
  );
}
