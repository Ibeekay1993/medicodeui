import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useNavigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import ScrollToTop from "@/components/ScrollToTop";
import { PageLoader } from "@/components/PageLoader";
import { DeployVersionWatcher } from "@/components/DeployVersionWatcher";
import { TabStatePreserver } from "@/components/TabStatePreserver";
import { Button } from "@/components/ui/button";
import { ChunkErrorBoundary } from "@/components/ChunkErrorBoundary";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const HospitalPortalPage = lazy(() => import("./pages/hospital/HospitalPortalPage"));
const HospitalNewRequest = lazy(() => import("./pages/hospital/HospitalNewRequest"));
const HospitalAuthorizations = lazy(() => import("./pages/hospital/HospitalAuthorizations"));
const HospitalClaims = lazy(() => import("./pages/hospital/HospitalClaims"));
const ClaimsAnalysisPage = lazy(() => import("./pages/claims/ClaimsAnalysisPage"));
const ClaimsPortalPage = lazy(() => import("./pages/claims/ClaimsPortalPage"));
const ClaimsReportsPage = lazy(() => import("./pages/claims/ClaimsReportsPage"));
const PaymentsLayout = lazy(() => import("./pages/payments/PaymentsLayout"));
const AwaitingPaymentPage = lazy(() => import("./pages/payments/AwaitingPaymentPage"));
const BatchesPage = lazy(() => import("./pages/payments/BatchesPage"));
const PaidClaimsPage = lazy(() => import("./pages/payments/PaidClaimsPage"));
const DashboardHome = lazy(() => import("./pages/dashboard/DashboardHome"));
const RequestsPage = lazy(() => import("./pages/dashboard/RequestsPage"));
const WhatsAppPage = lazy(() => import("./pages/dashboard/WhatsAppPage"));
const ReportsPage = lazy(() => import("./pages/dashboard/ReportsPage"));
const FinanceReportsPage = lazy(() => import("./pages/payments/FinanceReportsPage"));
const SettingsPage = lazy(() => import("./pages/dashboard/SettingsPage"));
const HospitalsPage = lazy(() => import("./pages/dashboard/HospitalsPage"));
const UsersPage = lazy(() => import("./pages/dashboard/UsersPage"));
const Register = lazy(() => import("./pages/Register"));
const AuditLogsPage = lazy(() => import("./pages/dashboard/AuditLogsPage"));
const DeleteRequestsPage = lazy(() => import("./pages/dashboard/DeleteRequestsPage"));
const NhisBeneficiaryUpdatePage = lazy(() => import("./pages/dashboard/NhisBeneficiaryUpdatePage"));
const HistoricalCodeImportPage = lazy(() => import("./pages/dashboard/HistoricalCodeImportPage"));
const SupportMessagesPage = lazy(() => import("./pages/dashboard/SupportMessagesPage"));
const AnnouncementsPage = lazy(() => import("./pages/dashboard/AnnouncementsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function RootRedirect() {
  const { session, role, loading } = useAuth();
  
  if (loading) return <PageLoader />;
  if (!session) return <Navigate to="/login" replace />;

  // If role is null and we are not loading, redirect to login
  if (!role) {
    console.error("RootRedirect: Session exists but role is null. Redirecting to login.");
    return <Navigate to="/login" replace />;
  }

  if (role === "admin") return <Navigate to="/backoffice/admin" replace />;
  if (role === "utilization_manager") return <Navigate to="/backoffice/utilization-manager" replace />;
  if (role === "hospital") return <Navigate to="/dashboard" replace />;
  if (role === "claims") return <Navigate to="/backoffice/claims" replace />;
  if (role === "finance") return <Navigate to="/backoffice/finance" replace />;
  
  return <Navigate to="/login" replace />;
}

function UnauthorizedPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl">
        <h1 className="text-2xl font-black uppercase italic text-slate-900">Access Denied</h1>
        <p className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-400">Unauthorized Registry Access</p>
        <Button onClick={() => navigate("/")} className="mt-6 h-12 w-full rounded-xl bg-slate-900 text-xs font-black uppercase tracking-widest shadow-xl shadow-slate-900/20">Return Home</Button>
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <DeployVersionWatcher />
        <AuthProvider>
          <TabStatePreserver />
          <ChunkErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/register" element={<Register />} />

              <Route path="/dashboard" element={<ProtectedRoute allowedRoles={["hospital","admin","utilization_manager","claims"]} loginPath="/login" fallbackPath="/unauthorized"><DashboardLayout /></ProtectedRoute>}>
                <Route index element={<ProtectedRoute allowedRoles={["hospital"]} fallbackPath="/unauthorized"><HospitalPortalPage /></ProtectedRoute>} />
                <Route path="new-request" element={<ProtectedRoute allowedRoles={["hospital"]} fallbackPath="/unauthorized"><HospitalNewRequest /></ProtectedRoute>} />
                <Route path="authorizations" element={<ProtectedRoute allowedRoles={["hospital"]} fallbackPath="/unauthorized"><HospitalAuthorizations /></ProtectedRoute>} />
                <Route path="claims" element={<ProtectedRoute allowedRoles={["hospital"]} fallbackPath="/unauthorized"><HospitalClaims /></ProtectedRoute>} />
                <Route path="messages" element={<SupportMessagesPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              <Route path="/backoffice/admin" element={<ProtectedRoute allowedRoles={["admin"]} loginPath="/login" fallbackPath="/unauthorized"><DashboardLayout /></ProtectedRoute>}>
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

              <Route path="/backoffice/utilization-manager" element={<ProtectedRoute allowedRoles={["utilization_manager"]} loginPath="/login" fallbackPath="/unauthorized"><DashboardLayout /></ProtectedRoute>}>
                <Route index element={<DashboardHome />} />
                <Route path="requests" element={<RequestsPage />} />
                <Route path="messages" element={<SupportMessagesPage />} />
                <Route path="whatsapp" element={<WhatsAppPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              <Route path="/backoffice/claims" element={<ProtectedRoute allowedRoles={["claims", "admin"]} loginPath="/login" fallbackPath="/unauthorized"><DashboardLayout /></ProtectedRoute>}>
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

              <Route path="/backoffice/finance" element={<ProtectedRoute allowedRoles={["finance", "admin"]} loginPath="/login" fallbackPath="/unauthorized"><DashboardLayout /></ProtectedRoute>}>
                <Route index element={<DashboardHome />} />
                <Route path="payments" element={<PaymentsLayout />}>
                  <Route index element={<Navigate to="awaiting" replace />} />
                  <Route path="awaiting" element={<AwaitingPaymentPage />} />
                  <Route path="batches" element={<BatchesPage />} />
                  <Route path="paid" element={<PaidClaimsPage />} />
                </Route>
                <Route path="reports" element={<FinanceReportsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              <Route path="/unauthorized" element={<UnauthorizedPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </ChunkErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
