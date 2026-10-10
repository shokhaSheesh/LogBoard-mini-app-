import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Check, ChevronRight, Plus, Search } from "lucide-react";
import { can, useAuth } from "../lib/auth";
import { deleteEquipment, EMPTY_EQUIPMENT, listEquipment, one, PAGE_SIZE, saveEquipment, type Equipment, type Kind } from "../lib/equipment";
import { friendlyError } from "../lib/errors";
import { searchDrivers, type DriverOption } from "../lib/loads";
import { haptic } from "../lib/telegram";
import { Sheet, SheetRow, toast, TopBar } from "../components/ui";

// Equipment, opened from the Profile: the company's trucks and trailers as two halves.
// A unit opens in a sheet to edit or remove; the ＋ adds one. Each needs its own permission.
export function EquipmentPage() {
  const { user, companyId } = useAuth();
  const navigate = useNavigate();
  const [kind, setKind]       = useState<Kind>("trucks");
  const [typed, setTyped]     = useState("");
  const [q, setQ]             = useState("");
  const [rows, setRows]       = useState<Equipment[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [again, setAgain]     = useState(0); // bumped to read the list again after a change
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [editing, setEditing] = useState<Equipment | null>(null);

  const canCreate = can(user, "equipments", "create");
  const canUpdate = can(user, "equipments", "update");
  const canDelete = can(user, "equipments", "delete");

  // Search waits for a pause in typing.
  useEffect(() => { const t = setTimeout(() => setQ(typed.trim()), 300); return () => clearTimeout(t); }, [typed]);
  useEffect(() => { setPage(1); }, [q, kind, companyId]);

  useEffect(() => {
    // Only the latest request may write.
    let stale = false;
    setLoading(true);
    listEquipment(kind, q, page)
      .then((r) => {
        if (stale) return;
        setRows((prev) => (page === 1 ? r.items : [...prev, ...r.items.filter((x) => !prev.some((p) => p.id === x.id))]));
        setTotal(r.total); setError("");
      })
      .catch((e) => { if (!stale) setError(friendlyError(e, `Couldn't load ${kind}. Try again.`)); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [kind, q, page, companyId, again]);

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
  const pick = (k: Kind) => { haptic.tap(); setRows([]); setKind(k); };
  const reload = () => { setEditing(null); setPage(1); setAgain((n) => n + 1); };

  return (
    <div className="screen">
      <TopBar title="Equipment" onBack={() => navigate("/profile")} />
      <div className="page-body" style={{ paddingBottom: 90 }}>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={kind === "trucks"} className={kind === "trucks" ? "on" : undefined} onClick={() => pick("trucks")}>Trucks</button>
          <button role="tab" aria-selected={kind === "trailers"} className={kind === "trailers" ? "on" : undefined} onClick={() => pick("trailers")}>Trailers</button>
        </div>
        <label className="search">
          <Search size={17} />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Search ${kind}`} aria-label={`Search ${kind}`} enterKeyHint="search" />
        </label>

        {error && <div className="error" role="alert">{error}</div>}
        {first && rows.length === 0 && <div className="center"><span className="spinner" /></div>}
        {!loading && !error && rows.length === 0 && <div className="center">{q ? `No ${kind} match.` : `No ${kind} yet.`}</div>}

        {rows.length > 0 && (
          <div className="list" style={{ opacity: first ? 0.5 : 1, transition: "opacity 0.15s" }}>
            {rows.map((u) => {
              const body = (
                <>
                  <div className="row"><b className="ell">{u.unit || "No number"}</b><span className="sub ell" style={u.driver ? { color: "var(--ink)" } : undefined}>{u.driver || "Unassigned"}</span></div>
                  <div className="sub ell">
                    {[[u.make, u.model].filter(Boolean).join(" "), u.vin, u.odometer != null ? `${Math.round(u.odometer).toLocaleString("en-US")} mi` : ""].filter(Boolean).join(" · ") || "No details"}
                  </div>
                </>
              );
              return canUpdate || canDelete
                ? <button key={u.id} onClick={() => { haptic.tap(); setEditing(u); }} aria-label={`Open ${one(kind)} ${u.unit}`}>{body}</button>
                : <div key={u.id}>{body}</div>;
            })}
          </div>
        )}
        {!first && loading && <div className="center" style={{ flex: "none", padding: 12 }}><span className="spinner" /></div>}
        <div ref={more} />
      </div>

      {canCreate && (
        <button className="fab" style={{ bottom: "calc(22px + var(--safe-bottom))" }} aria-label={`New ${one(kind)}`} onClick={() => { haptic.tap(); setEditing(EMPTY_EQUIPMENT); }}><Plus size={24} strokeWidth={2.4} /></button>
      )}

      {editing && <UnitSheet kind={kind} unit={editing} canSave={editing.id ? canUpdate : canCreate} canDelete={!!editing.id && canDelete} onClose={() => setEditing(null)} onDone={reload} />}
    </div>
  );
}

// ─── One truck or trailer ─────────────────────────────────────────────────────

function UnitSheet({ kind, unit, canSave, canDelete, onClose, onDone }: { kind: Kind; unit: Equipment; canSave: boolean; canDelete: boolean; onClose: () => void; onDone: () => void }) {
  const [form, setForm]   = useState<Equipment>(unit);
  const [busy, setBusy]   = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const set = (patch: Partial<Equipment>) => { setForm((f) => ({ ...f, ...patch })); setError(""); };
  const name = one(kind);

  async function save() {
    if (!form.unit.trim()) { setMissing(true); return; }
    setBusy("save"); setError("");
    try {
      await saveEquipment(kind, form);
      toast.ok(unit.id ? "Saved" : `${name[0].toUpperCase()}${name.slice(1)} added`);
      onDone();
    } catch (e) {
      setError(friendlyError(e, `Couldn't save the ${name}. Try again.`));
      setBusy(null);
    }
  }
  async function remove() {
    setBusy("delete"); setError("");
    try {
      await deleteEquipment(kind, unit.id);
      toast.ok(`${name[0].toUpperCase()}${name.slice(1)} ${unit.unit} removed`);
      onDone();
    } catch (e) {
      setError(friendlyError(e, `Couldn't remove the ${name}.`));
      setBusy(null); setConfirming(false);
    }
  }

  const field = (key: "unit" | "make" | "model" | "vin", label: string, placeholder: string) => (
    <>
      <div className="flabel" style={{ margin: "8px 2px 6px" }}>{label}</div>
      <input className="field" value={form[key]} onChange={(e) => { set({ [key]: e.target.value }); if (key === "unit") setMissing(false); }} placeholder={placeholder}
        aria-label={label} aria-invalid={key === "unit" && missing} autoComplete="off" disabled={!canSave} autoCapitalize={key === "vin" ? "characters" : "words"} />
    </>
  );

  return (
    <Sheet title={unit.id ? `${name[0].toUpperCase()}${name.slice(1)} ${unit.unit}` : `New ${name}`} onClose={() => { if (!busy) onClose(); }} tall>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {field("unit", "Unit number", "e.g. 104")}
        {missing && <div className="field-error" style={{ marginTop: 4 }}>Enter the unit number.</div>}
        <div className="flabel" style={{ margin: "8px 2px 6px" }}>Driver</div>
        <button className="picker" onClick={() => setPicking(true)} disabled={!canSave}>
          <span className={`ell ${form.driver ? "" : "ph"}`}>{form.driver || "Unassigned"}</span><ChevronRight size={17} style={{ color: "var(--muted)", flexShrink: 0 }} />
        </button>
        <div className="two">
          <div>{field("make", "Make", "e.g. Freightliner")}</div>
          <div>{field("model", "Model", "e.g. Cascadia")}</div>
        </div>
        {field("vin", "VIN", "17 characters")}
        {unit.odometer != null && <div className="sub" style={{ marginTop: 8 }}>Odometer {Math.round(unit.odometer).toLocaleString("en-US")} mi, from the truck.</div>}
      </div>

      {error && <div className="error" role="alert" style={{ marginTop: 8 }}>{error}</div>}
      {confirming ? (
        <div className="two" style={{ marginTop: 10, flexShrink: 0 }}>
          <button className="btn ghost" disabled={!!busy} onClick={() => setConfirming(false)}>Keep</button>
          <button className="btn danger" disabled={!!busy} onClick={remove}>{busy === "delete" ? <span className="spinner" /> : `Remove ${name}`}</button>
        </div>
      ) : (
        <div className={canDelete && canSave ? "two" : undefined} style={{ marginTop: 10, flexShrink: 0 }}>
          {canDelete && <button className="btn ghost" style={{ color: "var(--danger)" }} disabled={!!busy} onClick={() => setConfirming(true)}>Remove</button>}
          {canSave && <button className="btn" disabled={!!busy} onClick={save}>{busy === "save" ? <span className="spinner" /> : unit.id ? "Save" : `Add ${name}`}</button>}
        </div>
      )}

      {picking && <DriverSheet current={form.driverId} onClose={() => setPicking(false)} onPick={(d) => { set({ driverId: d?.id ?? "", driver: d?.name ?? "" }); setPicking(false); }} />}
    </Sheet>
  );
}

// Who gets the unit. Each driver is listed with the unit they have now, so moving one is a
// choice made knowingly.
function DriverSheet({ current, onPick, onClose }: { current: string; onPick: (d: DriverOption | null) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<DriverOption[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stale = false;
    const t = setTimeout(() => {
      searchDrivers(q.trim()).then((r) => { if (!stale) { setRows(r); setError(""); } }).catch((e) => { if (!stale) setError(friendlyError(e, "Couldn't load drivers.")); });
    }, q ? 300 : 0);
    return () => { stale = true; clearTimeout(t); };
  }, [q]);

  return (
    <Sheet title="Driver" onClose={onClose} tall>
      <label className="search"><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search driver" aria-label="Search drivers" /></label>
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      {!rows && !error && <div className="center"><span className="spinner" /></div>}
      {rows?.map((d) => (
        <SheetRow key={d.id} selected={d.id === current} onClick={() => onPick(d)}>
          <span className="ell" style={{ flex: 1 }}>{d.name}{d.unit && <span className="sub"> · truck {d.unit}</span>}</span>
          {d.id === current && <Check size={18} style={{ color: "var(--pine)" }} />}
        </SheetRow>
      ))}
      {rows && rows.length === 0 && <div className="center">No drivers match.</div>}
      {rows && current && <SheetRow onClick={() => onPick(null)}><span style={{ color: "var(--muted)" }}>Unassigned</span></SheetRow>}
    </Sheet>
  );
}
