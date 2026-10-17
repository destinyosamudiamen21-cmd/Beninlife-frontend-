// Music on the street: public/audio/street.mp3 on a loop, quietly, under everything else.
//
// Browsers only let a page make sound after the player has touched it, so `want(true)`
// plays at once if it can, and otherwise waits for the next tap or key press. A missing
// file is simply silence. The choice to have it on or off is kept in this browser.

const FILE = "/audio/street.mp3";
const VOLUME = 0.25;
const KEY = "beninlife.streetMusic";

export function streetMusicWanted(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function rememberStreetMusic(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // not remembered: it is on again next time
  }
}

export class StreetMusic {
  private element: HTMLAudioElement | null = null;
  private wanted = false;
  private missing = false;
  private waiting = false;

  /** Should it be playing right now (on the street, and the player wants it)? */
  want(on: boolean): void {
    this.wanted = on;
    if (on) this.play();
    else this.element?.pause();
  }

  private play(): void {
    if (this.missing || !this.wanted) return;
    if (!this.element) {
      const element = new Audio(FILE);
      element.loop = true;
      element.volume = VOLUME;
      element.preload = "auto";
      element.addEventListener("error", () => {
        this.missing = true; // no street.mp3 on the server: stay quiet, and stop trying
      });
      this.element = element;
    }
    this.element.play().catch(() => this.waitForTouch());
  }

  /** Not allowed to play yet: try again on the player's next tap or key. */
  private waitForTouch(): void {
    if (this.waiting || this.missing) return;
    this.waiting = true;
    const go = () => {
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("keydown", go);
      this.waiting = false;
      this.play();
    };
    window.addEventListener("pointerdown", go);
    window.addEventListener("keydown", go);
  }

  stop(): void {
    this.wanted = false;
    this.element?.pause();
  }
}
