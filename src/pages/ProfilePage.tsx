import { useState } from "react";
import { Check, KeyRound, LogOut } from "lucide-react";
import { useAuth } from "../lib/auth";
import { friendlyError } from "../lib/errors";
import { haptic } from "../lib/telegram";

const ROLE: Record<string, string> = { owner: "Owner", dispatcher: "Dispatcher", updater: "Updater" };
const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

export function ProfilePage() {
  const { user, companies, companyId, linked, switchCompany, logout } = useAuth();
  const [switching, setSwitching] = useState("");
  const [error, setError]         = useState("");
  if (!user) return null;

  const pick = async (id: string) => {
    if (id === companyId || switching) return;
    setSwitching(id);
    setError("");
    try {
      await switchCompany(id);
      haptic.success();
    } catch (e) {
      setError(friendlyError(e, "Couldn't switch company. Try again."));
    } finally {
      setSwitching("");
    }
  };

  return (
    <div className="scroll">
      <h1 className="title">Profile</h1>

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--pine-soft)", color: "var(--pine)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>
          {initialsOf(user.full_name)}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="ell" style={{ fontSize: 15, fontWeight: 600 }}>{user.full_name}</div>
          <div className="sub ell">{ROLE[user.role] ?? user.role} · {user.login || user.email}</div>
        </div>
      </div>

      {/* The web sends a new user to replace the password they were handed, but lets them
          carry on if they don't. Same here: a reminder, not a wall. */}
      {user.must_change_password && (
        <div className="card" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <KeyRound size={17} style={{ color: "var(--pine)", flexShrink: 0, marginTop: 1 }} />
          <span className="sub" style={{ fontSize: 13 }}>You're still on a temporary password. Change it in Brelo on the web, under Settings.</span>
        </div>
      )}

      <div className="label">{companies.length > 1 ? "Companies" : "Company"}</div>
      {companies.length === 0 ? (
        <div className="card sub">No company yet.</div>
      ) : (
        <div className="rows">
          {companies.map((c) => {
            const active = c.id === companyId;
            return (
              <button key={c.id} onClick={() => pick(c.id)} aria-pressed={active} disabled={!!switching}>
                <span style={{ minWidth: 0 }}>
                  <span className="ell" style={{ display: "block", fontWeight: active ? 600 : 500 }}>{c.name}</span>
                  {c.plan && <span className="sub">{c.plan} plan</span>}
                </span>
                {switching === c.id ? <span className="spinner" style={{ color: "var(--muted)" }} />
                  : active ? <Check size={18} style={{ color: "var(--pine)", flexShrink: 0 }} />
                  : <span className="sub">Switch</span>}
              </button>
            );
          })}
        </div>
      )}
      {error && <div className="error" role="alert">{error}</div>}

      <div className="label">Account</div>
      <div className="rows">
        {linked && (
          <div>
            <span>Telegram</span>
            <span className="sub">Opens without a password</span>
          </div>
        )}
        <button onClick={logout} style={{ color: "var(--danger)", justifyContent: "flex-start" }}>
          <LogOut size={17} /> {linked ? "Sign out and unlink" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
