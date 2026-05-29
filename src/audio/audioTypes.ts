export type ScaleId = 'pentatonic' | 'minor' | 'major' | 'chromatic';
export type WaveformId = 'sine' | 'triangle' | 'sawtooth';

export type SoundSettings = {
  enabled: boolean;
  volume: number;
  voices: number;
  scaleId: ScaleId;
  rootHz: number;
  octaves: number;
  waveform: WaveformId;
  brightness: number;
  motionDepth: number;
  seed: number;
};

export const SCALE_INTERVALS: Record<ScaleId, number[]> = {
  pentatonic: [0, 2, 4, 7, 9],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  major:      [0, 2, 4, 5, 7, 9, 11],
  chromatic:  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export function quantizeToScale(hz: number, rootHz: number, scaleId: ScaleId): number {
  const intervals = SCALE_INTERVALS[scaleId];
  const semisFromRoot = 12 * Math.log2(hz / rootHz);
  const octave = Math.floor(semisFromRoot / 12);
  const semInOctave = ((semisFromRoot % 12) + 12) % 12;
  let closest = intervals[0];
  let minDist = Math.abs(semInOctave - intervals[0]);
  for (const iv of intervals) {
    const d = Math.abs(semInOctave - iv);
    if (d < minDist) { minDist = d; closest = iv; }
  }
  return rootHz * Math.pow(2, (octave * 12 + closest) / 12);
}
