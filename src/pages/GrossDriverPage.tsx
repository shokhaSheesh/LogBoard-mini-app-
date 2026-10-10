import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Check, Search } from "lucide-react";
import { can, useAuth } from "../lib/auth";
import { fmtDate } from "../lib/dates";
import { friendlyError } from "../lib/errors";
import { daysBetween, driverLoads, EMPTY_DAY, saveDay, useGrossWeek, weekday, type DayCell, type GrossDriver, type LoadPick } from "../lib/gross";
import { ALL_STATUSES, STATUS_CONFIG, type Status } from "../lib/statuses";
import { haptic } from "../lib/telegram";
import { Bar, dollars, Kpis, percentOf, perMile, WeekBar } from "../components/finance";
import { NumberInput, Sheet, SheetRow, StatusChip, toast, TopBar } from "../components/ui";
import { money } from "../lib/loads";

// One driver's week: the totals, then a row per day. A day holds money from loads, a
// status, or nothing; tapping it changes that, for someone allowed to.
export function GrossDriverPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { week, loading, error, query, onCurrent, shift, current, refresh } = useGrossWeek();
  const [editing, setEditing] = useState<string | null>(null);

  const driver = week?.drivers.find((d) => d.id === id);
  // A week the driver has no numbers in still needs a title.
  const name = useRef("");
  if (driver) name.current = driver.name;

  const editable = !!driver && !driver.removedOn && can(user, "gross", "update");

  return (
    <>
      <TopBar title={name.current || "Driver"} onBack={() => navigate(`/finance${query}`)} />
      <div className="page-body">
        <WeekBar from={week?.from ?? ""} to={week?.to ?? ""} onShift={shift} onCurrent={current} isCurrent={onCurrent} />
        {error && <div className="error" role="alert">{error}</div>}
        {loading && !week && <div className="center"><span className="spinner" /></div>}
        {week && !error && !driver && <div className="center">Nothing for this driver in this week.</div>}
        {week && !error && driver && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}>
            <Kpis items={[
              { label: "Total", value: dollars(driver.total) },
              { label: "Driver pay", value: dollars(driver.driverPay) },
              { label: "Company profit", value: dollars(driver.profit), bad: driver.profit < 0 },
              { label: `Rate per mile · ${Math.round(driver.miles).toLocaleString("en-US")} mi`, value: perMile(driver.rpm) },
            ]} />
            {driver.target > 0 && (
              <div className="card" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <div className="row"><span className="sub">Weekly target {dollars(driver.target)}</span><b style={{ fontSize: 13 }}>{percentOf(driver.total, driver.target)}%</b></div>
                <Bar percent={percentOf(driver.total, driver.target)} />
              </div>
            )}
            {driver.removedOn && <div className="note">Removed {fmtDate(driver.removedOn)}. These days can't be changed.</div>}
            <div className="list">
              {daysBetween(week.from, week.to).map((date) => {
                const cell = driver.days[date] ?? EMPTY_DAY;
                const row = <DayRow date={date} cell={cell} />;
                return editable
                  ? <button key={date} onClick={() => { haptic.tap(); setEditing(date); }} aria-label={`Change ${weekday(date)} ${fmtDate(date)}`}>{row}</button>
                  : <div key={date}>{row}</div>;
              })}
            </div>
          </div>
        )}
      </div>

      {editing && driver && (
        <DaySheet driver={driver} date={editing} cell={driver.days[editing] ?? EMPTY_DAY}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void refresh(); }} />
      )}
    </>
  );
}

function DayRow({ date, cell }: { date: string; cell: DayCell }) {
  const status = cell.type !== "load" && cell.type !== "empty" ? cell.type : null;
  return (
    <div className="row">
      <span className="sub" style={{ width: 74, flexShrink: 0 }}>{weekday(date)} {fmtDate(date).slice(0, 5)}</span>
      <span className="ell" style={{ flex: 1, fontSize: 13.5, fontWeight: cell.loads.length ? 600 : 400, color: cell.loads.length ? undefined : "var(--muted)" }}>
        {status ? "" : cell.loads.length ? cell.loads.join(" / ") : cell.type === "load" ? "No load picked" : "Empty"}
      </span>
      {status ? <StatusChip status={status} /> : cell.type === "load" ? <b>{money(cell.amount)}</b> : <b style={{ color: "var(--muted)" }}>—</b>}
    </div>
  );
}

// ─── Changing a day ───────────────────────────────────────────────────────────

// Two kinds of day: Load (an amount, and the loads it belongs to) or Status (what the
// driver was doing instead). Clearing empties the day.
function DaySheet({ driver, date, cell, onClose, onSaved }: { driver: GrossDriver; date: string; cell: DayCell; onClose: () => void; onSaved: () => void }) {
  const wasStatus = cell.type !== "load" && cell.type !== "empty";
  // An empty day opens on Load: entering money is what this is mostly used for.
  const [mode, setMode]     = useState<"load" | "status">(wasStatus ? "status" : "load");
  const [amount, setAmount] = useState(cell.type === "load" ? cell.amount : 0);
  const [picked, setPicked] = useState<string[]>(cell.loads);
  const [status, setStatus] = useState<Status | null>(wasStatus ? (cell.type as Status) : null);
  const [busy, setBusy]     = useState<"save" | "clear" | null>(null);
  const [error, setError]   = useState("");

  const [q, setQ] = useState("");
  const [loads, setLoads] = useState<LoadPick[] | null>(null);
  // Every payout seen so far, so the sum stays right for a ticked load the search has
  // since filtered out.
  const payouts = useRef(new Map<string, number>());
  useEffect(() => {
    if (mode !== "load") return;
    let stale = false;
    const t = setTimeout(() => {
      driverLoads(driver.id, q.trim())
        .then((rows) => { if (stale) return; rows.forEach((r) => payouts.current.set(r.ref, r.payout)); setLoads(rows); })
        .catch(() => { if (!stale) setLoads([]); });
    }, q ? 300 : 0);
    return () => { stale = true; clearTimeout(t); };
  }, [mode, q, driver.id]);

  // Ticking loads fills the amount with their rates; it can still be typed over.
  function toggle(ref: string) {
    const next = picked.includes(ref) ? picked.filter((r) => r !== ref) : [...picked, ref];
    setPicked(next);
    setAmount(next.reduce((sum, r) => sum + (payouts.current.get(r) ?? 0), 0));
  }

  async function save(next: DayCell, which: "save" | "clear") {
    setBusy(which); setError("");
    try {
      await saveDay(driver.id, date, next);
      toast.ok(which === "clear" ? "Day cleared" : "Saved");
      onSaved();
    } catch (e) {
      setError(friendlyError(e, "Couldn't save the day. Try again."));
      setBusy(null);
    }
  }

  // A Load day needs something in it; a day with neither money nor a load is "Clear day".
  const canSave = mode === "load" ? amount > 0 || picked.length > 0 : status !== null;
  const submit = () => save(mode === "load" ? { type: "load", amount, loads: picked } : { type: status as Status, amount: 0, loads: [] }, "save");

  return (
    <Sheet title={`${driver.name} · ${weekday(date)} ${fmtDate(date)}`} onClose={() => { if (!busy) onClose(); }} tall={mode === "load"}>
      <div className="seg" role="tablist" style={{ marginBottom: 8 }}>
        {(["load", "status"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "on" : undefined} onClick={() => setMode(m)}>{m === "load" ? "Load" : "Status"}</button>
        ))}
      </div>

      {mode === "load" && (
        <>
          <div className="flabel" style={{ marginBottom: 8 }}>Amount</div>
          <NumberInput label="Amount" prefix="$" value={amount} onChange={setAmount} />
          <div className="flabel" style={{ margin: "10px 2px 8px" }}>Loads this day</div>
          <label className="search"><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this driver's loads" aria-label="Search this driver's loads" /></label>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 96 }}>
            {!loads && <div className="center"><span className="spinner" /></div>}
            {loads?.length === 0 && <div className="center" style={{ padding: 16 }}>{q ? "No loads match." : "This driver has no loads."}</div>}
            {loads?.map((l) => (
              <SheetRow key={l.ref} selected={picked.includes(l.ref)} onClick={() => toggle(l.ref)}>
                <span className="ell" style={{ flex: 1 }}>{l.ref}{l.route && <span className="sub"> · {l.route}</span>}</span>
                <span className="sub">{money(l.payout)}</span>
                <Check size={18} style={{ color: "var(--pine)", visibility: picked.includes(l.ref) ? "visible" : "hidden" }} />
              </SheetRow>
            ))}
          </div>
        </>
      )}

      {mode === "status" && ALL_STATUSES.map((s) => (
        <SheetRow key={s} selected={status === s} onClick={() => setStatus(s)}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_CONFIG[s].bg, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{STATUS_CONFIG[s].label}</span>
          {status === s && <Check size={18} style={{ color: "var(--pine)" }} />}
        </SheetRow>
      ))}

      {error && <div className="error" role="alert" style={{ marginTop: 8 }}>{error}</div>}
      <div className="two" style={{ marginTop: 10, flexShrink: 0 }}>
        <button className="btn ghost" disabled={!!busy || cell.type === "empty"} onClick={() => save(EMPTY_DAY, "clear")}>
          {busy === "clear" ? <span className="spinner" /> : "Clear day"}
        </button>
        <button className="btn" disabled={!!busy || !canSave} onClick={submit}>
          {busy === "save" ? <span className="spinner" /> : "Save"}
        </button>
      </div>
    </Sheet>
  );
}
