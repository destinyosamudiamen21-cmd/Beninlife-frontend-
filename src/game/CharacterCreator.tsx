import { useState } from "react";
import type { Look, LookOptions } from "../api/appearance";

type Props = {
  options: LookOptions;
  look: Look;
  firstTime: boolean;
  saving: boolean;
  error: string;
  onChange: (look: Look) => void;
  onSave: () => void;
  onCancel: () => void;
};

const SECTIONS = [
  { field: "skin_tone", label: "Skin tone", list: "skin_tones" },
  { field: "hair_color", label: "Hair", list: "hair_colors" },
  { field: "top_color", label: "Top", list: "top_colors" },
  { field: "bottom_color", label: "Bottoms", list: "bottom_colors" },
  { field: "shoe_color", label: "Shoes", list: "shoe_colors" },
] as const;

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

export function CharacterCreator({
  options,
  look,
  firstTime,
  saving,
  error,
  onChange,
  onSave,
  onCancel,
}: Props) {
  const hasBodyChoice = options.bodies.length > 1;
  // New players choose who they are first, then design them.
  const [step, setStep] = useState<"body" | "look">(
    firstTime && hasBodyChoice ? "body" : "look"
  );

  const randomise = () => {
    onChange({
      body: look.body,
      skin_tone: pick(options.skin_tones),
      hair_color: pick(options.hair_colors),
      top_color: pick(options.top_colors),
      bottom_color: pick(options.bottom_colors),
      shoe_color: pick(options.shoe_colors),
    });
  };

  const bodyButtons = (className: string) =>
    options.bodies.map((body) => (
      <button
        key={body.id}
        type='button'
        className={body.id === look.body ? `${className} selected` : className}
        aria-pressed={body.id === look.body}
        onClick={() => onChange({ ...look, body: body.id })}
      >
        {body.label}
      </button>
    ));

  if (step === "body") {
    return (
      <aside className='creator' aria-label='Choose your character'>
        <header className='creator-header'>
          <div>
            <h2>Choose your character</h2>
            <p>You can change this later from Edit look.</p>
          </div>
        </header>

        <div className='creator-body'>
          <div className='body-cards'>{bodyButtons("body-card")}</div>
        </div>

        <footer className='creator-footer'>
          <div className='creator-actions'>
            <button type='button' className='ghost' onClick={onCancel}>
              Skip for now
            </button>
            <button
              type='button'
              className='primary'
              onClick={() => setStep("look")}
            >
              Continue
            </button>
          </div>
        </footer>
      </aside>
    );
  }

  return (
    <aside className='creator' aria-label='Character creator'>
      <header className='creator-header'>
        <div>
          <h2>{firstTime ? "Design your character" : "Edit your look"}</h2>
          <p>Drag your character to turn them around.</p>
        </div>
        <button type='button' className='ghost' onClick={randomise}>
          Surprise me
        </button>
      </header>

      <div className='creator-body'>
        {hasBodyChoice && (
          <section>
            <h3>Character</h3>
            <div className='choices'>{bodyButtons("choice")}</div>
          </section>
        )}

        {SECTIONS.map((section) => (
          <section key={section.field}>
            <h3>{section.label}</h3>
            <div className='swatches'>
              {options[section.list].map((hex, index) => (
                <button
                  key={hex}
                  type='button'
                  className={
                    look[section.field] === hex ? "swatch selected" : "swatch"
                  }
                  style={{ backgroundColor: hex }}
                  aria-label={`${section.label} option ${index + 1}`}
                  aria-pressed={look[section.field] === hex}
                  onClick={() => onChange({ ...look, [section.field]: hex })}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className='creator-footer'>
        {error && <p className='error'>{error}</p>}
        <div className='creator-actions'>
          <button
            type='button'
            className='ghost'
            onClick={onCancel}
            disabled={saving}
          >
            {firstTime ? "Skip for now" : "Cancel"}
          </button>
          <button
            type='button'
            className='primary'
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save look"}
          </button>
        </div>
      </footer>
    </aside>
  );
}
