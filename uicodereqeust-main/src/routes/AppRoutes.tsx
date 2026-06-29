import { Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import { PageLoader } from "@/components/PageLoader";
import { ChunkErrorBoundary } from "@/components/ChunkErrorBoundary";
import ScrollToTop from "@/components/ScrollToTop";
import { DeployVersionWatcher } from "@/components/DeployVersionWatcher";
import { SessionTimeoutWatcher } from "@/components/SessionTimeoutWatcher";
import { TabStatePreserver } from "@/components/TabStatePreserver";
import { RootRedirect } from "./RootRedirect";
import { UnauthorizedPage } from "./UnauthorizedPage";
import { HospitalRoutes } from "./HospitalRoutes";
import { AdminRoutes } from "./AdminRoutes";
import { ClaimsRoutes } from "./ClaimsRoutes";
import { UtilizationRoutes } from "./UtilizationRoutes";
import { FinanceRoutes } from "./FinanceRoutes";

const Login = lazy(() => import("@/pages/Login"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Register = lazy(() => import("@/pages/Register"));
const NotFound = lazy(() => import("@/pages/NotFound"));

/**
 * AppRoutes is the application's root routing component.
 * It composes domain-specific route modules and mounts
 * application-level side-effect components (scroll restoration,
 * deployment watcher, session timeout, tab state).
 */
export function AppRoutes() {
  return (
    <>
      {/* Application-level side effects — order matters */}
      <ScrollToTop />
      <DeployVersionWatcher />
      <SessionTimeoutWatcher />
      <TabStatePreserver />

      <ChunkErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/register" element={<Register />} />

            {/* Domain route modules — one component per role portal */}
            {HospitalRoutes()}
            {AdminRoutes()}
            {UtilizationRoutes()}
            {ClaimsRoutes()}
            {FinanceRoutes()}

            {/* Fallback routes */}
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ChunkErrorBoundary>
    </>
  );
}
