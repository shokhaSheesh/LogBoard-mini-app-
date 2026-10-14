import { useEffect } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { takeTarget, type Target } from "../lib/deeplink";
import { fromReading } from "../lib/extract";
import { toast } from "./ui";

// Opens what the bot's "📱 Open in Brelo" button pointed at (see lib/deeplink): a draft the
// bot read from a rate confirmation goes into the New load form, ready to finish; a load
// opens on its own page.
//
// Both belong to one of the user's companies, and the server answers only for the company
// the request is made in. So the active company is asked first, then the user's others; the
// one that answers becomes the active company, as if they had switched to it themselves.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

// Where a draft has got to, when it is not something the form can open.
const NOT_READY: Record<string, string> = {
  choosing: "Pick the company in the bot's chat first, then open it again.",
  reading: "The bot is still reading this file. Try again in a moment.",
  creating: "This load is being created. Try again in a moment.",
  failed: "The bot couldn't read this file. Send it again.",
  discarded: "This draft was discarded.",
};

export function OpenFromBot() {
  const { companies, companyId, switchCompany } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const target = takeTarget();
    if (target) void open(target);
    // Once, at start: the target is read when the app opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The first of the user's companies that has this, and what it said.
  async function find(path: string): Promise<{ company: string; data: Raw } | null> {
    const order = [companyId, ...companies.map((c) => c.id).filter((id) => id && id !== companyId)].filter(Boolean);
    for (const company of order) {
      const data = await api.getAs<Raw>(path, company).catch(() => null);
      if (data) return { company, data };
    }
    return null;
  }

  async function open(t: Target) {
    const found = await find(t.kind === "draft" ? `/telegram/drafts/${t.id}` : `/loads/${t.id}`);
    if (!found) {
      toast.error(t.kind === "draft"
        ? "This draft is no longer available. Drafts last 48 hours — send the file to the bot again."
        : "This load isn't available to you.");
      return;
    }
    if (found.company !== companyId) await switchCompany(found.company).catch(() => {});

    if (t.kind === "load") { navigate(`/loads/${t.id}`); return; }

    const d = found.data;
    if (d.state === "created" && d.load_id) { navigate(`/loads/${d.load_id}`); return; }
    if (d.state !== "ready" || !d.draft) { toast.error(NOT_READY[d.state] ?? "This draft can't be opened right now."); return; }
    navigate("/loads/new", { state: { extraction: await fromReading(d) } });
  }

  return null;
}
