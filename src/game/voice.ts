// Voice between players who are standing together. Each pair talks straight to each
// other (WebRTC); the game server only passes on the few messages two browsers need to
// find one another, and only for players who are close. Nobody far away can listen in,
// because nobody far away is connected.
//
// What to know before relying on it:
//  - Browsers only allow the microphone on https:// pages, or on localhost.
//  - Two phones on different mobile networks often cannot reach each other directly.
//    That needs a relay ("TURN") server added to ICE_SERVERS below. Without one, voice
//    works on the same Wi-Fi and on most home broadband, and fails quietly elsewhere.
//  - On iPhones the volume of a sound cannot be set by a page, so a voice does not fade
//    with distance there: it is simply on within earshot and off beyond it.

/**
 * How two browsers find a way to each other. STUN is enough on the same Wi-Fi and on most
 * home broadband. Across mobile networks (MTN to Airtel, say) the voice has to be relayed
 * through a TURN server: set VITE_TURN_URL, VITE_TURN_USERNAME and VITE_TURN_CREDENTIAL
 * (on Vercel, from a TURN service such as Metered or Cloudflare Calls) and it is used too.
 */
const ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  ...(ENV.VITE_TURN_URL
    ? [{ urls: ENV.VITE_TURN_URL.split(",").map((url) => url.trim()), username: ENV.VITE_TURN_USERNAME, credential: ENV.VITE_TURN_CREDENTIAL }]
    : []),
];

const JOIN_WITHIN = 10;     // metres at which two players are connected
const LEAVE_BEYOND = 14;    // metres at which they are cut off again (further, so it does not flicker at the edge)
const FULL_VOLUME = 2.5;    // metres within which a voice is at full volume
const MOST_PEERS = 6;       // the nearest few: a phone cannot hold a call with a whole club
const RETRY_SECONDS = 6;    // how long a call may take to connect before it is dropped and tried again
const TALKING = 0.02;       // how loud counts as talking
const LISTEN_EVERY = 60;    // milliseconds between listens for who is talking
const TALKED_FOR = 700;     // milliseconds someone still counts as talking after their last sound

export type Nearby = { id: string; distance: number };

type Peer = {
  connection: RTCPeerConnection;
  audio: HTMLAudioElement;
  /** Candidates that arrived before the other side's description did. */
  early: RTCIceCandidateInit[];
  meter: AnalyserNode | null;
  source: MediaStreamAudioSourceNode | null;
  /** When this call was begun, on the page's clock: one that never connects is given up on. */
  opened: number;
  /** When their voice was last heard, on the page's clock. */
  heard: number;
};

type Signal = { kind?: string; sdp?: string; candidate?: RTCIceCandidateInit };

export type VoiceState = "off" | "on" | "muted";

/**
 * One player's side of every voice call they are in. Tell it who is near (`update`) and
 * hand it the messages that arrive for it (`signal`); it does the rest.
 */
export class Voice {
  state: VoiceState = "off";
  private peers = new Map<string, Peer>();
  private tried = new Map<string, number>();
  private microphone: MediaStream | null = null;
  private starting = false; // the browser is asking for the microphone right now
  private context: AudioContext | null = null;
  private listening: number | null = null;
  private turn = 0; // goes up each time voice is turned on or off, so a slow "on" knows it has been overtaken
  private samples = new Uint8Array(2048);   // about a twentieth of a second of sound: most of the time between listens
  private selfId: string;
  private send: (to: string, data: Record<string, unknown>) => void;

  constructor(selfId: string, send: (to: string, data: Record<string, unknown>) => void) {
    this.selfId = selfId;
    this.send = send;
  }

  /** Can this browser do it at all? False on a plain http:// page that is not localhost. */
  static supported(): boolean {
    return typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Turn voice on. The browser asks for the microphone the first time. Throws if it is refused. */
  async turnOn(): Promise<void> {
    if (this.state !== "off" || this.starting) return;
    this.starting = true;
    const turn = ++this.turn;
    let microphone: MediaStream;
    try {
      microphone = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } finally {
      this.starting = false;
    }
    if (turn !== this.turn) {
      // Turned off again while the browser was still asking. Let the microphone go.
      microphone.getTracks().forEach((track) => track.stop());
      return;
    }
    this.microphone = microphone;
    try {
      this.context = new AudioContext();
    } catch {
      this.context = null; // no meters, but the call still works
    }
    this.listening = window.setInterval(() => this.listen(), LISTEN_EVERY);
    this.state = "on";
  }

  /** Stop talking but keep listening, or start talking again. */
  setMuted(muted: boolean): void {
    if (this.state === "off" || !this.microphone) return;
    for (const track of this.microphone.getAudioTracks()) track.enabled = !muted;
    this.state = muted ? "muted" : "on";
  }

  /** Hang up on everyone and let go of the microphone. */
  turnOff(): void {
    this.turn += 1;
    for (const id of [...this.peers.keys()]) this.drop(id, true);
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.microphone = null;
    if (this.listening !== null) window.clearInterval(this.listening);
    this.listening = null;
    void this.context?.close().catch(() => {});
    this.context = null;
    this.tried.clear();
    this.state = "off";
  }

  /**
   * Who is near right now, and how far away. Call it a couple of times a second. People
   * who came close are called, people who went away are cut off, and everyone else is
   * made louder or quieter by how far they are.
   */
  update(near: Nearby[]): void {
    if (this.state === "off") return;
    const wanted = new Map<string, number>();
    for (const one of [...near].sort((a, b) => a.distance - b.distance)) {
      const connected = this.peers.has(one.id);
      if (one.distance > (connected ? LEAVE_BEYOND : JOIN_WITHIN)) continue;
      if (wanted.size < MOST_PEERS) wanted.set(one.id, one.distance);
    }
    for (const id of [...this.peers.keys()]) if (!wanted.has(id)) this.drop(id, true);

    const now = performance.now() / 1000;
    for (const [id, distance] of wanted) {
      let peer = this.peers.get(id);
      if (peer && peer.connection.connectionState !== "connected" && now - peer.opened > RETRY_SECONDS) {
        // It never connected: they had voice off when we called, or the call got lost.
        // Give it up, so that it can be tried afresh.
        this.drop(id, true);
        peer = undefined;
      }
      if (peer) {
        peer.audio.volume = volumeAt(distance);
        continue;
      }
      // Of any two players, the one whose id sorts first makes the call. That way they
      // never both call each other at the same moment. Someone who does not answer (their
      // voice is off) is tried again every few seconds, for as long as they are near.
      if (this.selfId < id && now - (this.tried.get(id) ?? -Infinity) >= RETRY_SECONDS) {
        this.tried.set(id, now);
        void this.call(id);
      }
    }
  }

  /** A message from another player's browser, passed on by the server. */
  async signal(from: string, data: Record<string, unknown>): Promise<void> {
    if (this.state === "off") return; // voice is off: nobody gets through, and nobody is told
    const message = data as Signal;
    try {
      if (message.kind === "offer" && typeof message.sdp === "string") {
        if (!this.peers.has(from) && this.peers.size >= MOST_PEERS) return; // already talking to as many as we can
        this.drop(from); // a new call from them replaces whatever was half set up
        const peer = this.open(from);
        await peer.connection.setRemoteDescription({ type: "offer", sdp: message.sdp });
        await this.flush(peer);
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
        this.send(from, { kind: "answer", sdp: answer.sdp });
      } else if (message.kind === "answer" && typeof message.sdp === "string") {
        const peer = this.peers.get(from);
        if (!peer || peer.connection.signalingState !== "have-local-offer") return;
        await peer.connection.setRemoteDescription({ type: "answer", sdp: message.sdp });
        await this.flush(peer);
      } else if (message.kind === "ice" && message.candidate) {
        const peer = this.peers.get(from);
        if (!peer) return;
        if (peer.connection.remoteDescription) await peer.connection.addIceCandidate(message.candidate);
        else peer.early.push(message.candidate);
      } else if (message.kind === "bye") {
        this.drop(from);
      }
    } catch (problem) {
      console.warn("[voice] a call could not be set up:", problem);
      this.drop(from);
    }
  }

  /** The ids of the players whose voices are coming through right now. */
  talking(): string[] {
    const now = performance.now();
    const loud: string[] = [];
    for (const [id, peer] of this.peers) if (now - peer.heard < TALKED_FOR) loud.push(id);
    return loud;
  }

  /** Note who is making a sound at this moment. Run several times a second: speech comes in bursts. */
  private listen(): void {
    const now = performance.now();
    for (const peer of this.peers.values()) {
      if (!peer.meter) continue;
      peer.meter.getByteTimeDomainData(this.samples);
      let sum = 0;
      for (const sample of this.samples) sum += ((sample - 128) / 128) ** 2;
      if (Math.sqrt(sum / this.samples.length) > TALKING) peer.heard = now;
    }
  }

  /** How many players this one is connected to. */
  get connected(): number {
    let count = 0;
    for (const peer of this.peers.values()) if (peer.connection.connectionState === "connected") count++;
    return count;
  }

  private async call(id: string): Promise<void> {
    try {
      const peer = this.open(id);
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      this.send(id, { kind: "offer", sdp: offer.sdp });
    } catch (problem) {
      console.warn("[voice] could not call:", problem);
      this.drop(id);
    }
  }

  private open(id: string): Peer {
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const audio = new Audio();
    audio.autoplay = true;
    const peer: Peer = { connection, audio, early: [], meter: null, source: null, heard: -Infinity, opened: performance.now() / 1000 };
    this.peers.set(id, peer);

    this.microphone?.getAudioTracks().forEach((track) => connection.addTrack(track, this.microphone as MediaStream));
    connection.onicecandidate = (event) => {
      if (event.candidate) this.send(id, { kind: "ice", candidate: event.candidate.toJSON() });
    };
    connection.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      audio.srcObject = stream;
      void audio.play().catch(() => {}); // a browser may want a tap first; turning voice on was one
      if (this.context) {
        try {
          const meter = this.context.createAnalyser();
          meter.fftSize = 2048;
          peer.source?.disconnect();
          peer.source = this.context.createMediaStreamSource(stream);
          peer.source.connect(meter);
          peer.meter = meter;
        } catch {
          peer.meter = null;
        }
      }
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed" || connection.connectionState === "closed") {
        if (this.peers.get(id) === peer) this.drop(id);
      }
    };
    return peer;
  }

  private async flush(peer: Peer): Promise<void> {
    for (const candidate of peer.early.splice(0)) await peer.connection.addIceCandidate(candidate);
  }

  /** Hang up on one player. `tell` lets them know, so their side does not sit waiting. */
  private drop(id: string, tell = false): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    if (tell) this.send(id, { kind: "bye" });
    peer.source?.disconnect();
    peer.connection.onicecandidate = peer.connection.ontrack = peer.connection.onconnectionstatechange = null;
    peer.connection.close();
    peer.audio.srcObject = null;
  }
}

/** How loud a voice is from a distance: full up close, fading to a murmur at the edge of earshot. */
export function volumeAt(distance: number): number {
  if (distance <= FULL_VOLUME) return 1;
  const faded = 1 - (distance - FULL_VOLUME) / (LEAVE_BEYOND - FULL_VOLUME);
  return Math.max(0.05, Math.min(1, faded));
}
