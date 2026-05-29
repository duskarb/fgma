export type TextAlign = 'left' | 'center' | 'right';

export type FontSpan = {
  start: number;
  end: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
};

export type TextLayer = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  color: string;
  opacity: number;
  align: TextAlign;
  fontFamily?: string;
  fontSpans?: FontSpan[];
  rotation?: number;
  locked?: boolean;
};

export type RenderSettings = {
  strength: number;
  decay: number;
  epsilon: number;
  pointSpacing: number;
  pointSize: number;
  showField: boolean;
  showMasses: boolean;
  animate: boolean;
  motionAmount: number;
};

export type ArtboardSize = {
  width: number;
  height: number;
};

export type PosterTexture = {
  canvas: HTMLCanvasElement;
  masses: Float32Array;
  massCount: number;
  totalMass: number;
  bgColor: [number, number, number];
};

export type { SoundSettings, ScaleId, WaveformId } from './audio/audioTypes';
