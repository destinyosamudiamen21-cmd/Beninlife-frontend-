// The roads between districts: drive off the end of one and you come out in the next.
// The list is frontend/public/map/links.json (the server has the same in places.py).

export type RoadLink = {
  id: string;
  district: string;
  x: number;
  z: number;
  to: string;
  to_district: string;
  to_name: string;
  arrive_x: number;
  arrive_z: number;
  arrive_rot: number;
};

let loaded: Promise<{ reach: number; links: RoadLink[] }> | null = null;

export function loadLinks(): Promise<{ reach: number; links: RoadLink[] }> {
  if (!loaded) {
    loaded = fetch("/map/links.json")
      .then((res) => (res.ok ? res.json() : { reach: 14, links: [] }))
      .catch(() => {
        loaded = null; // try again next time
        return { reach: 14, links: [] };
      });
  }
  return loaded;
}

/** The exit a car at (x, z) in this district has reached, or null. */
export function exitAt(links: readonly RoadLink[], reach: number, district: string, x: number, z: number): RoadLink | null {
  for (const link of links) {
    if (link.district === district && Math.hypot(link.x - x, link.z - z) < reach) return link;
  }
  return null;
}
