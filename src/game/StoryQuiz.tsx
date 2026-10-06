import { useState } from "react";
import type { StoryQuestion, StoryResult } from "../api/story";

type Props = {
  questions: StoryQuestion[];
  /** Send the answers to the server and get the story back. */
  onTell: (answers: Record<string, string>) => Promise<StoryResult>;
  /** The player has read their story and wants to start. */
  onDone: (result: StoryResult) => void;
};

const STREET_MARKS = [
  "",
  "\u25cf\u25cb\u25cb",
  "\u25cf\u25cf\u25cb",
  "\u25cf\u25cf\u25cf",
];

export function StoryQuiz({ questions, onTell, onDone }: Props) {
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
              <dt>House</dt>
              <dd>{result.home_name}</dd>
            </div>
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
            Start my life
          </button>
        </div>
      </div>
    );
  }

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
      setResult(await onTell(answers));
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
            onClick={() => setStep(step - 1)}
            disabled={step === 0 || sending}
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
