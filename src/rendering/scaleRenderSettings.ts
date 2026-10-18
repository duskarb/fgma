import type { ArtboardSize, RenderSettings } from '../types';

/**
 * The field shader works in pixels. Rendering at another scale keeps the
 * same look only if lengths (softness, stride, point size) grow with it and
 * strength compensates for the larger distances in the falloff.
 */
export function scaleRenderSettings(settings: RenderSettings, scale: number): RenderSettings {
  if (scale === 1) return settings;
  return {
    ...settings,
    strength: settings.strength * Math.pow(scale, 1 + settings.decay),
    epsilon: settings.epsilon * scale,
    pointSpacing: settings.pointSpacing * scale,
    pointSize: settings.pointSize * scale,
    pixelScale: (settings.pixelScale ?? 1) * scale,
  };
}

/** Scale of a render target relative to the 1x artboard. */
export function renderScale(target: ArtboardSize, artboard: ArtboardSize) {
  return artboard.width > 0 ? target.width / artboard.width : 1;
}
