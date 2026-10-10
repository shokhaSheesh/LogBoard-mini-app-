// A driver's display name — team drivers (two-person, `team: true`) show both
// names ("Name 1 & Name 2") instead of just the first driver's name.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function driverDisplayName(d: any): string {
  if (!d) return "";
  if (d.team && d.name2) return `${d.name ?? ""} & ${d.name2}`.trim();
  return d.name ?? d.id ?? "";
}
