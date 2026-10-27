import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, clearSession, getCompanyId, getToken, onSessionExpired, setCompanyId, setToken } from "./api";
import { inTelegram, launchData } from "./telegram";

export interface AuthUser {
  id: string;
  kind: string;
  role: "owner" | "dispatcher" | "updater";
  login: string;
  email: string;
  full_name: string;
  company_id: string;
  // The company the caller is acting as; absent when none is resolved yet.
  company?: { id: string; name: string; initials: string; color: string; week_start_day: number; mc?: string };
  must_change_password: boolean;
  // "<module>.<action>" keys for the active company — what decides which tabs show.
  permissions: string[];
}

export interface Company { id: string; name: string; initials: string; color: string }

interface AuthState {
  user: AuthUser | null;
  loading: boolean;              // the first "are we signed in?" check
  companies: Company[];          // an owner's companies; one entry for everyone else
  companyId: string;
  // Whether this Telegram account opens Brelo without a password (see telegramSignIn).
  linked: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchCompany: (id: string) => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/** Whether the user may open a page, by its permission module ("loads", "gross", …). */
export function can(user: AuthUser | null, module: string, action = "read"): boolean {
  if (!user) return false;
  return user.permissions?.includes(`${module}.${action}`) ?? false;
}

// Signing in through Telegram. Telegram signs a note of who opened the mini app; the API
// checks it, and if that Telegram account has been linked to a Brelo user it answers with a
// session — no password. It is tried quietly: outside Telegram, before the account is
// linked, or on a server without the feature, it simply reports false and the ordinary
// sign-in takes over.
async function telegramSignIn(): Promise<boolean> {
  if (!inTelegram) return false;
  try {
    const data = await api.post<{ token: string; user: AuthUser }>("/auth/telegram", { init_data: launchData });
    setToken(data.token);
    if (data.user.company_id) setCompanyId(data.user.company_id);
    return true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setActive] = useState(getCompanyId());
  const [linked, setLinked] = useState(false);

  // Who am I, and for which company? Permissions are per company, so an owner — whose
  // token names no company — must have one chosen before /auth/me can answer fully:
  // the one they used last, or their first.
  const load = useCallback(async () => {
    let me = await api.get<AuthUser>("/auth/me");
    if (me.role === "owner") {
      const list = await api.get<Company[]>("/owner/accounts").catch(() => [] as Company[]);
      setCompanies(list);
      const chosen = list.find((c) => c.id === getCompanyId()) ?? list[0];
      if (chosen && chosen.id !== me.company?.id) {
        setCompanyId(chosen.id);
        me = await api.get<AuthUser>("/auth/me");
      }
      setActive(chosen?.id ?? "");
    } else {
      if (me.company_id) setCompanyId(me.company_id);
      setActive(me.company_id);
      setCompanies(me.company ? [{ id: me.company.id, name: me.company.name, initials: me.company.initials, color: me.company.color }] : []);
    }
    setUser(me);
  }, []);

  useEffect(() => {
    (async () => {
      // Inside Telegram, a linked account gets a fresh session on every open, so it never
      // meets an expired one. Otherwise whatever session was kept from last time is used.
      const viaTelegram = await telegramSignIn();
      setLinked(viaTelegram);
      if (!viaTelegram && !getToken()) return;
      // A dead token is cleared by the API client. Anything else (offline, a 5xx) must not
      // sign the user out — reopening the app recovers.
      await load().catch(() => {});
    })().finally(() => setLoading(false));
  }, [load]);

  // The server ended the session mid-use. A linked Telegram account just gets a new one and
  // carries on; anyone else is shown the sign-in screen.
  useEffect(() => onSessionExpired(() => {
    telegramSignIn().then((ok) => {
      if (ok) return load().catch(() => {});
      setUser(null); setCompanies([]); setActive(""); setLinked(false);
    });
  }), [load]);

  const login = useCallback(async (loginName: string, password: string) => {
    // The API signs in on `login`; it also accepts an email there, so the one field serves both.
    const data = await api.post<{ token: string; user: AuthUser }>("/auth/login", { login: loginName, email: loginName, password });
    setToken(data.token);
    if (data.user.company_id) setCompanyId(data.user.company_id);
    // They have just proved the password, inside this Telegram account: remember the pair,
    // so the next open needs no password. Best-effort — the sign-in itself has succeeded.
    if (inTelegram) {
      await api.post("/auth/telegram/link", { init_data: launchData }).then(() => setLinked(true)).catch(() => setLinked(false));
    }
    await load();
  }, [load]);

  const logout = useCallback(async () => {
    // Signing out has to unlink first, or the very next open would sign straight back in.
    if (inTelegram) await api.delete("/auth/telegram/link").catch(() => {});
    await api.post("/auth/logout").catch(() => {}); // the token may already be dead
    clearSession();
    setUser(null); setCompanies([]); setActive(""); setLinked(false);
  }, []);

  const switchCompany = useCallback(async (id: string) => {
    setCompanyId(id);
    setActive(id);
    setUser(await api.get<AuthUser>("/auth/me"));
  }, []);

  return <Ctx.Provider value={{ user, loading, companies, companyId, linked, login, logout, switchCompany }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
