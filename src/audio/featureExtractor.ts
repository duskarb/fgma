import type { MotionAudioInput, SoundFeatures } from '../shared/motionFeatures';
import type { TraversalState } from './traversalAgent';

export function extractSoundFeatures(
  input: MotionAudioInput,
  t: number,
  traversal: TraversalState,
): SoundFeatures {
  const { masses, massCount, motionAmount, strength, decay, epsilon, bgColorHex, textColorHex, fontFamily, layersInfo, seed } = input;

  if (massCount === 0) {
    return {
      totalMass: 0, centerX: 0.5, centerY: 0.5,
      spread: 0, tension: 0,
      pulse: 1 + Math.sin(t * 1.65) * motionAmount,
      traversalX: 0.5, traversalY: 0.5,
      traversalSpeed: 0, clusterEnergy: 0, emptiness: 1, event: false,
      bgColorHex,
      textColorHex,
      fontFamily,
      layersInfo,
      strength,
      decay,
      epsilon,
      motionAmount,
      seed,
    };
  }

  // Center of mass (normalized 0–1 to artboard coords stored raw)
  let cx = 0, cy = 0, totalMass = 0;
  for (let i = 0; i < massCount; i++) {
    const m = masses[i * 3 + 2];
    cx += masses[i * 3] * m;
    cy += masses[i * 3 + 1] * m;
    totalMass += m;
  }
  cx /= totalMass;
  cy /= totalMass;

  // Spread: mass-weighted RMS distance from center
  let sumSq = 0;
  for (let i = 0; i < massCount; i++) {
    const dx = masses[i * 3] - cx;
    const dy = masses[i * 3 + 1] - cy;
    sumSq += (dx * dx + dy * dy) * masses[i * 3 + 2];
  }
  const spread = Math.sqrt(sumSq / totalMass);

  // Tension: sample pairwise forces between nearby masses (O(N) approximation)
  let tension = 0;
  const sample = Math.min(massCount, 32);
  const step = Math.max(1, Math.floor(massCount / sample));
  for (let i = 0; i < massCount; i += step) {
    for (let j = i + step; j < massCount; j += step) {
      const dx = masses[j * 3] - masses[i * 3];
      const dy = masses[j * 3 + 1] - masses[i * 3 + 1];
      const dist = Math.sqrt(dx * dx + dy * dy) + epsilon;
      tension += strength * masses[i * 3 + 2] * masses[j * 3 + 2] / Math.pow(dist, decay);
    }
  }
  // Normalize
  const pairCount = (sample * (sample - 1)) / 2;
  tension = pairCount > 0 ? tension / pairCount : 0;

  // Emptiness: fraction of grid cells with no mass (rough approximation via spread vs. count)
  const emptiness = Math.max(0, 1 - massCount / 200);

  // Pulse: exactly the same formula as the WebGL shader
  const pulse = 1 + Math.sin(t * 1.65) * motionAmount;

  return {
    totalMass,
    centerX: cx,
    centerY: cy,
    spread,
    tension,
    pulse,
    traversalX: traversal.x,
    traversalY: traversal.y,
    traversalSpeed: traversal.speed,
    clusterEnergy: traversal.clusterEnergy,
    emptiness,
    event: traversal.event,
    bgColorHex,
    textColorHex,
    fontFamily,
    layersInfo,
    strength,
    decay,
    epsilon,
    motionAmount,
    seed,
  };
}
