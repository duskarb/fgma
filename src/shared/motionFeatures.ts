export type VisualLayerInfo = {
  color: string;
  fontFamily: string;
  weight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontWeight?: number;
};

export type MotionAudioInput = {
  masses: Float32Array;
  massCount: number;
  totalMass: number;
  strength: number;
  decay: number;
  epsilon: number;
  motionAmount: number;
  durationSec: number;
  fps: number;
  seed: number;
  bgColorHex?: string;
  textColorHex?: string;
  fontFamily?: string;
  layersInfo?: VisualLayerInfo[];
};

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
  event: boolean;
  bgColorHex?: string;
  textColorHex?: string;
  fontFamily?: string;
  layersInfo?: VisualLayerInfo[];
  strength: number;
  decay: number;
  epsilon: number;
  motionAmount: number;
  seed?: number;
};
