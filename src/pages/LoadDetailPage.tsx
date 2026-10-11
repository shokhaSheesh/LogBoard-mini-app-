import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Check, Ellipsis, MapPinned, Pencil, Phone, Send, Trash2 } from "lucide-react";
import { can, useAuth } from "../lib/auth";
import { friendlyError } from "../lib/errors";
import { deleteLoad, fullAddress, getLoad, kindAt, milesText, money, postalAddress, stopLetter, updateLoad, type Load } from "../lib/loads";
import { getSendStatus, sendToDriver, type SendStatus } from "../lib/tgGroup";
import { fmtDateTime } from "../lib/dates";
import { ALL_STATUSES, STATUS_CONFIG, type Status } from "../lib/statuses";
import { Sheet, SheetRow, StatusChip, statusColors, toast, TopBar } from "../components/ui";

// The map library is large; it loads only when a load with located stops is opened.
const RouteMap = lazy(() => import("../components/RouteMap").then((m) => ({ default: m.RouteMap })));

type Open = "status" | "menu" | "delete" | { uncomplete: Status } | null;

export function LoadDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [load, setLoad]   = useState<Load | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen]   = useState<Open>(null);
  const [busy, setBusy]   = useState(false);
  const [send, setSend]   = useState<SendStatus | null>(null); // can this load go to its driver's group?
  const [sending, setSending] = useState(false);

  const canUpdate = can(user, "loads", "update");
  const canDelete = can(user, "loads", "delete");
  const back = () => navigate("/loads");

  useEffect(() => {
    let stale = false;
    getLoad(id).then((l) => { if (!stale) setLoad(l); }).catch((e) => { if (!stale) setError(friendlyError(e, "Couldn't open this load.")); });
    return () => { stale = true; };
  }, [id]);

  // An extra on this page: without it (the bot switched off, no permission) the card is
  // simply not shown. Asked again when the driver changes, since the group is the driver's.
  const driverId = load?.driverId ?? "";
  useEffect(() => {
    if (!load) return;
    let stale = false;
    getSendStatus(load.id).then((s) => { if (!stale) setSend(s); }).catch(() => { if (!stale) setSend(null); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load?.id, driverId]);

  if (error) return <div className="screen"><TopBar title="Load" onBack={back} /><div className="center"><div className="error">{error}</div></div></div>;
  if (!load) return <div className="screen"><TopBar title="Load" onBack={back} /><div className="center"><span className="spinner" /></div></div>;

  const points = load.stops.flatMap((s, i) => (s.lat != null && s.lng != null ? [{ lat: s.lat, lng: s.lng, label: stopLetter(i) }] : []));
  const distance = load.miles + load.deadhead;
  const perMile = distance > 0 ? load.payout / distance : 0;

  const setStatus = async (s: Status) => {
    setOpen(null);
    if (s === load.status) return;
    setBusy(true);
    try {
      setLoad(await updateLoad({ ...load, status: s }, load));
      toast.ok(`Status: ${STATUS_CONFIG[s].label}`);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't change the status."));
    } finally {
      setBusy(false);
    }
  };
  // Leaving "Completed" deletes the load's payout, so it asks first.
  const pickStatus = (s: Status) => (load.status === "completed" && s !== "completed" ? setOpen({ uncomplete: s }) : setStatus(s));

  const remove = async () => {
    setBusy(true);
    try {
      await deleteLoad(load.id);
      toast.ok(`Load ${load.loadId} deleted`);
      back();
    } catch (e) {
      setOpen(null);
      toast.error(friendlyError(e, "Couldn't delete the load."));
      setBusy(false);
    }
  };

  // Directions through every stop, in Google Maps.
  const mapsUrl = () => {
    const addrs = load.stops.map((s) => (s.lat != null && s.lng != null ? `${s.lat},${s.lng}` : fullAddress(s))).filter(Boolean);
    if (addrs.length < 2) return "";
    const p = new URLSearchParams({ api: "1", origin: addrs[0], destination: addrs[addrs.length - 1], travelmode: "driving" });
    if (addrs.length > 2) p.set("waypoints", addrs.slice(1, -1).join("|"));
    return `https://www.google.com/maps/dir/?${p}`;
  };
  const route = mapsUrl();

  const post = async () => {
    setSending(true);
    try {
      const at = await sendToDriver(load.id);
      toast.ok(send?.sentAt ? "Sent again" : "Sent to the driver's group");
      setSend((s) => (s ? { ...s, sentAt: at } : s));
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't send it. Try again."));
      // A group the bot was removed from is disconnected by the server; show that.
      getSendStatus(load.id).then(setSend).catch(() => {});
    } finally {
      setSending(false);
    }
  };
  const hasMenu = canUpdate || canDelete || !!route;

  return (
    <div className="screen">
      <TopBar title={`${load.broker ? `${load.broker} - ` : ""}${load.loadId}`} onBack={back}
        right={hasMenu && <button className="icon-btn" aria-label="More" onClick={() => setOpen("menu")}><Ellipsis size={19} /></button>} />

      <div className="page-body">
        <div className="row">
          <StatusChip status={load.status} large busy={busy} onClick={canUpdate ? () => setOpen("status") : undefined} />
          <b style={{ fontSize: 24, letterSpacing: "-0.02em" }}>{money(load.payout)}</b>
        </div>

        {points.length > 0 && (
          <Suspense fallback={<div className="card" style={{ height: 150 }} />}>
            <RouteMap points={points} height={150} />
          </Suspense>
        )}

        <div className="card">
          <div className="label" style={{ margin: "0 0 10px" }}>Route</div>
          <div className="timeline">
            {load.stops.map((s, i) => (
              <div key={i} style={{ display: "contents" }}>
                <span className={`letter ${s.done ? "done" : ""}`}>{s.done ? <Check size={12} strokeWidth={3} /> : stopLetter(i)}</span>
                <div style={{ minWidth: 0 }}>
                  {s.facility && <div className="sub" style={{ fontWeight: 600, color: "var(--ink)" }}>{s.facility}</div>}
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{postalAddress(s) || "No address"}</div>
                  <div className="sub">{[[s.appt, s.apptTz].filter(Boolean).join(" "), s.ref && `${kindAt(s, i) === "pickup" ? "PU" : "DEL"} # ${s.ref}`, s.done ? "done" : ""].filter(Boolean).join(" · ") || "No appointment"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card facts">
          <div><small>Driver</small><span className="ell" style={{ display: "block" }}>{load.driver || "Unassigned"}</span></div>
          <div><small>Dispatcher</small><span className="ell" style={{ display: "block" }}>{load.dispatcher || "—"}</span></div>
          <div><small>Truck</small>{load.truckUnit || "—"}</div>
          <div><small>Trailer</small>{load.trailerUnit || "—"}</div>
          <div><small>Loaded miles</small>{milesText(load.miles)}</div>
          <div><small>Deadhead</small>{milesText(load.deadhead)}</div>
          <div><small>Rate per mile</small>${perMile.toFixed(2)}</div>
          <div><small>Broker</small><span className="ell" style={{ display: "block" }}>{load.broker || "—"}</span></div>
          {load.refNumber && <div><small>Ref #</small><span className="ell" style={{ display: "block" }}>{load.refNumber}</span></div>}
          {load.poNumber && <div><small>PO #</small><span className="ell" style={{ display: "block" }}>{load.poNumber}</span></div>}
          {load.otherNumber && <div><small>Other #</small><span className="ell" style={{ display: "block" }}>{load.otherNumber}</span></div>}
        </div>

        {/* Posting the trip to the driver's Telegram group. What goes is the load as it is
            stored now, so sending again after an edit sends the edit. */}
        {send?.hasDriver && (send.connected ? (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <div className="row">
              <span style={{ minWidth: 0 }}>
                <span className="ell" style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{send.groupTitle || "Driver's Telegram group"}</span>
                <span className="sub">{send.sentAt ? `Sent ${fmtDateTime(send.sentAt)}` : "Not sent yet"}</span>
              </span>
              <Send size={18} style={{ color: "var(--muted)", flexShrink: 0 }} />
            </div>
            {canUpdate && <button className="btn small" disabled={sending} onClick={post}>{sending ? <span className="spinner" /> : send.sentAt ? "Send again" : "Send to driver"}</button>}
          </div>
        ) : (
          <button className="card" style={{ textAlign: "left", width: "100%" }} onClick={() => navigate(`/drivers/${send.driverId}`)} disabled={!can(user, "drivers")}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>Send this trip to the driver</span>
            <span className="sub">First add the Brelo bot to the group you share with {load.driver || "the driver"} and type /assign {load.driver || "their name"} there.</span>
          </button>
        ))}
      </div>

      {(load.driverPhone || canUpdate) && (
        <div className="page-foot">
          {load.driverPhone && <a className="btn ghost" href={`tel:${load.driverPhone}`} style={{ textDecoration: "none" }}><Phone size={17} /> Call driver</a>}
          {canUpdate && <button className="btn" onClick={() => navigate(`/loads/${load.id}/edit`)}><Pencil size={16} /> Edit</button>}
        </div>
      )}

      {open === "status" && (
        <Sheet title="Change status" onClose={() => setOpen(null)}>
          {ALL_STATUSES.map((s) => (
            <SheetRow key={s} selected={s === load.status} onClick={() => pickStatus(s)}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: statusColors(s).dot, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{STATUS_CONFIG[s].label}</span>
              {s === load.status && <Check size={18} style={{ color: "var(--pine)" }} />}
            </SheetRow>
          ))}
        </Sheet>
      )}

      {open === "menu" && (
        <Sheet onClose={() => setOpen(null)}>
          {canUpdate && <SheetRow onClick={() => navigate(`/loads/${load.id}/edit`)}><Pencil size={18} /> Edit load</SheetRow>}
          {route && <SheetRow onClick={() => { setOpen(null); window.open(route, "_blank", "noopener"); }}><MapPinned size={18} /> Open route in Maps</SheetRow>}
          {canDelete && <SheetRow danger onClick={() => setOpen("delete")}><Trash2 size={18} /> Delete load</SheetRow>}
        </Sheet>
      )}

      {open === "delete" && (
        <Sheet title="Delete this load?" onClose={() => !busy && setOpen(null)}>
          <div className="sub" style={{ fontSize: 14, marginBottom: 10 }}>
            {load.broker ? `${load.broker} - ` : ""}{load.loadId} will be removed from the board{load.driver ? ` and from ${load.driver}'s queue` : ""}.
          </div>
          <button className="btn danger" disabled={busy} onClick={remove}>{busy && <span className="spinner" />}Delete load</button>
          <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy} onClick={() => setOpen(null)}>Keep it</button>
        </Sheet>
      )}

      {open && typeof open === "object" && (
        <Sheet title="Move it out of Completed?" onClose={() => setOpen(null)}>
          <div className="sub" style={{ fontSize: 14, marginBottom: 10 }}>This removes the load's payout and takes its money out of Gross.</div>
          <button className="btn" onClick={() => setStatus(open.uncomplete)}>Change to {STATUS_CONFIG[open.uncomplete].label}</button>
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setOpen(null)}>Keep Completed</button>
        </Sheet>
      )}
    </div>
  );
}
