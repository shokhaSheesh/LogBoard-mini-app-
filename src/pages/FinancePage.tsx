import { useNavigate, useSearchParams } from "react-router";
import { can, useAuth } from "../lib/auth";
import { fmtDate } from "../lib/dates";
import { sumDrivers, useGrossWeek } from "../lib/gross";
import { haptic } from "../lib/telegram";
import { Bar, dollars, Kpis, percentOf, perMile, WeekBar } from "../components/finance";
import { Payouts } from "./Payouts";

type Half = "gross" | "payouts";

// The Finance tab: Gross and Payouts, switched at the top. Each half needs its own
// permission, and the switch only shows when the user has both. Which half is open is in
// the address (?tab=payouts), so a page opened from Payouts comes back to Payouts.
export function FinancePage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const halves: Half[] = (["gross", "payouts"] as const).filter((h) => can(user, h));
  const asked: Half = params.get("tab") === "payouts" ? "payouts" : "gross";
  const half = halves.includes(asked) ? asked : halves[0] ?? "gross";

  return (
    <div className="scroll">
      <h1 className="title">Finance</h1>
      {halves.length > 1 && (
        <div className="seg" role="tablist">
          {halves.map((h) => (
            <button key={h} role="tab" aria-selected={half === h} className={half === h ? "on" : undefined}
              onClick={() => { haptic.tap(); setParams(h === "payouts" ? { tab: "payouts" } : {}, { replace: true }); }}>{h === "gross" ? "Gross" : "Payouts"}</button>
          ))}
        </div>
      )}
      {half === "gross" ? <Gross /> : <Payouts />}
    </div>
  );
}

// Gross, as a list: every driver with the week's total and how far it is toward their
// target, best first. A driver opens onto their week, day by day.
function Gross() {
  const navigate = useNavigate();
  const { week, loading, error, query, onCurrent, shift, current } = useGrossWeek();
  const drivers = [...(week?.drivers ?? [])].sort((a, b) => b.total - a.total);
  const totals = sumDrivers(drivers);

  return (
    <>
      <WeekBar from={week?.from ?? ""} to={week?.to ?? ""} onShift={shift} onCurrent={current} isCurrent={onCurrent} />
      {error && <div className="error" role="alert">{error}</div>}
      {loading && !week && <div className="center"><span className="spinner" /></div>}
      {week && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}>
          <Kpis items={[
            { label: `Gross · ${drivers.length} ${drivers.length === 1 ? "driver" : "drivers"}`, value: dollars(totals.total) },
            { label: "Driver pay", value: dollars(totals.driverPay) },
            { label: "Company profit", value: dollars(totals.profit), bad: totals.profit < 0 },
            { label: `Rate per mile · ${Math.round(totals.miles).toLocaleString("en-US")} mi`, value: perMile(totals.rpm) },
          ]} />
          {drivers.length === 0 ? <div className="center">No drivers this week.</div> : (
            <div className="list">
              {drivers.map((d) => {
                const pct = percentOf(d.total, d.target);
                return (
                  <button key={d.id} onClick={() => navigate(`/finance/gross/${d.id}${query}`)} style={d.removedOn ? { opacity: 0.6 } : undefined}>
                    <div className="row"><b className="ell">{d.name}</b><b>{dollars(d.total)}</b></div>
                    <div className="row">
                      <span className="sub ell">
                        {[d.type, d.unit, d.removedOn ? `Removed ${fmtDate(d.removedOn)}` : d.target > 0 && `target ${dollars(d.target)}`].filter(Boolean).join(" · ")}
                      </span>
                      {d.target > 0 && <span className="sub" style={pct >= 100 ? { color: "var(--pine)", fontWeight: 600 } : undefined}>{pct}%</span>}
                    </div>
                    {d.target > 0 && <Bar percent={pct} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
