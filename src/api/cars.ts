import { request, sendJson } from "./request";

/** One car the dealership sells. */
export type CarModelInfo = {
  id: string;
  name: string;
  /** What people on the street call it: "Muscle". */
  nickname: string;
  year: number;
  /** "Brand new", "Tokunbo" (foreign used) or "Nigerian used". */
  condition: string;
  body: string;
  price: number;
  engine: string;
  zero_to_100: number;
  vip?: boolean;       // sold in the VIP lounge
  top_kmh: number;
  seats: number;
  blurb: string;
  colours: string[];
};

export type CarColour = { id: string; name: string; hex: string };

/** A car this player owns. */
export type OwnedCar = { id: number; model: string; colour: string; plate: string; paid: number };

export type CarParked = { car_id: number; district: string; x: number; z: number; rot: number };

export type Cars = {
  catalogue: CarModelInfo[];
  colours: CarColour[];
  cars: OwnedCar[];
  money: number;
  /** Buying happens at the dealership only. */
  at_dealer: boolean;
  /** The car they are driving, if they are. */
  driving: number | null;
  /** Their car standing on the street, if one is out. */
  parked: CarParked | null;
};

export function fetchCars(playerId: string): Promise<Cars> {
  return request<Cars>(`/players/${playerId}/cars`);
}

export function buyCar(playerId: string, model: string, colour: string): Promise<Cars> {
  return request<Cars>(`/players/${playerId}/cars`, sendJson("POST", { model, colour }));
}

export function sellCar(playerId: string, carId: number): Promise<Cars> {
  return request<Cars>(`/players/${playerId}/cars/${carId}`, { method: "DELETE" });
}

/** The driver leaves the car at (x, z), facing `rot`: next to the player. */
export function bringCar(playerId: string, carId: number, x: number, z: number, rot: number): Promise<Cars> {
  return request<Cars>(`/players/${playerId}/cars/${carId}/bring`, sendJson("POST", { x, z, rot }));
}

export function getIn(playerId: string, carId: number): Promise<Cars> {
  return request<Cars>(`/players/${playerId}/cars/${carId}/drive`, sendJson("POST", {}));
}

export function getOut(playerId: string): Promise<Cars> {
  return request<Cars>(`/players/${playerId}/cars/park`, sendJson("POST", {}));
}

export function sendCarHome(playerId: string): Promise<Cars> {
  return request<Cars>(`/players/${playerId}/cars/home`, sendJson("POST", {}));
}

/** "model|colour|plate": how a car is drawn. */
export function carLook(car: OwnedCar): string {
  return `${car.model}|${car.colour}|${car.plate}`;
}

// ---- riding in someone else's car ----------------------------------------------------------

export type Ride = { driver_id: string | null; passengers: string[]; seats: number; locked: boolean };

export function joinRide(playerId: string, driverId: string): Promise<Ride> {
  return request<Ride>(`/players/${playerId}/ride`, sendJson("POST", { driver_id: driverId }));
}

export function leaveRide(playerId: string): Promise<Ride> {
  return request<Ride>(`/players/${playerId}/ride/out`, { method: "POST" });
}

export function setDoors(playerId: string, locked: boolean): Promise<Ride> {
  return request<Ride>(`/players/${playerId}/car/doors`, sendJson("POST", { locked }));
}

export function everyoneOut(playerId: string): Promise<Ride> {
  return request<Ride>(`/players/${playerId}/car/everyone-out`, { method: "POST" });
}

/** Off the end of a main road into the next district, still driving. */
export function driveAcross(playerId: string, linkId: string): Promise<Cars> {
  return request<Cars>(`/players/${playerId}/drive-across/${linkId}`, { method: "POST" });
}
