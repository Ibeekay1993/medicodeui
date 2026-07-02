import { Route, Navigate } from "react-router-dom";
import { lazy } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

const DashboardHome = lazy(() => import("@/features/dashboard/pages/DashboardHome"));
const PaymentsLayout = lazy(() => import("@/features/payments/components/PaymentsLayout"));
const AwaitingPaymentPage = lazy(() => import("@/features/payments/pages/AwaitingPaymentPage"));
const BatchesPage = lazy(() => import("@/features/payments/pages/BatchesPage"));
const PaidClaimsPage = lazy(() => import("@/features/payments/pages/PaidClaimsPage"));
const FinanceReportsPage = lazy(() => import("@/features/payments/pages/FinanceReportsPage"));
const SettingsPage = lazy(() => import("@/features/dashboard/pages/SettingsPage"));

/** All routes available to the Finance role backoffice (/backoffice/finance/*) */
export function FinanceRoutes() {
  return (
    <Route
      path="/backoffice/finance"
      element={
        <ProtectedRoute
          allowedRoles={["finance", "admin"]}
          loginPath="/login"
          fallbackPath="/unauthorized"
        >
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route index element={<DashboardHome />} />
      <Route path="payments" element={<PaymentsLayout />}>
        <Route index element={<Navigate to="awaiting" replace />} />
        <Route path="awaiting" element={<AwaitingPaymentPage />} />
        <Route path="batches" element={<BatchesPage />} />
        <Route path="paid" element={<PaidClaimsPage />} />
        <Route path="reports" element={<FinanceReportsPage />} />
      </Route>
      <Route path="settings" element={<SettingsPage />} />
    </Route>
  );
}
