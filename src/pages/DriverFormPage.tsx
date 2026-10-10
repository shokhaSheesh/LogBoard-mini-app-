import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { AlertCircle, Check, ChevronRight, Search } from "lucide-react";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtDate } from "../lib/dates";
import { createDriver, describePay, EMPTY_DRIVER, getDriver, listUnits, updateDriver, type Driver, type PayType, type Unit } from "../lib/drivers";
import { friendlyError } from "../lib/errors";
import { periodRange } from "../lib/period";
import { STATUS_CONFIG, ALL_STATUSES } from "../lib/statuses";
import { dollars } from "../components/finance";
import { NumberInput, Sheet, SheetRow, StatusChip, toast, TopBar } from "../components/ui";

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

type Problems = Partial<Record<"name" | "phone" | "name2" | "phone2" | "truck" | "trailer", string>>;

// Adding a driver, or editing one: who they are, what they drive, and how they are paid.
// Solo or team is chosen when the driver is added and stays that way.
export function DriverFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm]     = useState<Driver>({ ...EMPTY_DRIVER, team: params.get("team") === "1" });
  const [was, setWas]       = useState<Driver | null>(null); // the driver as the form opened
  const [loadError, setLoadError] = useState("");
  const [payFrom, setPayFrom] = useState(today());
  const [problems, setProblems] = useState<Problems>({});
  const [error, setError]   = useState("");
  const [busy, setBusy]     = useState(false);
  const [picking, setPicking] = useState<null | "trucks" | "trailers" | "status">(null);

  useEffect(() => {
    if (!id) return;
    let stale = false;
    getDriver(id)
      .then((d) => { if (!stale) { setForm(d); setWas(d); } })
      .catch((e) => { if (!stale) setLoadError(friendlyError(e, "Couldn't load this driver. Try again.")); });
    return () => { stale = true; };
  }, [id]);

  const set = (patch: Partial<Driver>) => { setForm((f) => ({ ...f, ...patch })); setError(""); };
  const back = () => navigate(editing ? `/drivers/${id}` : "/drivers");

  // A pay change starts from a day and never reaches backwards, so the day is asked for
  // only when the pay differs from what the driver had.
  const payChanged = !!was && (form.payType !== was.payType || (form.payType !== "" && form.payRate !== was.payRate));
  const targetChanged = !!was && form.target !== was.target;
  const week = periodRange("week", user?.company?.week_start_day ?? 1);

  async function save() {
    const missing: Problems = {};
    if (!form.name.trim()) missing.name = "Enter the name.";
    if (!form.phone.trim()) missing.phone = "Enter the phone number.";
    if (form.team && !form.name2.trim()) missing.name2 = "Enter the second driver's name.";
    if (form.team && !form.phone2.trim()) missing.phone2 = "Enter the second driver's phone number.";
    setProblems(missing);
    if (Object.keys(missing).length) return;

    setBusy(true); setError("");
    try {
      if (editing) {
        await updateDriver(form, payChanged ? payFrom : undefined);
        toast.ok("Driver updated");
        navigate(`/drivers/${form.id}`);
      } else {
        const made = await createDriver(form);
        toast.ok("Driver added");
        navigate(made.id ? `/drivers/${made.id}` : "/drivers", { replace: true });
      }
    } catch (e) {
      // A truck or trailer the server refuses is a problem with that field, not the form.
      const code = e instanceof ApiError ? e.code : "";
      const said = friendlyError(e, "Couldn't save the driver. Try again.");
      if (code === "invalid_truck" || code === "truck_assigned") setProblems({ truck: said });
      else if (code === "invalid_trailer" || code === "trailer_assigned") setProblems({ trailer: said });
      else setError(said);
      setBusy(false);
    }
  }

  if (editing && !was) {
    return (
      <div className="screen">
        <TopBar title="Edit driver" onBack={back} />
        {loadError ? <div className="page-body"><div className="error" role="alert">{loadError}</div></div> : <div className="center"><span className="spinner" /></div>}
      </div>
    );
  }

  const text = (key: "name" | "phone" | "name2" | "phone2", label: string, placeholder: string, phone?: boolean) => (
    <>
      <div className="flabel req">{label}</div>
      <input className="field" value={form[key]} onChange={(e) => { set({ [key]: e.target.value }); setProblems((p) => ({ ...p, [key]: undefined })); }}
        placeholder={placeholder} aria-label={label} aria-invalid={!!problems[key]} autoComplete="off"
        {...(phone ? { type: "tel", inputMode: "tel" as const } : { autoCapitalize: "words" })} />
      {problems[key] && <div className="field-error">{problems[key]}</div>}
    </>
  );

  return (
    <div className="screen">
      <TopBar title={editing ? "Edit driver" : "New driver"} onBack={back} />
      <div className="page-body">
        {!editing && (
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={!form.team} className={!form.team ? "on" : undefined} onClick={() => set({ team: false })}>Solo</button>
            <button role="tab" aria-selected={form.team} className={form.team ? "on" : undefined} onClick={() => set({ team: true })}>Team</button>
          </div>
        )}

        {text("name", form.team ? "Driver 1 name" : "Name", "Full name")}
        {text("phone", form.team ? "Driver 1 phone" : "Phone", "Phone number", true)}
        {form.team && text("name2", "Driver 2 name", "Full name")}
        {form.team && text("phone2", "Driver 2 phone", "Phone number", true)}

        <div className="flabel">Type</div>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={form.type === "C/D"} className={form.type === "C/D" ? "on" : undefined} onClick={() => set({ type: "C/D" })}>Company driver</button>
          <button role="tab" aria-selected={form.type === "O/O"} className={form.type === "O/O" ? "on" : undefined} onClick={() => set({ type: "O/O" })}>Owner operator</button>
        </div>

        {/* An existing driver's status is changed from their page, where finishing a load is
            handled properly; here it is only the status a new driver starts in. */}
        {!editing && (
          <>
            <div className="flabel">Status</div>
            <button className="picker" onClick={() => setPicking("status")}><StatusChip status={form.status} /><ChevronRight size={17} style={{ color: "var(--muted)" }} /></button>
          </>
        )}

        <div className="two">
          <div>
            <div className="flabel" style={{ marginBottom: 8 }}>Truck</div>
            <button className="picker" aria-invalid={!!problems.truck} onClick={() => setPicking("trucks")}><span className={`ell ${form.truck ? "" : "ph"}`}>{form.truck || "None"}</span><ChevronRight size={17} style={{ color: "var(--muted)", flexShrink: 0 }} /></button>
          </div>
          <div>
            <div className="flabel" style={{ marginBottom: 8 }}>Trailer</div>
            <button className="picker" aria-invalid={!!problems.trailer} onClick={() => setPicking("trailers")}><span className={`ell ${form.trailer ? "" : "ph"}`}>{form.trailer || "None"}</span><ChevronRight size={17} style={{ color: "var(--muted)", flexShrink: 0 }} /></button>
          </div>
        </div>
        {(problems.truck || problems.trailer) && <div className="field-error">{problems.truck || problems.trailer}</div>}

        <div className="flabel">Location</div>
        <input className="field" value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="City, state" aria-label="Location" autoComplete="off" />
        <div className="flabel">Comment</div>
        <input className="field" value={form.comment} onChange={(e) => set({ comment: e.target.value })} placeholder="Optional" aria-label="Comment" autoComplete="off" />

        <div className="flabel">Weekly gross target</div>
        <NumberInput label="Weekly gross target" prefix="$" whole value={form.target} onChange={(target) => set({ target })} />
        {targetChanged && was && <div className="sub">Counts from this week ({fmtDate(week.from)}). Earlier weeks keep {was.target > 0 ? dollars(was.target) : "no target"}.</div>}

        <div className="flabel">Pay</div>
        <div className="seg" role="tablist">
          {([["", "Not set"], ["rpm", "Per mile"], ["percent", "% of gross"]] as [PayType, string][]).map(([t, label]) => (
            // Clearing the type drops the rate with it.
            <button key={t} role="tab" aria-selected={form.payType === t} className={form.payType === t ? "on" : undefined} onClick={() => set(t ? { payType: t } : { payType: "", payRate: 0 })}>{label}</button>
          ))}
        </div>
        {form.payType === "rpm" && <NumberInput label="Rate per mile" prefix="$" suffix="/mi" value={form.payRate} onChange={(payRate) => set({ payRate })} />}
        {form.payType === "percent" && <NumberInput label="Percent of gross" suffix="%" value={form.payRate} onChange={(payRate) => set({ payRate: Math.min(100, payRate) })} />}
        {payChanged && was && (
          <>
            <div className="flabel">New pay starts on</div>
            <input className="field" type="date" min={today()} value={payFrom} onChange={(e) => setPayFrom(e.target.value || today())} aria-label="New pay starts on" />
            <div className="sub">Until then, and for everything before, it stays {describePay(was.payType, was.payRate).toLowerCase()}.</div>
          </>
        )}

        {error && <div className="error" role="alert"><AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />{error}</div>}
      </div>
      <div className="page-foot">
        <button className="btn" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : editing ? "Save changes" : "Add driver"}</button>
      </div>

      {picking === "status" && (
        <Sheet title="Status" onClose={() => setPicking(null)}>
          {/* Completed is what finishing a load does; a new driver can't start there. */}
          {ALL_STATUSES.filter((s) => s !== "completed").map((s) => (
            <SheetRow key={s} selected={s === form.status} onClick={() => { set({ status: s }); setPicking(null); }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_CONFIG[s].bg, flexShrink: 0 }} />{STATUS_CONFIG[s].label}
            </SheetRow>
          ))}
        </Sheet>
      )}
      {(picking === "trucks" || picking === "trailers") && (
        <UnitSheet kind={picking} current={picking === "trucks" ? form.truckId : form.trailerId}
          onClose={() => setPicking(null)}
          onPick={(u) => {
            set(picking === "trucks" ? { truckId: u?.id ?? "", truck: u?.unit ?? "" } : { trailerId: u?.id ?? "", trailer: u?.unit ?? "" });
            setProblems((p) => ({ ...p, truck: undefined, trailer: undefined }));
            setPicking(null);
          }} />
      )}
    </div>
  );
}

// ─── Picking a truck or a trailer ─────────────────────────────────────────────

// Every unit is listed with whoever has it now, so taking one from another driver is a
// choice made knowingly rather than a surprise.
function UnitSheet({ kind, current, onPick, onClose }: { kind: "trucks" | "trailers"; current: string; onPick: (u: Unit | null) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Unit[] | null>(null);
  const [error, setError] = useState("");
  const one = kind === "trucks" ? "truck" : "trailer";
  useEffect(() => {
    let stale = false;
    const t = setTimeout(() => {
      listUnits(kind, q.trim()).then((r) => { if (!stale) { setRows(r); setError(""); } }).catch((e) => { if (!stale) setError(friendlyError(e, `Couldn't load ${kind}.`)); });
    }, q ? 300 : 0);
    return () => { stale = true; clearTimeout(t); };
  }, [q, kind]);

  return (
    <Sheet title={kind === "trucks" ? "Truck" : "Trailer"} onClose={onClose} tall>
      <label className="search"><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${one} number`} aria-label={`Search ${kind}`} /></label>
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      {!rows && !error && <div className="center"><span className="spinner" /></div>}
      {rows?.map((u) => (
        <SheetRow key={u.id} selected={u.id === current} onClick={() => onPick(u)}>
          <span className="ell" style={{ flex: 1 }}>{u.unit || "No number"}{u.takenBy && u.id !== current && <span className="sub"> · with {u.takenBy}</span>}</span>
          {u.id === current && <Check size={18} style={{ color: "var(--pine)" }} />}
        </SheetRow>
      ))}
      {rows && rows.length === 0 && <div className="center">{q ? `No ${kind} match.` : `No ${kind} yet.`}</div>}
      {rows && current && <SheetRow onClick={() => onPick(null)}><span style={{ color: "var(--muted)" }}>No {one}</span></SheetRow>}
    </Sheet>
  );
}
