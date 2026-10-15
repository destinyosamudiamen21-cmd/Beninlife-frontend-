import { useState } from "react";
import type { StoryPath, StoryQuestion, StoryResult } from "../api/story";

type Props = {
  /** The questions for each of the two lives. */
  questions: Record<StoryPath, StoryQuestion[]>;
  /** Send the chosen life and the answers to the server and get the story back. */
  onTell: (
    path: StoryPath,
    answers: Record<string, string>
  ) => Promise<StoryResult>;
  /** The player has read their story and wants to start. */
  onDone: (result: StoryResult) => void;
};

const STREET_MARKS = ["", "●○○", "●●○", "●●●"];

// The two lives, as they are offered on the first screen.
const LIVES: {
  path: StoryPath;
  letter: string;
  name: string;
  blurb: string;
}[] = [
  {
    path: "student",
    letter: "A",
    name: "Student",
    blurb:
      "A fresher at UNIBEN. You start in your hostel room with a little money, a timetable and roommates. Lectures, assignments, tests, and everything else a campus has.",
  },
  {
    path: "citizen",
    letter: "B",
    name: "Normal Citizen",
    blurb:
      "Benin is your city and you have a place of your own in it. Work, hustle, buy and sell, and build your life from there.",
  },
];

export function StoryQuiz({ questions: all, onTell, onDone }: Props) {
  const [path, setPath] = useState<StoryPath | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<StoryResult | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  if (result) {
    return (
      <div className='story'>
        <div className='story-card story-result'>
          <p className='story-kicker'>Your story</p>
          <h2>{result.title}</h2>
          <p className='story-blurb'>{result.blurb}</p>

          <dl className='story-facts'>
            <div>
              <dt>Money</dt>
              <dd>₦{result.cash.toLocaleString()}</dd>
            </div>
            <div>
              <dt>{result.path === "student" ? "Room" : "House"}</dt>
              <dd>{result.home_name}</dd>
            </div>
            {result.path === "student" && (
              <div>
                <dt>From home</dt>
                <dd>₦{result.allowance.toLocaleString()} a week</dd>
              </div>
            )}
            <div>
              <dt>Street sense</dt>
              <dd>
                {result.street_name}{" "}
                <span className='story-marks'>
                  {STREET_MARKS[result.street] ?? ""}
                </span>
              </dd>
            </div>
          </dl>
          <p className='story-note'>{result.street_note}</p>

          <button
            type='button'
            className='primary story-go'
            onClick={() => onDone(result)}
          >
            {result.path === "student" ? "Go to my room" : "Start my life"}
          </button>
        </div>
      </div>
    );
  }

  // First of all: which life?
  if (path === null) {
    return (
      <div className='story'>
        <style>{`
          .story-life { display: flex; gap: 12px; align-items: flex-start; text-align: left; width: 100%; }
          .story-life b { flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
            background: #1f2a26; color: #fff; font-size: 14px; }
          .story-life span { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
          .story-life strong { font-size: 16px; }
          .story-life small { font-size: 13px; line-height: 1.35; opacity: 0.8; font-weight: 400; }
        `}</style>
        <div className='story-card'>
          <div className='story-top'>
            <p className='story-kicker'>Your story</p>
          </div>
          <h2>Who are you in Benin City?</h2>
          <div className='story-options'>
            {LIVES.map((life) => (
              <button
                key={life.path}
                type='button'
                className='story-option'
                onClick={() => {
                  setPath(life.path);
                  setStep(0);
                  setAnswers({});
                }}
              >
                <span className='story-life'>
                  <b>{life.letter}</b>
                  <span>
                    <strong>{life.name}</strong>
                    <small>{life.blurb}</small>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className='story-small'>
            Both lives share the same city. You choose once.
          </p>
        </div>
      </div>
    );
  }

  const questions = all[path];
  const question = questions[step];
  if (!question) return null;
  const last = step === questions.length - 1;
  const picked = answers[question.id];
  const complete = questions.every((q) => answers[q.id] !== undefined);

  const choose = (optionId: string) => {
    setError("");
    setAnswers((current) => ({ ...current, [question.id]: optionId }));
    // Picking an answer moves on by itself. The last one waits, so the story is never sent by a slip.
    if (!last) setStep(step + 1);
  };

  const finish = async () => {
    if (!complete || sending) return;
    setSending(true);
    setError("");
    try {
      setResult(await onTell(path, answers));
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Could not save your story. Try again."
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className='story'>
      <div className='story-card'>
        <div className='story-top'>
          <p className='story-kicker'>
            Your story · {step + 1} of {questions.length}
          </p>
          <div className='story-dots' aria-hidden='true'>
            {questions.map((q, index) => (
              <span
                key={q.id}
                className={index < step ? "done" : index === step ? "now" : ""}
              />
            ))}
          </div>
        </div>

        <h2>{question.text}</h2>

        <div className='story-options'>
          {question.options.map((option) => (
            <button
              key={option.id}
              type='button'
              className={`story-option${
                picked === option.id ? " selected" : ""
              }`}
              onClick={() => choose(option.id)}
            >
              {option.text}
            </button>
          ))}
        </div>

        {error && <p className='error'>{error}</p>}

        <div className='story-actions'>
          <button
            type='button'
            className='ghost'
            onClick={() => (step === 0 ? setPath(null) : setStep(step - 1))}
            disabled={sending}
          >
            Back
          </button>
          {last && (
            <button
              type='button'
              className='primary'
              onClick={() => void finish()}
              disabled={!complete || sending}
            >
              {sending ? "Writing…" : "This is my story"}
            </button>
          )}
        </div>
        <p className='story-small'>
          Answer how it really was. Your story is written once and decides how
          you start.
        </p>
      </div>
    </div>
  );
}
