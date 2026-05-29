import type { SoundSettings } from './audioTypes';
import { quantizeToScale } from './audioTypes';
import type { SoundFeatures } from '../shared/motionFeatures';

export type SynthGraph = {
  update(features: SoundFeatures, t: number): void;
  connect(dest: AudioNode): void;
  disconnect(): void;
  setVolume(volume: number): void;
};

const RAMP = 0.08; // smooth ramp for parameters

/* ════════════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════════════ */

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const num = parseInt(hex, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function makeDistortionCurve(amount = 18) {
  const k = amount;
  const n = 44100;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function clampRange(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function hashString(value: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash01(value: string, salt = 0): number {
  return (hashString(value, salt) % 10000) / 10000;
}

function makeNoiseBuffer(ctx: BaseAudioContext, key: string) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * 0.8));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let state = hashString(key, 0x9e3779b9) || 1;

  for (let i = 0; i < length; i++) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const white = (state / 0xffffffff) * 2 - 1;
    const crackle = (state % 1999 === 0) ? (state % 2 === 0 ? 0.35 : -0.35) : 0;
    const shimmer = Math.sin(i * (0.02 + hash01(key, 23) * 0.05)) * 0.1;
    data[i] = clampRange(white * 0.12 + shimmer * 0.05 + crackle * 0.25, -1, 1);
  }

  return buffer;
}

/** Deterministic 0-1 hash from a font family name string */
function computeFontHash(name: string): number {
  return hash01(name);
}

/* ════════════════════════════════════════════════════════════
   Per-color voice type (Drone + Pluck + Noise Paths)
   ════════════════════════════════════════════════════════════ */

type ColorVoice = {
  droneOsc: OscillatorNode;
  droneSub: OscillatorNode;
  droneSubGain: GainNode;
  droneFilter: BiquadFilterNode;
  droneGain: GainNode;

  pluckOsc: OscillatorNode;
  pluckModOsc: OscillatorNode;
  pluckModGain: GainNode;
  pluckFilter: BiquadFilterNode;
  pluckGain: GainNode;

  noise: AudioBufferSourceNode;
  noiseFilter: BiquadFilterNode;
  noiseGain: GainNode;

  panner: StereoPannerNode;
  voiceGain: GainNode;

  removing: boolean;
  lastPluckTime: number;
  lastDistance: number;
};

/* ════════════════════════════════════════════════════════════
   Build Synth Graph
   ════════════════════════════════════════════════════════════ */

export function buildSynthGraph(
  ctx: BaseAudioContext,
  settings: SoundSettings,
): SynthGraph {
  // ── Master Gain ──────────────────────────────────────────
  const master = ctx.createGain();
  let currentVolume = settings.volume;
  master.gain.value = currentVolume;

  // ── Final Safety Limiter (Compressor) to prevent ear-piercing feedback spikes ──
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14.0; 
  limiter.knee.value = 6.0;
  limiter.ratio.value = 16.0;      
  limiter.attack.value = 0.003;    
  limiter.release.value = 0.12;
  limiter.connect(master);

  // ── Reverb (delay-feedback network) ──────────────────────
  const ambiDelay = ctx.createDelay(2.0);
  ambiDelay.delayTime.value = 0.55; 
  const ambiFeedback = ctx.createGain();
  ambiFeedback.gain.value = 0.35;
  const ambiWet = ctx.createGain();
  ambiWet.gain.value = 0.18;
  const ambiDry = ctx.createGain();
  ambiDry.gain.value = 0.8;

  ambiDelay.connect(ambiFeedback);
  ambiFeedback.connect(ambiDelay);
  ambiDelay.connect(ambiWet);
  ambiWet.connect(limiter);

  // ── Voice Mixer (all per-color voices sum here) ──────────
  const voiceMix = ctx.createGain();
  voiceMix.gain.value = 1.0;

  // ── FM Modulator (global, driven by gravity/decay) ───────
  const fmMod = ctx.createOscillator();
  fmMod.type = 'sine';
  fmMod.frequency.value = 1.5;
  const fmModGain = ctx.createGain();
  fmModGain.gain.value = 0;
  fmMod.connect(fmModGain);
  fmMod.start();

  // ── Parallel clean / distortion paths ────────────────────
  const cleanGain = ctx.createGain();
  cleanGain.gain.value = 1.0;
  const preGain = ctx.createGain();
  preGain.gain.value = 1.0;
  const distNode = ctx.createWaveShaper();
  distNode.curve = makeDistortionCurve(10); 
  distNode.oversample = '4x';
  const distGain = ctx.createGain();
  distGain.gain.value = 0;

  voiceMix.connect(cleanGain);
  voiceMix.connect(preGain);
  preGain.connect(distNode);
  distNode.connect(distGain);

  // ── Tone filter (tension / motion) ───────────────────────
  const toneFilter = ctx.createBiquadFilter();
  toneFilter.type = 'lowpass';
  toneFilter.frequency.value = 1400;
  toneFilter.Q.value = 0.7;

  cleanGain.connect(toneFilter);
  distGain.connect(toneFilter);
  toneFilter.connect(ambiDry);
  toneFilter.connect(ambiDelay);

  // ── Brightness filter (driven by average lightness) ──────
  const brightFilter = ctx.createBiquadFilter();
  brightFilter.type = 'lowpass';
  brightFilter.frequency.value = 2200;

  ambiDry.connect(brightFilter);
  brightFilter.connect(limiter);

  // ── Dynamic per-color voice pool ─────────────────────────
  const voices = new Map<string, ColorVoice>();

  function createVoice(colorKey: string): ColorVoice {
    // 1. Drone Path
    const droneOsc = ctx.createOscillator();
    const droneSub = ctx.createOscillator();
    const droneSubGain = ctx.createGain();
    const droneFilter = ctx.createBiquadFilter();
    const droneGain = ctx.createGain();

    droneOsc.type = 'sine';
    droneSub.type = 'sine';
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 800;
    droneFilter.Q.value = 1.0;
    droneGain.gain.value = 0;
    droneSubGain.gain.value = 0;

    droneOsc.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneSub.connect(droneSubGain);

    // 2. Pluck Path (FM + Resonant Filter Sweep)
    const pluckOsc = ctx.createOscillator();
    const pluckModOsc = ctx.createOscillator();
    const pluckModGain = ctx.createGain();
    const pluckFilter = ctx.createBiquadFilter();
    const pluckGain = ctx.createGain();

    pluckOsc.type = 'sine';
    pluckModOsc.type = 'sine';
    pluckFilter.type = 'lowpass';
    pluckFilter.frequency.value = 1000;
    pluckFilter.Q.value = 1.8;
    pluckGain.gain.value = 0;
    pluckModGain.gain.value = 0;

    pluckModOsc.connect(pluckModGain);
    pluckModGain.connect(pluckOsc.frequency);
    pluckOsc.connect(pluckFilter);
    pluckFilter.connect(pluckGain);

    // 3. Noise Path
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, colorKey);
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1200;
    noiseFilter.Q.value = 1.0;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);

    // 4. Stereo Panner and Voice Gain
    const panner = ctx.createStereoPanner();
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 1.0;

    droneGain.connect(panner);
    droneSubGain.connect(panner);
    pluckGain.connect(panner);
    noiseGain.connect(panner);

    panner.connect(voiceGain);
    voiceGain.connect(voiceMix);

    droneOsc.start();
    droneSub.start();
    pluckOsc.start();
    pluckModOsc.start();
    noise.start();

    return {
      droneOsc,
      droneSub,
      droneSubGain,
      droneFilter,
      droneGain,
      pluckOsc,
      pluckModOsc,
      pluckModGain,
      pluckFilter,
      pluckGain,
      noise,
      noiseFilter,
      noiseGain,
      panner,
      voiceGain,
      removing: false,
      lastPluckTime: 0,
      lastDistance: 999,
    };
  }

  function fadeOutVoice(key: string, v: ColorVoice, now: number) {
    if (v.removing) return;
    v.removing = true;
    v.voiceGain.gain.setTargetAtTime(0, now, 0.08);

    const stopTime = now + 0.6;
    if (ctx instanceof OfflineAudioContext) {
      try { v.droneOsc.stop(stopTime); } catch {}
      try { v.droneSub.stop(stopTime); } catch {}
      try { v.pluckOsc.stop(stopTime); } catch {}
      try { v.pluckModOsc.stop(stopTime); } catch {}
      try { v.noise.stop(stopTime); } catch {}
      voices.delete(key);
    } else {
      setTimeout(() => {
        try { v.droneOsc.stop(); } catch {}
        try { v.droneSub.stop(); } catch {}
        try { v.pluckOsc.stop(); } catch {}
        try { v.pluckModOsc.stop(); } catch {}
        try { v.noise.stop(); } catch {}
        
        try { v.droneOsc.disconnect(); } catch {}
        try { v.droneSub.disconnect(); } catch {}
        try { v.droneSubGain.disconnect(); } catch {}
        try { v.droneFilter.disconnect(); } catch {}
        try { v.droneGain.disconnect(); } catch {}
        
        try { v.pluckOsc.disconnect(); } catch {}
        try { v.pluckModOsc.disconnect(); } catch {}
        try { v.pluckModGain.disconnect(); } catch {}
        try { v.pluckFilter.disconnect(); } catch {}
        try { v.pluckGain.disconnect(); } catch {}
        
        try { v.noise.disconnect(); } catch {}
        try { v.noiseFilter.disconnect(); } catch {}
        try { v.noiseGain.disconnect(); } catch {}
        
        try { v.panner.disconnect(); } catch {}
        try { v.voiceGain.disconnect(); } catch {}

        // Critical Fix: Only delete if this EXACT voice instance is still in the map!
        if (voices.get(key) === v) {
          voices.delete(key);
        }
      }, 700);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     Update — called every animation frame
     ═══════════════════════════════════════════════════════════ */

  function update(f: SoundFeatures, t: number) {
    const now = ctx instanceof OfflineAudioContext ? t : ctx.currentTime;

    // ── 1. Group visual text runs and background by unique hex color ──
    type ColorGroup = {
      colorKey: string;
      area: number;
      xSum: number;
      ySum: number;
      fontHashSum: number;
      fontWeightSum: number;
      fontSizeSum: number;
      count: number;
    };
    const groups = new Map<string, ColorGroup>();

    function getOrCreateGroup(hex: string): ColorGroup {
      const normalized = hex.toLowerCase();
      let group = groups.get(normalized);
      if (!group) {
        group = {
          colorKey: normalized,
          area: 0,
          xSum: 0,
          ySum: 0,
          fontHashSum: 0,
          fontWeightSum: 0,
          fontSizeSum: 0,
          count: 0,
        };
        groups.set(normalized, group);
      }
      return group;
    }

    let totalTextArea = 0;
    if (f.layersInfo && f.layersInfo.length > 0) {
      for (const layer of f.layersInfo) {
        const area = Math.max(0.001, layer.width * layer.height);
        totalTextArea += area;

        const group = getOrCreateGroup(layer.color);
        group.area += area;
        group.xSum += layer.x * area;
        group.ySum += layer.y * area;
        group.fontHashSum += computeFontHash(layer.fontFamily) * area;
        group.fontWeightSum += (layer.fontWeight ?? 400) * area;
        group.fontSizeSum += (layer.fontSize ?? 42) * area;
        group.count += 1;
      }
    }

    // Background color plays as its own voice (ensures sound even without text layers)
    const bgHex = (f.bgColorHex || '#ffffff').toLowerCase();
    const bgArea = Math.max(0.15, 1.0 - Math.min(0.85, totalTextArea));
    const bgGroup = getOrCreateGroup(bgHex);
    bgGroup.area += bgArea;
    bgGroup.xSum += 0.5 * bgArea;
    bgGroup.ySum += 0.5 * bgArea;
    bgGroup.fontHashSum += 0.5 * bgArea;
    bgGroup.fontWeightSum += 400 * bgArea;
    bgGroup.fontSizeSum += 42 * bgArea;
    bgGroup.count += 1;

    // Normalize weighted properties
    type NormalizedGroup = {
      colorKey: string;
      area: number;
      ratio: number;
      x: number;
      y: number;
      fontHash: number;
      fontWeight: number;
      fontSize: number;
      hsl: { h: number; s: number; l: number };
    };

    let totalArea = 0;
    for (const g of groups.values()) totalArea += g.area;
    if (totalArea <= 0) totalArea = 1.0;

    const normalizedGroups: NormalizedGroup[] = [];
    for (const g of groups.values()) {
      const ratio = g.area / totalArea;
      const x = g.area > 0 ? g.xSum / g.area : 0.5;
      const y = g.area > 0 ? g.ySum / g.area : 0.5;
      const fontHash = g.area > 0 ? g.fontHashSum / g.area : 0.5;
      const fontWeight = g.area > 0 ? g.fontWeightSum / g.area : 400;
      const fontSize = g.area > 0 ? g.fontSizeSum / g.area : 42;
      const hsl = hexToHsl(g.colorKey);

      normalizedGroups.push({
        colorKey: g.colorKey,
        area: g.area,
        ratio,
        x,
        y,
        fontHash,
        fontWeight,
        fontSize,
        hsl,
      });
    }

    // ── 2. Manage voice pool based on current colors ──
    const currentKeys = new Set(normalizedGroups.map((g) => g.colorKey));
    for (const [key, voice] of voices.entries()) {
      if (!currentKeys.has(key) && !voice.removing) {
        fadeOutVoice(key, voice, now);
      }
    }

    // ── 3. Update each active voice ──
    let avgSat = 0;
    let avgLight = 0;
    let avgFontHash = 0;

    const bgHsl = hexToHsl(bgHex);
    const bgHueSemitone = Math.floor((bgHsl.h / 360) * 12);
    const rootFreq = settings.rootHz * Math.pow(2, bgHueSemitone / 12.0);

    const gravityN = clamp01(f.strength / 1200);
    const decayN = clamp01((f.decay - 0.5) / 2.5);
    const warpFactor = clamp01(gravityN * 1.1 * (0.4 + decayN * 0.6));

    let sumRed = 0, sumYellow = 0, sumBlue = 0, sumPurple = 0;

    for (const g of normalizedGroups) {
      let voice = voices.get(g.colorKey);
      if (!voice || voice.removing) {
        voice = createVoice(g.colorKey);
        voices.set(g.colorKey, voice);
      }

      const h = g.hsl.h; // 0-360
      const s = g.hsl.s / 100; // 0-1
      const l = g.hsl.l / 100; // 0-1
      const fontHash = g.fontHash;
      const ratio = g.ratio;

      avgSat += s * ratio;
      avgLight += l * ratio;
      avgFontHash += fontHash * ratio;

      // ── HUE QUADRANT CROSSFADE WEIGHTS ──
      const angle = (h / 360.0) * Math.PI * 2;
      const wRed = Math.max(0, Math.cos(angle));
      const wYellow = Math.max(0, Math.sin(angle));
      const wBlue = Math.max(0, -Math.cos(angle));
      const wPurple = Math.max(0, -Math.sin(angle));
      const totalW = wRed + wYellow + wBlue + wPurple || 1.0;
      
      const rW = wRed / totalW;
      const yW = wYellow / totalW;
      const bW = wBlue / totalW;
      const pW = wPurple / totalW;

      sumRed += rW * ratio;
      sumYellow += yW * ratio;
      sumBlue += bW * ratio;
      sumPurple += pW * ratio;

      // ── PITCH / SCALE ──
      const octaveShift = -2.0 + l * 4.0 + (fontHash - 0.5) * 0.6; 
      const hueSemitoneOffset = Math.round((h / 360) * 12.0);
      const slowLfo = Math.sin(t * 0.12 * Math.PI * 2) * (3.0 + gravityN * 12.0) * s; 
      const totalSemitones = octaveShift * 12.0 + hueSemitoneOffset;
      
      const freqBaseUnquantized = rootFreq * Math.pow(2, totalSemitones / 12.0);
      const freqBase = quantizeToScale(freqBaseUnquantized, rootFreq, settings.scaleId);

      const panRatio = clampRange((g.x - 0.5) * 1.5, -1.0, 1.0);
      const detuneLeft = slowLfo + (fontHash - 0.5) * 6.0;
      const detuneRight = -slowLfo + (fontHash - 0.5) * 6.0;

      // Configure Drone Oscillator type and frequency
      if (rW > 0.5) {
        voice.droneOsc.type = 'sawtooth';
      } else if (yW > 0.5) {
        voice.droneOsc.type = 'triangle';
      } else {
        voice.droneOsc.type = 'sine';
      }

      voice.droneOsc.frequency.setTargetAtTime(freqBase, now, 0.05);
      voice.droneOsc.detune.setTargetAtTime(panRatio < 0 ? detuneLeft : detuneRight, now, RAMP);

      // Sub Bass Drone (sine at half pitch)
      voice.droneSub.frequency.setTargetAtTime(freqBase / 2.0, now, 0.05);
      voice.droneSub.detune.setTargetAtTime(detuneLeft * 0.5, now, RAMP);

      // Drone filter frequency
      const droneFilterCutoff = 120 + l * 1200 + decayN * 300;
      voice.droneFilter.frequency.setTargetAtTime(droneFilterCutoff, now, RAMP);
      voice.droneFilter.Q.setTargetAtTime(0.7 + s * 1.5, now, RAMP);

      // Drone Gains (scaled strictly by ratio to keep total volume constant)
      const droneVol = ratio * 0.06 * s * (0.3 + l * 0.4);
      voice.droneGain.gain.setTargetAtTime(droneVol, now, RAMP);

      // Sub drone Gain (only active on dark, vivid colors)
      const subVol = (1.0 - l) * s * ratio * 0.04;
      voice.droneSubGain.gain.setTargetAtTime(subVol, now, RAMP);

      // Noise Path: active on gray/desaturated colors (ambient backdrop)
      const noiseVol = (1.0 - s) * ratio * 0.02;
      voice.noiseGain.gain.setTargetAtTime(noiseVol, now, RAMP);

      const noiseFilterFreq = 250 + l * 2500 + gravityN * 800;
      voice.noiseFilter.frequency.setTargetAtTime(noiseFilterFreq, now, RAMP);
      voice.noiseFilter.Q.setTargetAtTime(1.0 + decayN * 2.0, now, RAMP);

      // Panner
      voice.panner.pan.setTargetAtTime(panRatio, now, RAMP);

      // ── RHYTHMIC PLUCK TRIGGER ──
      const dx = f.traversalX - g.x;
      const dy = f.traversalY - g.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const isApproaching = dist < voice.lastDistance;
      const isNear = dist < 0.28;
      
      const pluckCooldown = rW * 0.12 + yW * 0.08 + bW * 0.40 + pW * 0.18 + fontHash * 0.20;
      const cooldownPassed = (now - voice.lastPluckTime) > pluckCooldown;

      let triggerPluck = false;
      if (cooldownPassed) {
        if (isNear && isApproaching) {
          triggerPluck = true;
        } else if (f.event && (g.colorKey !== bgHex || normalizedGroups.length === 1)) {
          triggerPluck = true;
        }
      }
      voice.lastDistance = dist;

      if (triggerPluck) {
        voice.lastPluckTime = now;

        const attackTime = rW * 0.003 + yW * 0.008 + bW * 0.06 + pW * 0.002 + fontHash * 0.03;
        const decayTime = (rW * 0.10 + yW * 0.18 + bW * 1.2 + pW * 0.50) * (0.35 + g.fontWeight / 400) / (0.6 + f.decay * 0.4);

        // Map pluck frequency to Traversal position + Doppler speed sweep
        const ySemitones = Math.round((1.0 - f.traversalY) * 20.0); 
        const dopplerSemitone = Math.round(f.traversalSpeed * 5.0); 
        let pluckFreqUnquantized = rootFreq * Math.pow(2, (ySemitones + dopplerSemitone) / 12.0);
        const pluckFreq = quantizeToScale(pluckFreqUnquantized, rootFreq, settings.scaleId);

        const pOsc = voice.pluckOsc;
        const pFilter = voice.pluckFilter;
        const pGain = voice.pluckGain.gain;
        const pModOsc = voice.pluckModOsc;
        const pModGain = voice.pluckModGain.gain;

        // Cancel previous schedules to prevent clicks and overlapping curves
        pGain.cancelScheduledValues(now);
        pFilter.frequency.cancelScheduledValues(now);
        pModGain.cancelScheduledValues(now);

        // Set base frequency
        pOsc.frequency.setValueAtTime(pluckFreq, now);

        if (rW > 0.5) {
          // Red: Sawtooth Subtractive sweep (fat string/bass pluck)
          pOsc.type = 'sawtooth';
          
          pFilter.frequency.setValueAtTime(6000 * (0.4 + gravityN * 0.6), now);
          pFilter.frequency.exponentialRampToValueAtTime(180 + decayN * 100, now + attackTime + decayTime);
          
          pModGain.setValueAtTime(0, now); // No FM modulation
        } 
        else if (yW > 0.5) {
          // Yellow: Bright FM bell (harmonic 3:1)
          pOsc.type = 'sine';
          pModOsc.type = 'sine';
          pModOsc.frequency.setValueAtTime(pluckFreq * 3.0, now);
          
          const maxModIndex = pluckFreq * 0.8 * (0.4 + gravityN * 0.6);
          pModGain.setValueAtTime(maxModIndex, now);
          pModGain.exponentialRampToValueAtTime(0.1, now + attackTime + decayTime);
          
          pFilter.frequency.setValueAtTime(4000, now);
        }
        else if (bW > 0.5) {
          // Blue: Deep, soft Triangle sweep (warm liquid tine/pluck)
          pOsc.type = 'triangle';
          
          pFilter.frequency.setValueAtTime(2000, now);
          pFilter.frequency.exponentialRampToValueAtTime(80, now + attackTime + decayTime);
          
          pModGain.setValueAtTime(0, now);
        }
        else {
          // Purple: Metallic/Inharmonic FM chime (golden ratio 1.618)
          pOsc.type = 'sine';
          pModOsc.type = 'sine';
          pModOsc.frequency.setValueAtTime(pluckFreq * 1.618, now);
          
          const maxModIndex = pluckFreq * 1.2 * (0.4 + gravityN * 0.6);
          pModGain.setValueAtTime(maxModIndex, now);
          pModGain.exponentialRampToValueAtTime(0.1, now + attackTime + decayTime);
          
          pFilter.frequency.setValueAtTime(8000, now);
        }

        // Amplitude Envelope: Linear rise then exponential decay down to non-zero floor (0.0001)
        const peakVolume = ratio * 0.16 * (0.3 + s * 0.7);
        pGain.setValueAtTime(0, now);
        pGain.linearRampToValueAtTime(peakVolume, now + attackTime);
        pGain.exponentialRampToValueAtTime(0.0001, now + attackTime + decayTime);
      } else {
        // Soft return to silence if pluck is not active
        if (now - voice.lastPluckTime > 1.5) {
          voice.pluckGain.gain.setTargetAtTime(0.0, now, RAMP);
        }
      }
    }

    // ── 4. Global Modulations (Morphed by color proportions and physics) ──
    const avgRed = clamp01(sumRed);
    const avgYellow = clamp01(sumYellow);
    const avgBlue = clamp01(sumBlue);
    const avgPurple = clamp01(sumPurple);

    // Global FM modulator wobble rate and depth
    const fmFreq = 0.1 + (f.strength / 150.0) + avgPurple * 5.0;
    const fmDepth = gravityN * 12.0 * (0.2 + avgSat * 0.8) * (1.0 - avgBlue * 0.8); 
    fmMod.frequency.setTargetAtTime(fmFreq, now, RAMP);
    fmModGain.gain.setTargetAtTime(fmDepth, now, RAMP);

    // Warm Analog saturation distortion wet/dry (milder mix to avoid excessive distortion)
    const distWet = clampRange(warpFactor * 0.08 * (0.3 + avgRed * 0.7), 0, 0.08); 
    cleanGain.gain.setTargetAtTime(1.0 - distWet, now, RAMP);
    distGain.gain.setTargetAtTime(distWet, now, RAMP);
    preGain.gain.setTargetAtTime(1.0 + warpFactor * 0.25, now, RAMP); 

    // Tone Filter: Tension and motion amount open cutoff
    const toneCut = 220.0 + f.tension * 0.15 + f.motionAmount * 1800.0 + avgLight * 2800.0;
    toneFilter.frequency.setTargetAtTime(clampRange(toneCut, 120, 12000), now, RAMP);
    toneFilter.Q.setTargetAtTime(0.5 + f.motionAmount * 1.2 + decayN * 0.5, now, RAMP);

    // Final Brightness Filter based on average lightness (sculpts high/low profile)
    if (avgLight < 0.35) {
      brightFilter.type = 'lowpass';
      brightFilter.frequency.setTargetAtTime(120 + avgLight * 1500, now, RAMP);
      brightFilter.Q.setTargetAtTime(1.2, now, RAMP);
    } else if (avgLight > 0.70) {
      brightFilter.type = 'highpass';
      brightFilter.frequency.setTargetAtTime(150 + (avgLight - 0.7) * 600, now, RAMP);
      brightFilter.Q.setTargetAtTime(0.7, now, RAMP);
    } else {
      brightFilter.type = 'lowpass';
      brightFilter.frequency.setTargetAtTime(450 + avgLight * 12000, now, RAMP);
      brightFilter.Q.setTargetAtTime(1.0, now, RAMP);
    }

    // ── Global Reverb & Delay modulated dynamically by HSL weights ──
    const revDelay = avgRed * 0.18 + avgYellow * 0.32 + avgBlue * 0.82 + avgPurple * 0.45 + avgFontHash * 0.2;
    const revFeedback = clampRange(avgRed * 0.15 + avgYellow * 0.45 + avgBlue * 0.72 + avgPurple * 0.52 + warpFactor * 0.1, 0.08, 0.78);
    const revWet = clampRange(avgRed * 0.02 + avgYellow * 0.12 + avgBlue * 0.45 + avgPurple * 0.28 + gravityN * 0.12, 0.02, 0.55);

    // Apply slow time constant (1.8s) for delay changes to eliminate tape pitch-sweeps
    ambiDelay.delayTime.setTargetAtTime(clampRange(revDelay, 0.08, 1.8), now, 1.8);
    ambiFeedback.gain.setTargetAtTime(revFeedback, now, RAMP);
    ambiWet.gain.setTargetAtTime(revWet, now, RAMP);

    // Master volume subtle animation pulse breathing
    const pulseRate = 0.12 + f.motionAmount * 0.8 + gravityN * 0.3 + decayN * 0.2;
    const pulseDepth = clampRange(f.motionAmount * 0.05 + warpFactor * 0.015, 0, 0.06);
    const pulse = 1.0 + Math.sin(t * pulseRate * Math.PI * 2) * pulseDepth;
    master.gain.setTargetAtTime(currentVolume * pulse, now, RAMP);
  }

  /* ═══════════════════════════════════════════════════════════
     Public interface
     ═══════════════════════════════════════════════════════════ */

  function setVolume(volume: number) {
    currentVolume = volume;
    master.gain.setTargetAtTime(currentVolume, ctx.currentTime, RAMP);
  }

  function connect(dest: AudioNode) {
    master.connect(dest);
  }

  function disconnect() {
    master.disconnect();
    try { fmMod.stop(); } catch {}

    for (const v of voices.values()) {
      try { v.droneOsc.stop(); } catch {}
      try { v.droneSub.stop(); } catch {}
      try { v.pluckOsc.stop(); } catch {}
      try { v.pluckModOsc.stop(); } catch {}
      try { v.noise.stop(); } catch {}

      try { v.droneOsc.disconnect(); } catch {}
      try { v.droneSub.disconnect(); } catch {}
      try { v.droneSubGain.disconnect(); } catch {}
      try { v.droneFilter.disconnect(); } catch {}
      try { v.droneGain.disconnect(); } catch {}

      try { v.pluckOsc.disconnect(); } catch {}
      try { v.pluckModOsc.disconnect(); } catch {}
      try { v.pluckModGain.disconnect(); } catch {}
      try { v.pluckFilter.disconnect(); } catch {}
      try { v.pluckGain.disconnect(); } catch {}

      try { v.noise.disconnect(); } catch {}
      try { v.noiseFilter.disconnect(); } catch {}
      try { v.noiseGain.disconnect(); } catch {}

      try { v.panner.disconnect(); } catch {}
      try { v.voiceGain.disconnect(); } catch {}
    }
    voices.clear();
  }

  return { update, connect, disconnect, setVolume };
}
