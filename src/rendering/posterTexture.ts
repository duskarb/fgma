import type { ArtboardSize, FontSpan, PosterTexture, TextLayer } from '../types';
import { fillMixed, fontString, measureMixed } from './multilingual';
import {
  DEFAULT_MASS_STRIDE,
  MASS_COMPONENTS_PER_POINT,
  MASS_DENSITY_THRESHOLD,
  MAX_SHADER_MASSES,
  POSTER_HEIGHT,
  POSTER_WIDTH,
} from './massConfig';

export { POSTER_HEIGHT, POSTER_WIDTH } from './massConfig';

const textureCanvas = document.createElement('canvas');
const maskCanvas = document.createElement('canvas');

function resizeCanvas(canvas: HTMLCanvasElement, size: ArtboardSize) {
  if (canvas.width !== size.width) canvas.width = size.width;
  if (canvas.height !== size.height) canvas.height = size.height;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function withAlpha(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function splitForWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: number,
  fontSize: number,
  letterSpacing: number,
  fontFamily?: string,
  fontSpans?: FontSpan[],
): { line: string; start: number }[] {
  const result: { line: string; start: number }[] = [];
  const sourceLines = text.split('\n');
  let offset = 0;

  for (const sourceLine of sourceLines) {
    if (!sourceLine.trim()) {
      result.push({ line: '', start: offset });
      offset += sourceLine.length + 1;
      continue;
    }

    const hasSpaces = sourceLine.includes(' ');
    const tokens = hasSpaces ? sourceLine.split(' ') : [...sourceLine];
    let currentLine = '';
    let currentLineStart = offset;
    let tokenOffset = offset;

    for (let ti = 0; ti < tokens.length; ti++) {
      const token = tokens[ti];
      const joiner = hasSpaces && currentLine ? ' ' : '';
      const candidate = `${currentLine}${joiner}${token}`;
      if (measureMixed(ctx, candidate, weight, fontSize, letterSpacing, fontFamily, fontSpans, currentLineStart) <= maxWidth || !currentLine) {
        currentLine = candidate;
      } else {
        result.push({ line: currentLine, start: currentLineStart });
        currentLineStart = tokenOffset;
        currentLine = token;
      }
      tokenOffset += [...token].length;
      if (hasSpaces && ti < tokens.length - 1) tokenOffset += 1;
    }

    result.push({ line: currentLine, start: currentLineStart });
    offset += [...sourceLine].length + 1;
  }

  return result;
}


function layerHeight(layer: TextLayer, ctx: CanvasRenderingContext2D) {
  const lines = splitForWidth(ctx, layer.text, layer.width, layer.fontWeight, layer.fontSize, layer.letterSpacing, layer.fontFamily, layer.fontSpans);
  return Math.max(layer.fontSize, lines.length * layer.fontSize * layer.lineHeight);
}

export function estimateLayerBounds(layer: TextLayer) {
  const ctx = textureCanvas.getContext('2d')!;
  return {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layerHeight(layer, ctx),
  };
}

function drawTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer) {
  ctx.save();

  const { fontWeight: weight, fontSize, letterSpacing, lineHeight, fontFamily, fontSpans } = layer;
  const lines = splitForWidth(ctx, layer.text, layer.width, weight, fontSize, letterSpacing, fontFamily, fontSpans);
  const height = Math.max(fontSize, lines.length * fontSize * lineHeight);

  const rotation = layer.rotation ?? 0;
  if (rotation !== 0) {
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.translate(-cx, -cy);
  }

  ctx.globalAlpha = layer.opacity ?? 1;
  ctx.fillStyle = layer.color;
  ctx.textBaseline = 'top';
  ctx.font = fontString(weight, fontSize, false, fontFamily);

  const lineAdvance = fontSize * lineHeight;
  lines.forEach(({ line, start: charOffset }, index) => {
    let x = layer.x;
    const lineWidth = measureMixed(ctx, line, weight, fontSize, letterSpacing, fontFamily, fontSpans, charOffset);
    if (layer.align === 'center') x += (layer.width - lineWidth) / 2;
    if (layer.align === 'right') x += layer.width - lineWidth;
    fillMixed(ctx, line, x, layer.y + index * lineAdvance, weight, fontSize, letterSpacing, fontFamily, fontSpans, charOffset);
  });

  ctx.restore();
}

type MassCell = {
  gx: number;
  gy: number;
  x: number;
  y: number;
  mass: number;
};

function collectMasses(layers: TextLayer[], size: ArtboardSize, stride: number, maxMasses = MAX_SHADER_MASSES) {
  const cellMass = new Map<string, MassCell>();
  const safeStride = Math.max(1, Math.round(stride));
  resizeCanvas(maskCanvas, size);
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;

  for (const layer of layers) {
    maskCtx.clearRect(0, 0, size.width, size.height);
    drawTextLayer(maskCtx, { ...layer, color: '#ffffff' });

    // The alpha mask is the bridge between typography and physics:
    // opaque sampled cells become mass candidates for the shader field.
    const image = maskCtx.getImageData(0, 0, size.width, size.height).data;
    for (let y = 0; y < size.height; y += safeStride) {
      for (let x = 0; x < size.width; x += safeStride) {
        let alpha = 0;
        let pixels = 0;
        const yMax = Math.min(size.height, y + safeStride);
        const xMax = Math.min(size.width, x + safeStride);

        for (let py = y; py < yMax; py += 1) {
          for (let px = x; px < xMax; px += 1) {
            alpha += image[(py * size.width + px) * 4 + 3] / 255;
            pixels += 1;
          }
        }

        const density = alpha / pixels;
        if (density < MASS_DENSITY_THRESHOLD) continue;

        const gx = Math.round(x / safeStride);
        const gy = Math.round(y / safeStride);
        const key = `${gx}:${gy}`;
        const previous = cellMass.get(key);
        const cx = x + (xMax - x) / 2;
        const cy = y + (yMax - y) / 2;
        if (previous) {
          previous.mass += 1.0;
        } else {
          cellMass.set(key, { gx, gy, x: cx, y: cy, mass: 1.0 });
        }
      }
    }
  }

  const candidates = [...cellMass.values()].sort((a, b) => (a.gy - b.gy) || (a.gx - b.gx));
  const capacity = Math.max(16, Math.min(MAX_SHADER_MASSES, Math.floor(maxMasses)));
  const masses = new Float32Array(capacity * MASS_COMPONENTS_PER_POINT);
  const totalMass = candidates.reduce((sum, item) => sum + item.mass, 0);
  if (!candidates.length) return { masses, count: 0, totalMass: 0 };

  // WebGL1 uniforms need a compile-time array limit. When text produces more
  // cells than the shader can accept, nearby cells are folded into coarser
  // cells instead of abruptly dropping the tail of the candidate list.
  const coarsen = Math.max(1, Math.ceil(Math.sqrt(candidates.length / capacity)));
  const fixedGrid = new Map<string, MassCell>();

  for (const item of candidates) {
    const gx = Math.floor(item.gx / coarsen) * coarsen;
    const gy = Math.floor(item.gy / coarsen) * coarsen;
    const key = `${gx}:${gy}`;
    const previous = fixedGrid.get(key);

    if (previous) {
      previous.mass += item.mass;
    } else {
      fixedGrid.set(key, {
        gx,
        gy,
        x: (gx + 0.5 * coarsen) * safeStride,
        y: (gy + 0.5 * coarsen) * safeStride,
        mass: item.mass,
      });
    }
  }

  const points = [...fixedGrid.values()].sort((a, b) => (a.gy - b.gy) || (a.gx - b.gx));
  const count = Math.min(capacity, points.length);

  for (let i = 0; i < count; i += 1) {
    const item = points[i];

    masses[i * 3] = Math.min(size.width - 1, item.x);
    masses[i * 3 + 1] = Math.min(size.height - 1, item.y);
    masses[i * 3 + 2] = item.mass;
  }

  return { masses, count, totalMass };
}

export async function createPosterTexture(
  layers: TextLayer[],
  bgColor: string,
  size: ArtboardSize = { width: POSTER_WIDTH, height: POSTER_HEIGHT },
  maxMasses = MAX_SHADER_MASSES,
  massStride = DEFAULT_MASS_STRIDE,
): Promise<PosterTexture> {
  await document.fonts.ready;

  resizeCanvas(textureCanvas, size);
  const ctx = textureCanvas.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size.width, size.height);

  ctx.fillStyle = withAlpha('#000000', 0.06);
  ctx.fillRect(0, 0, size.width, 1);
  ctx.fillRect(0, size.height - 1, size.width, 1);

  layers.forEach((layer) => drawTextLayer(ctx, layer));

  const { masses, count, totalMass } = collectMasses(layers, size, massStride, maxMasses);
  const { r, g, b } = hexToRgb(bgColor);

  return {
    canvas: textureCanvas,
    masses,
    massCount: count,
    totalMass,
    bgColor: [r / 255, g / 255, b / 255],
  };
}
