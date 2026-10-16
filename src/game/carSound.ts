// The sound of driving, made in the browser with no sound files: the engine, which climbs
// through the gears as the car speeds up and growls when the gas goes down; the horn; and a
// thud when the car hits something.
//
// A browser only plays sound after the player has pressed something, so start() is called
// from the "Get in" button. stop() is called on getting out.

type Ctx = AudioContext;

// Where each gear runs out, in m/s. Between two, the engine climbs from low revs to high.
const GEARS = [0, 5, 11, 18, 26, 35, 46];
const IDLE_RPM = 850;
const TOP_RPM = 5600;

/** The engine's revs for a speed: up through each gear, dropping as the next one goes in. */
export function revsFor(speed: number): number {
  const v = Math.abs(speed);
  for (let i = 1; i < GEARS.length; i++) {
    if (v < GEARS[i]) {
      const t = (v - GEARS[i - 1]) / (GEARS[i] - GEARS[i - 1]);
      const low = i === 1 ? IDLE_RPM : 2300;
      return low + (TOP_RPM - low) * t;
    }
  }
  return TOP_RPM;
}

export class CarSound {
  private context: Ctx | null = null;
  private master: GainNode | null = null;
  private engine: { oscillators: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private horn: { oscillators: OscillatorNode[]; gain: GainNode } | null = null;

  private ensure(): { context: Ctx; master: GainNode } | null {
    if (typeof window === "undefined") return null;
    if (!this.context) {
      const Maker = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Maker) return null;
      this.context = new Maker();
      this.master = this.context.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") void this.context.resume();
    return { context: this.context, master: this.master! };
  }

  /** The engine starts: a turn of the key. */
  start(): void {
    const audio = this.ensure();
    if (!audio || this.engine) return;
    const { context, master } = audio;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 2.5;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.11, context.currentTime + 0.35);
    filter.connect(gain).connect(master);
    // The firing note, the one an octave under it, and a rough edge a little out of tune.
    const oscillators: OscillatorNode[] = [];
    for (const [type, level] of [["sawtooth", 0.6], ["square", 0.25], ["sawtooth", 0.3]] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      const voice = context.createGain();
      voice.gain.value = level;
      oscillator.connect(voice).connect(filter);
      oscillator.start();
      oscillators.push(oscillator);
    }
    this.engine = { oscillators, gain, filter };
    this.update(0, 0);
  }

  /** Called every frame while driving: how fast, and how hard the gas is pressed. */
  update(speed: number, gas: number): void {
    const engine = this.engine;
    const context = this.context;
    if (!engine || !context) return;
    const rpm = revsFor(speed) + gas * 350;
    // A four-cylinder fires twice a turn of the crank.
    const firing = (rpm / 60) * 2;
    const now = context.currentTime;
    const [main, under, rough] = engine.oscillators;
    main.frequency.setTargetAtTime(firing, now, 0.05);
    under.frequency.setTargetAtTime(firing / 2, now, 0.05);
    rough.frequency.setTargetAtTime(firing * 1.012, now, 0.05);
    engine.filter.frequency.setTargetAtTime(260 + rpm * 0.14 + gas * 500, now, 0.08);
    engine.gain.gain.setTargetAtTime(0.07 + gas * 0.08 + Math.min(Math.abs(speed), 40) * 0.0012, now, 0.1);
  }

  /** The horn, while it is held. Two notes together, like a real car's. */
  hornOn(): void {
    const audio = this.ensure();
    if (!audio || this.horn) return;
    const { context, master } = audio;
    const gain = context.createGain();
    gain.gain.value = 0.0;
    gain.gain.linearRampToValueAtTime(0.16, context.currentTime + 0.02);
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.9;
    filter.connect(gain).connect(master);
    const oscillators = [415, 523].map((frequency) => {
      const oscillator = context.createOscillator();
      oscillator.type = "square";
      oscillator.frequency.value = frequency;
      oscillator.connect(filter);
      oscillator.start();
      return oscillator;
    });
    this.horn = { oscillators, gain };
  }

  hornOff(): void {
    const horn = this.horn;
    const context = this.context;
    if (!horn || !context) return;
    horn.gain.gain.setTargetAtTime(0, context.currentTime, 0.02);
    for (const oscillator of horn.oscillators) oscillator.stop(context.currentTime + 0.15);
    this.horn = null;
  }

  /** A knock: the car hit something. Harder hits are louder. */
  thud(strength: number): void {
    const audio = this.ensure();
    if (!audio) return;
    const { context, master } = audio;
    const seconds = 0.35;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 380;
    const gain = context.createGain();
    gain.gain.value = Math.min(0.9, 0.15 + strength * 0.05);
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  /** The engine goes off. */
  stop(): void {
    this.hornOff();
    const engine = this.engine;
    const context = this.context;
    if (!engine || !context) return;
    engine.gain.gain.setTargetAtTime(0, context.currentTime, 0.12);
    for (const oscillator of engine.oscillators) oscillator.stop(context.currentTime + 0.6);
    this.engine = null;
  }
}

export const carSound = new CarSound();
