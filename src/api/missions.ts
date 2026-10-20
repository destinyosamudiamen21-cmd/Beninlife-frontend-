import { request } from "./request";

export type MissionStep = { text: string; progress: number; target: number; done: boolean; place: string };

export type Mission = {
  id: string;
  chapter: string;
  title: string;
  giver: string;
  story: string;
  steps: MissionStep[];
  reward: number;
  done: boolean;
};

export type Chapter = { name: string; done: number; total: number };

export type Missions = { active: Mission[]; chapters: Chapter[]; claimed: number; total: number; money: number; news: string[] };

export function fetchMissions(playerId: string): Promise<Missions> {
  return request<Missions>(`/players/${playerId}/missions`);
}

/** Collect a finished mission's reward. The answer has the next missions in it. */
export function claimMission(playerId: string, missionId: string): Promise<Missions> {
  return request<Missions>(`/players/${playerId}/missions/${encodeURIComponent(missionId)}/claim`, { method: "POST" });
}

export function missionsReady(missions: Missions | null): number {
  return missions ? missions.active.filter((mission) => mission.done).length : 0;
}
