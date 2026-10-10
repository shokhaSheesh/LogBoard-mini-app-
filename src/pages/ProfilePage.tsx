import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Building2, Check, ChevronRight, LogOut, ReceiptText, Send, Truck } from "lucide-react";
import { can, useAuth, type Company } from "../lib/auth";
import { getBilling, getFleetCounts, listInvoices, type Billing } from "../lib/billing";
import { fmtDate } from "../lib/dates";
import { friendlyError } from "../lib/errors";
import { haptic, inTelegram } from "../lib/telegram";
import { SlideToConfirm } from "../components/SlideToConfirm";
import { Sheet, toast } from "../components/ui";

const ROLE: Record<string, string> = { owner: "Owner", dispatcher: "Dispatcher", updater: "Updater" };
const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

// The Profile tab: who is signed in, the company's plan (for its owner), the company and
// its fleet, and the way out.
export function ProfilePage() {
  const { user, companies, companyId, linked, switchCompany, logout } = useAuth();
  const navigate = useNavigate();
  const [picking, setPicking]     = useState(false);
  const [switching, setSwitching] = useState("");
  const [leaving, setLeaving]     = useState(false);
  const [billing, setBilling]     = useState<Billing | null>(null);
  const [fleet, setFleet]         = useState<{ trucks: number; trailers: number } | null>(null);
  const [invoices, setInvoices]   = useState<number | null>(null);

  const isOwner = user?.role === "owner";
  const seesFleet = can(user, "equipments");
  // All extras on this page: if one can't be read, its part simply isn't shown.
  useEffect(() => {
    let stale = false;
    setBilling(null); setFleet(null); setInvoices(null);
    if (isOwner && companyId) getBilling(companyId).then((b) => { if (!stale) setBilling(b); }).catch(() => {});
    if (isOwner && companyId) listInvoices(companyId).then((r) => { if (!stale) setInvoices(r.length); }).catch(() => {});
    if (seesFleet && companyId) getFleetCounts().then((f) => { if (!stale) setFleet(f); }).catch(() => {});
    return () => { stale = true; };
  }, [isOwner, seesFleet, companyId]);

  if (!user) return null;
  const company = companies.find((c) => c.id === companyId);
  const canSwitch = companies.length > 1;

  const pick = async (c: Company) => {
    if (c.id === companyId) { setPicking(false); return; }
    setSwitching(c.id);
    try {
      await switchCompany(c.id);
      haptic.success();
      setPicking(false);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't switch company. Try again."));
    } finally {
      setSwitching("");
    }
  };

  const used = billing?.driversUsed ?? 0, limit = billing?.driversLimit ?? null;

  return (
    <div className="scroll">
      <div className="who">
        <span className="avatar">{initialsOf(user.full_name || user.login)}</span>
        <div style={{ minWidth: 0 }}>
          <div className="ell" style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>{user.full_name || user.login}</div>
          <div className="sub ell">{[ROLE[user.role] ?? user.role, user.login || user.email].filter(Boolean).join(" · ")}</div>
        </div>
      </div>

      {/* The plan, for the owner: what it is, how much of it is used, when it runs out. */}
      {billing && (
        <div className="plan-card">
          <div><small>Plan</small><b>{billing.plan || "No plan"}</b></div>
          {limit != null && limit > 0 && <div className="plan-bar"><i style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></div>}
          <div className="row">
            <span>{limit != null ? `${used} of ${limit} drivers` : `${used} ${used === 1 ? "driver" : "drivers"} · no limit`}</span>
            {billing.renewsOn && <span>{billing.daysLeft != null && billing.daysLeft <= 7 ? `${Math.max(0, billing.daysLeft)} ${billing.daysLeft === 1 ? "day" : "days"} left` : `Until ${fmtDate(billing.renewsOn)}`}</span>}
          </div>
        </div>
      )}

      <div className="prows">
        {canSwitch ? (
          <button onClick={() => { haptic.tap(); setPicking(true); }}>
            <span className="picon"><Building2 size={16} /></span><span className="ptitle">Company</span>
            <span className="pvalue"><span className="ell">{company?.name ?? "Choose"}</span><ChevronRight size={15} /></span>
          </button>
        ) : (
          <div>
            <span className="picon"><Building2 size={16} /></span><span className="ptitle">Company</span>
            <span className="pvalue"><span className="ell">{company?.name ?? "None yet"}</span></span>
          </div>
        )}
        {seesFleet && (
          <button onClick={() => { haptic.tap(); navigate("/profile/equipment"); }}>
            <span className="picon"><Truck size={16} /></span><span className="ptitle">Equipment</span>
            <span className="pvalue">
              {fleet && <span className="ell">{fleet.trucks} {fleet.trucks === 1 ? "truck" : "trucks"} · {fleet.trailers} {fleet.trailers === 1 ? "trailer" : "trailers"}</span>}
              <ChevronRight size={15} />
            </span>
          </button>
        )}
        {isOwner && companyId && (
          <button onClick={() => { haptic.tap(); navigate("/profile/invoices"); }}>
            <span className="picon"><ReceiptText size={16} /></span><span className="ptitle">Invoices</span>
            <span className="pvalue">{invoices != null && <span>{invoices}</span>}<ChevronRight size={15} /></span>
          </button>
        )}
        {/* Inside Telegram, a signed-in account is tied to this Telegram account so the app
            opens without the password next time. Signing out undoes that. */}
        {inTelegram && (
          <div>
            <span className="picon"><Send size={15} /></span>
            <span className="ptitle">Password-free sign-in<small>{linked ? "Brelo opens straight from this Telegram account" : "Sign in again to turn it on"}</small></span>
            <span className="pvalue" style={linked ? { color: "var(--pine)", fontWeight: 600 } : undefined}>{linked ? "On" : "Off"}</span>
          </div>
        )}
      </div>

      <SlideToConfirm label="Slide to sign out" icon={<LogOut size={19} />} busy={leaving}
        onConfirm={() => { setLeaving(true); void logout(); }} />

      {picking && (
        <Sheet title="Switch company" onClose={() => !switching && setPicking(false)}>
          {companies.map((c) => (
            <button key={c.id} className="sheet-row" onClick={() => pick(c)} disabled={!!switching}>
              <span className="co-mark" style={c.color ? { background: `color-mix(in srgb, ${c.color} 18%, transparent)`, color: c.color } : undefined}>{c.initials || initialsOf(c.name)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="ell" style={{ display: "block", fontWeight: 600 }}>{c.name}</span>
                {c.plan && <span className="sub">{c.plan} plan</span>}
              </span>
              {switching === c.id ? <span className="spinner" style={{ color: "var(--muted)" }} /> : c.id === companyId && <Check size={18} style={{ color: "var(--pine)" }} />}
            </button>
          ))}
        </Sheet>
      )}
    </div>
  );
}
