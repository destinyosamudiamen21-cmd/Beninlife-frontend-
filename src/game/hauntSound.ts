// The sounds of the haunted house, made in the browser with no sound files: a low drone
// that never quite settles, whispers, a scream, a door slamming, a heartbeat, and now and
// then a creak, footsteps overhead or a moan from somewhere in the house.
//
// A browser only plays sound after the player has pressed something, so start() is called
// when they walk in through the door (a press). Everything stops with stop().

type Ctx = AudioContext;

export class HauntSound {
  private context: Ctx | null = null;
  private master: GainNode | null = null;
  private drone: OscillatorNode[] = [];
  private beat: number | null = null;
  private ambient: number | null = null;

  private ensure(): { context: Ctx; master: GainNode } | null {
    if (typeof window === "undefined") return null;
    if (!this.context) {
      const Maker = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Maker) return null;
      this.context = new Maker();
      this.master = this.context.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") void this.context.resume();
    return { context: this.context, master: this.master! };
  }

  /** Noise: the raw material of whispers, screams and wind. */
  private noise(context: Ctx, seconds: number): AudioBufferSourceNode {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  start(): void {
    const audio = this.ensure();
    if (!audio || this.drone.length) return;
    const { context, master } = audio;
    // Two low tones a little out of tune with each other: the room hums and beats.
    for (const [frequency, level] of [[55, 0.16], [58.3, 0.12], [110.7, 0.04]] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.value = level;
      oscillator.connect(gain).connect(master);
      oscillator.start();
      this.drone.push(oscillator);
    }
    // A slow heartbeat underneath it all.
    this.beat = window.setInterval(() => this.heartbeat(), 1500);
    // And now and then, never on a beat you can count: a creak, steps upstairs, a moan, whispers.
    const next = () => {
      this.ambient = window.setTimeout(() => {
        const pick = Math.random();
        if (pick < 0.32) this.creak();
        else if (pick < 0.6) this.footsteps();
        else if (pick < 0.82) this.moan();
        else this.whisper();
        next();
      }, 5000 + Math.random() * 9000);
    };
    next();
  }

  stop(): void {
    for (const oscillator of this.drone) {
      try {
        oscillator.stop();
      } catch {
        // already stopped
      }
    }
    this.drone = [];
    if (this.beat !== null) window.clearInterval(this.beat);
    this.beat = null;
    if (this.ambient !== null) window.clearTimeout(this.ambient);
    this.ambient = null;
  }

  /** A floorboard, or a door on old hinges: a rough tone that wavers as it bends. */
  creak(): void {
    const audio = this.ensure();
    if (!audio) return;
    const { context, master } = audio;
    const now = context.currentTime;
    const length = 0.6 + Math.random() * 0.7;
    const oscillator = context.createOscillator();
    oscillator.type = "sawtooth";
    const base = 140 + Math.random() * 120;
    oscillator.frequency.setValueAtTime(base, now);
    for (let i = 1; i <= 6; i++) oscillator.frequency.linearRampToValueAtTime(base * (0.8 + Math.random() * 0.5), now + (length * i) / 6);
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 9;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + length);
    const pan = context.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    oscillator.connect(filter).connect(gain).connect(pan).connect(master);
    oscillator.start(now);
    oscillator.stop(now + length + 0.05);
  }

  /** Slow steps on the floor above, coming closer and stopping. */
  footsteps(): void {
    const audio = this.ensure();
    if (!audio) return;
    const now = audio.context.currentTime;
    const steps = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < steps; i++) this.thump(now + i * 0.62, 70 + Math.random() * 10, 0.18 + (i / steps) * 0.35, 0.12);
  }

  /** A low voice, far off: a tone that rises and falls under noise. */
  moan(): void {
    const audio = this.ensure();
    if (!audio) return;
    const { context, master } = audio;
    const now = context.currentTime;
    const voice = context.createOscillator();
    voice.type = "triangle";
    voice.frequency.setValueAtTime(160, now);
    voice.frequency.linearRampToValueAtTime(220, now + 1.0);
    voice.frequency.linearRampToValueAtTime(130, now + 2.6);
    const vibrato = context.createOscillator();
    const depth = context.createGain();
    vibrato.frequency.value = 5;
    depth.gain.value = 6;
    vibrato.connect(depth).connect(voice.frequency);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.8);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    voice.connect(filter).connect(gain).connect(master);
    voice.start(now);
    vibrato.start(now);
    voice.stop(now + 2.9);
    vibrato.stop(now + 2.9);
  }

  private thump(at: number, frequency: number, level: number, length: number): void {
    const audio = this.ensure();
    if (!audio) return;
    const { context, master } = audio;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.5, at + length);
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + length);
    oscillator.connect(gain).connect(master);
    oscillator.start(at);
    oscillator.stop(at + length + 0.05);
  }

  heartbeat(): void {
    const audio = this.ensure();
    if (!audio) return;
    const now = audio.context.currentTime;
    this.thump(now, 60, 0.5, 0.15);
    this.thump(now + 0.22, 52, 0.35, 0.18);
  }

  /** A door slamming somewhere close. */
  slam(): void {
    const audio = this.ensure();
    if (!audio) return;
    const { context, master } = audio;
    const now = context.currentTime;
    this.thump(now, 90, 1.2, 0.5);
    const crack = this.noise(context, 0.25);
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    gain.gain.setValueAtTime(0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    crack.connect(filter).connect(gain).connect(master);
    crack.start(now);
  }

  /** A scream: noise through a filter that sweeps up and falls away, with a wailing tone. */
  scream(): void {
    const audio = this.ensure();
    if (!audio) return;
    const { context, master } = audio;
    const now = context.currentTime;
    const source = this.noise(context, 1.4);
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(2600, now + 0.25);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 1.3);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(1.6, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);
    source.connect(filter).connect(gain).connect(master);
    source.start(now);
    const wail = context.createOscillator();
    const wailGain = context.createGain();
    wail.type = "sawtooth";
    wail.frequency.setValueAtTime(700, now);
    wail.frequency.linearRampToValueAtTime(1150, now + 0.3);
    wail.frequency.linearRampToValueAtTime(600, now + 1.2);
    wailGain.gain.setValueAtTime(0.001, now);
    wailGain.gain.exponentialRampToValueAtTime(0.18, now + 0.06);
    wailGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    wail.connect(wailGain).connect(master);
    wail.start(now);
    wail.stop(now + 1.3);
  }

  /** Whispers: soft bursts of filtered noise, left and right. */
  whisper(): void {
    const audio = this.ensure();
    if (!audio) return;
    const { context, master } = audio;
    const now = context.currentTime;
    for (let i = 0; i < 5; i++) {
      const at = now + i * 0.32 + Math.random() * 0.1;
      const source = this.noise(context, 0.3);
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2400 + Math.random() * 1600;
      filter.Q.value = 2;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.001, at);
      gain.gain.exponentialRampToValueAtTime(0.35, at + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.28);
      const pan = context.createStereoPanner();
      pan.pan.value = i % 2 ? 0.8 : -0.8;
      source.connect(filter).connect(gain).connect(pan).connect(master);
      source.start(at);
    }
  }
}
