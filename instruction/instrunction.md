# fgma Audio Export Instruction

## Goal

Extend **f(g)=ma** so that MP4 export includes **generated sound** as part of the same system that generates the motion poster.

This is **not** a generic image-to-sound converter. The sound must come from the same internal logic that already drives the visual output:

**text -> density -> mass points -> force field -> motion -> sound**

---

## Core Concept

f(g)=ma is a graphic instrument. The sound layer must reinforce that claim.

The poster should not be "translated into sound" by scanning x/y pixels. Instead, the system should **listen to the force field that generates the poster itself**.

### Therefore

- Do **not** use `x = time, y = pitch` style sonification.
- Do **not** treat the final image bitmap as the primary sound source.
- Do use the existing **mass field**, **force field**, and **motion parameters** as the source of audio behavior.
- Do make the sound feel like a byproduct of **mass, tension, acceleration, pulse, and traversal**.

---

## Time Axis Rule

The sound timeline must be derived from the **life cycle of the force field**, not from a visual scanline.

### Time should come from three layers

1. **System Pulse**
   - Derived from the same animated pulse used in the motion poster.
   - This is the base clock of the sound.
   - It should create the sense that the poster is breathing or vibrating.

2. **Force-Field Traversal**
   - A virtual probe / listener / particle should move through the mass field over time.
   - Its route should be determined by attraction, tension, density, or seeded field logic.
   - This becomes the main musical time axis for export.

3. **Local Events**
   - When the traversal enters dense zones, crosses boundaries, or experiences high field tension, the system should trigger events such as clicks, bursts, distortion, or timbral shifts.

### Summary

Time is not:

- reading the poster from left to right
- reading brightness over time

Time is:

- pulse
- traversal
- force change
- field events

---

## Audio Behavior

The audio should feel physically related to the graphic system.

### Recommended mapping direction

- **total mass** -> low-end weight / bass frequency zone
- **field tension** -> filter opening / brightness / resonance
- **spread of mass** -> stereo width / reverb amount / spaciousness
- **motionAmount** -> modulation depth
- **traversal speed** -> pitch movement or modulation rate
- **acceleration / sudden field change** -> noise bursts / distortion / transients
- **cluster entry / edge crossing** -> percussive click or impulse
- **empty space** -> reduced activity / longer reverb tail

### Important

Avoid mappings that are too literal or decorative. The sound should not merely "represent" the picture. It should make the force relations audible.

---

## Export Principle

When the user exports an MP4:

- the system must render **video and audio together**
- the audio must be **deterministic**
- the same poster settings must always produce the same exported sound
- any randomness must be **seeded**
- export must not depend on live user gestures at export time

### Deterministic export means

Given:

- the current poster layers
- current force settings
- export duration
- export FPS
- export seed

The system should always produce the same:

- visual frames
- audio waveform
- final MP4

---

## Preview vs Export

### Realtime Preview

Realtime preview sound may be lightweight. Its role is responsiveness.

### MP4 Export

MP4 export sound must be full-quality and deterministic. Use an offline render path so that the exported audio matches the visual motion and does not depend on browser timing jitter.

---

## Implementation Rules

1. Build the sound system from the **same data** used by the visual renderer.
2. Create a shared feature extraction layer that computes audio-relevant features from:
   - mass points
   - force parameters
   - animation time
3. Keep the sound engine modular.
4. Separate:
   - feature extraction
   - traversal logic
   - synthesis
   - offline rendering
   - muxing/export
5. Do not tightly couple synthesis code to React UI code.
6. Prefer a small number of strong sonic behaviors over many arbitrary mappings.
7. Preserve conceptual clarity over musical complexity.

---

## Data Source Priority

Use these sources in order of importance:

1. **Mass point array**
2. **Force settings**: `strength`, `decay`, `epsilon`, `motionAmount`, etc.
3. **Animation time / pulse**
4. **Derived field features**
5. Final pixel data only if absolutely needed as a secondary diagnostic source

---

## Minimum Viable Sound System

The first version only needs:

- one low-frequency drone layer
- one traversal voice
- one event/transient layer
- one ambience/reverb layer

This is enough if it clearly communicates:

- weight
- motion
- tension
- eventfulness

---

## Required Modules

Implement the following conceptual modules:

- `audio/featureExtractor`
  - computes mass statistics and field-derived features

- `audio/traversalAgent`
  - defines how a virtual probe moves through the field over time

- `audio/synthGraph`
  - builds the sound graph for realtime playback

- `audio/renderOfflineAudio`
  - renders export audio deterministically

- `export/exportMp4WithAudio`
  - combines video frames and rendered audio into one MP4

---

## Acceptance Criteria

The implementation is successful if:

1. Exported MP4 contains synchronized audio.
2. The sound clearly changes when poster structure changes.
3. The sound is recognizably driven by force-field structure, not by trivial x/y scan logic.
4. The same settings and seed produce identical results.
5. The system feels like a **graphic instrument**, not an ornamental add-on.

---

## Short Design Statement

f(g)=ma does not convert images into sound. It generates sound from the same force field that generates the poster.

The poster is not just seen. It is heard as a vibrating graphic system.
