import type { ArtboardSize, RenderSettings, TextLayer } from './types';
import type { SoundSettings, ScaleId, WaveformId } from './audio/audioTypes';

export type ArtboardPresetId = 'a4' | 'a3' | '4x5' | '1x1' | 'hd';
export type Orientation = 'portrait' | 'landscape';
export type ViewZoom = 'fit' | number;
export type PanPoint = { x: number; y: number };

export const ARTBOARD_PRESETS: { id: ArtboardPresetId; label: string; width: number; height: number; defaultOrientation: Orientation }[] = [
  { id: 'a4', label: 'A4', width: 1240, height: 1754, defaultOrientation: 'portrait' },
  { id: 'a3', label: 'A3', width: 1754, height: 2480, defaultOrientation: 'portrait' },
  { id: '4x5', label: '4:5', width: 1080, height: 1350, defaultOrientation: 'portrait' },
  { id: '1x1', label: '1:1', width: 1080, height: 1080, defaultOrientation: 'portrait' },
  { id: 'hd', label: '1920x1080', width: 1920, height: 1080, defaultOrientation: 'landscape' },
];

export function getArtboardPreset(presetId: ArtboardPresetId) {
  return ARTBOARD_PRESETS.find((item) => item.id === presetId) ?? ARTBOARD_PRESETS[0];
}

export function resolveArtboardSize(presetId: ArtboardPresetId, orientation: Orientation): ArtboardSize {
  const preset = getArtboardPreset(presetId);
  if (preset.width === preset.height) return { width: preset.width, height: preset.height };

  const short = Math.min(preset.width, preset.height);
  const long = Math.max(preset.width, preset.height);
  return orientation === 'portrait'
    ? { width: short, height: long }
    : { width: long, height: short };
}

const PREVIEW_MAX_PIXELS = 900_000;

export function resolvePreviewRenderSize(size: ArtboardSize): ArtboardSize {
  const pixels = size.width * size.height;
  if (pixels <= PREVIEW_MAX_PIXELS) return size;

  const scale = Math.sqrt(PREVIEW_MAX_PIXELS / pixels);
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

export function scaleLayersForSize(layers: TextLayer[], from: ArtboardSize, to: ArtboardSize) {
  if (from.width === to.width && from.height === to.height) return layers;

  const sx = to.width / from.width;
  const sy = to.height / from.height;
  const textScale = Math.min(sx, sy);

  return layers.map((layer) => ({
    ...layer,
    x: layer.x * sx,
    y: layer.y * sy,
    width: layer.width * sx,
    fontSize: layer.fontSize * textScale,
    letterSpacing: layer.letterSpacing * textScale,
    fontSpans: layer.fontSpans?.map((span) => ({
      ...span,
      fontSize: span.fontSize === undefined ? undefined : span.fontSize * textScale,
      letterSpacing: span.letterSpacing === undefined ? undefined : span.letterSpacing * textScale,
    })),
  }));
}

export const FONTS: { id: string; label: string; korean: boolean }[] = [
  { id: 'Pretendard', label: 'Pretendard', korean: true },
  { id: 'SUIT Variable', label: 'SUIT Variable', korean: true },
  { id: 'Paperlogy', label: 'Paperlogy', korean: true },
  { id: 'Gmarket Sans', label: 'Gmarket Sans', korean: true },
  { id: 'Black Han Sans', label: 'Black Han Sans', korean: true },
  { id: 'Noto Serif KR', label: 'Noto Serif KR', korean: true },
  { id: 'IBM Plex Sans KR', label: 'IBM Plex Sans KR', korean: true },
  { id: 'Maru Buri', label: 'Maru Buri', korean: true },
  { id: 'Inter', label: 'Inter', korean: false },
  { id: 'Geist', label: 'Geist', korean: false },
  { id: 'Roboto Flex', label: 'Roboto Flex', korean: false },
  { id: 'Recursive', label: 'Recursive', korean: false },
  { id: 'Fraunces', label: 'Fraunces', korean: false },
  { id: 'Anybody', label: 'Anybody', korean: false },
  { id: 'IBM Plex Sans', label: 'IBM Plex Sans', korean: false },
  { id: 'Space Grotesk', label: 'Space Grotesk', korean: false },
  { id: 'Archivo', label: 'Archivo', korean: false },
  { id: 'Space Mono', label: 'Space Mono', korean: false },
  { id: 'Bebas Neue', label: 'Bebas Neue', korean: false },
  { id: 'Cormorant Garamond', label: 'Cormorant Garamond', korean: false },
];

export const initialLayers: TextLayer[] = [
  {
    id: 'default-text',
    text: '말에 힘(중력)이 있다고..\n\nf(g)=ma\n피그마 아님.\n\n말조심🐎🐴🙊\n\nmade by @duskarb',
    x: 80,
    y: 120,
    width: 800,
    fontSize: 72,
    fontWeight: 800,
    lineHeight: 1.15,
    letterSpacing: -0.02,
    color: '#111111',
    opacity: 1,
    align: 'left',
    fontFamily: 'Pretendard',
  },
];

export const SCALE_OPTIONS: { id: ScaleId; label: string }[] = [
  { id: 'pentatonic', label: 'Pentatonic' },
  { id: 'minor',      label: 'Minor' },
  { id: 'major',      label: 'Major' },
  { id: 'chromatic',  label: 'Chromatic' },
];

export const WAVEFORM_OPTIONS: { id: WaveformId; label: string }[] = [
  { id: 'sine',     label: 'Sine' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'sawtooth', label: 'Sawtooth' },
];

export const initialSoundSettings: SoundSettings = {
  enabled: false,
  volume: 0.6,
  voices: 4,
  scaleId: 'pentatonic',
  rootHz: 110,
  octaves: 2,
  waveform: 'sine',
  brightness: 0.6,
  motionDepth: 0.4,
  seed: 42,
};

export const initialSettings: RenderSettings = {
  strength: 520,
  decay: 1.42,
  epsilon: 42,
  pointSpacing: 6,
  pointSize: 1.5,
  showField: true,
  showMasses: false,
  animate: true,
  motionAmount: 0.28,
};
