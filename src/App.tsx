import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { AuthProvider, can, useAuth } from "./lib/auth";
import { TabBar, TABS } from "./components/TabBar";
import { SignInPage } from "./pages/SignInPage";
import { ProfilePage } from "./pages/ProfilePage";
import { LoadsPage } from "./pages/LoadsPage";
import { LoadDetailPage } from "./pages/LoadDetailPage";
import { LoadFormPage } from "./pages/LoadFormPage";
import { FinancePage } from "./pages/FinancePage";
import { GrossDriverPage } from "./pages/GrossDriverPage";
import { KpiDispatcherPage, KpiPage } from "./pages/KpiPages";
import { DashboardPage } from "./pages/DashboardPage";
import { DriversPage } from "./pages/DriversPage";
import { DriverDetailPage } from "./pages/DriverDetailPage";
import { DriverFormPage } from "./pages/DriverFormPage";
import { EquipmentPage } from "./pages/EquipmentPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { Toaster } from "./components/ui";
import { PullToRefresh } from "./components/PullToRefresh";
import { useRefreshRound } from "./lib/refresh";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  );
}

// Signed out → the sign-in screen and nothing else. Signed in → the tabs the user's role
// can open, with the tab bar under them.
function Shell() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const round = useRefreshRound();

  if (loading) return <div className="screen"><div className="center"><span className="spinner" /></div></div>;
  if (!user) return <SignInPage />;

  const tabs = TABS.filter((t) => !t.modules || t.modules.some((m) => can(user, m)));
  const home = tabs[0]?.path ?? "/profile";

  return (
    <div className="screen">
      {/* A refresh starts the screen on show over (see lib/refresh). */}
      <Routes key={round}>
        {tabs.some((t) => t.path === "/loads") && <>
          <Route path="/loads" element={<LoadsPage />} />
          <Route path="/loads/new" element={<LoadFormPage />} />
          <Route path="/loads/:id" element={<LoadDetailPage />} />
          <Route path="/loads/:id/edit" element={<LoadFormPage />} />
        </>}
        {tabs.some((t) => t.path === "/finance") && <>
          <Route path="/finance" element={<FinancePage />} />
          {can(user, "gross") && <Route path="/finance/gross/:id" element={<GrossDriverPage />} />}
          {can(user, "payouts") && <>
            <Route path="/finance/kpi" element={<KpiPage />} />
            <Route path="/finance/kpi/:id" element={<KpiDispatcherPage />} />
          </>}
        </>}
        {tabs.some((t) => t.path === "/dashboard") && <Route path="/dashboard" element={<DashboardPage />} />}
        {tabs.some((t) => t.path === "/drivers") && <>
          <Route path="/drivers" element={<DriversPage />} />
          <Route path="/drivers/new" element={<DriverFormPage />} />
          <Route path="/drivers/:id" element={<DriverDetailPage />} />
          <Route path="/drivers/:id/edit" element={<DriverFormPage />} />
        </>}
        <Route path="/profile" element={<ProfilePage />} />
        {can(user, "equipments") && <Route path="/profile/equipment" element={<EquipmentPage />} />}
        {user.role === "owner" && <Route path="/profile/invoices" element={<InvoicesPage />} />}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
      {/* A page opened from a tab (a load, a form) takes the whole screen; the bar is for
          moving between the tabs themselves. */}
      {tabs.some((t) => t.path === pathname) && <TabBar tabs={tabs} />}
      <PullToRefresh />
      <Toaster />
    </div>
  );
}
