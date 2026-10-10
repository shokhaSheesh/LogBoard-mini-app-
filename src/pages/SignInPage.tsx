import { useState } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { BRAND_NAME, BrandMark } from "../components/Brand";
import { useAuth } from "../lib/auth";
import { friendlyError } from "../lib/errors";
import { haptic, inTelegram } from "../lib/telegram";

// The same sign-in as the web: a login and a password.
export function SignInPage() {
  const { login } = useAuth();
  const [name, setName]         = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow]         = useState(false);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || !password) { setError("Enter your login and password."); return; }
    setBusy(true);
    setError("");
    try {
      await login(name.trim(), password);
      haptic.success();
    } catch (err) {
      haptic.error();
      setError(friendlyError(err, "Couldn't sign you in. Try again."));
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <form onSubmit={submit} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12, padding: "24px 20px calc(24px + var(--safe-bottom))", maxWidth: 420, width: "100%", margin: "0 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 14, textAlign: "center" }}>
          <BrandMark size={58} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Sign in to {BRAND_NAME}</div>
            <div className="sub" style={{ fontSize: 13.5, marginTop: 2 }}>
              {inTelegram ? "Use your web login. You only do this once on this Telegram account." : "Use the same login as on the web."}
            </div>
          </div>
        </div>

        <input className="field" aria-label="Login" placeholder="Login" value={name} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          autoComplete="username" inputMode="email" aria-invalid={!!error && !name.trim()} onChange={(e) => setName(e.target.value)} />

        <div style={{ position: "relative" }}>
          <input className="field" aria-label="Password" placeholder="Password" value={password} type={show ? "text" : "password"}
            autoComplete="current-password" style={{ paddingRight: 46 }} aria-invalid={!!error && !password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)}
            style={{ position: "absolute", right: 4, top: 4, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {error && <div className="error" role="alert"><AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />{error}</div>}

        <button className="btn" type="submit" disabled={busy} style={{ marginTop: 4 }}>
          {busy && <span className="spinner" />}
          {busy ? "Signing in" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
