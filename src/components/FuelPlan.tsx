import { useEffect, useState } from "react";
import { AlertCircle, Fuel, RefreshCw, Send } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { can, useAuth } from "../lib/auth";
import { fmtDateTime } from "../lib/dates";
import { friendlyError } from "../lib/errors";
import { Sheet, toast } from "./ui";

// ─── The backend's fuel plan (ADR 0037), as much as the phone shows ───────────

interface PlanStop {
  seq: number; name: string; address: string; city: string; state: string;
  location: { lat: number; lng: number };
  route_mile: number; buy_gal: number; pump_price: number;
  price_source: "station" | "regional_average"; price_age_h: number | null; stale_price: boolean;
}
interface Plan {
  id: string;
  truck_unit: string;
  route_miles: number;
  assumptions: { tank_gal: number };
  stops: PlanStop[] | null;
  end_fuel_gal: number;
  totals: { gallons: number; cost: number; stops: number; savings: number | null };
  created_at: string;
}

// Fuel to the tenth, as the plan counts it; a pump price as the sign shows it — the same as
// the web and the Telegram message.
const gal = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const price = (n: number) => { const t = n.toFixed(3); return `$${t.endsWith("0") ? n.toFixed(2) : t}`; };
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mapsLink = (p: { lat: number; lng: number }) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

// What can stop a plan, in a few words; the server's sentence says the rest.
const TITLES: Record<string, string> = {
  no_truck: "No truck", cant_reach_pickup: "Can't reach the pickup", no_fuel_in_range: "No truck stop in range",
  catalog_not_ready: "Truck-stop map still loading", stop_missing_location: "A stop has no map location",
  load_finished: "Load is finished", no_route: "Nothing left to drive", router_failed: "The route couldn't be drawn",
  fuel_prices_failed: "Fuel prices couldn't be read", not_configured: "Fuel plans aren't set up yet",
};

/** A load's fuel plan: where to buy diesel on the trip and how much. Shown when the user may read plans. */
export function FuelPlanCard({ loadId, truckUnit, finished, outdatedPlanId }: {
  loadId: string; truckUnit: string; finished: boolean;
  /** The plan the load says is out of date ("" when none is): the load or its truck changed after it. */
  outdatedPlanId: string;
}) {
  const { user } = useAuth();
  const canRead = can(user, "fuel_plans");
  const canMake = can(user, "fuel_plans", "create") && !finished;

  const [plan, setPlan]       = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<{ code: string; message: string } | null>(null);
  const [asking, setAsking]   = useState(false);

  // The saved plan is read every time the load opens, so it stays until it's recalculated.
  useEffect(() => {
    if (!canRead) { setLoading(false); return; }
    let stale = false;
    setLoading(true);
    api.get<Plan>(`/loads/${loadId}/fuel-plan`)
      .then((p) => { if (!stale) setPlan(p ?? null); })
      .catch((e) => { if (!stale && !(e instanceof ApiError && (e.code === "no_plan" || e.status === 403))) setProblem({ code: "", message: friendlyError(e, "Couldn't read the fuel plan.") }); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [loadId, canRead]);

  const calculate = async (startPct?: number) => {
    setWorking(true); setProblem(null);
    try {
      setPlan(await api.post<Plan>(`/loads/${loadId}/fuel-plan`, startPct == null ? {} : { start_fuel_pct: startPct }));
      setAsking(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "start_fuel_required") setAsking(true);
      else { setAsking(false); setProblem({ code: e instanceof ApiError ? e.code ?? "" : "", message: friendlyError(e, "Couldn't make a plan. Try again.") }); }
    } finally {
      setWorking(false);
    }
  };

  const send = async () => {
    setSending(true);
    try {
      await api.post(`/loads/${loadId}/fuel-plan/telegram`);
      toast.ok("Fuel plan sent to the driver's group");
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't send it. Try again."));
    } finally {
      setSending(false);
    }
  };

  if (!canRead || loading || (finished && !plan)) return null;

  const stops = plan?.stops ?? [];
  const old = stops.filter((s) => s.stale_price || (s.price_age_h ?? 0) >= 24);
  const savings = plan?.totals.savings;
  // The load's flag is about the plan it was read beside; one made here since is current.
  const outdated = !!plan && !finished && plan.id === outdatedPlanId;

  return (
    <>
      <div className="label">Fuel plan</div>

      {problem && (
        <div className="card" role="alert" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <AlertCircle size={17} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{TITLES[problem.code] ?? "Couldn't make a plan"}</div>
            <div className="sub" style={{ fontSize: 13, marginTop: 2, lineHeight: 1.45 }}>{problem.message}</div>
          </div>
        </div>
      )}

      {!plan ? (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="sub" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Finds the truck stops on the route and how many gallons to buy at each, so the trip costs the least.
          </div>
          {canMake && (
            <button className="btn small" disabled={working} onClick={() => calculate()}>
              {working ? <><span className="spinner" /> Finding stops and prices…</> : <><Fuel size={16} /> Calculate fuel plan</>}
            </button>
          )}
        </div>
      ) : (
        <>
          {outdated && (
            <div className="card" style={{ display: "flex", gap: 10, alignItems: "flex-start", borderColor: "var(--caution-line)", background: "var(--caution-soft)" }}>
              <AlertCircle size={17} style={{ color: "var(--caution)", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, lineHeight: 1.45 }}>The load changed after this plan (or the driver got another truck). Recalculate before sending it.</div>
            </div>
          )}
          <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, textAlign: "center", opacity: working || outdated ? 0.55 : 1 }}>
            <div><b style={{ fontSize: 18 }}>{plan.totals.stops}</b><div className="sub">stop{plan.totals.stops === 1 ? "" : "s"}</div></div>
            <div><b style={{ fontSize: 18 }}>{gal(plan.totals.gallons)}</b><div className="sub">gallons</div></div>
            <div>
              <b style={{ fontSize: 18, color: savings && savings > 0 ? "var(--pine)" : undefined }}>{savings != null ? `$${Math.round(savings).toLocaleString("en-US")}` : "—"}</b>
              <div className="sub">saved</div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden", opacity: working || outdated ? 0.55 : 1 }}>
            {stops.length === 0 && <div style={{ padding: "12px 13px", fontSize: 14 }}>No fuel stop needed: the tank covers the trip.</div>}
            {stops.map((s, i) => {
              const age = s.price_age_h;
              const isOld = s.stale_price || (age ?? 0) >= 24;
              return (
                <div key={s.seq} style={{ padding: "12px 13px", display: "flex", gap: 12, alignItems: "flex-start", borderTop: i ? "1px solid var(--line)" : "none" }}>
                  <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--pine)", color: "var(--on-pine)", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.seq}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ell" style={{ fontSize: 14, fontWeight: 600 }}>{s.name}{(s.city || s.state) ? ` · ${[s.city, s.state].filter(Boolean).join(", ")}` : ""}</div>
                    <div className="sub" style={{ fontSize: 12.5 }}>Mile {Math.round(s.route_mile).toLocaleString("en-US")} · buy {gal(s.buy_gal)} gal at {price(s.pump_price)}</div>
                    {s.price_source === "regional_average"
                      ? <div style={{ fontSize: 11.5, color: "var(--caution)", marginTop: 2 }}>area average price</div>
                      : isOld && age != null && <div style={{ fontSize: 11.5, color: "var(--caution)", marginTop: 2 }}>price posted {Math.round(age / 24)} day{Math.round(age / 24) === 1 ? "" : "s"} ago</div>}
                  </div>
                  <a href={mapsLink(s.location)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--pine)", textDecoration: "none", flexShrink: 0, paddingTop: 2 }}>Map</a>
                </div>
              );
            })}
          </div>

          {old.length > 0 && (
            <div className="sub" style={{ fontSize: 12.5, color: "var(--caution)", padding: "0 2px" }}>
              A price is over a day old, so it may have moved. Recalculate before the driver gets there.
            </div>
          )}
          <div className="sub" style={{ textAlign: "center" }}>
            Total {money(plan.totals.cost)} · calculated {fmtDateTime(plan.created_at)}
          </div>

          {canMake && (
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn ghost small" style={{ flex: 1 }} disabled={sending || working} onClick={send}>
                {sending ? <span className="spinner" /> : <Send size={15} />} Send plan
              </button>
              <button className="btn small" style={{ flex: 1 }} disabled={working} onClick={() => calculate()}>
                {working ? <span className="spinner" /> : <RefreshCw size={15} />} Recalculate
              </button>
            </div>
          )}
        </>
      )}

      {asking && <StartFuelSheet truckUnit={plan?.truck_unit || truckUnit} tankGal={plan?.assumptions.tank_gal ?? null} busy={working}
        onClose={() => !working && setAsking(false)} onSubmit={(pct) => calculate(pct)} />}
    </>
  );
}

// The ELD sends no fuel level: ask how full the tank is.
function StartFuelSheet({ truckUnit, tankGal, busy, onClose, onSubmit }: {
  truckUnit: string; tankGal: number | null; busy: boolean; onClose: () => void; onSubmit: (pct: number) => void;
}) {
  const [text, setText] = useState("");
  const pct = text === "" ? NaN : Number(text);
  const valid = Number.isFinite(pct) && pct >= 0 && pct <= 100;
  return (
    <Sheet title="How much fuel is in the truck?" onClose={onClose}>
      <div className="sub" style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 }}>
        {truckUnit ? `Truck ${truckUnit}'s` : "The truck's"} ELD isn't sending a fuel level. Ask the driver and enter it here.
      </div>
      <label className="field" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input aria-label="Fuel in the tank, percent" inputMode="decimal" placeholder="Fuel in the tank" autoComplete="off" value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))}
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "none", fontSize: 16, padding: 0 }} />
        <span style={{ color: "var(--muted)", fontSize: 14 }}>%</span>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, margin: "10px 0" }}>
        {([["¼", 25], ["½", 50], ["¾", 75], ["Full", 100]] as const).map(([l, v]) => (
          <button key={l} className={`chip ${pct === v ? "on" : ""}`} onClick={() => setText(String(v))}>{l === "Full" ? l : `${l} tank`}</button>
        ))}
      </div>
      {valid && tankGal != null && <div className="sub" style={{ marginBottom: 10 }}>= {gal((pct / 100) * tankGal)} gal of a {gal(tankGal)} gal tank</div>}
      <button className="btn" disabled={!valid || busy} onClick={() => valid && onSubmit(pct)}>{busy && <span className="spinner" />}Calculate</button>
    </Sheet>
  );
}
