import { api } from "./api";
import { remembered } from "./cache";

// What the Profile shows about the company's subscription and fleet. Billing belongs to
// the owner; everyone else simply doesn't get it.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

export interface Billing {
  plan: string;          // "" when the company has no plan
  renewsOn: string;      // YYYY-MM-DD, or ""
  daysLeft: number | null;
  driversUsed: number;
  driversLimit: number | null; // null = unlimited
}

export function getBilling(companyId: string): Promise<Billing> {
  return remembered(`billing|${companyId}`, async () => {
    const b = await api.get<Raw>(`/owner/companies/${companyId}/billing`);
    return {
      plan: b?.current_plan?.name ?? "", renewsOn: b?.current_plan?.renews_on ?? b?.expires_at ?? "",
      daysLeft: b?.current_plan?.days_left ?? null,
      driversUsed: b?.drivers?.used ?? 0, driversLimit: b?.drivers?.limit ?? null,
    };
  });
}

/** How many trucks and trailers the company has. */
export function getFleetCounts(): Promise<{ trucks: number; trailers: number }> {
  return remembered("fleet-counts", async () => {
    const [trucks, trailers] = await Promise.all([
      api.list<Raw>("/trucks", { page: 1, page_size: 1 }),
      api.list<Raw>("/trailers", { page: 1, page_size: 1 }),
    ]);
    return { trucks: trucks.total, trailers: trailers.total };
  });
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export interface Invoice { id: string; number: string; date: string; plan: string; amount: number; currency: string; status: string }

export function listInvoices(companyId: string): Promise<Invoice[]> {
  return remembered(`invoices|${companyId}`, async () => {
    const rows = await api.get<Raw[]>(`/owner/companies/${companyId}/invoices`);
    return (rows ?? []).map((b): Invoice => ({
      id: b.id, number: b.invoice ?? b.id, date: b.date ?? b.created_at ?? "", plan: b.plan ?? b.plan_name ?? "",
      amount: b.amount ?? b.amount_paid ?? 0, currency: b.currency ?? "USD", status: b.status ?? "",
    }));
  });
}

// Hands an invoice's PDF to the phone. Inside an app's own browser (Telegram's included) a
// plain download often goes nowhere, so the share sheet is tried first — from there it can
// be saved to Files or sent on; a download link is the fallback where sharing files isn't
// offered. Returns false when the person closed the share sheet without choosing.
export async function openInvoicePdf(companyId: string, inv: Invoice): Promise<boolean> {
  const pdf = await api.blob(`/owner/companies/${companyId}/invoices/${inv.id}/pdf`);
  const name = `invoice-${inv.number}.pdf`;
  const file = new File([pdf], name, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; }
    catch (e) { if ((e as Error)?.name === "AbortError") return false; /* otherwise fall through to a download */ }
  }
  const url = URL.createObjectURL(pdf);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  // Revoked later: doing it at once can cancel the download the click just started.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
