import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Plus, Search } from "lucide-react";
import { can, useAuth } from "../lib/auth";
import { friendlyError } from "../lib/errors";
import { cityState, listLoads, milesText, money, PAGE_SIZE, type Load } from "../lib/loads";
import { ALL_STATUSES, STATUS_CONFIG, type Status } from "../lib/statuses";
import { haptic } from "../lib/telegram";
import { StatusChip } from "../components/ui";

// The Loads tab: search, a status filter, and one card per load — a line from pickup to
// delivery, with the driver and the rate under it.
export function LoadsPage() {
  const { user, companyId } = useAuth();
  const navigate = useNavigate();
  const [typed, setTyped]     = useState("");
  const [q, setQ]             = useState("");
  const [status, setStatus]   = useState<Status | "">("");
  const [loads, setLoads]     = useState<Load[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // Search waits for a pause in typing.
  useEffect(() => { const t = setTimeout(() => setQ(typed.trim()), 300); return () => clearTimeout(t); }, [typed]);
  // A new search, filter or company starts again from the first page.
  useEffect(() => { setPage(1); }, [q, status, companyId]);

  useEffect(() => {
    // Only the latest request may write: a slow answer to an earlier filter must not
    // overwrite a newer one.
    let stale = false;
    setLoading(true);
    listLoads({ q, status, page })
      .then(({ items, total: t }) => {
        if (stale) return;
        setLoads((prev) => (page === 1 ? items : [...prev, ...items.filter((l) => !prev.some((p) => p.id === l.id))]));
        setTotal(t);
        setError("");
      })
      .catch((e) => { if (!stale) setError(friendlyError(e, "Couldn't load the loads. Try again.")); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [q, status, page, companyId]);

  // The next page loads as the end of the list scrolls into view.
  const more = useRef<HTMLDivElement>(null);
  const hasMore = loads.length < total && loads.length >= page * PAGE_SIZE;
  useEffect(() => {
    const el = more.current;
    if (!el || !hasMore || loading) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setPage((p) => p + 1); }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading]);

  const first = loading && page === 1;

  return (
    <>
      <div className="scroll">
        <h1 className="title">Loads</h1>
        <label className="search">
          <Search size={17} />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search load, broker, driver" aria-label="Search loads" enterKeyHint="search" />
        </label>
        <div className="chips" role="group" aria-label="Filter by status">
          <button className={`chip ${status === "" ? "on" : ""}`} onClick={() => setStatus("")}>All</button>
          {ALL_STATUSES.map((s) => (
            <button key={s} className={`chip ${status === s ? "on" : ""}`} onClick={() => { haptic.tap(); setStatus(status === s ? "" : s); }}>{STATUS_CONFIG[s].label}</button>
          ))}
        </div>

        {error && <div className="error" role="alert">{error}</div>}
        {first && <div className="center"><span className="spinner" /></div>}
        {!first && !error && loads.length === 0 && (
          <div className="center">{q || status ? "No loads match." : "No loads yet."}</div>
        )}

        {!first && loads.map((l) => (
          <button key={l.id} className="card load-card" onClick={() => navigate(`/loads/${l.id}`)}>
            <div className="row">
              <span className="sub ell">{l.broker ? `${l.broker} - ` : ""}<b style={{ color: "var(--ink)" }}>{l.loadId}</b></span>
              <StatusChip status={l.status} />
            </div>
            {/* Every stop, in order: the pickup, each stop between, the delivery. */}
            {l.stops.length === 0 ? <span className="sub">No route yet</span> : (
              <div className="lane">
                {l.stops.map((s, i) => {
                  const last = i === l.stops.length - 1 && i > 0;
                  return (
                    <div key={i} style={{ display: "contents" }}>
                      <i className={last ? "end" : i > 0 ? "mid" : undefined} />
                      <b className="ell" style={s.done ? { color: "var(--muted)", textDecoration: "line-through" } : undefined}>{cityState(s) || "No address"}</b>
                      <span>{s.appt}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 9 }}>
              <span className="sub ell">{[l.driver || "Unassigned", l.miles ? milesText(l.miles) : ""].filter(Boolean).join(" · ")}</span>
              <b style={{ fontSize: 16 }}>{money(l.payout)}</b>
            </div>
          </button>
        ))}
        {!first && loading && <div className="center" style={{ flex: "none", padding: 12 }}><span className="spinner" /></div>}
        <div ref={more} />
      </div>

      {can(user, "loads", "create") && (
        <button className="fab" aria-label="New load" onClick={() => { haptic.tap(); navigate("/loads/new"); }}><Plus size={24} strokeWidth={2.4} /></button>
      )}
    </>
  );
}
