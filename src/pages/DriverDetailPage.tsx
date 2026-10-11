import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ChevronRight, Ellipsis, MapPin, Pencil, Phone, Send, Trash2 } from "lucide-react";
import { can, useAuth } from "../lib/auth";
import { fmtDate } from "../lib/dates";
import { deleteDriver, describePay, displayName, driversChanged, driverWeek, getDriver, updateDriver, type Driver, type DriverWeek } from "../lib/drivers";
import { friendlyError } from "../lib/errors";
import { addDays } from "../lib/gross";
import { getLoad, money, updateLoad } from "../lib/loads";
import { ALL_STATUSES, STATUS_CONFIG, type Status } from "../lib/statuses";
import { Bar, dollars, Kpis, percentOf, perMile, WeekBar } from "../components/finance";
import { Sheet, SheetRow, StatusChip, toast, TopBar } from "../components/ui";
import { disconnectDriverGroup, getDriverGroup, type GroupConnection } from "../lib/tgGroup";

type Open = null | "menu" | "status" | "delete" | { uncomplete: Status };

// One driver: who they are and what they drive, the loads they are on, and their numbers
// week by week. Changing the status, editing and removing each need their own permission.
export function DriverDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [error, setError]   = useState("");
  const [open, setOpen]     = useState<Open>(null);
  const [busy, setBusy]     = useState(false);
  const [changed, setChanged] = useState(0); // bumped to read the driver again after a change

  const canUpdate = can(user, "drivers", "update");
  const canDelete = can(user, "drivers", "delete");
  const back = () => navigate("/drivers");

  useEffect(() => {
    let stale = false;
    getDriver(id)
      .then((d) => { if (!stale) { setDriver(d); setError(""); } })
      .catch((e) => { if (!stale) setError(friendlyError(e, "Couldn't load this driver. Try again.")); });
    return () => { stale = true; };
  }, [id, changed]);

  if (!driver) {
    return (
      <div className="screen">
        <TopBar title="Driver" onBack={back} />
        {error ? <div className="page-body"><div className="error" role="alert">{error}</div></div> : <div className="center"><span className="spinner" /></div>}
      </div>
    );
  }

  // "Completed" is not a state a driver sits in: it finishes the load they are running,
  // which writes its payout and moves them on. So it is saved on the load, with every stop
  // done; only a driver with no load takes the status directly.
  async function setStatus(next: Status) {
    if (!driver) return;
    setOpen(null); setBusy(true);
    try {
      if (next === "completed" && driver.currentLoadId) {
        const load = await getLoad(driver.currentLoadId);
        await updateLoad({ ...load, status: "completed" }, load);
        driversChanged(); // the driver moved on behind that save
      } else {
        await updateDriver({ ...driver, status: next });
      }
      toast.ok("Status updated");
      setChanged((n) => n + 1);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't change the status."));
    } finally {
      setBusy(false);
    }
  }
  // Leaving Completed un-completes the load, which removes its payout. Ask first.
  const pickStatus = (next: Status) => {
    if (next === driver.status) { setOpen(null); return; }
    if (driver.status === "completed") { setOpen({ uncomplete: next }); return; }
    void setStatus(next);
  };

  async function remove() {
    if (!driver) return;
    setBusy(true);
    try {
      await deleteDriver(driver.id);
      toast.ok(`${displayName(driver)} removed`);
      back();
    } catch (e) {
      setOpen(null);
      toast.error(friendlyError(e, "Couldn't remove the driver."));
      setBusy(false);
    }
  }

  const where = driver.eldLocation || driver.location;
  const maps = driver.eldLat != null && driver.eldLng != null ? `https://www.google.com/maps/search/?api=1&query=${driver.eldLat},${driver.eldLng}` : "";
  const canLoads = can(user, "loads");
  const loadRows = [
    ...(driver.currentLoadId ? [{ id: driver.currentLoadId, ref: driver.currentLoad, note: "Current" }] : []),
    ...driver.nextLoads.filter((l) => l.id !== driver.currentLoadId).map((l, i) => ({ id: l.id, ref: l.ref, note: `Next ${i + 1}` })),
  ];

  return (
    <div className="screen">
      <TopBar title={displayName(driver)} onBack={back}
        right={(canUpdate || canDelete) && <button className="icon-btn" aria-label="More" onClick={() => setOpen("menu")}><Ellipsis size={19} /></button>} />

      <div className="page-body">
        <div className="row">
          <StatusChip status={driver.status} large busy={busy} onClick={canUpdate ? () => setOpen("status") : undefined} />
          <span className="sub">{[driver.team ? "Team" : "Solo", driver.type].join(" · ")}</span>
        </div>

        <div className="rows">
          <PhoneRow name={driver.team ? driver.name : ""} phone={driver.phone} />
          {driver.team && <PhoneRow name={driver.name2} phone={driver.phone2} />}
        </div>

        <div className="card">
          <div className="facts">
            <div><small>Truck</small>{driver.truck || "None"}</div>
            <div><small>Trailer</small>{driver.trailer || "None"}</div>
            <div><small>Pay</small>{describePay(driver.payType, driver.payRate)}</div>
            <div><small>Weekly target</small>{driver.target > 0 ? dollars(driver.target) : "None"}</div>
          </div>
        </div>

        {(where || driver.comment) && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {where && (
              <div className="row">
                <span className="ell" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5 }}><MapPin size={15} style={{ color: "var(--muted)", flexShrink: 0 }} /><span className="ell">{where}</span></span>
                {maps && <a href={maps} target="_blank" rel="noopener noreferrer" style={{ color: "var(--pine)", fontSize: 13, fontWeight: 600, textDecoration: "none", flexShrink: 0 }}>Maps</a>}
              </div>
            )}
            {driver.comment && <div className="note">{driver.comment}</div>}
          </div>
        )}

        {loadRows.length > 0 && (
          <>
            <div className="label">Loads</div>
            <div className="rows">
              {loadRows.map((l) => {
                const inner = <><span className="ell" style={{ fontWeight: 600 }}>{l.ref || "Load"}</span><span className="sub" style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>{l.note}{canLoads && <ChevronRight size={15} />}</span></>;
                return canLoads ? <button key={l.id} onClick={() => navigate(`/loads/${l.id}`)}>{inner}</button> : <div key={l.id}>{inner}</div>;
              })}
            </div>
          </>
        )}

        <TelegramGroup driverId={driver.id} driverName={displayName(driver)} canChange={canUpdate} />

        <Week driverId={driver.id} />
      </div>

      {open === "status" && (
        <Sheet title="Change status" onClose={() => setOpen(null)}>
          {ALL_STATUSES.map((s) => (
            <SheetRow key={s} selected={s === driver.status} onClick={() => pickStatus(s)}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_CONFIG[s].bg, flexShrink: 0 }} />
              {STATUS_CONFIG[s].label}
            </SheetRow>
          ))}
        </Sheet>
      )}

      {open === "menu" && (
        <Sheet onClose={() => setOpen(null)}>
          {canUpdate && <SheetRow onClick={() => navigate(`/drivers/${driver.id}/edit`)}><Pencil size={18} /> Edit driver</SheetRow>}
          {canDelete && <SheetRow danger onClick={() => setOpen("delete")}><Trash2 size={18} /> Remove driver</SheetRow>}
        </Sheet>
      )}

      {open === "delete" && (
        <Sheet title="Remove this driver?" onClose={() => !busy && setOpen(null)}>
          <div className="sub" style={{ fontSize: 14, marginBottom: 10 }}>
            {displayName(driver)} leaves the roster and the board. The weeks they worked stay in Gross and Payouts.
          </div>
          <button className="btn danger" disabled={busy} onClick={remove}>{busy && <span className="spinner" />}Remove driver</button>
          <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy} onClick={() => setOpen(null)}>Keep</button>
        </Sheet>
      )}

      {open && typeof open === "object" && (
        <Sheet title="Move out of Completed?" onClose={() => setOpen(null)}>
          <div className="sub" style={{ fontSize: 14, marginBottom: 10 }}>This un-completes the driver's load: its payout is removed and its money comes out of Gross.</div>
          <button className="btn" onClick={() => setStatus(open.uncomplete)}>Change to {STATUS_CONFIG[open.uncomplete].label}</button>
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setOpen(null)}>Keep Completed</button>
        </Sheet>
      )}
    </div>
  );
}

// ─── The driver's Telegram group ──────────────────────────────────────────────

// Which group this driver's trips are posted to. Connecting one is done in Telegram, in the
// group itself — the bot is added there and someone types /assign with the driver's name —
// so this card shows what is connected and says how to connect. It asks the server again
// whenever the app is returned to, since Telegram is where the person has just been.
function TelegramGroup({ driverId, driverName, canChange }: { driverId: string; driverName: string; canChange: boolean }) {
  const [group, setGroup] = useState<GroupConnection | null>(null);
  const [busy, setBusy]   = useState(false);
  const [asking, setAsking] = useState(false); // "disconnect?" is open

  useEffect(() => {
    let stale = false;
    const read = () => getDriverGroup(driverId).then((g) => { if (!stale) setGroup(g); }).catch(() => { if (!stale) setGroup(null); });
    void read();
    const back = () => { if (document.visibilityState === "visible") void read(); };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => { stale = true; document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); };
  }, [driverId]);

  // No answer at all: the bot isn't switched on, or this role can't see drivers' groups.
  if (!group) return null;

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectDriverGroup(driverId);
      setGroup({ connected: false, title: "", linkedAt: "" });
      toast.ok("Group disconnected");
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't disconnect the group."));
    } finally {
      setBusy(false); setAsking(false);
    }
  };

  return (
    <>
      <div className="label">Telegram group</div>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <div className="row">
          <span style={{ minWidth: 0 }}>
            <span className="ell" style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{group.connected ? group.title || "Connected" : "Not connected"}</span>
            {group.connected && <span className="sub">Trips are posted here · since {fmtDate(group.linkedAt)}</span>}
          </span>
          <Send size={18} style={{ color: group.connected ? "var(--pine)" : "var(--muted)", flexShrink: 0 }} />
        </div>
        {!group.connected && (
          <div className="sub" style={{ fontSize: 12.5 }}>
            To connect: add the Brelo bot to the group you share with this driver, then type <b style={{ color: "var(--ink)", fontWeight: 600 }}>/assign {driverName}</b> there.
          </div>
        )}
        {canChange && group.connected && <button className="btn ghost small" disabled={busy} onClick={() => setAsking(true)}>Disconnect</button>}
      </div>

      {asking && (
        <Sheet title="Disconnect this group?" onClose={() => !busy && setAsking(false)}>
          <div className="sub" style={{ fontSize: 14, marginBottom: 10 }}>Trips for {driverName} will no longer be posted to {group.title || "the group"}. The bot stays in the chat; type /assign there to connect it again.</div>
          <button className="btn danger" disabled={busy} onClick={disconnect}>{busy && <span className="spinner" />}Disconnect</button>
          <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy} onClick={() => setAsking(false)}>Keep it</button>
        </Sheet>
      )}
    </>
  );
}

function PhoneRow({ name, phone }: { name: string; phone: string }) {
  if (!phone) return <div><span className="sub">{name || "Phone"}</span><span className="sub">No phone</span></div>;
  return (
    <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`} style={{ color: "inherit", textDecoration: "none" }}>
      <span className="ell" style={{ fontWeight: 600 }}>{phone}{name && <span className="sub" style={{ fontWeight: 400 }}> · {name}</span>}</span>
      <Phone size={17} style={{ color: "var(--pine)", flexShrink: 0 }} />
    </a>
  );
}

// ─── The driver's numbers, a week at a time ───────────────────────────────────

// The first read sends no dates: the server decides which work week is current, and the
// arrows move from that week by whole weeks, so the phone's clock never sets an edge.
function Week({ driverId }: { driverId: string }) {
  const [offset, setOffset] = useState(0);
  const [week, setWeek]     = useState<DriverWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");
  const anchor = useRef<{ from: string; to: string } | null>(null);

  useEffect(() => {
    let stale = false;
    setLoading(true); setError("");
    const a = anchor.current;
    driverWeek(driverId, a ? addDays(a.from, offset * 7) : undefined, a ? addDays(a.to, offset * 7) : undefined)
      .then((w) => { if (stale) return; if (!anchor.current && w.from) anchor.current = { from: w.from, to: w.to }; setWeek(w); })
      .catch((e) => { if (!stale) setError(friendlyError(e, "Couldn't load this week's numbers.")); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [driverId, offset]);

  return (
    <>
      <div className="label">Week</div>
      <WeekBar from={week?.from ?? ""} to={week?.to ?? ""} onShift={(dir) => setOffset((n) => n + dir)} onCurrent={() => setOffset(0)} isCurrent={offset === 0} />
      {error && <div className="error" role="alert">{error}</div>}
      {loading && !week && <div className="center"><span className="spinner" /></div>}
      {week && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}>
          <Kpis items={[
            { label: `Gross · ${week.loads} ${week.loads === 1 ? "load" : "loads"}`, value: dollars(week.gross) },
            { label: "Driver pay", value: dollars(week.driverPay) },
            { label: `Rate per mile · ${Math.round(week.miles).toLocaleString("en-US")} mi`, value: perMile(week.rpm) },
            { label: week.target > 0 ? `Target ${dollars(week.target)}` : "Target", value: week.target > 0 ? `${percentOf(week.gross, week.target)}%` : "None" },
          ]} />
          {week.target > 0 && <Bar percent={percentOf(week.gross, week.target)} />}
          {week.rows.length === 0 ? <div className="center" style={{ padding: 16 }}>No loads this week.</div> : (
            <div className="list">
              {week.rows.map((l) => (
                <div key={l.id}>
                  <div className="row"><b className="ell">{l.ref || "Load"}</b><b>{money(l.payout)}</b></div>
                  <div className="row">
                    <span className="sub ell">{[l.origin && l.destination ? `${l.origin} → ${l.destination}` : "", l.miles > 0 ? `${Math.round(l.miles).toLocaleString("en-US")} mi` : "", fmtDate(l.completedAt)].filter(Boolean).join(" · ")}</span>
                    <StatusChip status={l.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
