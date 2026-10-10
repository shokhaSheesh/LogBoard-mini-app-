export type Status =
  | "re_update"
  | "ready"
  | "covered"
  | "dispatched"
  | "enroute"
  | "completed"
  | "reserved"
  | "rest"
  | "shop"
  | "home";

export interface StatusConfig {
  label: string;
  bg: string;
  color: string;
}

export const STATUS_CONFIG: Record<Status, StatusConfig> = {
  re_update:  { label: "Re-Update",  bg: "#EF4444", color: "#ffffff" },
  ready:      { label: "Ready",      bg: "#10B981", color: "#ffffff" },
  covered:    { label: "Covered",    bg: "#8B5CF6", color: "#ffffff" },
  dispatched: { label: "Dispatched", bg: "#F59E0B", color: "#111827" },
  enroute:    { label: "Enroute",    bg: "#3B82F6", color: "#ffffff" },
  completed:  { label: "Completed",  bg: "#22C55E", color: "#111827" },
  reserved:   { label: "Reserved",   bg: "#6366F1", color: "#ffffff" },
  rest:       { label: "Rest",       bg: "#D1D5DB", color: "#374151" },
  shop:       { label: "Shop",       bg: "#F97316", color: "#ffffff" },
  home:       { label: "Home",       bg: "#64748B", color: "#ffffff" },
};

export const ALL_STATUSES = Object.keys(STATUS_CONFIG) as Status[];
