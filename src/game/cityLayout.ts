// Benin City as the map shows it: where each district sits, the big roads between them,
// the river, and the parts of town that are not open yet.
//
// It is a drawing of the city, not a survey. Every district is shown at its true size (one
// unit here is one metre in the district), but they are moved closer together than they
// really are, so the whole city fits on one screen. Change the numbers here to move
// things about. Nothing here touches the 3D library.

import type { Bounds } from "./districtData";

export type MapPoint = { x: number; z: number };

/** Where each district's own (0, 0), its bus stop, sits on the map. North is -z, east is +x. */
export const DISTRICT_AT: Record<string, MapPoint> = {
  ringroad: { x: 0, z: 0 },
  newbenin: { x: 620, z: -900 },
  uniben: { x: -760, z: -1750 },
  gra: { x: -700, z: 820 },
  ikpoba: { x: 1720, z: -260 },
};

/** How far the map can be scrolled. */
export const MAP_EDGE = { minX: -1600, maxX: 2300, minZ: -2500, maxZ: 1400 };
/** The middle of everything, and how much to show to see all of it. */
export const WHOLE_CITY = { x: 300, z: -560, span: 3800 };

/** A spot inside a district, as a spot on the map. Null for a district the map does not have. */
export function toMap(district: string, x: number, z: number): MapPoint | null {
  const at = DISTRICT_AT[district];
  return at ? { x: at.x + x, z: at.z + z } : null;
}

/** The patch of the map a district covers. */
export function districtPatch(district: string, bounds: Bounds): Bounds | null {
  const at = DISTRICT_AT[district];
  if (!at) return null;
  return { minX: at.x + bounds.minX, maxX: at.x + bounds.maxX, minZ: at.z + bounds.minZ, maxZ: at.z + bounds.maxZ };
}

/** A big road between districts: its name, its width and its centre line (x, z, x, z ...). */
export type Trunk = { name: string; width: number; p: number[] };

export const TRUNKS: Trunk[] = [
  { name: "Ugbowo-Lagos Road", width: 26, p: [0, 0, -170, -520, -420, -1050, -640, -1500, -760, -1750, -900, -2150, -1040, -2500] },
  { name: "Mission Road", width: 22, p: [0, 0, 240, -430, 620, -900, 880, -1500, 1180, -2100, 1380, -2500] },
  { name: "Akpakpava Road", width: 24, p: [0, 0, 480, -70, 980, -150, 1500, -230] },
  { name: "Sapele Road", width: 24, p: [0, 0, 60, 480, 150, 900] },
  { name: "Airport Road", width: 22, p: [0, 0, -400, 300, -900, 620, -1300, 900] },
  { name: "Sapele Road to GRA", width: 20, p: [0, 0, -260, 420, -700, 820] },
  { name: "Benin–Agbor Road", width: 24, p: [1500, -230, 1720, -260, 2300, -300] },
  { name: "Ekenwan Road", width: 20, p: [0, 0, -600, -40, -1200, 50, -1500, 120] },
  { name: "Sakponba Road", width: 20, p: [0, 0, 420, 380, 900, 760, 1100, 900] },
  { name: "Textile Mill Road", width: 18, p: [-420, -1050, 100, -1000, 620, -900] },
];

/** The Ikpoba river, down the east side of the city. */
export const RIVER = { width: 70, p: [1120, -2500, 1040, -1800, 1190, -1000, 1090, -300, 1250, 400, 1200, 900] };

/** Parts of the city that are on the map but cannot be visited yet. */
export const COMING_SOON: { name: string; x: number; z: number }[] = [
  { name: "Airport", x: -1250, z: 420 },
  { name: "Sapele Road", x: 330, z: 700 },
  { name: "Upper Sakponba", x: 900, z: 520 },
  { name: "Ekenwan", x: -1050, z: -160 },
  { name: "Uselu", x: -180, z: -1220 },
  { name: "Aduwawa", x: 1330, z: -1350 },
];

/** What a kind of place looks like on the map: one letter-sized picture and a colour. */
export const PIN: Record<string, { glyph: string; colour: string }> = {
  stop: { glyph: "bus", colour: "#2f6f5e" },
  hostel: { glyph: "bed", colour: "#7a4a2b" },
  school: { glyph: "book", colour: "#35557a" },
  library: { glyph: "book", colour: "#35557a" },
  work: { glyph: "coin", colour: "#a9792b" },
  food: { glyph: "pot", colour: "#c8432b" },
  games: { glyph: "pad", colour: "#5b4a8a" },
  sport: { glyph: "ball", colour: "#2f6f5e" },
  fight: { glyph: "fist", colour: "#8a2a22" },
  market: { glyph: "stall", colour: "#c8432b" },
  club: { glyph: "note", colour: "#5b2a6e" },
  craft: { glyph: "mask", colour: "#a9792b" },
  museum: { glyph: "pillar", colour: "#6b5a44" },
  park: { glyph: "tree", colour: "#3f7d3a" },
  party: { glyph: "note", colour: "#b0447a" },
  police: { glyph: "shield", colour: "#1f3a6b" },
  hospital: { glyph: "cross", colour: "#2f6f5e" },
  mall: { glyph: "bag", colour: "#2f9e54" },
  shop: { glyph: "cart", colour: "#c8432b" },
  cinema: { glyph: "film", colour: "#8a1a2b" },
  lounge: { glyph: "glass", colour: "#a9792b" },
  aquarium: { glyph: "fish", colour: "#1e6fa8" },
  haunted: { glyph: "ghost", colour: "#3a3530" },
  golf: { glyph: "flag", colour: "#3f7d3a" },
  flyover: { glyph: "bridge", colour: "#5a5f66" },
  zoo: { glyph: "paw", colour: "#8a5a2b" },
  rent: { glyph: "key", colour: "#7a4a2b" },
};
export const PLAIN_PIN = { glyph: "dot", colour: "#6b5a44" };

/** The spans the map jumps to. */
export const DISTRICT_SPAN = 820;
export const PLACE_SPAN = 320;
