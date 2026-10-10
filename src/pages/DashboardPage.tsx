import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { getDashboard, toSeries, type Dashboard, type Ranked } from "../lib/dashboard";
import { fmtDateRange } from "../lib/dates";
import { friendlyError } from "../lib/errors";
import { periodRange, usePeriod } from "../lib/period";
import { haptic } from "../lib/telegram";
import { Bar, compact, dollars, Kpis, PeriodChip, perMile } from "../components/finance";

// The Dashboard tab: three headline numbers, one chart that switches between gross and
// loads, and one ranking at a time, picked by the chips under the chart.

type Board = "drivers" | "dispatchers" | "states" | "loads";
const BOARDS: { id: Board; label: string }[] = [
  { id: "drivers", label: "Drivers" }, { id: "dispatchers", label: "Dispatchers" }, { id: "states", label: "States" }, { id: "loads", label: "Loads" },
];

export function DashboardPage() {
  const { user, companyId } = useAuth();
  const [period, setPeriod] = usePeriod("dashboard");
  const range = periodRange(period, user?.company?.week_start_day ?? 1);
  const [data, setData]       = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    // Only the latest request may write; the last period stays on screen, dimmed, meanwhile.
    let stale = false;
    setLoading(true); setError("");
    getDashboard(period, range)
      .then((d) => { if (!stale) setData(d); })
      .catch((e) => { if (!stale) setError(friendlyError(e, "Couldn't load the dashboard. Try again.")); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, range.from, range.to, companyId]);

  const [board, setBoard] = useState<Board>("drivers");
  const before = period === "week" || period === "lastWeek" ? "vs week before" : "vs before";
  const change = (v: number | null) => (v == null ? {} : { note: `${v >= 0 ? "+" : ""}${v.toFixed(0)}% ${before}`, noteTone: v >= 0 ? "good" as const : "bad" as const });

  return (
    <div className="scroll">
      <h1 className="title">Dashboard</h1>
      <div className="sticky">
        <div className="chips">
          <PeriodChip value={period} onPick={setPeriod} />
          {data?.from && period !== "all" && <span className="sub" style={{ alignSelf: "center" }}>{fmtDateRange(data.from, data.to)}</span>}
        </div>
      </div>

      {error && <div className="error" role="alert">{error}</div>}
      {loading && !data && <div className="center"><span className="spinner" /></div>}
      {data && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}>
          <Kpis across={3} items={[
            { label: "Loads", value: data.loads.toLocaleString("en-US"), ...change(data.loadsDelta) },
            { label: "Gross", value: compact(data.gross), ...change(data.grossDelta) },
            { label: "Disp. payout", value: compact(data.dispatcherPayout) },
          ]} />
          <Chart data={data} />
          <div className="chips" role="tablist" aria-label="Ranking">
            {BOARDS.map((b) => (
              <button key={b.id} role="tab" aria-selected={board === b.id} className={`chip ${board === b.id ? "on" : ""}`} onClick={() => { haptic.tap(); setBoard(b.id); }}>{b.label}</button>
            ))}
          </div>
          {board === "drivers" && (
            <Ranking key="drivers" tabs={[
              { label: "By gross", rows: data.driversByGross, show: dollars, empty: "No driver gross in this period." },
              { label: "By rate per mile", rows: data.driversByRpm, show: (n) => `${perMile(n)}/mi`, empty: "No miles recorded in this period." },
            ]} />
          )}
          {board === "dispatchers" && <Ranking key="dispatchers" tabs={[{ label: "", rows: data.dispatchers, show: dollars, empty: "No dispatcher payouts in this period." }]} />}
          {board === "states" && (
            <Ranking key="states" tabs={[
              { label: "Pickup", rows: data.pickupStates, show: dollars, empty: "No completed loads with a pickup state in this period." },
              { label: "Delivery", rows: data.deliveryStates, show: dollars, empty: "No completed loads with a delivery state in this period." },
            ]} />
          )}
          {board === "loads" && <Ranking key="loads" bars={false} tabs={[{ label: "", rows: data.topLoads, show: dollars, empty: "No loads completed in this period." }]} />}
        </div>
      )}
    </div>
  );
}

// ─── Gross or loads over time ─────────────────────────────────────────────────

function Chart({ data }: { data: Dashboard }) {
  const [what, setWhat] = useState<"gross" | "loads">("gross");
  const [picked, setPicked] = useState<number | null>(null);
  const { unit, points } = toSeries(data.daily);
  // A new period is a new set of bars; the one tapped before means nothing in it.
  useEffect(() => { setPicked(null); }, [data]);

  const value = (i: number) => (what === "gross" ? points[i].gross : points[i].loads);
  const show = (n: number) => (what === "gross" ? dollars(n) : `${n} ${n === 1 ? "load" : "loads"}`);
  const top = Math.max(0, ...points.map((_, i) => value(i)));
  // A label under every bar while they fit; otherwise every few, so they don't collide.
  const every = Math.ceil(points.length / 8);
  const sel = picked != null && picked < points.length ? picked : null;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row">
        <div style={{ minWidth: 0 }}>
          <div className="sub ell">{sel != null ? points[sel].tip : `By ${unit}`}</div>
          <b style={{ fontSize: 16 }}>{show(sel != null ? value(sel) : what === "gross" ? data.gross : data.loads)}</b>
        </div>
        <div className="seg small" role="tablist" style={{ width: 132 }}>
          {(["gross", "loads"] as const).map((w) => (
            <button key={w} role="tab" aria-selected={what === w} className={what === w ? "on" : undefined} onClick={() => setWhat(w)}>{w === "gross" ? "Gross" : "Loads"}</button>
          ))}
        </div>
      </div>
      {top === 0 ? <div className="center" style={{ padding: "26px 0" }}>Nothing completed in this period.</div> : (
        <div>
          <div className="chart">
            {points.map((p, i) => (
              <button key={i} className={`${value(i) === 0 ? "zero" : ""} ${sel === i ? "sel" : ""}`} aria-label={`${p.tip}: ${show(value(i))}`}
                onClick={() => { haptic.tap(); setPicked(sel === i ? null : i); }}>
                <i style={{ height: `${value(i) === 0 ? 0 : Math.max(4, (value(i) / top) * 100)}%` }} />
              </button>
            ))}
          </div>
          <div className="chart-axis">{points.map((p, i) => <span key={i}>{i % every === 0 ? p.label : ""}</span>)}</div>
        </div>
      )}
    </div>
  );
}

// ─── One ranking ──────────────────────────────────────────────────────────────

interface RankTab { label: string; rows: Ranked[]; show: (n: number) => string; empty: string }

// A ranking with one or two ways of ordering it (drivers by gross or by rate per mile).
// The bar under each row is how it compares with first place.
function Ranking({ tabs, bars = true }: { tabs: RankTab[]; bars?: boolean }) {
  const [at, setAt] = useState(0);
  const tab = tabs[at];
  const top = Math.max(0, ...tab.rows.map((r) => r.value));
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {tabs.length > 1 && (
        <div className="seg small" role="tablist">
          {tabs.map((t, i) => <button key={t.label} role="tab" aria-selected={at === i} className={at === i ? "on" : undefined} onClick={() => setAt(i)}>{t.label}</button>)}
        </div>
      )}
      {tab.rows.length === 0 ? <div className="center" style={{ padding: "18px 0" }}>{tab.empty}</div> : (
        <div className="rank">
          {tab.rows.map((r, i) => (
            <div key={i} style={{ display: "contents" }}>
              <span className="n">{i + 1}</span><b className="ell">{r.name || "Unknown"}</b><em>{tab.show(r.value)}</em>
              {r.note && <small className="ell">{r.note}</small>}
              {bars ? <Bar percent={top > 0 ? (r.value / top) * 100 : 0} /> : <span className="gap" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
