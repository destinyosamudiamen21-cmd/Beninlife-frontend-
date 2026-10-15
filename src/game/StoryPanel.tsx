import { useEffect, useState } from "react";
import type { Story } from "./museumStories";

// Whether stories are read aloud. Kept for the whole visit, not per story.
let narrating = true;

/** A voice for the museum: an English voice from Nigeria if the device has one, then any English one. */
function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang === "en-NG") ??
    voices.find((voice) => voice.lang === "en-GB") ??
    voices.find((voice) => voice.lang.startsWith("en")) ??
    null
  );
}

function say(text: string): void {
  if (typeof speechSynthesis === "undefined") return;
  speechSynthesis.cancel();
  const line = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) line.voice = voice;
  line.rate = 0.95;
  line.pitch = 0.95;
  speechSynthesis.speak(line);
}

function hush(): void {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

type Props = { story: Story; onClose: () => void };

/** A plaque in the museum, opened: the story told a page at a time, read aloud if wanted. */
export function StoryPanel({ story, onClose }: Props) {
  const [page, setPage] = useState(0);
  const [voice, setVoice] = useState(narrating);
  const canSpeak = typeof speechSynthesis !== "undefined";

  useEffect(() => setPage(0), [story]);
  useEffect(() => {
    if (voice) say(story.pages[page]);
    else hush();
  }, [page, story, voice]);
  useEffect(() => () => hush(), []);

  const last = page === story.pages.length - 1;
  const toggle = () => {
    narrating = !voice;
    setVoice(!voice);
  };

  return (
    <div className="story" role="dialog" aria-label={story.title}>
      <style>{`
        .story { position: absolute; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 20;
          width: min(560px, calc(100vw - 24px)); background: #1c1512; color: #f6efe0; border: 2px solid #a9792b; border-radius: 16px;
          padding: 16px 18px 14px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.55); animation: story-up 0.25s ease-out; }
        @keyframes story-up { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translateX(-50%); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .story { animation: none; } }
        .story-era { font-size: 12px; font-weight: 700; color: #e2b657; }
        .story h2 { font-size: 21px; font-weight: 800; line-height: 1.15; margin: 3px 0 10px; letter-spacing: -0.01em; }
        .story p { font-size: 15.5px; line-height: 1.55; min-height: 4.6em; color: #efe4cc; }
        .story-foot { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
        .story-dots { display: flex; gap: 5px; flex: 1; }
        .story-dots i { width: 8px; height: 8px; border-radius: 50%; background: #4a3a2a; }
        .story-dots i.on { background: #e2b657; }
        .story button { border: 1.5px solid #a9792b; background: #2a201a; color: #f6efe0; border-radius: 10px; padding: 9px 13px; font-weight: 700; font-size: 14px; }
        .story button.go { background: #e2b657; color: #1c1512; border-color: #e2b657; }
        .story button[aria-pressed="true"] { background: #2f6f5e; border-color: #2f6f5e; }
      `}</style>
      <div className="story-era">{story.era}</div>
      <h2>{story.title}</h2>
      <p>{story.pages[page]}</p>
      <div className="story-foot">
        <div className="story-dots" aria-label={`Page ${page + 1} of ${story.pages.length}`}>
          {story.pages.map((_, index) => (
            <i key={index} className={index === page ? "on" : ""} />
          ))}
        </div>
        {canSpeak && (
          <button type="button" onClick={toggle} aria-pressed={voice}>
            {voice ? "Voice on" : "Voice off"}
          </button>
        )}
        {page > 0 && (
          <button type="button" onClick={() => setPage(page - 1)}>
            Back
          </button>
        )}
        <button type="button" className="go" onClick={() => (last ? onClose() : setPage(page + 1))}>
          {last ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}
