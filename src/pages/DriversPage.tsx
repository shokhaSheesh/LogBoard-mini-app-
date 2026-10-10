import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Plus, Search } from "lucide-react";
import { can, useAuth } from "../lib/auth";
import { displayName, listDrivers, PAGE_SIZE, type Driver } from "../lib/drivers";
import { friendlyError } from "../lib/errors";
import { ALL_STATUSES, STATUS_CONFIG, type Status } from "../lib/statuses";
import { haptic } from "../lib/telegram";
import { StatusChip } from "../components/ui";

// What kind of driver the list is showing. Kept while the app is open, so coming back from
// a driver lands on the same list.
let lastTeam = false;

// The Drivers tab: the roster. Solo drivers and teams are two halves, switched at the top
// like Finance; under that, search and a status filter as on Loads. A driver opens onto
// their page.
export function DriversPage() {
  const { user, companyId } = useAuth();
  const navigate = useNavigate();
  const [team, setTeam]       = useState(lastTeam);
  const [typed, setTyped]     = useState("");
  const [q, setQ]             = useState("");
  const [status, setStatus]   = useState<Status | "">("");
  const [rows, setRows]       = useState<Driver[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // Search waits for a pause in typing.
  useEffect(() => { const t = setTimeout(() => setQ(typed.trim()), 300); return () => clearTimeout(t); }, [typed]);
  // A new search, filter or company starts again from the first page.
  useEffect(() => { setPage(1); }, [q, status, team, companyId]);

  useEffect(() => {
    // Only the latest request may write: a slow answer to an earlier filter must not
    // overwrite a newer one.
    let stale = false;
    setLoading(true);
    listDrivers({ q, status, team, page })
      .then((r) => {
        if (stale) return;
        setRows((prev) => (page === 1 ? r.items : [...prev, ...r.items.filter((x) => !prev.some((p) => p.id === x.id))]));
        setTotal(r.total); setError("");
      })
      .catch((e) => { if (!stale) setError(friendlyError(e, "Couldn't load drivers. Try again.")); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [q, status, team, page, companyId]);

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
  const pick = (t: boolean) => { haptic.tap(); lastTeam = t; setRows([]); setTeam(t); };

  return (
    <>
      <div className="scroll">
        <h1 className="title">Drivers</h1>
        <div className="sticky">
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={!team} className={!team ? "on" : undefined} onClick={() => pick(false)}>Solo</button>
            <button role="tab" aria-selected={team} className={team ? "on" : undefined} onClick={() => pick(true)}>Team</button>
          </div>
          <label className="search">
            <Search size={17} />
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search driver, unit, phone" aria-label="Search drivers" enterKeyHint="search" />
          </label>
          <div className="chips" role="group" aria-label="Filter by status">
            <button className={`chip ${status === "" ? "on" : ""}`} onClick={() => setStatus("")}>All</button>
            {ALL_STATUSES.map((s) => (
              <button key={s} className={`chip ${status === s ? "on" : ""}`} onClick={() => { haptic.tap(); setStatus(status === s ? "" : s); }}>{STATUS_CONFIG[s].label}</button>
            ))}
          </div>
        </div>

        {error && <div className="error" role="alert">{error}</div>}
        {first && rows.length === 0 && <div className="center"><span className="spinner" /></div>}
        {!loading && !error && rows.length === 0 && <div className="center">{q || status ? "No drivers match." : team ? "No team drivers yet." : "No drivers yet."}</div>}

        {rows.length > 0 && (
          <div className="list" style={{ opacity: first ? 0.5 : 1, transition: "opacity 0.15s" }}>
            {rows.map((d) => (
              <button key={d.id} onClick={() => navigate(`/drivers/${d.id}`)}>
                <div className="row"><b className="ell">{displayName(d)}</b><StatusChip status={d.status} /></div>
                <div className="sub ell">
                  {[d.type, d.truck && `truck ${d.truck}`, d.trailer && `trailer ${d.trailer}`, d.phone].filter(Boolean).join(" · ")}
                </div>
              </button>
            ))}
          </div>
        )}
        {!first && loading && <div className="center" style={{ flex: "none", padding: 12 }}><span className="spinner" /></div>}
        <div ref={more} />
      </div>

      {can(user, "drivers", "create") && (
        <button className="fab" aria-label="New driver" onClick={() => { haptic.tap(); navigate(`/drivers/new${team ? "?team=1" : ""}`); }}><Plus size={24} strokeWidth={2.4} /></button>
      )}
    </>
  );
}
