# fgma Audio Export Tech Stack

## Objective

Add deterministic audio generation and MP4-with-audio export to f(g)=ma without changing the conceptual core of the project.

The stack should stay lightweight, browser-native where possible, and aligned with the current architecture.

---

## 1. Current Project Stack

Based on the current repository, fgma already uses:

- **React**
- **React DOM**
- **TypeScript**
- **Vite**
- **mp4-muxer**
- **gifenc**
- **jsPDF**
- **lucide-react**

The current rendering logic is:

1. Render text layers to an offscreen canvas
2. Create an alpha mask
3. Sample the mask into density cells
4. Convert dense cells into mass points
5. Send mass points to a WebGL shader
6. Distort the poster texture through a force field

This should remain the foundation for audio as well.

---

## 2. Recommended Audio Strategy

### Recommendation

Use **native Web Audio API** as the primary audio engine.

Why:

- lightweight
- no large dependency required
- works well for custom synthesis
- supports both realtime and offline rendering
- conceptually cleaner for a system-driven instrument

### Use two audio paths

1. **AudioContext**
   - for live preview playback

2. **OfflineAudioContext**
   - for deterministic export rendering

This split is important. Realtime sound can be responsive and simpler. Export sound must be deterministic and high quality.

---

## 3. Recommended Export Strategy

### Preferred path

Use:

- existing **mp4-muxer** for MP4 muxing
- **WebCodecs** video/audio encoding where available
- **OfflineAudioContext** for audio waveform rendering

### Final export pipeline

1. Render motion poster frames
2. Render audio offline from the same poster state
3. Encode video frames
4. Encode audio
5. Mux both into one MP4
6. Download final file

### Fallback path

If browser audio encoding support is not sufficient:

- render WAV first
- then use a secondary muxing fallback
- optionally consider `ffmpeg.wasm` only as a fallback, not the default

Reason:

- `ffmpeg.wasm` is heavy
- slower startup
- larger bundle
- not ideal as the primary approach

---

## 4. Architecture Decision

### Do NOT

- generate audio from a final bitmap scan
- put audio logic inside React components
- make export depend on live playback timing
- use unseeded randomness

### DO

- share force-field data between visual and audio systems
- create a dedicated audio domain layer
- keep export deterministic
- define one clear data contract between renderer and audio engine

---

## 5. Proposed Folder Structure

```txt
src/
  audio/
    featureExtractor.ts
    traversalAgent.ts
    synthGraph.ts
    previewAudioEngine.ts
    renderOfflineAudio.ts
    audioTypes.ts
    seededRandom.ts

  export/
    exportMp4WithAudio.ts
    encodeAudioTrack.ts
    muxMp4.ts

  rendering/
    posterTexture.ts
    webglPosterRenderer.ts

  shared/
    motionFeatures.ts
    exportTypes.ts
```

---

## 6. Core Data Contracts

### Mass point

```ts
export type MassPoint = {
  x: number;
  y: number;
  mass: number;
};
```

### Audio settings

```ts
export type AudioSettings = {
  enabled: boolean;
  masterGain: number;
  seed: number;
  durationSec: number;
  sampleRate: number;
  traversalMode: "attractor" | "orbit" | "path";
  eventSensitivity: number;
};
```

### Shared motion/audio input

```ts
export type MotionAudioInput = {
  masses: Float32Array | number[];
  massCount: number;
  strength: number;
  decay: number;
  epsilon: number;
  motionAmount: number;
  durationSec: number;
  fps: number;
  seed: number;
};
```

### Derived features

```ts
export type SoundFeatures = {
  totalMass: number;
  centerX: number;
  centerY: number;
  spread: number;
  tension: number;
  pulse: number;
  traversalX: number;
  traversalY: number;
  traversalSpeed: number;
  clusterEnergy: number;
  emptiness: number;
};
```

---

## 7. Feature Extraction Layer

### Purpose

Convert visual system state into audio-usable features.

### Input

- mass points
- mass count
- force settings
- current time `t`
- seeded traversal state

### Output

- stable numerical features for synthesis

### Suggested features

- `totalMass`
- `centerOfMass`
- `massSpread`
- `fieldTension`
- `pulse`
- `traversalPosition`
- `traversalVelocity`
- `clusterTransitions`
- `emptySpaceRatio`

This layer is the conceptual bridge between graphic logic and sound logic.

---

## 8. Traversal Agent

### Purpose

Create a time-based path through the force field.

### Why it matters

This is how the sound gets a non-trivial time axis.

### Recommended behavior

Use a seeded agent that:

- starts from a deterministic initial point
- moves according to mass attraction / local tension
- updates every audio block or frame step
- emits event flags when:
  - entering dense regions
  - crossing a strong gradient
  - approaching cluster centers
  - changing direction rapidly

### Modes for future extensibility

- `attractor`: pulled toward mass clusters
- `orbit`: circles high-energy regions
- `path`: follows a smoothed route through cluster sequence

For v1, `attractor` is enough.

---

## 9. Synthesis Design

Use a small, clear synthesis graph.

### Layer 1: Bass / Body

Represents total mass and system weight.

- oscillator or filtered drone
- frequency zone responds to `totalMass`
- amplitude responds to `pulse`

### Layer 2: Traversal Voice

Represents movement through the field.

- oscillator or band-limited voice
- pitch/timbre follows traversal state
- filter responds to `tension`

### Layer 3: Event Layer

Represents local force events.

- short clicks / impulses / noise bursts
- triggered by cluster entry, sharp gradients, or abrupt tension changes

### Layer 4: Space / Ambience

Represents emptiness or spread.

- reverb / delay / diffusion
- stronger when field is open or spatially wide

### Realtime preview

Can use a lighter version of the same graph.

---

## 10. Why Native Web Audio Instead of Tone.js

Tone.js is useful, but for this project native Web Audio is preferred because:

- the mappings are custom and system-driven
- the sound is not grid-sequenced music
- export determinism matters more than high-level musical abstractions
- bundle size stays smaller
- direct control over OfflineAudioContext is cleaner

Tone.js can still be considered later if needed, but it is not necessary for the first implementation.

---

## 11. MP4 Export Implementation Plan

### Step 1: Shared feature path

Create a function like:

```ts
extractSoundFeatures(input: MotionAudioInput, t: number): SoundFeatures
```

This must be usable by both:

- realtime preview
- offline export

### Step 2: Preview audio engine

Create:

```ts
createPreviewAudioEngine(): {
  start(): void;
  stop(): void;
  update(input: MotionAudioInput, t: number): void;
}
```

### Step 3: Offline audio render

Create:

```ts
renderOfflineAudio(input: MotionAudioInput, audioSettings: AudioSettings): Promise<AudioBuffer>
```

This should:

- use `OfflineAudioContext`
- render the entire duration at the target sample rate
- produce deterministic audio

### Step 4: Audio encoding

Create:

```ts
encodeAudioTrack(audioBuffer: AudioBuffer): Promise<EncodedAudioTrack>
```

Preferred output:

- AAC if available in browser encoding pipeline
- otherwise a supported fallback track representation for muxing

### Step 5: Final mux

Create:

```ts
exportMp4WithAudio(options: ExportOptions): Promise<Blob>
```

This should:

- render frames
- encode video
- render and encode audio
- mux into a single MP4
- return final Blob

---

## 12. Synchronization Rules

Synchronization must be based on the same:

- `durationSec`
- `fps`
- seed
- visual motion timing

### Important

Audio time and video time must be derived from the same clock definition. Do not sync them indirectly after the fact.

Preferred:

- frame time = `frameIndex / fps`
- audio feature time = exact same timeline in seconds

---

## 13. Performance Notes

### Keep

- mass feature extraction efficient
- traversal state lightweight
- synthesis graph small
- offline render predictable

### Avoid

- per-sample expensive geometry analysis
- scanning full bitmaps during export
- very large dependency additions unless truly necessary

### Good practice

Precompute stable field statistics once per export where possible, and compute only time-varying values during rendering.

---

## 14. Browser / Compatibility Notes

### Preferred modern path

- Web Audio API
- OfflineAudioContext
- WebCodecs where available
- mp4-muxer for final MP4 assembly

### Fallback

If the browser lacks needed encoding support:

- degrade gracefully
- allow silent MP4 + separate WAV as fallback if necessary during development
- or use a heavier fallback only when explicitly enabled

---

## 15. Suggested Milestones

### Milestone 1

- Create feature extractor
- Create preview audio engine
- Basic drone + traversal voice
- Manual start/stop

### Milestone 2

- Add event layer
- Add deterministic seeded traversal
- Connect to current motion parameters

### Milestone 3

- Implement offline audio render
- Verify reproducibility

### Milestone 4

- Implement MP4 with audio muxing
- Export one-click final file

### Milestone 5

- Tune mappings
- Improve sonic identity
- Add user-facing audio controls if needed

---

## 16. Final Recommendation

Keep the existing visual stack. Do not redesign the project around audio.

Add a parallel audio system that listens to the same force-field data, and use offline rendering plus MP4 muxing to make sound part of the export pipeline.

This preserves the strongest idea of fgma:

**the poster is not merely composed; it is generated by force. The sound should emerge from that same force.**
