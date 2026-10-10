import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { HandCoins, Search } from "lucide-react";
import { can, useAuth } from "../lib/auth";
import { fmtDate } from "../lib/dates";
import { friendlyError } from "../lib/errors";
import { money } from "../lib/loads";
import { adjustPayout, listPayouts, PAGE_SIZE, payoutDispatchers, type DispatcherOption, type Payout, type PayoutTotals } from "../lib/payouts";
import { periodRange, usePeriod } from "../lib/period";
import { haptic } from "../lib/telegram";
import { Kpis, PeriodChip, PickChip } from "../components/finance";
import { NumberInput, Sheet, toast } from "../components/ui";

/** Sign-aware: a negative net reads "-$50", not "$50". */
const cash = (n: number) => `${n < 0 ? "-" : ""}${money(Math.abs(n))}`;

// The Payouts half of Finance: completed loads as cards — the net on the right, the rate
// and anything added or deducted under it. Tapping one adjusts it, for someone allowed to.
export function Payouts() {
  const { user, companyId } = useAuth();
  const navigate = useNavigate();
  const canAdjust = can(user, "payouts", "update");

  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [period, setPeriod] = usePeriod();
  const [dispatcher, setDispatcher] = useState("");
  const [dispatchers, setDispatchers] = useState<DispatcherOption[]>([]);

  const [rows, setRows]       = useState<Payout[]>([]);
  const [total, setTotal]     = useState(0);
  const [totals, setTotals]   = useState<PayoutTotals>({ rate: 0, added: 0, deducted: 0, net: 0 });
  const [page, setPage]       = useState(1);
  const [again, setAgain]     = useState(0); // bumped to ask again after an adjustment
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [editing, setEditing] = useState<Payout | null>(null);

  const range = periodRange(period, user?.company?.week_start_day ?? 1);

  useEffect(() => { payoutDispatchers().then(setDispatchers).catch(() => setDispatchers([])); }, [companyId]);
  // Search waits for a pause in typing.
  useEffect(() => { const t = setTimeout(() => setQ(typed.trim()), 300); return () => clearTimeout(t); }, [typed]);
  // A new search, filter or company starts again from the first page.
  useEffect(() => { setPage(1); }, [q, period, dispatcher, companyId]);

  useEffect(() => {
    // Only the latest request may write: a slow answer to an earlier filter must not
    // overwrite a newer one.
    let stale = false;
    setLoading(true);
    listPayouts({ q, dispatcherId: dispatcher, from: range.from, to: range.to, page })
      .then((r) => {
        if (stale) return;
        setRows((prev) => (page === 1 ? r.items : [...prev, ...r.items.filter((x) => !prev.some((p) => p.id === x.id))]));
        setTotal(r.total); setTotals(r.totals); setError("");
      })
      .catch((e) => { if (!stale) setError(friendlyError(e, "Couldn't load payouts. Try again.")); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [q, dispatcher, range.from, range.to, page, companyId, again]);

  // The next page loads as the end of the list scrolls into view.
  const more = useRef<HTMLDivElement>(null);
  const hasMore = rows.length < total && rows.length >= page * PAGE_SIZE;
  useEffect(() => {
    const el = more.current;
    if (!el || !hasMore || loading) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setPage((p) => p + 1); }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading]);

  const first = loading && page === 1;
  const filtered = !!q || !!dispatcher || period !== "all";

  return (
    <>
      <label className="search">
        <Search size={17} />
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search driver, load, broker" aria-label="Search payouts" enterKeyHint="search" />
      </label>
      <div className="chips">
        <PeriodChip value={period} onPick={setPeriod} />
        <PickChip title="Dispatcher" value={dispatcher} on={!!dispatcher}
          label={dispatchers.find((d) => d.id === dispatcher)?.name ?? "All dispatchers"}
          options={[{ id: "", label: "All dispatchers" }, ...dispatchers.map((d) => ({ id: d.id, label: d.name }))]}
          onPick={setDispatcher} />
      </div>

      <div style={{ opacity: loading && rows.length > 0 ? 0.5 : 1, transition: "opacity 0.15s" }}>
        <Kpis items={[
          { label: `Rate · ${total} ${total === 1 ? "load" : "loads"}`, value: cash(totals.rate) },
          { label: "Net payout", value: cash(totals.net), bad: totals.net < 0 },
        ]} />
      </div>

      {error && <div className="error" role="alert">{error}</div>}
      {first && rows.length === 0 && <div className="center"><span className="spinner" /></div>}
      {!loading && !error && rows.length === 0 && <div className="center">{filtered ? "No payouts match." : "No payouts yet."}</div>}

      {rows.map((p) => {
        const body = <PayoutCard p={p} />;
        return canAdjust
          ? <button key={p.id} className="card load-card" onClick={() => { haptic.tap(); setEditing(p); }} aria-label={`Adjust payout ${p.loadRef}`}>{body}</button>
          : <div key={p.id} className="card load-card">{body}</div>;
      })}
      {!first && loading && <div className="center" style={{ flex: "none", padding: 12 }}><span className="spinner" /></div>}
      <div ref={more} />

      {/* What these loads earn each dispatcher — its own page, on the same period. It floats
          above the tab bar, where the Loads tab keeps its create button. */}
      <button className="fab" aria-label="Dispatcher KPI" title="Dispatcher KPI" onClick={() => { haptic.tap(); navigate("/finance/kpi"); }}><HandCoins size={23} /></button>

      {editing && (
        <AdjustSheet payout={editing} onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
            setEditing(null);
            // The totals changed too; ask again from the top.
            setPage(1); setAgain((n) => n + 1);
          }} />
      )}
    </>
  );
}

// A payout carries each end of the route as one line, street included when the load has
// one ("4750 W Mohave St, Phoenix, AZ"). A card has room for the city and state: the last
// two parts.
const place = (address: string) => address.split(",").map((x) => x.trim()).filter(Boolean).slice(-2).join(", ");

function PayoutCard({ p }: { p: Payout }) {
  const route = p.origin && p.destination ? `${place(p.origin)} → ${place(p.destination)}` : "";
  return (
    <>
      <div className="row">
        <span className="sub ell">{p.broker ? `${p.broker} - ` : ""}<b style={{ color: "var(--ink)" }}>{p.loadRef || "Load"}</b></span>
        <span className="sub" style={{ flexShrink: 0 }}>{fmtDate(p.completedAt)}</span>
      </div>
      <div className="row">
        <b className="ell" style={{ fontSize: 14.5 }}>{p.driver || "No driver"}</b>
        <b style={{ fontSize: 16, color: p.net < 0 ? "var(--danger)" : undefined }}>{cash(p.net)}</b>
      </div>
      <div className="row">
        <span className="sub ell">{route || p.dispatcher}</span>
        <span className="sub" style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {(p.added > 0 || p.deducted > 0) && <span>{money(p.rate)}</span>}
          {p.added > 0 && <span style={{ color: "var(--pine)", fontWeight: 600 }}>+{money(p.added)}</span>}
          {p.deducted > 0 && <span style={{ color: "var(--danger)", fontWeight: 600 }}>-{money(p.deducted)}</span>}
        </span>
      </div>
      {(p.notes || (p.dispatcher && route)) && (
        <div className="sub ell" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          {[route ? p.dispatcher : "", p.notes].filter(Boolean).join(" · ")}
        </div>
      )}
    </>
  );
}

// ─── Adjusting a payout ───────────────────────────────────────────────────────

// The rate is the load's and can't be changed here; what can is what was added on top,
// what was taken off, and a note saying why.
function AdjustSheet({ payout, onClose, onSaved }: { payout: Payout; onClose: () => void; onSaved: (p: Payout) => void }) {
  const [added, setAdded]       = useState(payout.added);
  const [deducted, setDeducted] = useState(payout.deducted);
  const [notes, setNotes]       = useState(payout.notes);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");

  async function save() {
    setBusy(true); setError("");
    try {
      const updated = await adjustPayout(payout.id, { added, deducted, notes: notes.trim() });
      toast.ok("Payout updated");
      onSaved(updated);
    } catch (e) {
      setError(friendlyError(e, "Couldn't save the adjustment. Try again."));
      setBusy(false);
    }
  }

  return (
    <Sheet title="Adjust payout" onClose={() => { if (!busy) onClose(); }}>
      <div className="sub" style={{ marginTop: -4, marginBottom: 6 }}>{[payout.loadRef, payout.driver, `rate ${money(payout.rate)}`].filter(Boolean).join(" · ")}</div>
      <div className="two">
        <div><div className="flabel" style={{ marginBottom: 8 }}>Added</div><NumberInput label="Added" prefix="$" value={added} onChange={setAdded} /></div>
        <div><div className="flabel" style={{ marginBottom: 8 }}>Deducted</div><NumberInput label="Deducted" prefix="$" value={deducted} onChange={setDeducted} /></div>
      </div>
      <div className="flabel" style={{ margin: "10px 2px 8px" }}>Notes</div>
      <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why it changed" aria-label="Notes" maxLength={500} />
      <div className="row" style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 12 }}>
        <span className="sub">Net payout</span>
        <b style={{ fontSize: 20 }}>{cash(payout.rate + added - deducted)}</b>
      </div>
      {error && <div className="error" role="alert" style={{ marginTop: 8 }}>{error}</div>}
      <button className="btn" style={{ marginTop: 10 }} disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : "Save"}</button>
    </Sheet>
  );
}
