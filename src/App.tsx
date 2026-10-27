import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { Lock } from "lucide-react";
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
import { Toaster } from "./components/ui";
import { PullToRefresh } from "./components/PullToRefresh";
import { OpenFromBot } from "./components/OpenFromBot";
import { useRefreshRound } from "./lib/refresh";
import { onCompanyClosed, type CompanyClosed } from "./lib/api";

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
  const { user, loading, companyId } = useAuth();
  const { pathname } = useLocation();
  const round = useRefreshRound();
  const [closed, setClosed] = useState<CompanyClosed | null>(null);

  useEffect(() => onCompanyClosed(setClosed), []);
  // The verdict is about one company and one sign-in: a new one gets asked afresh.
  useEffect(() => setClosed(null), [user?.id, companyId]);

  if (loading) return <div className="screen"><div className="center"><span className="spinner" /></div></div>;
  if (!user) return <SignInPage />;

  if (closed) return <CompanyClosedScreen code={closed} />;

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
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
      {/* A page opened from a tab (a load, a form) takes the whole screen; the bar is for
          moving between the tabs themselves. */}
      {tabs.some((t) => t.path === pathname) && <TabBar tabs={tabs} />}
      <PullToRefresh />
      {/* Opened from one of the bot's "Open in Brelo" buttons: go where it pointed. */}
      <OpenFromBot />
      <Toaster />
    </div>
  );
}

const CLOSED_COPY: Record<CompanyClosed, { title: string; body: string }> = {
  company_suspended: {
    title: "This company is suspended",
    body: "An administrator has suspended the account, so the board isn't available. Get in touch with them to restore it.",
  },
  company_unavailable: {
    title: "This company isn't available",
    body: "The board can't reach this company right now. Try again in a moment, and if it keeps happening, get in touch with your administrator.",
  },
};

// Every board route is refused while the company is closed, so no tab could load: this
// says why, in place of the tabs. Nobody in the app can reopen it (an administrator sets
// the status), so it offers only another try and the way out.
function CompanyClosedScreen({ code }: { code: CompanyClosed }) {
  const { logout } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const copy = CLOSED_COPY[code];
  return (
    <div className="screen">
      <div className="center">
        <span className="picon" style={{ width: 56, height: 56, borderRadius: 18, color: "var(--pine)" }}><Lock size={24} /></span>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>{copy.title}</div>
        <div style={{ fontSize: 14, lineHeight: 1.5, maxWidth: 300 }}>{copy.body}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 300, marginTop: 8 }}>
          <button className="btn" onClick={() => window.location.reload()}>Try again</button>
          <button className="btn ghost" disabled={leaving} onClick={() => { setLeaving(true); void logout(); }}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
