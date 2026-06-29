import { Route, Navigate } from "react-router-dom";
import { lazy } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

const DashboardHome = lazy(() => import("@/features/dashboard/pages/DashboardHome"));
const RequestsPage = lazy(() => import("@/features/dashboard/pages/RequestsPage"));
const ClaimsAnalysisPage = lazy(() => import("@/pages/claims/ClaimsAnalysisPage"));
const ClaimsPortalPage = lazy(() => import("@/pages/claims/ClaimsPortalPage"));
const ClaimsReportsPage = lazy(() => import("@/pages/claims/ClaimsReportsPage"));
const PaymentsLayout = lazy(() => import("@/features/payments/components/PaymentsLayout"));
const AwaitingPaymentPage = lazy(() => import("@/features/payments/pages/AwaitingPaymentPage"));
const BatchesPage = lazy(() => import("@/features/payments/pages/BatchesPage"));
const PaidClaimsPage = lazy(() => import("@/features/payments/pages/PaidClaimsPage"));
const SupportMessagesPage = lazy(() => import("@/features/dashboard/pages/SupportMessagesPage"));
const ReportsPage = lazy(() => import("@/features/dashboard/pages/ReportsPage"));
const AuditLogsPage = lazy(() => import("@/features/dashboard/pages/AuditLogsPage"));
const WhatsAppPage = lazy(() => import("@/features/dashboard/pages/WhatsAppPage"));
const HospitalsPage = lazy(() => import("@/features/dashboard/pages/HospitalsPage"));
const UsersPage = lazy(() => import("@/features/dashboard/pages/UsersPage"));
const DeleteRequestsPage = lazy(() => import("@/features/dashboard/pages/DeleteRequestsPage"));
const NhisBeneficiaryUpdatePage = lazy(() => import("@/features/dashboard/pages/NhisBeneficiaryUpdatePage"));
const HistoricalCodeImportPage = lazy(() => import("@/features/dashboard/pages/HistoricalCodeImportPage"));
const AnnouncementsPage = lazy(() => import("@/features/dashboard/pages/AnnouncementsPage"));
const SettingsPage = lazy(() => import("@/features/dashboard/pages/SettingsPage"));

/** All routes available to the Admin role backoffice (/backoffice/admin/*) */
export function AdminRoutes() {
  return (
    <Route
      path="/backoffice/admin"
      element={
        <ProtectedRoute allowedRoles={["admin"]} loginPath="/login" fallbackPath="/unauthorized">
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route index element={<DashboardHome />} />
      <Route path="requests" element={<RequestsPage />} />
      <Route path="claims-analysis" element={<ClaimsAnalysisPage />} />
      <Route path="claims" element={<ClaimsPortalPage />} />
      <Route path="claims-reports" element={<ClaimsReportsPage />} />
      <Route path="payments" element={<PaymentsLayout />}>
        <Route index element={<Navigate to="awaiting" replace />} />
        <Route path="awaiting" element={<AwaitingPaymentPage />} />
        <Route path="batches" element={<BatchesPage />} />
        <Route path="paid" element={<PaidClaimsPage />} />
      </Route>
      <Route path="messages" element={<SupportMessagesPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="audit" element={<AuditLogsPage />} />
      <Route path="whatsapp" element={<WhatsAppPage />} />
      <Route path="hospitals" element={<HospitalsPage />} />
      <Route path="users" element={<UsersPage />} />
      <Route path="audit-logs" element={<AuditLogsPage />} />
      <Route path="delete-requests" element={<DeleteRequestsPage />} />
      <Route path="nhis-update" element={<NhisBeneficiaryUpdatePage />} />
      <Route path="historical-import" element={<HistoricalCodeImportPage />} />
      <Route path="announcements" element={<AnnouncementsPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>
  );
}
