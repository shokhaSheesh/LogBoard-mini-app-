import { NavLink } from "react-router";
import { ChartColumnIncreasing, ChartPie, CircleUserRound, IdCard, PackageOpen } from "lucide-react";
import { haptic } from "../lib/telegram";

export interface Tab {
  path: string;
  label: string;
  icon: React.ElementType;
  // The permission modules that open this tab — any one of them is enough. A tab with
  // none listed (Profile) is always there.
  modules?: string[];
}

// The same icons the web sidebar uses for these pages, so the two feel like one product.
export const TABS: Tab[] = [
  { path: "/loads",     label: "Loads",     icon: PackageOpen,           modules: ["loads"] },
  { path: "/finance",   label: "Finance",   icon: ChartColumnIncreasing, modules: ["gross", "payouts"] },
  { path: "/dashboard", label: "Dashboard", icon: ChartPie,              modules: ["dashboard"] },
  { path: "/drivers",   label: "Drivers",   icon: IdCard,                modules: ["drivers"] },
  { path: "/profile",   label: "Profile",   icon: CircleUserRound },
];

// The floating pill. Icons only, so each carries its name for screen readers.
export function TabBar({ tabs }: { tabs: Tab[] }) {
  return (
    <nav className="tabbar" aria-label="Sections">
      {tabs.map(({ path, label, icon: Icon }) => (
        <NavLink key={path} to={path} aria-label={label} title={label} onClick={haptic.tap}
          className={({ isActive }) => (isActive ? "active" : undefined)}>
          <Icon size={21} strokeWidth={2} />
        </NavLink>
      ))}
    </nav>
  );
}
