import { useEffect, useState } from "react";
import { Home, Plus } from "lucide-react";
import { deleteHomePeriod, listHomePeriods, saveHomePeriod, type HomePeriod } from "../lib/drivers";
import { fmtDate, fmtDateRange } from "../lib/dates";
import { friendlyError } from "../lib/errors";
import { haptic } from "../lib/telegram";
import { DateField } from "./pickers";
import { Sheet, toast } from "./ui";

// A driver's home time: the stretches they spend at home, kept as a history, so everyone can
// see when a driver is away and when they're back. A record only — the status is still set
// by hand.

const pad2 = (n: number) => String(n).padStart(2, "0");
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const isNow = (p: HomePeriod) => p.startDate <= todayIso() && todayIso() <= p.endDate;
// Inclusive: 20–27 is eight days at home.
const daysOf = (p: HomePeriod) => Math.round((Date.parse(p.endDate) - Date.parse(p.startDate)) / 86400000) + 1;

/** On a driver in the list: the home period on today, or the next one. */
export function HomeTag({ home }: { home: HomePeriod }) {
  return (
    <span className={`home-tag ${isNow(home) ? "now" : ""}`}>
      <Home size={12} /> {isNow(home) ? `Home until ${fmtDate(home.endDate)}` : `Home ${fmtDateRange(home.startDate, home.endDate)}`}
    </span>
  );
}

/** The section on a driver's page: every period, newest first, with add, change and remove. */
export function HomeTime({ driverId, canChange }: { driverId: string; canChange: boolean }) {
  const [periods, setPeriods] = useState<HomePeriod[] | null>(null);
  const [editing, setEditing] = useState<{ id: string; from: string; until: string } | null>(null);
  const [removing, setRemoving] = useState<HomePeriod | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stale = false;
    setLoadError("");
    listHomePeriods(driverId)
      .then((ps) => { if (!stale) setPeriods(ps); })
      .catch((e) => { if (!stale) { setPeriods(null); setLoadError(friendlyError(e, "Couldn't load the home time.")); } });
    return () => { stale = true; };
  }, [driverId, attempt]);

  // A failed read says so, rather than leaving the driver looking as if it had no home time.
  if (!periods) {
    if (!loadError) return null;
    return (
      <>
        <div className="label">Home time</div>
        <div className="card sub" role="alert" style={{ fontSize: 12.5, color: "var(--danger)" }}>{loadError}</div>
        <button className="btn ghost small" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
      </>
    );
  }

  const save = async () => {
    if (!editing) return;
    if (!editing.from || !editing.until) { setError("Pick both days."); return; }
    setBusy(true); setError("");
    try {
      const saved = await saveHomePeriod(driverId, { id: editing.id || undefined, startDate: editing.from, endDate: editing.until });
      setPeriods((ps) => [saved, ...(ps ?? []).filter((p) => p.id !== saved.id)].sort((a, b) => b.startDate.localeCompare(a.startDate)));
      toast.ok(editing.id ? "Home time changed" : "Home time added");
      setEditing(null);
    } catch (e) {
      setError(friendlyError(e, "Couldn't save the home time."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await deleteHomePeriod(driverId, removing.id);
      setPeriods((ps) => (ps ?? []).filter((p) => p.id !== removing.id));
      toast.ok("Home time removed");
      setRemoving(null);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't remove the home time."));
    } finally {
      setBusy(false);
    }
  };

  const open = (p?: HomePeriod) => { haptic.tap(); setError(""); setEditing(p ? { id: p.id, from: p.startDate, until: p.endDate } : { id: "", from: "", until: "" }); };

  return (
    <>
      <div className="label">Home time</div>
      {periods.length > 0 ? (
        <div className="rows">
          {periods.map((p) => {
            const inner = <>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600 }}>{fmtDateRange(p.startDate, p.endDate)}</span>
                <span className="sub">{daysOf(p)} {daysOf(p) === 1 ? "day" : "days"}{isNow(p) ? " · at home now" : p.startDate > todayIso() ? " · coming up" : ""}</span>
              </span>
              <Home size={16} style={{ color: isNow(p) ? "var(--pine)" : "var(--muted)", flexShrink: 0 }} />
            </>;
            return canChange ? <button key={p.id} onClick={() => open(p)}>{inner}</button> : <div key={p.id}>{inner}</div>;
          })}
        </div>
      ) : (
        <div className="card sub" style={{ fontSize: 12.5 }}>When this driver goes home, add the days here so everyone can see when they're back.</div>
      )}
      {canChange && <button className="btn ghost small" onClick={() => open()}><Plus size={16} /> Add home time</button>}

      {editing && (
        <Sheet title={editing.id ? "Change home time" : "Add home time"} onClose={() => !busy && setEditing(null)}>
          <div className="two" style={{ marginTop: 4 }}>
            <div><div className="flabel" style={{ marginBottom: 6 }}>From</div>
              <DateField label="Home from" value={editing.from} required onChange={(from) => { setError(""); setEditing({ ...editing, from, until: editing.until && editing.until < from ? from : editing.until }); }} /></div>
            <div><div className="flabel" style={{ marginBottom: 6 }}>Until</div>
              <DateField label="Home until" value={editing.until} min={editing.from || undefined} required onChange={(until) => { setError(""); setEditing({ ...editing, until }); }} /></div>
          </div>
          {error && <div className="error" role="alert" style={{ marginTop: 10 }}>{error}</div>}
          <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={save}>{busy && <span className="spinner" />}{editing.id ? "Save" : "Add"}</button>
          {editing.id && (
            <button className="btn ghost" style={{ marginTop: 8, color: "var(--danger)" }} disabled={busy}
              onClick={() => { const p = periods.find((x) => x.id === editing.id); setEditing(null); if (p) setRemoving(p); }}>Remove</button>
          )}
        </Sheet>
      )}

      {removing && (
        <Sheet title="Remove this home time?" onClose={() => !busy && setRemoving(null)}>
          <div className="sub" style={{ fontSize: 14, marginBottom: 10 }}>{fmtDateRange(removing.startDate, removing.endDate)} will be taken off this driver's history.</div>
          <button className="btn danger" disabled={busy} onClick={remove}>{busy && <span className="spinner" />}Remove</button>
          <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy} onClick={() => setRemoving(null)}>Keep it</button>
        </Sheet>
      )}
    </>
  );
}
