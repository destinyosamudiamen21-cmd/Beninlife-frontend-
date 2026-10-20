import { request } from "./request";

/** Today's spending and the daily limit, and what the next raise costs. */
export type Spending = {
  day: string;
  spent: number;
  /** Today's limit. */
  allowance: number;
  left: number;
  /** The tier bought today (0: none). */
  level: number;
  /** There is a tier above: false at the top. */
  can_raise: boolean;
  /** Today's free allowance. */
  free: number;
  /** A day with a bigger free allowance (the birthday). */
  special_day: boolean;
  tiers: Tier[];
  /** What the next raise takes the limit to. */
  next_allowance: number;
  next_price_kobo: number;
  /** "₦100" */
  next_price: string;
  /** Real payments are set up on the server. */
  payments: boolean;
  /** Pretend payments, for trying it out (never on the live server). */
  test_payments: boolean;
};

export type Tier = { number: number; limit: number; price: string; bought: boolean; useful: boolean };

export type RaiseStarted = { reference: string; checkout_url: string | null; price: string };
export type RaiseResult = { paid: boolean; status: string; spending: Spending };

export function fetchSpending(playerId: string): Promise<Spending> {
  return request<Spending>(`/players/${playerId}/spending`);
}

/** Start paying for a raise: the server writes the payment down and opens a checkout page. */
export function startRaise(playerId: string): Promise<RaiseStarted> {
  return request<RaiseStarted>(`/players/${playerId}/spending/raise`, { method: "POST" });
}

/** Has it been paid? The server asks the payment company itself. */
export function checkRaise(playerId: string, reference: string): Promise<RaiseResult> {
  return request<RaiseResult>(`/players/${playerId}/spending/raise/${encodeURIComponent(reference)}`);
}

export function pretendToPay(playerId: string, reference: string): Promise<RaiseResult> {
  return request<RaiseResult>(`/players/${playerId}/spending/raise/${encodeURIComponent(reference)}/pretend`, { method: "POST" });
}
