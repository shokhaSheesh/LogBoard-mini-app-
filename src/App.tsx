import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { AuthProvider, can, useAuth } from "./lib/auth";
import { TabBar, TABS } from "./components/TabBar";
import { SignInPage } from "./pages/SignInPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ComingSoon } from "./pages/ComingSoon";
import { LoadsPage } from "./pages/LoadsPage";
import { LoadDetailPage } from "./pages/LoadDetailPage";
import { LoadFormPage } from "./pages/LoadFormPage";
import { FinancePage } from "./pages/FinancePage";
import { GrossDriverPage } from "./pages/GrossDriverPage";
import { KpiDispatcherPage, KpiPage } from "./pages/KpiPages";
import { Toaster } from "./components/ui";

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

  if (loading) return <div className="screen"><div className="center"><span className="spinner" /></div></div>;
  if (!user) return <SignInPage />;

  const tabs = TABS.filter((t) => !t.modules || t.modules.some((m) => can(user, m)));
  const home = tabs[0]?.path ?? "/profile";

  return (
    <div className="screen">
      <Routes>
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
        {tabs.some((t) => t.path === "/dashboard") && <Route path="/dashboard" element={<ComingSoon title="Dashboard" />} />}
        {tabs.some((t) => t.path === "/drivers")   && <Route path="/drivers"   element={<ComingSoon title="Drivers" />} />}
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
      {/* A page opened from a tab (a load, a form) takes the whole screen; the bar is for
          moving between the tabs themselves. */}
      {tabs.some((t) => t.path === pathname) && <TabBar tabs={tabs} />}
      <Toaster />
    </div>
  );
}
