import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Download } from "lucide-react";
import { useAuth } from "../lib/auth";
import { listInvoices, openInvoicePdf, type Invoice } from "../lib/billing";
import { fmtDate } from "../lib/dates";
import { friendlyError } from "../lib/errors";
import { haptic } from "../lib/telegram";
import { toast, TopBar } from "../components/ui";

const amountOf = (inv: Invoice) => {
  try { return inv.amount.toLocaleString("en-US", { style: "currency", currency: inv.currency || "USD" }); }
  catch { return `$${inv.amount.toLocaleString("en-US")}`; }
};
const paid = (status: string) => ["paid", "active"].includes(status.toLowerCase());
const label = (status: string) => (status ? status[0].toUpperCase() + status.slice(1).toLowerCase() : "");

// Invoices, opened from the Profile: what the company has been billed for its plan, newest
// first, each with its PDF. The owner's only — billing is theirs.
export function InvoicesPage() {
  const { companyId } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows]   = useState<Invoice[] | null>(null);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState("");

  useEffect(() => {
    let stale = false;
    setRows(null); setError("");
    listInvoices(companyId)
      .then((r) => { if (!stale) setRows(r); })
      .catch((e) => { if (!stale) setError(friendlyError(e, "Couldn't load invoices. Try again.")); });
    return () => { stale = true; };
  }, [companyId]);

  async function open(inv: Invoice) {
    if (opening) return;
    haptic.tap(); setOpening(inv.id);
    try { await openInvoicePdf(companyId, inv); }
    catch (e) { toast.error(friendlyError(e, "Couldn't open that invoice.")); }
    finally { setOpening(""); }
  }

  return (
    <div className="screen">
      <TopBar title="Invoices" onBack={() => navigate("/profile")} />
      <div className="page-body">
        {error && <div className="error" role="alert">{error}</div>}
        {!rows && !error && <div className="center"><span className="spinner" /></div>}
        {rows?.length === 0 && <div className="center">No invoices yet.</div>}
        {rows && rows.length > 0 && (
          <div className="list">
            {rows.map((inv) => (
              <button key={inv.id} onClick={() => open(inv)} disabled={!!opening} aria-label={`Open invoice ${inv.number}`}>
                <div className="row"><b className="ell">{amountOf(inv)}</b>
                  <span className="sub" style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {inv.status && <span style={{ fontWeight: 600, color: paid(inv.status) ? "var(--pine)" : "var(--danger)" }}>{label(inv.status)}</span>}
                    {opening === inv.id ? <span className="spinner" style={{ width: 15, height: 15 }} /> : <Download size={15} />}
                  </span>
                </div>
                <div className="sub ell">{[fmtDate(inv.date), inv.plan && `${inv.plan} plan`, inv.number].filter(Boolean).join(" · ")}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
