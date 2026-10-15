import { request, sendJson } from "./request";

export type StoryOption = { id: string; text: string };

/** The two lives a player can start. */
export type StoryPath = "citizen" | "student";
export type StoryQuestion = {
  id: string;
  text: string;
  options: StoryOption[];
};

export type StoryResult = {
  title: string;
  blurb: string;
  cash: number;
  home: string;
  home_name: string;
  street: number;
  street_name: string;
  street_note: string;
  /** Which life they chose. */
  path: StoryPath;
  /** Students: what home sends each week. */
  allowance: number;
  /** Students: where the door to their room is, out on the street. */
  door_x: number | null;
  door_z: number | null;
};

export type StoryState = {
  done: boolean;
  /** For someone starting as a citizen. */
  questions: StoryQuestion[];
  /** For someone starting as a student. */
  student_questions: StoryQuestion[];
  result: StoryResult | null;
  money: number;
};

export function fetchStory(playerId: string): Promise<StoryState> {
  return request<StoryState>(`/players/${playerId}/story`);
}

/** Answers are question id -> option id. The server works out what they mean. */
export function tellStory(
  playerId: string,
  path: StoryPath,
  answers: Record<string, string>
): Promise<StoryResult> {
  return request<StoryResult>(
    `/players/${playerId}/story`,
    sendJson("POST", { path, answers })
  );
}
