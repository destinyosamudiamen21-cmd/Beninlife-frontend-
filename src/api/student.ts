import { request } from "./request";

export type ClassInfo = {
  code: string;
  title: string;
  day: number;
  time: string;
  test: boolean;
  /** "attended", "open" (the door is open now), "later" or "over". */
  status: string;
};

export type Assignment = {
  code: string;
  work: number;
  due: string;
  ready: boolean;
};

export type Friend = {
  who: string;
  name: string;
  points: number;
  level: string;
  partner: boolean;
};

export type Student = {
  is_student: boolean;
  day_name: string;
  today: ClassInfo[];
  next_class: ClassInfo | null;
  attended: number;
  missed: number;
  /** Per cent. */
  attendance: number;
  /** How ready they are for the next test, 0 to 100. */
  study: number;
  assignment: Assignment | null;
  cgpa: number;
  grade: string;
  graded: number;
  allowance: number;
  next_allowance: string;
  friends: Friend[];
  /** Megabytes it takes to submit an assignment. */
  submit_data: number;
  data_mb: number;
  money: number;
};

export function fetchStudent(playerId: string): Promise<Student> {
  return request<Student>(`/players/${playerId}/student`);
}

export function submitAssignment(
  playerId: string
): Promise<{ student: Student; lines: string[] }> {
  return request<{ student: Student; lines: string[] }>(
    `/players/${playerId}/student/submit`,
    { method: "POST" }
  );
}
