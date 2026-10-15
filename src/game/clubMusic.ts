// The music in the clubs, lounges and anywhere else with a sound of its own.
//
// Adding music: put an .mp3 (your own, or one you have the right to use) in
// frontend/public/audio/, named after the place, and it plays on a loop inside:
//   club.mp3       Que Club, and any club without a file of its own
//   patricia.mp3, patio.mp3, space.mp3, darkalley.mp3      the four GRA clubs
//   greyfield.mp3, driveway.mp3, mandela.mp3, zzone.mp3    the lounges
//   mall.mp3, zoo.mp3, kada.mp3, golf.mp3 ...              any other place, by its id in venues.ts
// A club with no file at all still has music: a simple beat made on the spot (a kick, a
// shaker, a log drum and a bass note) at the same two beats a second its lights keep.

const TRACK = "/audio/club.mp3";
const BEAT = 0.5;          // seconds: 120 beats a minute, the same as clubLayout.BEATS_PER_SECOND
const LOOK_AHEAD = 0.2;    // seconds of music planned ahead of now
const VOLUME = 0.22;

// One bar of sixteen steps. 1 where the sound plays.
const KICK = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const SHAKER = [0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1];
const LOG_DRUM = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0];     // the off-beat bounce
const BASS_NOTES = [55, 55, 65.4, 49];                                 // one note a bar: A, A, C, G

export class ClubMusic {
  private context: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer: number | null = null;
  private element: HTMLAudioElement | null = null;
  private step = 0;
  private nextTime = 0;
  private turn = 0; // goes up on every start and stop, so a slow start knows it has been overtaken
  playing = false;

  /**
   * Start the music. Call it from a tap or a click: browsers do not let a page make sound
   * by itself. `track` is the place's own file, tried first; then club.mp3 if `beat` is on
   * (a club), and last the beat made on the spot. With `beat` off (a lounge, the mall) a
   * place without its own file is simply quiet.
   */
  start(track?: string, beat = true): void {
    if (this.playing) return;
    this.playing = true;
    const turn = ++this.turn;
    // The beat's sound engine is made now, inside the tap, because phones refuse one made
    // later. It stays silent unless it turns out to be needed.
    try {
      this.context = new AudioContext();
      void this.context.resume().catch(() => {});
    } catch {
      this.context = null; // no sound engine on this device: the track may still play
    }
    // Try the real tracks first, in order. If none is there, or none will play, make the beat instead.
    const tracks = [...(track ? [track] : []), ...(beat ? [TRACK] : [])];
    const next = (index: number) => {
      if (turn !== this.turn) return; // stopped, or started again, in the meantime
      if (index >= tracks.length) {
        this.element = null;
        if (beat) this.startBeat();
        return;
      }
      const element = new Audio(tracks[index]);
      element.loop = true;
      element.volume = 0.5;
      this.element = element;
      element.play().catch(() => next(index + 1));
    };
    next(0);
  }

  stop(): void {
    this.playing = false;
    this.turn += 1;
    this.element?.pause();
    this.element = null;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    void this.context?.close().catch(() => {});
    this.context = null;
    this.out = null;
  }

  private startBeat(): void {
    const context = this.context;
    if (!context || this.timer !== null) return;
    this.out = context.createGain();
    this.out.gain.value = VOLUME;
    this.out.connect(context.destination);
    this.step = 0;
    this.nextTime = context.currentTime + 0.05;
    this.timer = window.setInterval(() => this.plan(), 60);
  }

  /** Put the next few notes on the clock. Run often; each note is scheduled once. */
  private plan(): void {
    const context = this.context;
    if (!context || document.hidden) return; // nobody is listening to a tab they cannot see
    // After a pause (the tab was hidden, the phone was busy) carry on from now. Playing
    // everything that was missed, all at once, is noise.
    if (this.nextTime < context.currentTime) this.nextTime = context.currentTime + 0.05;
    while (this.nextTime < context.currentTime + LOOK_AHEAD) {
      const at = this.nextTime, step = this.step % 16, bar = Math.floor(this.step / 16);
      if (KICK[step]) this.thump(at, 150, 45, 0.22, 1);
      if (LOG_DRUM[step]) this.thump(at, 220, 110, 0.12, 0.5);
      if (SHAKER[step]) this.hiss(at);
      if (step % 4 === 2) this.tone(at, BASS_NOTES[bar % BASS_NOTES.length], 0.2, 0.5);
      this.step += 1;
      this.nextTime += BEAT / 4;
    }
  }

  /** A drum: a pitch that drops fast. */
  private thump(at: number, from: number, to: number, seconds: number, level: number): void {
    const context = this.context, out = this.out;
    if (!context || !out) return;
    const voice = context.createOscillator(), gain = context.createGain();
    voice.frequency.setValueAtTime(from, at);
    voice.frequency.exponentialRampToValueAtTime(to, at + seconds);
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + seconds);
    voice.connect(gain).connect(out);
    voice.start(at);
    voice.stop(at + seconds + 0.02);
  }

  private tone(at: number, hertz: number, seconds: number, level: number): void {
    const context = this.context, out = this.out;
    if (!context || !out) return;
    const voice = context.createOscillator(), gain = context.createGain();
    voice.type = "triangle";
    voice.frequency.setValueAtTime(hertz, at);
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + seconds);
    voice.connect(gain).connect(out);
    voice.start(at);
    voice.stop(at + seconds + 0.02);
  }

  /** A shaker: a very short burst of high, rough sound. */
  private hiss(at: number): void {
    const context = this.context, out = this.out;
    if (!context || !out) return;
    const voice = context.createOscillator(), gain = context.createGain();
    voice.type = "square";
    voice.frequency.setValueAtTime(6200 + Math.random() * 1800, at);
    gain.gain.setValueAtTime(0.08, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
    voice.connect(gain).connect(out);
    voice.start(at);
    voice.stop(at + 0.05);
  }
}
