import { createRng } from './seededRandom';
import type { MotionAudioInput } from '../shared/motionFeatures';

export type TraversalState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  clusterEnergy: number;
  event: boolean;
};

const DAMPING = 0.88;
const FORCE_SCALE = 0.00012;
const EVENT_THRESHOLD = 0.35;
const CLUSTER_RADIUS_FACTOR = 40;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function createTraversalAgent(input: MotionAudioInput) {
  const rng = createRng(input.seed ^ 0xdeadbeef);
  const { masses, massCount, strength, decay, epsilon } = input;

  // Find bounding box of mass coordinates
  let maxX = 800;
  let maxY = 1200;
  for (let i = 0; i < massCount; i++) {
    maxX = Math.max(maxX, masses[i * 3]);
    maxY = Math.max(maxY, masses[i * 3 + 1]);
  }

  // Seeded start near the field center of mass
  let cx = 0, cy = 0, totalM = 0;
  for (let i = 0; i < massCount; i++) {
    const m = masses[i * 3 + 2];
    cx += masses[i * 3] * m;
    cy += masses[i * 3 + 1] * m;
    totalM += m;
  }
  if (totalM > 0) { cx /= totalM; cy /= totalM; }

  const spread = massCount > 0
    ? Math.sqrt(
        Array.from({ length: massCount }, (_, i) => {
          const dx = masses[i * 3] - cx;
          const dy = masses[i * 3 + 1] - cy;
          return (dx * dx + dy * dy) * masses[i * 3 + 2];
        }).reduce((a, b) => a + b, 0) / totalM
      )
    : 200;

  let x = cx + (rng() - 0.5) * spread * 1.2;
  let y = cy + (rng() - 0.5) * spread * 1.2;
  let vx = (rng() - 0.5) * 0.5;
  let vy = (rng() - 0.5) * 0.5;
  let prevSpeed = 0;

  function step(): TraversalState {
    let fx = 0, fy = 0;
    let localEnergy = 0;

    for (let i = 0; i < massCount; i++) {
      const mx = masses[i * 3];
      const my = masses[i * 3 + 1];
      const m = masses[i * 3 + 2];
      const dx = mx - x;
      const dy = my - y;
      const dist = Math.sqrt(dx * dx + dy * dy) + epsilon;
      const force = strength * m / Math.pow(dist, decay);
      fx += (dx / dist) * force;
      fy += (dy / dist) * force;
      if (dist < CLUSTER_RADIUS_FACTOR * m) localEnergy += m / dist;
    }

    vx = (vx + fx * FORCE_SCALE) * DAMPING;
    vy = (vy + fy * FORCE_SCALE) * DAMPING;

    // Clamp velocity to avoid runaway
    const vMag = Math.sqrt(vx * vx + vy * vy);
    if (vMag > 8) { vx = (vx / vMag) * 8; vy = (vy / vMag) * 8; }

    x += vx;
    y += vy;

    // Boundary bounces
    let hitBoundary = false;
    if (x < 0) { x = 0; vx = -vx * 0.5; hitBoundary = true; }
    if (x > maxX) { x = maxX; vx = -vx * 0.5; hitBoundary = true; }
    if (y < 0) { y = 0; vy = -vy * 0.5; hitBoundary = true; }
    if (y > maxY) { y = maxY; vy = -vy * 0.5; hitBoundary = true; }

    const speed = Math.sqrt(vx * vx + vy * vy);
    const speedDelta = Math.abs(speed - prevSpeed);
    const event = speedDelta > EVENT_THRESHOLD || localEnergy > 1.5 || hitBoundary;
    prevSpeed = speed;

    return {
      x: clamp01(x / maxX),
      y: clamp01(y / maxY),
      vx: vx / maxX,
      vy: vy / maxY,
      speed: speed / Math.max(maxX, maxY),
      clusterEnergy: localEnergy,
      event,
    };
  }

  return { step };
}
