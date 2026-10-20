import { request } from "./request";

export type Goal = {
  id: string;
  name: string;
  icon: string;
  target: number;
  progress: number;
  /** What collecting it pays now, the streak's bonus included. */
  reward: number;
  done: boolean;
  claimed: boolean;
};

export type Streak = {
  days: number;
  best: number;
  /** Today already counts towards it. */
  today: boolean;
  /** Days until the next week-of-streak bonus. */
  next_bonus_in: number;
};

export type Goals = {
  day: string;
  week: string;
  daily: Goal[];
  weekly: Goal[];
  streak: Streak;
  /** Seconds until today's goals change. */
  day_ends_in: number;
  week_ends_in: number;
  money: number;
  news: string[];
};

export function fetchGoals(playerId: string): Promise<Goals> {
  return request<Goals>(`/players/${playerId}/goals`);
}

/** Collect a finished goal's reward. The first daily goal collected each day keeps the streak going. */
export function claimGoal(playerId: string, goalId: string): Promise<Goals> {
  return request<Goals>(`/players/${playerId}/goals/${encodeURIComponent(goalId)}/claim`, { method: "POST" });
}

/** Goals finished and waiting to be collected. */
export function readyCount(goals: Goals | null): number {
  if (!goals) return 0;
  return [...goals.daily, ...goals.weekly].filter((goal) => goal.done && !goal.claimed).length;
}
