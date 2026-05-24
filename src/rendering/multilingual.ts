import type { FontSpan } from '../types';

function isKorean(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
    (code >= 0x1100 && code <= 0x11ff) ||  // Hangul Jamo
    (code >= 0x3130 && code <= 0x318f) ||  // Hangul Compat Jamo
    (code >= 0xa960 && code <= 0xa97f) ||  // Hangul Jamo Extended-A
    (code >= 0xd7b0 && code <= 0xd7ff)     // Hangul Jamo Extended-B
  );
}

type Run = { text: string; korean: boolean };

function toRuns(text: string): Run[] {
  if (!text) return [];
  const chars = [...text];
  const runs: Run[] = [];
  let current = chars[0];
  let currentKorean = isKorean(chars[0]);

  for (let i = 1; i < chars.length; i++) {
    const korean = isKorean(chars[i]);
    if (korean !== currentKorean) {
      runs.push({ text: current, korean: currentKorean });
      current = chars[i];
      currentKorean = korean;
    } else {
      current += chars[i];
    }
  }
  runs.push({ text: current, korean: currentKorean });
  return runs;
}

export const KOREAN_FONTS = new Set([
  'Pretendard', 'Gmarket Sans', 'Black Han Sans',
  'Noto Serif KR', 'IBM Plex Sans KR', 'Maru Buri',
]);

export function fontString(weight: number, size: number, korean: boolean, fontFamily?: string): string {
  const ff = fontFamily || (korean ? 'Pretendard' : 'Inter');
  const isKoreanFont = KOREAN_FONTS.has(ff);

  let family: string;
  if (isKoreanFont) {
    family = `"${ff}", "Apple SD Gothic Neo", sans-serif`;
  } else {
    family = korean
      ? `Pretendard, "Apple SD Gothic Neo", "${ff}", sans-serif`
      : `"${ff}", Pretendard, Helvetica, Arial, sans-serif`;
  }
  return `${weight} ${size}px ${family}`;
}

export function fontFamilyAt(pos: number, spans: FontSpan[] | undefined, defaultFamily?: string): string | undefined {
  if (!spans?.length) return defaultFamily;
  const span = spans.find((s) => pos >= s.start && pos < s.end);
  return span ? span.fontFamily : defaultFamily;
}

type SpannedRun = { text: string; family: string | undefined; korean: boolean };

function toSpannedRuns(
  text: string,
  fontSpans: FontSpan[] | undefined,
  defaultFamily: string | undefined,
  charOffset: number,
): SpannedRun[] {
  if (!text) return [];
  const chars = [...text];
  const runs: SpannedRun[] = [];

  let curFamily = fontFamilyAt(charOffset, fontSpans, defaultFamily);
  let curKorean = isKorean(chars[0]);
  let curText = chars[0];

  for (let i = 1; i < chars.length; i++) {
    const family = fontFamilyAt(charOffset + i, fontSpans, defaultFamily);
    const korean = isKorean(chars[i]);
    if (family !== curFamily || korean !== curKorean) {
      runs.push({ text: curText, family: curFamily, korean: curKorean });
      curFamily = family;
      curKorean = korean;
      curText = chars[i];
    } else {
      curText += chars[i];
    }
  }
  runs.push({ text: curText, family: curFamily, korean: curKorean });
  return runs;
}

export function measureMixed(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  size: number,
  letterSpacing: number,
  fontFamily?: string,
  fontSpans?: FontSpan[],
  charOffset = 0,
): number {
  if (!text) return 0;
  const chars = [...text];

  if (fontSpans?.length) {
    const runs = toSpannedRuns(text, fontSpans, fontFamily, charOffset);
    let width = 0;
    for (const run of runs) {
      ctx.font = fontString(weight, size, run.korean, run.family);
      width += ctx.measureText(run.text).width;
    }
    return width + Math.max(0, chars.length - 1) * letterSpacing;
  }

  const runs = toRuns(text);
  let width = 0;
  for (const run of runs) {
    ctx.font = fontString(weight, size, run.korean, fontFamily);
    width += ctx.measureText(run.text).width;
  }
  return width + Math.max(0, chars.length - 1) * letterSpacing;
}

export function fillMixed(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  weight: number,
  size: number,
  letterSpacing: number,
  fontFamily?: string,
  fontSpans?: FontSpan[],
  charOffset = 0,
): void {
  if (!text) return;

  if (fontSpans?.length) {
    if (!letterSpacing) {
      let cx = x;
      for (const run of toSpannedRuns(text, fontSpans, fontFamily, charOffset)) {
        ctx.font = fontString(weight, size, run.korean, run.family);
        ctx.fillText(run.text, cx, y);
        cx += ctx.measureText(run.text).width;
      }
    } else {
      const chars = [...text];
      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        const family = fontFamilyAt(charOffset + i, fontSpans, fontFamily);
        const korean = isKorean(char);
        ctx.font = fontString(weight, size, korean, family);
        ctx.fillText(char, x, y);
        x += ctx.measureText(char).width + letterSpacing;
      }
    }
    return;
  }

  if (!letterSpacing) {
    let cx = x;
    for (const run of toRuns(text)) {
      ctx.font = fontString(weight, size, run.korean, fontFamily);
      ctx.fillText(run.text, cx, y);
      cx += ctx.measureText(run.text).width;
    }
  } else {
    for (const char of [...text]) {
      const korean = isKorean(char);
      ctx.font = fontString(weight, size, korean, fontFamily);
      ctx.fillText(char, x, y);
      x += ctx.measureText(char).width + letterSpacing;
    }
  }
}
