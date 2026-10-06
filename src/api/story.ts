import { request, sendJson } from "./request";

export type StoryOption = { id: string; text: string };
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
};

export type StoryState = {
  done: boolean;
  questions: StoryQuestion[];
  result: StoryResult | null;
  money: number;
};

export function fetchStory(playerId: string): Promise<StoryState> {
  return request<StoryState>(`/players/${playerId}/story`);
}

/** Answers are question id -> option id. The server works out what they mean. */
export function tellStory(
  playerId: string,
  answers: Record<string, string>
): Promise<StoryResult> {
  return request<StoryResult>(
    `/players/${playerId}/story`,
    sendJson("POST", { answers })
  );
}
