import { api } from "./api";

// A driver's Telegram group, and posting a load to it. The bot does the posting, and a group
// is connected in Telegram itself (the bot is added to it and someone types /assign with the
// driver's name). These are the app's side: is a group connected, disconnect it, and send.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

export interface GroupConnection { connected: boolean; title: string; linkedAt: string }

export async function getDriverGroup(driverId: string): Promise<GroupConnection> {
  const g = await api.get<Raw>(`/drivers/${driverId}/telegram-group`);
  return { connected: !!g?.connected, title: g?.title ?? "", linkedAt: g?.linked_at ?? "" };
}

export const disconnectDriverGroup = (driverId: string) => api.delete(`/drivers/${driverId}/telegram-group`);

export interface SendStatus { hasDriver: boolean; driverId: string; connected: boolean; groupTitle: string; sentAt: string }

export async function getSendStatus(loadId: string): Promise<SendStatus> {
  const s = await api.get<Raw>(`/loads/${loadId}/telegram`);
  return { hasDriver: !!s?.has_driver, driverId: s?.driver_id ?? "", connected: !!s?.connected, groupTitle: s?.group_title ?? "", sentAt: s?.sent_at ?? "" };
}

/** Posts the load, as it is stored right now, to its driver's group. Returns when. */
export const sendToDriver = async (loadId: string): Promise<string> => (await api.post<Raw>(`/loads/${loadId}/telegram`))?.sent_at ?? "";
