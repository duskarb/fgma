import type { SoundSettings } from './audioTypes';
import type { MotionAudioInput } from '../shared/motionFeatures';
import { createTraversalAgent } from './traversalAgent';
import { extractSoundFeatures } from './featureExtractor';
import { buildSynthGraph } from './synthGraph';
import type { SynthGraph } from './synthGraph';

export class SonificationEngine {
  private ctx: AudioContext | null = null;
  private graph: SynthGraph | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private settings: SoundSettings;
  private lastInput: MotionAudioInput | null = null;

  constructor(settings: SoundSettings) {
    this.settings = settings;
  }

  // Must be called from a user gesture (click handler)
  start() {
    if (this.ctx) return;
    this.ctx = new AudioContext({ sampleRate: 44100 });
    this.streamDest = this.ctx.createMediaStreamDestination();
    this.graph = buildSynthGraph(this.ctx, this.settings);
    this.graph.connect(this.streamDest);
    this.graph.connect(this.ctx.destination);
  }

  stop() {
    if (!this.ctx) return;
    this.graph?.disconnect();
    this.graph = null;
    void this.ctx.close();
    this.ctx = null;
    this.streamDest = null;
  }

  update(input: MotionAudioInput, t: number) {
    if (!this.ctx || !this.graph) return;
    this.lastInput = input;

    // Lazy-create traversal agent per update (stateless for preview, stateful for export)
    // For preview we step the agent once per RAF frame
    if (!this._agent || this._agentSeed !== input.seed || this._agentMassCount !== input.massCount) {
      this._agent = createTraversalAgent(input);
      this._agentSeed = input.seed;
      this._agentMassCount = input.massCount;
    }

    const traversalState = this._agent.step();
    const features = extractSoundFeatures(input, t, traversalState);
    this.graph.update(features, t);
  }

  setSettings(settings: SoundSettings) {
    this.settings = settings;
    if (this.ctx && this.graph) {
      this.graph.setVolume?.(settings.volume);
    }
  }

  setVolume(v: number) {
    this.settings = { ...this.settings, volume: v };
  }

  getCaptureStream(): MediaStream {
    if (!this.streamDest) throw new Error('SonificationEngine not started');
    return this.streamDest.stream;
  }

  get isRunning() {
    return !!this.ctx;
  }

  resetAgent() {
    this._agent = null;
    this._agentSeed = -1;
    this._agentMassCount = -1;
  }

  restart() {
    const wasRunning = this.isRunning;
    if (wasRunning) {
      this.stop();
      this.start();
      this.resetAgent();
      if (this.lastInput) {
        this.update(this.lastInput, this.ctx ? this.ctx.currentTime : 0);
      }
    }
  }

  dispose() {
    this.stop();
  }

  private _agent: ReturnType<typeof createTraversalAgent> | null = null;
  private _agentSeed = -1;
  private _agentMassCount = -1;
}
