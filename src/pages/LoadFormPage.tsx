import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AlertCircle, Check, ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import { can, useAuth } from "../lib/auth";
import { EMPTY_APPT, formatApptParts, parseAppt } from "../lib/appt";
import { friendlyError } from "../lib/errors";
import { geocodeCity, routeMiles } from "../lib/geo";
import {
  createLoad, EMPTY_LOAD, fullAddress, getLoad, listDispatchers, milesText, money, searchDrivers, stopLetter, updateLoad,
  type DriverOption, type Load, type PersonOption, type Stop,
} from "../lib/loads";
import { suggestAddresses, type PlaceSuggestion } from "../lib/places";
import { haptic } from "../lib/telegram";
import { NumberInput, Sheet, SheetRow, StatusChip, toast, TopBar } from "../components/ui";

const RouteMap = lazy(() => import("../components/RouteMap").then((m) => ({ default: m.RouteMap })));

// Creating and editing a load, in three short steps instead of one long form:
//   1 Load   — its number, broker, rate, and who runs and books it
//   2 Route  — the stops, on a map, with the miles worked out
//   3 Review — everything on one screen, then save
const STEPS = ["Load", "Route", "Review"] as const;

const located = (s: Stop) => s.lat != null && s.lng != null;
const filled = (s: Stop) => s.city.trim() !== "";

export function LoadFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const { user } = useAuth();
  const navigate = useNavigate();
  const allowed = can(user, "loads", isNew ? "create" : "update");

  const [was, setWas]     = useState<Load | null>(isNew ? EMPTY_LOAD : null); // what the form opened with
  const [form, setForm]   = useState<Load>(EMPTY_LOAD);
  const [step, setStep]   = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<"driver" | "dispatcher" | { stop: number } | null>(null);

  useEffect(() => {
    if (isNew) return;
    let stale = false;
    getLoad(id!).then((l) => { if (!stale) { setWas(l); setForm(l); } }).catch((e) => { if (!stale) setError(friendlyError(e, "Couldn't open this load.")); });
    return () => { stale = true; };
  }, [id, isNew]);

  const set = (patch: Partial<Load>) => { setForm((f) => ({ ...f, ...patch })); setError(""); };
  const leave = () => navigate(isNew ? "/loads" : `/loads/${id}`);

  // Loaded miles follow the route: whenever every stop has a point, the driving distance
  // through them is worked out and written in. It can still be typed over afterwards.
  const routeKey = form.stops.map((s) => (located(s) ? `${s.lat},${s.lng}` : "?")).join("|");
  const firstRoute = useRef(true);
  const [measuring, setMeasuring] = useState(false);
  useEffect(() => {
    // The route a load is opened with already has its miles; only a change re-measures.
    if (firstRoute.current) { firstRoute.current = !was || routeKey === was.stops.map((s) => (located(s) ? `${s.lat},${s.lng}` : "?")).join("|"); if (firstRoute.current) return; }
    const pts = form.stops.filter(located).map((s) => ({ lat: s.lat!, lng: s.lng! }));
    if (pts.length < 2 || pts.length !== form.stops.length) return;
    const ctl = new AbortController();
    setMeasuring(true);
    routeMiles(pts, ctl.signal).then((mi) => { if (!ctl.signal.aborted && mi != null) setForm((f) => ({ ...f, miles: mi })); }).finally(() => { if (!ctl.signal.aborted) setMeasuring(false); });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, was]);

  // What stands between this step and the next, as a sentence; "" when nothing does.
  const blocker = (s: number): string => {
    if (s === 0 && !form.loadId.trim()) return "Enter the load ID.";
    if (s === 1) {
      const stops = form.stops.filter(filled);
      if (stops.length < 2) return "A load needs a pickup and a delivery.";
      const lost = form.stops.findIndex((x) => filled(x) && !located(x));
      if (lost !== -1) return `Stop ${stopLetter(lost)} isn't on the map yet. Open it and pick the address from the list.`;
    }
    return "";
  };

  const next = () => {
    const why = blocker(step);
    if (why) { haptic.error(); setError(why); return; }
    setError("");
    setStep((s) => s + 1);
  };

  const save = async () => {
    const why = blocker(0) || blocker(1);
    if (why) { setError(why); return; }
    setSaving(true);
    setError("");
    // Empty rows the user never filled in are dropped, not saved as blank stops.
    const load = { ...form, stops: form.stops.filter(filled) };
    try {
      const saved = isNew ? await createLoad(load) : await updateLoad(load, was!);
      toast.ok(`Load ${saved.loadId} ${isNew ? "created" : "saved"}`);
      navigate(`/loads/${saved.id}`, { replace: true });
    } catch (e) {
      haptic.error();
      setError(friendlyError(e, "Couldn't save the load."));
      setSaving(false);
    }
  };

  if (!allowed) return <div className="screen"><TopBar title="Load" onBack={leave} /><div className="center">You don't have permission to do that.</div></div>;
  if (!was) return <div className="screen"><TopBar title="Load" onBack={leave} /><div className="center">{error ? <div className="error">{error}</div> : <span className="spinner" />}</div></div>;

  const points = form.stops.flatMap((s, i) => (located(s) ? [{ lat: s.lat!, lng: s.lng!, label: stopLetter(i) }] : []));
  const distance = form.miles + form.deadhead;

  return (
    <div className="screen">
      <TopBar title={`${isNew ? "New load" : "Edit load"} · ${STEPS[step]}`} onBack={step === 0 ? leave : () => { setError(""); setStep((s) => s - 1); }} />
      <div className="steps" aria-label={`Step ${step + 1} of ${STEPS.length}`}>{STEPS.map((s, i) => <i key={s} className={i <= step ? "on" : ""} />)}</div>

      <div className="page-body">
        {step === 0 && <>
          <div className="flabel">Load ID</div>
          <input className="field" value={form.loadId} onChange={(e) => set({ loadId: e.target.value })} placeholder="58135734" aria-label="Load ID" autoCapitalize="characters" autoCorrect="off" aria-invalid={!!error && !form.loadId.trim()} />
          <div className="flabel">Broker</div>
          <input className="field" value={form.broker} onChange={(e) => set({ broker: e.target.value })} placeholder="CRST" aria-label="Broker" autoCorrect="off" />
          <div className="flabel">Rate</div>
          <NumberInput label="Rate" prefix="$" value={form.payout} onChange={(payout) => set({ payout })} />
          <div className="flabel">Driver</div>
          <button className="picker" onClick={() => setSheet("driver")}><span className={form.driver ? "ell" : "ell ph"}>{form.driver || "No driver yet"}</span><ChevronRight size={18} style={{ color: "var(--muted)" }} /></button>
          <div className="flabel">Dispatcher</div>
          <button className="picker" onClick={() => setSheet("dispatcher")}><span className={form.dispatcher ? "ell" : "ell ph"}>{form.dispatcher || "No dispatcher"}</span><ChevronRight size={18} style={{ color: "var(--muted)" }} /></button>
        </>}

        {step === 1 && <>
          <Suspense fallback={<div className="card" style={{ height: 150 }} />}>
            <RouteMap points={points} height={150} />
          </Suspense>
          {form.stops.map((s, i) => (
            <button key={i} className="card stop-card" onClick={() => setSheet({ stop: i })}>
              <span className={`letter ${located(s) ? "done" : ""}`} style={{ gridRow: "span 2", alignSelf: "start" }}>{stopLetter(i)}</span>
              <span className="ell" style={{ fontSize: 14, fontWeight: 600, color: filled(s) ? undefined : "var(--muted)" }}>
                {fullAddress(s) || (i === 0 ? "Pickup address" : i === form.stops.length - 1 ? "Delivery address" : "Stop address")}
              </span>
              <ChevronRight size={18} style={{ color: "var(--muted)", gridRow: "span 2" }} />
              <span className="sub ell" style={{ gridColumn: 2, color: filled(s) && !located(s) ? "#D97706" : undefined }}>
                {filled(s) && !located(s) ? "Not on the map yet" : s.appt || "No appointment"}
              </span>
            </button>
          ))}
          <button className="add-row" onClick={() => { const at = form.stops.length - 1; set({ stops: [...form.stops.slice(0, at), { street: "", city: "", state: "", appt: "", done: false }, ...form.stops.slice(at)] }); setSheet({ stop: at }); }}>
            <Plus size={17} /> Add a stop
          </button>
          <div className="two">
            <div><div className="flabel" style={{ marginBottom: 6 }}>Loaded miles</div><NumberInput label="Loaded miles" suffix={measuring ? "…" : "mi"} whole value={form.miles} onChange={(miles) => set({ miles })} /></div>
            <div><div className="flabel" style={{ marginBottom: 6 }}>Deadhead</div><NumberInput label="Deadhead miles" suffix="mi" whole value={form.deadhead} onChange={(deadhead) => set({ deadhead })} /></div>
          </div>
        </>}

        {step === 2 && <>
          <div className="card">
            <div className="row"><span className="sub ell">{form.broker ? `${form.broker} - ` : ""}<b style={{ color: "var(--ink)", fontSize: 15 }}>{form.loadId}</b></span>{!isNew && <StatusChip status={form.status} />}</div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}>{money(form.payout)}</div>
            <div className="sub">{distance > 0 ? `${milesText(distance)} · $${(form.payout / distance).toFixed(2)} per mile` : "No miles yet"}</div>
          </div>
          <div className="card">
            <div className="timeline">
              {form.stops.filter(filled).map((s, i) => (
                <div key={i} style={{ display: "contents" }}>
                  <span className="letter">{stopLetter(i)}</span>
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{fullAddress(s)}</div><div className="sub">{s.appt || "No appointment"}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div className="card facts">
            <div><small>Driver</small><span className="ell" style={{ display: "block" }}>{form.driver || "No driver yet"}</span></div>
            <div><small>Dispatcher</small><span className="ell" style={{ display: "block" }}>{form.dispatcher || "—"}</span></div>
            <div><small>Loaded miles</small>{milesText(form.miles)}</div>
            <div><small>Deadhead</small>{milesText(form.deadhead)}</div>
          </div>
        </>}

        {error && <div className="error" role="alert"><AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />{error}</div>}
      </div>

      <div className="page-foot">
        {step < 2
          ? <button className="btn" onClick={next}>Next: {STEPS[step + 1]}</button>
          : <button className="btn" disabled={saving} onClick={save}>{saving && <span className="spinner" />}{isNew ? "Create load" : "Save changes"}</button>}
      </div>

      {sheet === "driver" && <DriverSheet current={form.driverId} onClose={() => setSheet(null)} onPick={(d) => { set({ driverId: d?.id ?? "", driver: d?.name ?? "" }); setSheet(null); }} />}
      {sheet === "dispatcher" && <DispatcherSheet current={form.dispatcherId} onClose={() => setSheet(null)} onPick={(p) => { set({ dispatcherId: p?.id ?? "", dispatcher: p?.name ?? "" }); setSheet(null); }} />}
      {sheet && typeof sheet === "object" && (
        <StopSheet index={sheet.stop} count={form.stops.length} stop={form.stops[sheet.stop]} onClose={() => setSheet(null)}
          onSave={(s) => { set({ stops: form.stops.map((x, i) => (i === sheet.stop ? s : x)) }); setSheet(null); }}
          onRemove={form.stops.length > 2 ? () => { set({ stops: form.stops.filter((_, i) => i !== sheet.stop) }); setSheet(null); } : undefined} />
      )}
    </div>
  );
}

// ─── One stop: its address and its appointment ────────────────────────────────

// "City, ST" or "Street, City, ST" typed by hand → the three fields.
function splitAddress(text: string): Pick<Stop, "street" | "city" | "state"> {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return { street: "", city: parts[0] ?? "", state: "" };
  const state = parts[parts.length - 1].replace(/\s+\d{5}(-\d{4})?$/, "");
  return { street: parts.slice(0, -2).join(", "), city: parts[parts.length - 2], state };
}

// An appointment the date and time fields can hold: one day, a time, an optional end time.
// Anything else ("FCFS", a range of days) is kept as the text it was.
function readAppt(appt: string): { date: string; from: string; to: string; note: string } {
  const p = parseAppt(appt);
  if (p.note || p.d2 !== null) return { date: "", from: "", to: "", note: appt };
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = p.d !== null && p.mo !== null ? `${p.y ?? new Date().getFullYear()}-${pad(p.mo + 1)}-${pad(p.d)}` : "";
  return { date, from: p.from, to: p.to, note: "" };
}
function writeAppt(a: { date: string; from: string; to: string; note: string }): string {
  if (a.note.trim()) return a.note.trim();
  const [y, m, d] = a.date ? a.date.split("-").map(Number) : [];
  return formatApptParts({ ...EMPTY_APPT, y: y ?? null, mo: m ? m - 1 : null, d: d ?? null, from: a.from, to: a.to });
}

function StopSheet({ index, count, stop, onSave, onRemove, onClose }: {
  index: number; count: number; stop: Stop; onSave: (s: Stop) => void; onRemove?: () => void; onClose: () => void;
}) {
  const [text, setText]       = useState(fullAddress(stop));
  const [picked, setPicked]   = useState<Stop>(stop); // the address fields and point behind `text`
  const [pickedText, setPickedText] = useState(fullAddress(stop));
  const [list, setList]       = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [appt, setAppt]       = useState(() => readAppt(stop.appt));
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");
  const seq = useRef(0);

  const kind = index === 0 ? "Pickup" : index === count - 1 ? "Delivery" : "Stop";

  // Suggestions follow the typing, after a short pause; only the latest answer is shown.
  useEffect(() => {
    if (text === pickedText || text.trim().length < 3) { setList([]); setSearching(false); return; }
    const mine = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const found = await suggestAddresses(text);
      if (mine !== seq.current) return;
      setList(found ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [text, pickedText]);

  const pick = async (s: PlaceSuggestion) => {
    haptic.tap();
    setList([]); setText(s.text); setPickedText(s.text); setError("");
    setSearching(true);
    const place = await s.resolve();
    setSearching(false);
    if (!place) return;
    const next = { ...picked, street: place.street, city: place.city, state: place.state, lat: place.lat, lng: place.lng };
    setPicked(next);
    const line = fullAddress(next);
    setText(line); setPickedText(line);
  };

  const save = async () => {
    const typed = text.trim();
    if (!typed) { setError("Enter an address."); return; }
    let out = picked;
    // Typed by hand rather than picked: split it into fields and find it on the map.
    if (typed !== pickedText || !located(picked)) {
      setBusy(true);
      const at = await geocodeCity(typed);
      setBusy(false);
      if (!at) { haptic.error(); setError("Couldn't find that address. Pick one from the list, or check the spelling."); return; }
      out = { ...picked, ...splitAddress(typed), lat: at.lat, lng: at.lng };
    }
    if (appt.from && appt.to && appt.to < appt.from) { setError("The time window ends before it starts."); return; }
    onSave({ ...out, appt: writeAppt(appt) });
  };

  return (
    <Sheet title={`Stop ${stopLetter(index)} · ${kind}`} onClose={onClose} tall>
      <label className="search" style={{ height: 46, borderColor: error && !text.trim() ? "var(--danger)" : undefined }}>
        <Search size={17} />
        <input value={text} onChange={(e) => { setText(e.target.value); setError(""); }} placeholder="Address or City, ST" aria-label="Address" autoCorrect="off" autoFocus={!text} />
        {searching && <span className="spinner" style={{ width: 16, height: 16 }} />}
        {!searching && text === pickedText && located(picked) && <Check size={17} style={{ color: "var(--pine)" }} />}
      </label>

      {list.length > 0 && (
        <div className="rows" style={{ marginTop: 6 }}>
          {list.map((s) => <button key={s.id} onClick={() => pick(s)} style={{ minHeight: 44 }}><span className="ell" style={{ fontSize: 14 }}>{s.text}</span></button>)}
          <div className="sub" style={{ justifyContent: "flex-end", minHeight: 26, fontSize: 10.5 }}>powered by Google</div>
        </div>
      )}

      <div className="flabel" style={{ marginTop: 12 }}>Appointment</div>
      {appt.note ? (
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <input className="field" value={appt.note} onChange={(e) => setAppt({ ...appt, note: e.target.value })} aria-label="Appointment" />
          <button className="btn ghost" style={{ width: "auto", padding: "0 12px", height: 46, fontSize: 13 }} onClick={() => setAppt({ date: "", from: "", to: "", note: "" })}>Use a date</button>
        </div>
      ) : <>
        <input className="field" type="date" value={appt.date} onChange={(e) => setAppt({ ...appt, date: e.target.value })} aria-label="Date" style={{ marginTop: 6 }} />
        <div className="two" style={{ marginTop: 8 }}>
          <div><div className="sub" style={{ margin: "0 2px 4px" }}>From</div><input className="field" type="time" value={appt.from} onChange={(e) => setAppt({ ...appt, from: e.target.value })} aria-label="From" /></div>
          <div><div className="sub" style={{ margin: "0 2px 4px" }}>To (optional)</div><input className="field" type="time" value={appt.to} onChange={(e) => setAppt({ ...appt, to: e.target.value })} aria-label="To" /></div>
        </div>
      </>}

      {error && <div className="error" role="alert" style={{ marginTop: 10 }}>{error}</div>}
      <div style={{ flex: 1, minHeight: 12 }} />
      <button className="btn" disabled={busy} onClick={save}>{busy && <span className="spinner" />}Save stop</button>
      {onRemove && <button className="btn ghost" style={{ marginTop: 8, color: "var(--danger)" }} onClick={onRemove}><Trash2 size={16} /> Remove stop</button>}
    </Sheet>
  );
}

// ─── Picking who runs the load, and who booked it ─────────────────────────────

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
      <label className="search"><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search driver or unit" aria-label="Search drivers" /></label>
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      {!rows && !error && <div className="center"><span className="spinner" /></div>}
      {rows?.map((d) => (
        <SheetRow key={d.id} selected={d.id === current} onClick={() => onPick(d)}>
          <span className="ell" style={{ flex: 1 }}>{d.name}{d.unit && <span className="sub"> · {d.unit}</span>}</span>
          <StatusChip status={d.status} />
        </SheetRow>
      ))}
      {rows && rows.length === 0 && <div className="center">No drivers match.</div>}
      {rows && current && <SheetRow onClick={() => onPick(null)}><span style={{ color: "var(--muted)" }}>No driver</span></SheetRow>}
    </Sheet>
  );
}

function DispatcherSheet({ current, onPick, onClose }: { current: string; onPick: (p: PersonOption | null) => void; onClose: () => void }) {
  const [rows, setRows] = useState<PersonOption[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { listDispatchers().then(setRows).catch((e) => setError(friendlyError(e, "Couldn't load dispatchers."))); }, []);
  const sorted = useMemo(() => [...(rows ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [rows]);

  return (
    <Sheet title="Dispatcher" onClose={onClose}>
      {error && <div className="error">{error}</div>}
      {!rows && !error && <div className="center" style={{ padding: 24 }}><span className="spinner" /></div>}
      {sorted.map((p) => (
        <SheetRow key={p.id} selected={p.id === current} onClick={() => onPick(p)}>
          <span className="ell" style={{ flex: 1 }}>{p.name}</span>{p.id === current && <Check size={18} style={{ color: "var(--pine)" }} />}
        </SheetRow>
      ))}
      {rows && current && <SheetRow onClick={() => onPick(null)}><span style={{ color: "var(--muted)" }}>No dispatcher</span></SheetRow>}
    </Sheet>
  );
}
