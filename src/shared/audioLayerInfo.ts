import type { ArtboardSize, TextLayer } from '../types';
import type { VisualLayerInfo } from './motionFeatures';

type FontRun = {
  start: number;
  end: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
};

function estimateTextHeight(layer: TextLayer, fontSize = layer.fontSize) {
  const charCount = Math.max(1, [...layer.text].length);
  const charsPerLine = Math.max(1, Math.floor((layer.width || 1) / Math.max(1, fontSize)));
  const lineCount = Math.max(1, Math.ceil(charCount / charsPerLine));
  return Math.max(fontSize, fontSize * (layer.lineHeight ?? 1.2) * lineCount);
}

function getFontRuns(layer: TextLayer): FontRun[] {
  const textLength = [...layer.text].length;
  const defaultRun = {
    start: 0,
    end: textLength,
    fontFamily: layer.fontFamily || 'Pretendard',
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
  };

  if (!layer.fontSpans?.length || textLength === 0) return [defaultRun];

  const points = new Set<number>([0, textLength]);
  for (const span of layer.fontSpans) {
    points.add(Math.max(0, Math.min(textLength, span.start)));
    points.add(Math.max(0, Math.min(textLength, span.end)));
  }

  const sorted = [...points].sort((a, b) => a - b);
  const runs: FontRun[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;

    const span = layer.fontSpans.find((item) => start >= item.start && start < item.end);
    runs.push({
      start,
      end,
      fontFamily: span?.fontFamily ?? defaultRun.fontFamily,
      fontSize: span?.fontSize ?? defaultRun.fontSize,
      fontWeight: span?.fontWeight ?? defaultRun.fontWeight,
    });
  }

  return runs.length > 0 ? runs : [defaultRun];
}

export function buildAudioLayerInfo(layers: TextLayer[], artboardSize: ArtboardSize): VisualLayerInfo[] {
  const w = artboardSize.width || 1;
  const h = artboardSize.height || 1;

  return layers.flatMap((layer) => {
    const textLength = Math.max(1, [...layer.text].length);
    const baseHeight = estimateTextHeight(layer);
    const baseWidthN = Math.max(0.001, layer.width / w);
    const baseHeightN = Math.max(0.001, baseHeight / h);
    const runs = getFontRuns(layer);

    return runs.map((run) => {
      const ratio = Math.max(0.001, (run.end - run.start) / textLength);
      const areaScale = Math.sqrt(ratio);
      const runCenter = (run.start + run.end) / (2 * textLength);
      const runHeight = estimateTextHeight(layer, run.fontSize);

      return {
        color: layer.color,
        fontFamily: run.fontFamily,
        weight: (run.end - run.start) * run.fontSize * (layer.opacity ?? 1),
        x: (layer.x + layer.width * runCenter) / w,
        y: layer.y / h,
        width: baseWidthN * areaScale,
        height: Math.max(0.001, (runHeight / h) * areaScale || baseHeightN * areaScale),
        fontSize: run.fontSize,
        fontWeight: run.fontWeight,
      };
    });
  });
}
