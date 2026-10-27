import { api } from "./api";
import { remembered } from "./cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

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
