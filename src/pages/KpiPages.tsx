import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ChevronRight } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fmtDate } from "../lib/dates";
import { friendlyError } from "../lib/errors";
import { kpiLoads, kpiSummary, percentLabel, type KpiLoad, type KpiSummary } from "../lib/payouts";
import { periodRange, usePeriod } from "../lib/period";
import { cents, dollars, Kpis, PeriodChip } from "../components/finance";
import { TopBar } from "../components/ui";

// Dispatcher KPI: what each dispatcher earned in a period — their percent of the loads of
// theirs that were completed in it. The list, then one dispatcher's loads behind the number.

const HOW = "KPI = load rate × the dispatcher's percent on the day it was completed. Added and deducted amounts don't count.";

function useSummary() {
  const { user, companyId } = useAuth();
  const [period, setPeriod] = usePeriod("payouts");
  const range = periodRange(period, user?.company?.week_start_day ?? 1);
  const [data, setData] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let stale = false;
    setLoading(true); setError("");
    kpiSummary(range)
      .then((d) => { if (!stale) setData(d); })
      .catch((e) => { if (!stale) setError(friendlyError(e, "Couldn't work out the KPI. Try again.")); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, companyId]);
  return { period, setPeriod, range, data, loading, error };
}

export function KpiPage() {
  const navigate = useNavigate();
  const { period, setPeriod, data, loading, error } = useSummary();

  return (
    <>
      <TopBar title="Dispatcher KPI" onBack={() => navigate("/finance?tab=payouts")} />
      <div className="page-body">
        <div className="sticky"><div className="chips"><PeriodChip value={period} onPick={setPeriod} /></div></div>
        {error && <div className="error" role="alert">{error}</div>}
        {loading && !data && <div className="center"><span className="spinner" /></div>}
        {data && !error && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}>
            <Kpis items={[
              { label: `Total rate · ${data.loads} ${data.loads === 1 ? "load" : "loads"}`, value: dollars(data.rateTotal) },
              { label: "KPI to pay", value: cents(data.amount) },
            ]} />
            {data.rows.length === 0 ? <div className="center">No completed loads in this period.</div> : (
              <div className="list">
                {data.rows.map((r) => (
                  <button key={r.id} onClick={() => navigate(`/finance/kpi/${r.id}`)}>
                    <div className="row"><b className="ell">{r.name}</b><b style={r.amount > 0 ? undefined : { color: "var(--muted)" }}>{cents(r.amount)}</b></div>
                    <div className="row">
                      <span className="sub ell">{[`${r.loads} ${r.loads === 1 ? "load" : "loads"}`, dollars(r.rateTotal), percentLabel(r) || "No percent"].join(" · ")}</span>
                      <ChevronRight size={15} style={{ color: "var(--muted)", flexShrink: 0 }} />
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="note">{HOW}</div>
          </div>
        )}
      </div>
    </>
  );
}

export function KpiDispatcherPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { companyId } = useAuth();
  const { period, setPeriod, range, data, error } = useSummary();
  const row = data?.rows.find((r) => r.id === id);

  const [loads, setLoads] = useState<KpiLoad[] | null>(null);
  const [loadsError, setLoadsError] = useState("");
  useEffect(() => {
    let stale = false;
    setLoads(null); setLoadsError("");
    kpiLoads(id, range)
      .then((rows) => { if (!stale) setLoads(rows); })
      .catch((e) => { if (!stale) setLoadsError(friendlyError(e, "Couldn't load these loads. Try again.")); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, range.from, range.to, companyId]);

  return (
    <>
      <TopBar title={row?.name ?? "Dispatcher"} onBack={() => navigate("/finance/kpi")} />
      <div className="page-body">
        <div className="sticky"><div className="chips"><PeriodChip value={period} onPick={setPeriod} /></div></div>
        {(error || loadsError) && <div className="error" role="alert">{error || loadsError}</div>}
        {row && (
          <Kpis items={[
            { label: `Total rate · ${row.loads} ${row.loads === 1 ? "load" : "loads"}`, value: dollars(row.rateTotal) },
            { label: `KPI · ${percentLabel(row) || "no percent"}`, value: cents(row.amount) },
          ]} />
        )}
        {!loads && !loadsError && <div className="center"><span className="spinner" /></div>}
        {loads?.length === 0 && <div className="center">No completed loads in this period.</div>}
        {loads && loads.length > 0 && (
          <div className="list">
            {loads.map((l) => (
              <div key={l.id}>
                <div className="row">
                  <span className="ell" style={{ fontSize: 13.5 }}>{l.broker && <span className="sub">{l.broker} - </span>}<b style={{ fontSize: 13.5 }}>{l.loadRef || "Load"}</b></span>
                  <b>{cents(l.amount)}</b>
                </div>
                <div className="sub ell">{[l.driver, fmtDate(l.completedAt), `${dollars(l.rate)} × ${l.percent}%`].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
