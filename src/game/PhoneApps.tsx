// The phone's smaller apps: Data, School, Me and Help. Each is one screen.

import { useEffect, useRef, useState } from "react";
import { buyData, fetchData, type Life, type PhoneData } from "../api/life";
import type { StoryResult } from "../api/story";
import { fetchStudent, submitAssignment, type ClassInfo, type Student } from "../api/student";
import { Screen, dataText, naira, words } from "./phoneKit";

const CLASS_STATUS: Record<string, string> = { attended: "You were there", open: "The door is open now", later: "Later", over: "Over" };
const NEEDS: { id: "energy" | "food" | "hygiene" | "fun" | "social"; name: string }[] = [
  { id: "energy", name: "Energy" },
  { id: "food", name: "Food" },
  { id: "hygiene", name: "Hygiene" },
  { id: "fun", name: "Fun" },
  { id: "social", name: "Social" },
];

/** A hook for the apps that fetch one thing when they open: what was fetched, and what went wrong. */
function useLoaded<T>(load: () => Promise<T>, fallback: string): { data: T | null; set: (value: T) => void; error: string; setError: (text: string) => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const loader = useRef(load);
  useEffect(() => {
    let cancelled = false;
    loader
      .current()
      .then((loaded) => !cancelled && setData(loaded))
      .catch((problem: unknown) => !cancelled && setError(words(problem, fallback)));
    return () => {
      cancelled = true;
    };
  }, [fallback]);
  return { data, set: setData, error, setError };
}

// ---- data ---------------------------------------------------------------------------------

type DataProps = { playerId: string; onMoney: (money: number) => void; onBack: () => void };

/** Buying data. Texts use it, and so do scrolling the phone and the school portal. */
export function DataApp({ playerId, onMoney, onBack }: DataProps) {
  const { data, set, error, setError } = useLoaded<PhoneData>(() => fetchData(playerId), "Could not check your data.");
  const [busy, setBusy] = useState(false);

  const buy = async (bundle: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const bought = await buyData(playerId, bundle);
      set(bought);
      onMoney(bought.money);
    } catch (problem) {
      setError(words(problem, "Could not buy that."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Data" sub="Bundles for your line" onBack={onBack}>
      {error && <p className="ph-error">{error}</p>}
      {data && (
        <>
          <div className="ph-facts">
            <div>
              <span>Data left</span>
              <strong>{dataText(data.data_mb)}</strong>
            </div>
            <div>
              <span>Money</span>
              <strong>{naira(data.money)}</strong>
            </div>
          </div>
          <div className="ph-list">
            {data.bundles.map((bundle) => (
              <div key={bundle.id} className="ph-item">
                <div className="ph-lines">
                  <strong>{bundle.name}</strong>
                  <span>{naira(bundle.price)}</span>
                </div>
                <button type="button" className="ph-mini" onClick={() => void buy(bundle.id)} disabled={busy || bundle.price > data.money}>
                  Buy
                </button>
              </div>
            ))}
          </div>
          <p className="ph-small">Data is used by texts, by scrolling your phone, and by the school portal. Sending money uses none.</p>
        </>
      )}
    </Screen>
  );
}

// ---- school -------------------------------------------------------------------------------

type SchoolProps = { playerId: string; onBack: () => void };

/** The school portal: today's classes, attendance, the assignment in hand and money from home. */
export function SchoolApp({ playerId, onBack }: SchoolProps) {
  const { data: school, set, error, setError } = useLoaded<Student>(() => fetchStudent(playerId), "Could not open the portal.");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const handed = await submitAssignment(playerId);
      set(handed.student);
      setSaid(handed.lines.join(" "));
    } catch (problem) {
      setError(words(problem, "Could not submit it."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="School" sub={school?.day_name ?? "The student portal"} onBack={onBack}>
      {error && <p className="ph-error">{error}</p>}
      {said && <p className="ph-note">{said}</p>}
      {school && (
        <>
          <div className="ph-facts">
            <div>
              <span>Attendance</span>
              <strong>{school.attendance}%</strong>
            </div>
            <div>
              <span>CGPA</span>
              <strong>{school.graded > 0 ? `${school.cgpa.toFixed(2)} · ${school.grade}` : "Not marked yet"}</strong>
            </div>
            <div>
              <span>Ready for the test</span>
              <strong>{school.study}%</strong>
            </div>
            <div>
              <span>From home, {school.next_allowance}</span>
              <strong>{naira(school.allowance)}</strong>
            </div>
          </div>
          <h3 className="ph-heading">Classes</h3>
          <div className="ph-list">
            {school.today.map((lesson) => (
              <Lesson key={`${lesson.day}-${lesson.time}`} lesson={lesson} />
            ))}
            {school.today.length === 0 && school.next_class && <Lesson lesson={school.next_class} next />}
          </div>
          <h3 className="ph-heading">Assignment</h3>
          {school.assignment ? (
            <div className="ph-item">
              <div className="ph-lines">
                <strong>{school.assignment.code}</strong>
                <span>Due {school.assignment.due}</span>
                <div className="ph-bar" role="img" aria-label={`${school.assignment.work}% done`}>
                  <span style={{ width: `${school.assignment.work}%` }} />
                </div>
              </div>
              <button type="button" className="ph-mini" onClick={() => void submit()} disabled={busy || !school.assignment.ready || school.data_mb < school.submit_data}>
                {school.assignment.ready ? "Submit" : `${school.assignment.work}%`}
              </button>
            </div>
          ) : (
            <p className="ph-small">No assignment in hand.</p>
          )}
          {school.assignment?.ready && school.data_mb < school.submit_data && (
            <p className="ph-small">The portal needs {school.submit_data} MB and you have {dataText(school.data_mb)}. Buy data first.</p>
          )}
          {school.friends.length > 0 && (
            <p className="ph-small">
              {school.friends.map((friend) => `${friend.name}: ${friend.partner ? "your person" : friend.level.toLowerCase()}`).join(" · ")}
            </p>
          )}
          <p className="ph-small">Classes are inside 500 LT, at 8:00 am and 1:00 pm. The door opens an hour before and is locked half an hour after the start. Early? Sit on a bench and wait for the lecturer.</p>
        </>
      )}
    </Screen>
  );
}

function Lesson({ lesson, next = false }: { lesson: ClassInfo; next?: boolean }) {
  return (
    <div className="ph-item">
      <div className="ph-lines">
        <strong>
          {lesson.code}
          {lesson.test ? " · TEST" : ""}
        </strong>
        <span>
          {lesson.title} · {next ? `Day ${lesson.day}, ` : ""}
          {lesson.time}
        </span>
      </div>
      <b className="ph-in">{CLASS_STATUS[lesson.status] ?? lesson.status}</b>
    </div>
  );
}

// ---- me -----------------------------------------------------------------------------------

type MeProps = { username: string; money: number; life: Life | null; story: StoryResult | null; onBack: () => void; onSignOut?: () => void };

/** The player at a glance: how they are, what they are good at, and the life they started with. */
export function MeApp({ username, money, life, story, onBack, onSignOut }: MeProps) {
  return (
    <Screen title={`@${username}`} sub={story ? story.title : "You"} onBack={onBack}>
      <div className="ph-facts">
        <div>
          <span>Money</span>
          <strong>{naira(money)}</strong>
        </div>
        <div>
          <span>Mood</span>
          <strong>{life ? life.needs.mood_name : "…"}</strong>
        </div>
      </div>
      {life && (
        <>
          <h3 className="ph-heading">
            How you are · Day {life.clock.day}, {life.clock.text}
          </h3>
          <div className="ph-card">
            {NEEDS.map((need) => {
              const value = life.needs[need.id];
              return (
                <div key={need.id} className="ph-need">
                  <span>{need.name}</span>
                  <div className={`ph-bar${value < 20 ? " urgent" : value < 45 ? " low" : ""}`} role="img" aria-label={`${need.name}: ${value} of 100`}>
                    <span style={{ width: `${value}%` }} />
                  </div>
                  <b>{value}</b>
                </div>
              );
            })}
          </div>
          {life.skills.length > 0 && (
            <>
              <h3 className="ph-heading">What you are good at</h3>
              <div className="ph-facts">
                {life.skills.map((skill) => (
                  <div key={skill.id}>
                    <span>{skill.name}</span>
                    <strong>Level {skill.level}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {story && (
        <>
          <h3 className="ph-heading">Your story</h3>
          <div className="ph-facts">
            <div>
              <span>You stay in</span>
              <strong>{story.home_name}</strong>
            </div>
            <div>
              <span>Street sense</span>
              <strong>{story.street_name}</strong>
            </div>
          </div>
          <p className="ph-small">{story.street_note}</p>
        </>
      )}
      {onSignOut && (
        <button type="button" className="ph-plain" style={{ color: "#ff3b30", marginTop: 8 }} onClick={onSignOut}>
          Sign out
        </button>
      )}
    </Screen>
  );
}

// ---- help ---------------------------------------------------------------------------------

const HELP: [string, string][] = [
  ["Walking", "Drag anywhere on the street, or use W A S D. Drag further, or hold Shift, to run."],
  ["Looking round", "Pinch to zoom and twist two fingers to swing the camera right round you. On a computer: scroll to zoom, drag with the right button or press Q and E to turn. The compass turns you back to north."],
  ["Getting about", "Open the Map and press a place. Trekking is free and an arrow shows the way. The bus is cheapest but stops at the bus stop. A keke, a bike or a cab takes you to the door."],
  ["Talking", "The bar at the bottom of the street says it out loud to whoever is near. The microphone beside it is your voice, for whoever is standing with you."],
  ["Stuck?", "If you push and go nowhere for a few seconds, a Get me out button comes up: it puts you at your area's bus stop. Not in a car, and not with the police on you."],
  ["Missions", "Press Missions at the top of the street. Each one says what to do and who wants it done; Show me opens the map on the place. Finish every step and press Collect for the money. Daily and weekly goals are on the other tab."],
  ["Jobs", "Open the Jobs app. Oba Trust Bank and Edo Tech Hub on Boundary Road, GRA, hire at reception in office hours: have a bath first. Work shifts at your desk to get promoted and paid more. The app lists every other way to earn too."],
  ["Messages", "A text reaches anyone, wherever they are. Each one takes a little data."],
  ["Friends", "Save somebody's number. When they save yours you are friends, and can see when the other is in the game and which part of town they are in."],
  ["Money", "Send money from a conversation or from the Bank. It arrives at once. There is a limit to how much can be sent and received in a day."],
  ["Your house", "At home, press Build. Buy: pick from the catalogue, tap where it goes, tap again to buy. Tap anything you own to move, turn or sell it. Build: add a room against the house and pay the workers stage by stage. Paint: tap a room to try new walls and floors."],
];

/** How the game is played, for anyone who has just arrived. */
export function HelpApp({ onBack }: { onBack: () => void }) {
  return (
    <Screen title="How to play" sub="The short version" onBack={onBack}>
      <div className="ph-list">
        {HELP.map(([title, text]) => (
          <div key={title} className="ph-item tall">
            <div className="ph-lines">
              <strong>{title}</strong>
              <span>{text}</span>
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}
