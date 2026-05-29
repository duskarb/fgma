import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  Copy,
  Download,
  Film,
  Lock,
  LockOpen,
  Maximize2,
  Minus,
  Plus,
  Redo2,
  RotateCw,
  Trash2,
  Undo2,
  Sparkles,
  Type,
} from 'lucide-react';
import type { ArtboardSize, FontSpan, RenderSettings, TextLayer } from './types';
import { createPosterTexture, estimateLayerBounds } from './rendering/posterTexture';
import { WebglPosterRenderer } from './rendering/webglPosterRenderer';
import {
  ARTBOARD_PRESETS,
  FONTS,
  SCALE_OPTIONS,
  WAVEFORM_OPTIONS,
  getArtboardPreset,
  initialLayers,
  initialSettings,
  initialSoundSettings,
  resolveArtboardSize,
  resolvePreviewRenderSize,
  scaleLayersForSize,
  type ArtboardPresetId,
  type Orientation,
  type PanPoint,
  type ViewZoom,
} from './appConfig';
import { useExport } from './hooks/useExport';
import { useRenderSettings } from './hooks/useRenderSettings';
import { useTextLayers } from './hooks/useTextLayers';
import { readAutosave, useAutosave } from './hooks/useAutosave';
import type { SoundSettings } from './audio/audioTypes';
import { SonificationEngine } from './audio/SonificationEngine';
import type { PosterTexture } from './types';
import { buildAudioLayerInfo } from './shared/audioLayerInfo';

type HistoryFeedback = 'Undo' | 'Redo' | null;

function zoomLabel(zoom: ViewZoom, resolvedZoom: number) {
  return zoom === 'fit' ? 'Fit' : `${Math.round(resolvedZoom * 100)}%`;
}

function getWidthResizeCursor(rotation = 0) {
  const normalized = ((rotation % 180) + 180) % 180;
  if (normalized < 22.5 || normalized >= 157.5) return 'ew-resize';
  if (normalized < 67.5) return 'nesw-resize';
  if (normalized < 112.5) return 'ns-resize';
  return 'nwse-resize';
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function clamp(v: number, min?: number, max?: number) {
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

function normalizeWheelDelta(deltaY: number, deltaMode: number) {
  if (deltaMode === 1) return deltaY * 16;
  if (deltaMode === 2) return deltaY * window.innerHeight;
  return deltaY;
}

function shortLayerName(layer: TextLayer) {
  return layer.text.split('\n').find(Boolean)?.slice(0, 18) || 'Text';
}

// Figma-style drag-to-scrub input
function ScrubInput({
  label,
  value,
  mixedFallback,
  onChange,
  onChangeStart,
  min,
  max,
  step = 1,
  decimals,
  suffix,
}: {
  label: string;
  value: number | null; // null = mixed/multiple values
  mixedFallback?: number;
  onChange: (v: number) => void;
  onChangeStart?: () => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  suffix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');
  const dragState = useRef<{ startX: number; startVal: number; dragged: boolean; changeStarted: boolean } | null>(null);
  const previousBodyCursor = useRef<string | null>(null);

  const fmt = (v: number) => {
    if (decimals !== undefined) return v.toFixed(decimals);
    return Number.isInteger(step) ? String(Math.round(v)) : v.toFixed(2);
  };

  function setScrubCursor() {
    if (previousBodyCursor.current === null) {
      previousBodyCursor.current = document.body.style.cursor;
    }
    document.documentElement.classList.add('is-scrubbing');
    document.body.style.cursor = 'ew-resize';
  }

  function restoreCursor() {
    if (previousBodyCursor.current === null) return;
    document.documentElement.classList.remove('is-scrubbing');
    document.body.style.cursor = previousBodyCursor.current;
    previousBodyCursor.current = null;
  }

  useEffect(() => restoreCursor, []);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (editing) return;
    e.preventDefault();
    dragState.current = { startX: e.clientX, startVal: value ?? mixedFallback ?? 0, dragged: false, changeStarted: false };
    setScrubCursor();

    const onMove = (ev: PointerEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      if (Math.abs(dx) >= 2) {
        if (!dragState.current.changeStarted) {
          onChangeStart?.();
          dragState.current.changeStarted = true;
        }
        dragState.current.dragged = true;
        const raw = dragState.current.startVal + dx * step;
        const clamped = clamp(raw, min, max);
        const places = decimals ?? (Number.isInteger(step) ? 0 : 4);
        onChange(parseFloat(clamped.toFixed(places)));
      }
    };

    const finishDrag = () => {
      restoreCursor();
      if (dragState.current && !dragState.current.dragged) {
        setEditVal(value !== null ? fmt(value) : '');
        setEditing(true);
      }
      dragState.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
  }

  function commit() {
    const n = parseFloat(editVal);
    if (!isNaN(n)) {
      const next = clamp(n, min, max);
      if (next !== value) {
        onChangeStart?.();
        onChange(next);
      }
    }
    setEditing(false);
  }

  return (
    <div
      className={`scrub-field${editing ? ' scrub-field--editing' : ''}`}
      onPointerDown={handlePointerDown}
    >
      <span className="scrub-label">{label}</span>
      {editing ? (
        <input
          className="scrub-edit"
          type="number"
          autoFocus
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') return;
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') setEditing(false);
            e.stopPropagation();
          }}
        />
      ) : (
        <span className="scrub-value" style={value === null ? { opacity: 0.4, fontStyle: 'italic' } : undefined}>
          {value !== null ? fmt(value) : 'mixed'}
        </span>
      )}
      {suffix && <span className="scrub-unit">{suffix}</span>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onChangeStart,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onChangeStart?: () => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="field">
      <span>
        {label}
        <b>{Number.isInteger(value) ? value : value.toFixed(2)}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onChangeStart}
        onFocus={onChangeStart}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function IconButton({
  label,
  active,
  children,
  onClick,
  disabled = false,
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className={`icon-button ${active ? 'is-active' : ''}`} type="button" title={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

type ResizeDir = 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type MarqueeRect = { x: number; y: number; w: number; h: number };

type LayerClipboardPayload = {
  type: 'fgma-text-layers';
  version: 1;
  layers: TextLayer[];
  primaryId: string;
};

type TextClipboardPayload = {
  text: string;
  sourceLayer: TextLayer | null;
};

type EditorSnapshot = {
  layers: TextLayer[];
  selectedId: string;
  selectedIds: string[];
  bgColor: string;
  artboardPreset: ArtboardPresetId;
  orientation: Orientation;
  settings: RenderSettings;
};

const LAYER_CLIPBOARD_TYPE = 'application/x-fgma-text-layers';

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable;
}

// ── Span utilities ────────────────────────────────────────────────

type SpanPatch = Partial<Pick<FontSpan, 'fontFamily' | 'fontSize' | 'fontWeight' | 'letterSpacing'>>;

function spanHasOverride(s: FontSpan): boolean {
  return s.fontFamily !== undefined || s.fontSize !== undefined
    || s.fontWeight !== undefined || s.letterSpacing !== undefined;
}

function mergeAdjacentSpans(spans: FontSpan[]): FontSpan[] {
  const result: FontSpan[] = [];
  for (const s of spans) {
    const last = result[result.length - 1];
    if (last && last.end === s.start
      && last.fontFamily === s.fontFamily
      && last.fontSize === s.fontSize
      && last.fontWeight === s.fontWeight
      && last.letterSpacing === s.letterSpacing) {
      last.end = s.end;
    } else {
      result.push({ ...s });
    }
  }
  return result;
}

/** Apply a style patch to [start, end) in the existing spans, preserving other properties. */
function patchSpans(
  existing: FontSpan[] | undefined,
  start: number,
  end: number,
  patch: SpanPatch,
  textLen: number,
): FontSpan[] | undefined {
  start = Math.max(0, start);
  end = Math.min(textLen, end);
  if (start >= end) return existing;

  const spans = (existing ?? []).filter((s) => s.start < s.end);
  const result: FontSpan[] = [];

  // Keep / trim spans outside [start, end)
  for (const s of spans) {
    if (s.end <= start || s.start >= end) {
      result.push(s);
    } else {
      if (s.start < start) result.push({ ...s, end: start });
      if (s.end > end) result.push({ ...s, start: end });
    }
  }

  // Build sub-ranges within [start, end), inheriting existing span props then applying patch
  const inRange = spans
    .filter((s) => s.start < end && s.end > start)
    .map((s) => ({ ...s, start: Math.max(s.start, start), end: Math.min(s.end, end) }))
    .sort((a, b) => a.start - b.start);

  let pos = start;
  for (const s of inRange) {
    if (pos < s.start) {
      const ns: FontSpan = { start: pos, end: s.start, ...patch };
      if (spanHasOverride(ns)) result.push(ns);
    }
    const merged: FontSpan = { ...s, ...patch };
    if (spanHasOverride(merged)) result.push(merged);
    pos = s.end;
  }
  if (pos < end) {
    const ns: FontSpan = { start: pos, end, ...patch };
    if (spanHasOverride(ns)) result.push(ns);
  }

  result.sort((a, b) => a.start - b.start);
  const merged = mergeAdjacentSpans(result);
  return merged.length > 0 ? merged : undefined;
}

function clearSpanProperties(
  existing: FontSpan[] | undefined,
  props: (keyof SpanPatch)[],
): FontSpan[] | undefined {
  if (!existing?.length) return existing;
  const updated = existing
    .map((span) => {
      const next = { ...span };
      for (const prop of props) delete next[prop];
      return next;
    })
    .filter(spanHasOverride);
  const merged = mergeAdjacentSpans(updated);
  return merged.length > 0 ? merged : undefined;
}

function textAreaSelectionToCharRange(textarea: HTMLTextAreaElement) {
  const toCharIndex = (codeUnitIndex: number) => [...textarea.value.slice(0, codeUnitIndex)].length;
  return {
    start: toCharIndex(textarea.selectionStart),
    end: toCharIndex(textarea.selectionEnd),
  };
}

function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  // Reset first so scrollHeight reflects the new content/font-size
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
  // Also schedule a second pass after style recalc (e.g. font-size change)
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  });
}

/** Shift span positions after an insertion or deletion. */
function adjustSpansForTextChange(
  oldText: string,
  newText: string,
  spans: FontSpan[] | undefined,
): FontSpan[] | undefined {
  if (!spans?.length) return spans;

  const oc = [...oldText];
  const nc = [...newText];

  // Find common prefix
  let pre = 0;
  while (pre < oc.length && pre < nc.length && oc[pre] === nc[pre]) pre++;

  // Find common suffix
  let oSuf = 0;
  let nSuf = 0;
  while (
    oSuf < oc.length - pre && nSuf < nc.length - pre
    && oc[oc.length - 1 - oSuf] === nc[nc.length - 1 - nSuf]
  ) { oSuf++; nSuf++; }

  const delStart = pre;
  const delEnd = oc.length - oSuf;   // exclusive
  const insEnd = nc.length - nSuf;   // exclusive

  // First handle deletion [delStart, delEnd), then insertion at delStart of length (insEnd - delStart)
  let updated = spans;

  if (delEnd > delStart) {
    // Delete
    const count = delEnd - delStart;
    updated = updated.map((s) => {
      if (s.end <= delStart) return s;
      if (s.start >= delEnd) return { ...s, start: s.start - count, end: s.end - count };
      return { ...s, start: Math.min(s.start, delStart), end: Math.max(delStart, s.end - count) };
    }).filter((s) => s.start < s.end);
  }

  const insCount = insEnd - delStart;
  if (insCount > 0) {
    // Insert
    updated = updated.map((s) => {
      if (s.end <= delStart) return s;
      if (s.start >= delStart) return { ...s, start: s.start + insCount, end: s.end + insCount };
      return { ...s, end: s.end + insCount };
    });
  }

  return updated.length > 0 ? updated : undefined;
}

type SelectionStyle = {
  fontFamily: string | null;
  fontSize: number | null;
  fontWeight: number | null;
  letterSpacing: number | null;
};

type ResolvedTextStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
};

function resolvedStyleAt(layer: TextLayer, pos: number): ResolvedTextStyle {
  const span = layer.fontSpans?.find((s) => pos >= s.start && pos < s.end);
  return {
    fontFamily: span?.fontFamily ?? layer.fontFamily ?? 'Pretendard',
    fontSize: span?.fontSize ?? layer.fontSize,
    fontWeight: span?.fontWeight ?? layer.fontWeight,
    letterSpacing: span?.letterSpacing ?? layer.letterSpacing,
  };
}

function stylesEqual(a: ResolvedTextStyle, b: ResolvedTextStyle) {
  return a.fontFamily === b.fontFamily
    && a.fontSize === b.fontSize
    && a.fontWeight === b.fontWeight
    && a.letterSpacing === b.letterSpacing;
}

function fontFamilyCss(fontFamily: string) {
  return `'${fontFamily}', 'Apple SD Gothic Neo', Helvetica, Arial, sans-serif`;
}

function richTextRuns(layer: TextLayer) {
  const chars = [...layer.text];
  const runs: { text: string; style: ResolvedTextStyle }[] = [];
  for (let i = 0; i < chars.length; i++) {
    const style = resolvedStyleAt(layer, i);
    const last = runs[runs.length - 1];
    if (last && stylesEqual(last.style, style)) {
      last.text += chars[i];
    } else {
      runs.push({ text: chars[i], style });
    }
  }
  return runs;
}

/** Compute the effective style for a text selection range on a layer. null = mixed. */
function getSelectionStyle(layer: TextLayer, selStart: number, selEnd: number): SelectionStyle {
  const defaults = {
    fontFamily: layer.fontFamily ?? 'Pretendard',
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    letterSpacing: layer.letterSpacing,
  };

  if (selStart >= selEnd) {
    // Cursor only – show style of the span at cursor (or layer defaults)
    const pos = Math.max(0, selStart);
    const span = layer.fontSpans?.find((s) => pos >= s.start && pos < s.end);
    return {
      fontFamily: span?.fontFamily ?? defaults.fontFamily,
      fontSize: span?.fontSize ?? defaults.fontSize,
      fontWeight: span?.fontWeight ?? defaults.fontWeight,
      letterSpacing: span?.letterSpacing ?? defaults.letterSpacing,
    };
  }

  let ff: string | null = null, fs: number | null = null, fw: number | null = null, ls: number | null = null;
  let mixFF = false, mixFS = false, mixFW = false, mixLS = false;

  for (let i = selStart; i < selEnd; i++) {
    const span = layer.fontSpans?.find((s) => i >= s.start && i < s.end);
    const cff = span?.fontFamily ?? defaults.fontFamily;
    const cfs = span?.fontSize ?? defaults.fontSize;
    const cfw = span?.fontWeight ?? defaults.fontWeight;
    const cls = span?.letterSpacing ?? defaults.letterSpacing;

    if (i === selStart) { ff = cff; fs = cfs; fw = cfw; ls = cls; }
    else {
      if (ff !== cff) mixFF = true;
      if (fs !== cfs) mixFS = true;
      if (fw !== cfw) mixFW = true;
      if (ls !== cls) mixLS = true;
    }
  }

  return {
    fontFamily: mixFF ? null : ff,
    fontSize: mixFS ? null : fs,
    fontWeight: mixFW ? null : fw,
    letterSpacing: mixLS ? null : ls,
  };
}

export default function App() {
  const savedSnapshot = useMemo(() => readAutosave(), []);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const rendererRef = useRef<WebglPosterRenderer | null>(null);
  const settingsRef = useRef(initialSettings);
  const previewWarpRef = useRef(true);
  const editingIdRef = useRef<string | null>(null);
  const draggingRef = useRef(false);
  const {
    layers,
    setLayers,
    selectedId,
    setSelectedId,
    selectedIds,
    setSelectedIds,
    selectedLayer,
    selectOne,
    toggleSelect,
  } = useTextLayers(savedSnapshot ?? undefined);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const [bgColor, setBgColor] = useState(savedSnapshot?.bgColor ?? '#ffffff');
  const [artboardPreset, setArtboardPreset] = useState<ArtboardPresetId>(savedSnapshot?.artboardPreset ?? 'a4');
  const [orientation, setOrientation] = useState<Orientation>(savedSnapshot?.orientation ?? 'portrait');
  const [viewZoom, setViewZoom] = useState<ViewZoom>('fit');
  const [viewPan, setViewPan] = useState<PanPoint>({ x: 0, y: 0 });
  const [fitZoom, setFitZoom] = useState(1);
  const { settings, setSettings, patchSettings } = useRenderSettings(pushUndoSnapshot, savedSnapshot?.settings);
  const [status, setStatus] = useState('LIVE');
  const [webglAvailable, setWebglAvailable] = useState(true);
  const [previewWarp, setPreviewWarp] = useState(false);
  const [needsRender, setNeedsRender] = useState(true);
  const hasRenderedRef = useRef(false);
  const exportingRef = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSel, setEditingSel] = useState<{ start: number; end: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(initialSoundSettings);
  const soundSettingsRef = useRef<SoundSettings>(initialSoundSettings);
  const [includeSoundInMp4, setIncludeSoundInMp4] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);
  const sonificationEngineRef = useRef<SonificationEngine | null>(null);
  const textureRef = useRef<PosterTexture | null>(null);
  const [altHeld, setAltHeld] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [historyFeedback, setHistoryFeedback] = useState<HistoryFeedback>(null);
  const historyFeedbackTimerRef = useRef<number | null>(null);
  const undoStackRef = useRef<EditorSnapshot[]>([]);
  const redoStackRef = useRef<EditorSnapshot[]>([]);
  const layerClipboardRef = useRef<LayerClipboardPayload | null>(null);
  const textClipboardRef = useRef<TextClipboardPayload | null>(null);
  const pasteOffsetRef = useRef(1);
  const editorSnapshotRef = useRef<EditorSnapshot>({
    layers: savedSnapshot?.layers ?? initialLayers,
    selectedId: savedSnapshot?.selectedId ?? '',
    selectedIds: savedSnapshot?.selectedIds ?? [],
    bgColor: savedSnapshot?.bgColor ?? '#ffffff',
    artboardPreset: savedSnapshot?.artboardPreset ?? 'a4',
    orientation: savedSnapshot?.orientation ?? 'portrait',
    settings: savedSnapshot?.settings ?? initialSettings,
  });
  const artboardSize = useMemo(
    () => resolveArtboardSize(artboardPreset, orientation),
    [artboardPreset, orientation],
  );
  const previewRenderSize = useMemo(
    () => resolvePreviewRenderSize(artboardSize),
    [artboardSize],
  );
  const resolvedViewZoom = viewZoom === 'fit' ? fitZoom : viewZoom;
  const stageDisplayWidth = Math.max(80, Math.round(artboardSize.width * resolvedViewZoom));
  const { exportPng, exportPdf, exportWebm, exportMp4, exportGif } = useExport({
    canvasRef,
    rendererRef,
    exportingRef,
    layers,
    bgColor,
    artboardSize,
    artboardPreset,
    previewRenderSize,
    previewWarp,
    settingsRef,
    recording,
    setRecording,
    setStatus,
    setEditingId,
    sonificationEngineRef,
    soundSettings,
    includeSoundInMp4,
    textureRef,
  });

  settingsRef.current = settings;
  soundSettingsRef.current = soundSettings;
  previewWarpRef.current = previewWarp;
  editingIdRef.current = editingId;
  draggingRef.current = draggingId !== null;
  editorSnapshotRef.current = { layers, selectedId, selectedIds, bgColor, artboardPreset, orientation, settings };
  useAutosave({ layers, selectedId, selectedIds, bgColor, artboardPreset, orientation, settings });

  const boundsById = useMemo(() => {
    return Object.fromEntries(layers.map((layer) => [layer.id, estimateLayerBounds(layer)]));
  }, [layers]);

  useEffect(() => {
    if (!canvasRef.current || rendererRef.current) return;
    try {
      rendererRef.current = new WebglPosterRenderer(canvasRef.current);
      rendererRef.current.setSize(previewRenderSize);
      setWebglAvailable(true);
    } catch {
      setWebglAvailable(false);
      setStatus('FLAT');
    }
  }, [previewRenderSize]);

  useEffect(() => {
    rendererRef.current?.setSize(previewRenderSize);
    if (!rendererRef.current && canvasRef.current) {
      canvasRef.current.width = previewRenderSize.width;
      canvasRef.current.height = previewRenderSize.height;
    }
  }, [previewRenderSize]);

  useEffect(() => {
    let cancelled = false;
    const maxMasses = rendererRef.current?.getMaxMasses();
    const visibleLayers = editingId ? layers.filter((l) => l.id !== editingId) : layers;
    const renderLayers = scaleLayersForSize(visibleLayers, artboardSize, previewRenderSize);
    createPosterTexture(renderLayers, bgColor, previewRenderSize, maxMasses, settingsRef.current.pointSpacing).then((texture) => {
      if (cancelled) return;
      textureRef.current = texture;
      
      // Reset the sonification traversal agent when physical shape changes
      sonificationEngineRef.current?.resetAgent();

      if (rendererRef.current) {
        rendererRef.current.setSize(previewRenderSize);
        rendererRef.current.updateTexture(texture);
        setStatus('LIVE');
      } else if (canvasRef.current) {
        const canvas = canvasRef.current;
        canvas.width = previewRenderSize.width;
        canvas.height = previewRenderSize.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(texture.canvas, 0, 0);
        setStatus('FLAT');
        setHasRendered(true);
      }
    });
    return () => { cancelled = true; };
  }, [layers, bgColor, artboardSize, previewRenderSize, editingId]);

  useEffect(() => {
    const engine = sonificationEngineRef.current;
    if (engine?.isRunning) {
      engine.setSettings(soundSettings);
    }
  }, [soundSettings]);

  useEffect(() => {
    let frame = 0;
    const started = performance.now();
    const tick = () => {
      if (!exportingRef.current && rendererRef.current) {
        const time = (performance.now() - started) / 1000;
        const flat = !previewWarpRef.current || editingIdRef.current !== null || draggingRef.current;
        rendererRef.current.render(
          flat ? { ...settingsRef.current, strength: 0, motionAmount: 0, showField: false, showMasses: false } : settingsRef.current,
          time,
        );
        setHasRendered((prev) => prev ? prev : true);

        // Update sonification engine each frame (same clock as renderer)
        const engine = sonificationEngineRef.current;
        const tex = textureRef.current;
        if (engine?.isRunning && tex) {
          const snap = editorSnapshotRef.current;
          const currentLayers = snap.layers;
          const currentSelectedLayer = currentLayers.find((l) => l.id === snap.selectedId) ?? null;
          const currentArtboardSize = resolveArtboardSize(snap.artboardPreset, snap.orientation);

          engine.update({
            masses: tex.masses,
            massCount: tex.massCount,
            totalMass: tex.totalMass,
            strength: settingsRef.current.strength,
            decay: settingsRef.current.decay,
            epsilon: settingsRef.current.epsilon,
            motionAmount: settingsRef.current.motionAmount,
            durationSec: 5,
            fps: 30,
            seed: soundSettingsRef.current.seed,
            bgColorHex: snap.bgColor,
            textColorHex: currentSelectedLayer?.color || currentLayers[0]?.color || '#111111',
            fontFamily: currentSelectedLayer?.fontFamily || currentLayers[0]?.fontFamily || 'Pretendard',
            layersInfo: buildAudioLayerInfo(currentLayers, currentArtboardSize),
          }, time);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => { sonificationEngineRef.current?.dispose(); };
  }, []);

  useEffect(() => {
    setNeedsRender(true);
    if (hasRenderedRef.current) setPreviewWarp(false);
  }, [layers, bgColor, artboardSize]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const updateFitZoom = () => {
      const availableWidth = Math.max(120, workspace.clientWidth - 56);
      const availableHeight = Math.max(120, workspace.clientHeight - 56);
      const nextFit = Math.min(1, availableWidth / artboardSize.width, availableHeight / artboardSize.height);
      setFitZoom(clamp(nextFit, 0.08, 1));
    };

    updateFitZoom();
    const observer = new ResizeObserver(updateFitZoom);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [artboardSize]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!event.ctrlKey) {
        const dx = normalizeWheelDelta(event.deltaX, event.deltaMode);
        const dy = normalizeWheelDelta(event.deltaY, event.deltaMode);
        setViewPan((current) => ({
          x: current.x - dx,
          y: current.y - dy,
        }));
        return;
      }

      const delta = normalizeWheelDelta(event.deltaY, event.deltaMode);
      const current = viewZoom === 'fit' ? fitZoom : viewZoom;
      const next = Number(clamp(current * Math.exp(-delta * 0.004), 0.08, 3).toFixed(3));
      const rect = stageRef.current?.getBoundingClientRect();
      if (rect) {
        const ratio = next / current;
        setViewPan((pan) => ({
          x: pan.x + (event.clientX - rect.left) * (1 - ratio),
          y: pan.y + (event.clientY - rect.top) * (1 - ratio),
        }));
      }
      setViewZoom(next);
    };

    workspace.addEventListener('wheel', handleWheel, { passive: false });
    return () => workspace.removeEventListener('wheel', handleWheel);
  }, [fitZoom, viewZoom]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') { e.preventDefault(); setAltHeld(true); return; }
      if (isEditableTarget(e.target)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (editingId) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const selectableIds = layers.filter((layer) => !layer.locked).map((layer) => layer.id);
        setSelectedIds(selectableIds);
        setSelectedId(selectableIds[selectableIds.length - 1] ?? '');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (e.key === '[') {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) moveLayer(-1);
        else moveLayerToEnd(-1);
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) moveLayer(1);
        else moveLayerToEnd(1);
        return;
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        nudgeSelected(dx, dy);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deleteSelected();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(false);
      if (e.code === 'Space') {
        setSpaceHeld(false);
        setPanning(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [editingId, selectedId, selectedIds, layers]);

  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      if (event.target instanceof HTMLTextAreaElement && editingIdRef.current) {
        const selectedText = event.target.value.slice(event.target.selectionStart, event.target.selectionEnd);
        if (selectedText) {
          const sourceLayer = editorSnapshotRef.current.layers.find((layer) => layer.id === editingIdRef.current) ?? null;
          textClipboardRef.current = { text: selectedText, sourceLayer: sourceLayer ? structuredClone(sourceLayer) : null };
          layerClipboardRef.current = null;
          pasteOffsetRef.current = 1;
        }
        return;
      }
      if (editingIdRef.current || isEditableTarget(event.target)) return;
      const snapshot = editorSnapshotRef.current;
      const selected = snapshot.layers.filter((layer) => snapshot.selectedIds.includes(layer.id));
      if (selected.length === 0) return;

      const payload: LayerClipboardPayload = {
        type: 'fgma-text-layers',
        version: 1,
        layers: structuredClone(selected),
        primaryId: snapshot.selectedId,
      };
      layerClipboardRef.current = payload;
      textClipboardRef.current = null;
      pasteOffsetRef.current = 1;
      event.clipboardData?.setData(LAYER_CLIPBOARD_TYPE, JSON.stringify(payload));
      event.clipboardData?.setData('text/plain', selected.map((layer) => layer.text).join('\n'));
      event.preventDefault();
    };

    const handlePaste = (event: ClipboardEvent) => {
      if (editingIdRef.current || isEditableTarget(event.target)) return;

      const rawPayload = event.clipboardData?.getData(LAYER_CLIPBOARD_TYPE);
      let payload: LayerClipboardPayload | null = null;
      if (rawPayload) {
        try {
          const parsed = JSON.parse(rawPayload) as LayerClipboardPayload;
          if (parsed.type === 'fgma-text-layers' && Array.isArray(parsed.layers)) payload = parsed;
        } catch {
          payload = null;
        }
      }
      const pastedText = event.clipboardData?.getData('text/plain') ?? '';
      const textPayload = textClipboardRef.current;
      if (!payload && pastedText.trim()) {
        event.preventDefault();
        pasteTextLayer(
          pastedText,
          textPayload?.text === pastedText ? textPayload.sourceLayer : selectedLayer,
        );
        return;
      }

      payload ??= layerClipboardRef.current;
      if (!payload || payload.layers.length === 0) return;

      event.preventDefault();
      pushUndoSnapshot();
      const offset = pasteOffsetRef.current * 24;
      pasteOffsetRef.current += 1;

      const idMap = new Map<string, string>();
      const copies = payload.layers.map((layer) => {
        const nextId = uid();
        idMap.set(layer.id, nextId);
        return {
          ...structuredClone(layer),
          id: nextId,
          locked: false,
          x: layer.x + offset,
          y: layer.y + offset,
        };
      });
      setLayers((current) => [...current, ...copies]);

      const newIds = copies.map((layer) => layer.id);
      const primaryId = idMap.get(payload.primaryId) ?? newIds[newIds.length - 1];
      setSelectedIds(newIds);
      setSelectedId(primaryId);
      setEditingId(null);
    };

    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);
    };
  }, [artboardSize, selectedLayer]);

  useEffect(() => {
    return () => {
      if (historyFeedbackTimerRef.current !== null) window.clearTimeout(historyFeedbackTimerRef.current);
    };
  }, []);

  function snapshotsEqual(a: EditorSnapshot, b: EditorSnapshot) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function pushUndoSnapshot() {
    const snapshot = structuredClone(editorSnapshotRef.current);
    const stack = undoStackRef.current;
    if (stack.length > 0 && snapshotsEqual(stack[stack.length - 1], snapshot)) return;
    stack.push(snapshot);
    if (stack.length > 100) stack.shift();
    redoStackRef.current = [];
  }

  function showHistoryFeedback(label: Exclude<HistoryFeedback, null>) {
    setHistoryFeedback(label);
    if (historyFeedbackTimerRef.current !== null) window.clearTimeout(historyFeedbackTimerRef.current);
    historyFeedbackTimerRef.current = window.setTimeout(() => setHistoryFeedback(null), 820);
  }

  function restoreSnapshot(snapshot: EditorSnapshot) {
    setLayers(snapshot.layers);
    setSelectedId(snapshot.selectedId);
    setSelectedIds(snapshot.selectedIds ?? (snapshot.selectedId ? [snapshot.selectedId] : []));
    setBgColor(snapshot.bgColor);
    setArtboardPreset(snapshot.artboardPreset);
    setOrientation(snapshot.orientation);
    setSettings(snapshot.settings);
    setEditingId(null);
    setDraggingId(null);
    setPreviewWarp(false);
    setNeedsRender(true);
  }

  function undo() {
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) return;
    redoStackRef.current.push(structuredClone(editorSnapshotRef.current));
    if (redoStackRef.current.length > 100) redoStackRef.current.shift();
    restoreSnapshot(snapshot);
    showHistoryFeedback('Undo');
  }

  function redo() {
    const snapshot = redoStackRef.current.pop();
    if (!snapshot) return;
    undoStackRef.current.push(structuredClone(editorSnapshotRef.current));
    if (undoStackRef.current.length > 100) undoStackRef.current.shift();
    restoreSnapshot(snapshot);
    showHistoryFeedback('Redo');
  }

  function resizeLayersToArtboard(nextSize: ArtboardSize) {
    const widthRatio = nextSize.width / artboardSize.width;
    const heightRatio = nextSize.height / artboardSize.height;
    const typeRatio = Math.sqrt((nextSize.width * nextSize.height) / (artboardSize.width * artboardSize.height));

    setLayers((current) => current.map((layer) => {
      const nextX = clamp(Math.round(layer.x * widthRatio), 0, nextSize.width - 8);
      const nextY = clamp(Math.round(layer.y * heightRatio), 0, nextSize.height - 8);
      const maxWidth = Math.max(40, nextSize.width - nextX);
      return {
        ...layer,
        x: nextX,
        y: nextY,
        width: clamp(Math.round(layer.width * widthRatio), 40, maxWidth),
        fontSize: Math.max(8, Math.round(layer.fontSize * typeRatio)),
        letterSpacing: Number((layer.letterSpacing * typeRatio).toFixed(2)),
        fontSpans: layer.fontSpans?.map((span) => ({
          ...span,
          fontSize: span.fontSize === undefined ? undefined : Math.max(8, Math.round(span.fontSize * typeRatio)),
          letterSpacing: span.letterSpacing === undefined ? undefined : Number((span.letterSpacing * typeRatio).toFixed(2)),
        })),
      };
    }));
  }

  function changeArtboard(nextPreset: ArtboardPresetId, nextOrientation = getArtboardPreset(nextPreset).defaultOrientation) {
    if (nextPreset === artboardPreset && nextOrientation === orientation) return;
    pushUndoSnapshot();
    const nextSize = resolveArtboardSize(nextPreset, nextOrientation);
    resizeLayersToArtboard(nextSize);
    setArtboardPreset(nextPreset);
    setOrientation(nextOrientation);
  }

  function rotateArtboard() {
    const nextOrientation = orientation === 'portrait' ? 'landscape' : 'portrait';
    changeArtboard(artboardPreset, nextOrientation);
  }

  function stepZoom(direction: -1 | 1) {
    const current = viewZoom === 'fit' ? fitZoom : viewZoom;
    const zoomSteps = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2];
    const next = direction > 0
      ? zoomSteps.find((step) => step > current + 0.01) ?? zoomSteps[zoomSteps.length - 1]
      : [...zoomSteps].reverse().find((step) => step < current - 0.01) ?? zoomSteps[0];
    setViewZoom(next);
  }

  function handleRender() {
    hasRenderedRef.current = true;
    setNeedsRender(false);
    setPreviewWarp(true);
  }

  function patchSelected(patch: Partial<TextLayer>, recordHistory = true) {
    if (selectedIds.length === 0) return;
    if (recordHistory) pushUndoSnapshot();
    setLayers((current) =>
      current.map((layer) =>
        selectedIds.includes(layer.id) && !layer.locked
          ? { ...layer, ...patch }
          : layer
      ),
    );
  }

  /**
   * Apply a style patch to the current text selection (if editing + selection exists),
   * otherwise fall through to patchSelected on all selected layers.
   */
  function patchSelectionSpan(spanPatch: SpanPatch, layerPatch?: Partial<TextLayer>, recordHistory = true) {
    if (selectedIds.length === 0) return;
    const activeSel = editingId && selectedLayer ? (editingId === selectedLayer.id ? editingSel : null) : null;
    const hasTextSel = activeSel && activeSel.start !== activeSel.end;

    if (hasTextSel && selectedLayer) {
      if (selectedLayer.locked) return;
      if (recordHistory) pushUndoSnapshot();
      setLayers((current) =>
        current.map((layer) => {
          if (layer.id !== selectedLayer.id) return layer;
          const newSpans = patchSpans(layer.fontSpans, activeSel.start, activeSel.end, spanPatch, [...layer.text].length);
          return { ...layer, fontSpans: newSpans };
        }),
      );
    } else {
      // No text selection – apply to all selected layers
      const patch: Partial<TextLayer> = layerPatch ?? {};
      const spanPropsToClear: (keyof SpanPatch)[] = [];
      if (spanPatch.fontFamily !== undefined) patch.fontFamily = spanPatch.fontFamily;
      if (spanPatch.fontSize !== undefined) patch.fontSize = spanPatch.fontSize;
      if (spanPatch.fontWeight !== undefined) patch.fontWeight = spanPatch.fontWeight;
      if (spanPatch.letterSpacing !== undefined) patch.letterSpacing = spanPatch.letterSpacing;
      if (spanPatch.fontFamily !== undefined) spanPropsToClear.push('fontFamily');
      if (spanPatch.fontSize !== undefined) spanPropsToClear.push('fontSize');
      if (spanPatch.fontWeight !== undefined) spanPropsToClear.push('fontWeight');
      if (spanPatch.letterSpacing !== undefined) spanPropsToClear.push('letterSpacing');

      if (recordHistory) pushUndoSnapshot();
      setLayers((current) =>
        current.map((layer) => {
          if (!selectedIds.includes(layer.id) || layer.locked) return layer;
          return {
            ...layer,
            ...patch,
            fontSpans: clearSpanProperties(layer.fontSpans, spanPropsToClear),
          };
        }),
      );
    }
  }

  function updateLayer(id: string, patch: Partial<TextLayer>, recordHistory = true) {
    if (recordHistory) pushUndoSnapshot();
    setLayers((current) => current.map((layer) => (layer.id === id && !layer.locked ? { ...layer, ...patch } : layer)));
  }

  function toggleLayerLock(id: string) {
    pushUndoSnapshot();
    setEditingId((current) => (current === id ? null : current));
    setLayers((current) => current.map((layer) => (layer.id === id ? { ...layer, locked: !layer.locked } : layer)));
  }

  function finishEditing(layer: TextLayer) {
    setEditingId(null);
    setEditingSel(null);
    if (layer.text.trim()) return;
    setLayers((current) => {
      const next = current.filter((item) => item.id !== layer.id);
      selectOne(selectedId === layer.id ? (next[0]?.id ?? '') : selectedId);
      return next;
    });
  }

  function addLayerAt(x: number, y: number, text = '') {
    pushUndoSnapshot();
    const next: TextLayer = {
      id: uid(),
      text,
      x,
      y,
      width: 340,
      fontSize: 42,
      fontWeight: 800,
      lineHeight: 1.05,
      letterSpacing: 0,
      color: '#111111',
      opacity: 1,
      align: 'left',
      fontFamily: selectedLayer?.fontFamily ?? 'Pretendard',
    };
    setLayers((current) => [...current, next]);
    selectOne(next.id);
    setEditingId(next.id);
  }

  function pasteTextLayer(text: string, sourceLayer: TextLayer | null) {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    pushUndoSnapshot();
    const offset = pasteOffsetRef.current * 24;
    pasteOffsetRef.current += 1;
    const fallbackLayer = sourceLayer ?? selectedLayer;
    const defaultX = Math.round(artboardSize.width * 0.18);
    const defaultY = Math.round(artboardSize.height * 0.18);
    const next: TextLayer = {
      id: uid(),
      text,
      x: clamp((fallbackLayer?.x ?? defaultX) + offset, 0, artboardSize.width - 40),
      y: clamp((fallbackLayer?.y ?? defaultY) + offset, 0, artboardSize.height - 40),
      width: fallbackLayer?.width ?? 340,
      fontSize: fallbackLayer?.fontSize ?? 42,
      fontWeight: fallbackLayer?.fontWeight ?? 800,
      lineHeight: fallbackLayer?.lineHeight ?? 1.05,
      letterSpacing: fallbackLayer?.letterSpacing ?? 0,
      color: fallbackLayer?.color ?? '#111111',
      opacity: fallbackLayer?.opacity ?? 1,
      align: fallbackLayer?.align ?? 'left',
      fontFamily: fallbackLayer?.fontFamily ?? 'Pretendard',
      fontSpans: undefined,
      rotation: fallbackLayer?.rotation,
      locked: false,
    };
    setLayers((current) => [...current, next]);
    selectOne(next.id);
    setEditingId(null);
  }

  function duplicateSelected() {
    const targets = layers.filter((layer) => selectedIds.includes(layer.id) && !layer.locked);
    if (targets.length === 0) return;
    pushUndoSnapshot();
    const idMap = new Map<string, string>();
    const copies = targets.map((layer) => {
      const nextId = uid();
      idMap.set(layer.id, nextId);
      return { ...layer, id: nextId, locked: false, x: layer.x + 24, y: layer.y + 24 };
    });
    setLayers((current) => [...current, ...copies]);
    const newIds = copies.map((layer) => layer.id);
    setSelectedIds(newIds);
    setSelectedId(idMap.get(selectedId) ?? newIds[newIds.length - 1] ?? '');
  }

  function deleteSelected() {
    const removableIds = new Set(layers.filter((layer) => selectedIds.includes(layer.id) && !layer.locked).map((layer) => layer.id));
    if (removableIds.size === 0) return;
    pushUndoSnapshot();
    const next = layers.filter((layer) => !removableIds.has(layer.id));
    setLayers(next);
    selectOne(next[0]?.id ?? '');
  }

  function moveLayer(direction: -1 | 1) {
    const movableIds = new Set(layers.filter((layer) => selectedIds.includes(layer.id) && !layer.locked).map((layer) => layer.id));
    if (movableIds.size === 0) return;
    const canMove = direction > 0
      ? layers.some((layer, index) => movableIds.has(layer.id) && index < layers.length - 1 && !movableIds.has(layers[index + 1].id))
      : layers.some((layer, index) => movableIds.has(layer.id) && index > 0 && !movableIds.has(layers[index - 1].id));
    if (!canMove) return;
    pushUndoSnapshot();
    const next = [...layers];
    if (direction > 0) {
      for (let index = next.length - 2; index >= 0; index -= 1) {
        if (!movableIds.has(next[index].id) || movableIds.has(next[index + 1].id)) continue;
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
      }
    } else {
      for (let index = 1; index < next.length; index += 1) {
        if (!movableIds.has(next[index].id) || movableIds.has(next[index - 1].id)) continue;
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
      }
    }
    setLayers(next);
  }

  function moveLayerToEnd(direction: -1 | 1) {
    const movableIds = new Set(layers.filter((layer) => selectedIds.includes(layer.id) && !layer.locked).map((layer) => layer.id));
    if (movableIds.size === 0) return;
    const selectedLayers = layers.filter((layer) => movableIds.has(layer.id));
    const remainingLayers = layers.filter((layer) => !movableIds.has(layer.id));
    const next = direction > 0
      ? [...remainingLayers, ...selectedLayers]
      : [...selectedLayers, ...remainingLayers];
    if (next.every((layer, index) => layer.id === layers[index].id)) return;
    pushUndoSnapshot();
    setLayers(next);
  }

  function nudgeSelected(dx: number, dy: number) {
    const movableIds = new Set(layers.filter((layer) => selectedIds.includes(layer.id) && !layer.locked).map((layer) => layer.id));
    if (movableIds.size === 0) return;
    pushUndoSnapshot();
    setLayers((current) =>
      current.map((layer) =>
        movableIds.has(layer.id)
          ? { ...layer, x: Math.round(layer.x + dx), y: Math.round(layer.y + dy) }
          : layer,
      ),
    );
  }

  function alignSelected(axis: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') {
    const targets = layers.filter((l) => selectedIds.includes(l.id) && !l.locked);
    if (targets.length === 0) return;
    pushUndoSnapshot();

    if (targets.length === 1) {
      // Single layer: align to artboard
      setLayers((current) =>
        current.map((layer) => {
          if (!selectedIds.includes(layer.id) || layer.locked) return layer;
          const bounds = boundsById[layer.id] ?? estimateLayerBounds(layer);
          if (axis === 'left') return { ...layer, x: 0 };
          if (axis === 'right') return { ...layer, x: Math.round(artboardSize.width - layer.width) };
          if (axis === 'center-x') return { ...layer, x: Math.round((artboardSize.width - layer.width) / 2) };
          if (axis === 'top') return { ...layer, y: 0 };
          if (axis === 'bottom') return { ...layer, y: Math.round(artboardSize.height - bounds.height) };
          return { ...layer, y: Math.round((artboardSize.height - bounds.height) / 2) };
        }),
      );
    } else {
      // Multiple layers: align to each other (bounding box of selection)
      const targetBounds = targets.map((l) => {
        const b = boundsById[l.id] ?? estimateLayerBounds(l);
        return { id: l.id, x: l.x, y: l.y, width: l.width, height: b.height };
      });
      const groupLeft = Math.min(...targetBounds.map((b) => b.x));
      const groupRight = Math.max(...targetBounds.map((b) => b.x + b.width));
      const groupTop = Math.min(...targetBounds.map((b) => b.y));
      const groupBottom = Math.max(...targetBounds.map((b) => b.y + b.height));
      const groupCenterX = (groupLeft + groupRight) / 2;
      const groupCenterY = (groupTop + groupBottom) / 2;

      setLayers((current) =>
        current.map((layer) => {
          if (!selectedIds.includes(layer.id) || layer.locked) return layer;
          const bounds = boundsById[layer.id] ?? estimateLayerBounds(layer);
          if (axis === 'left') return { ...layer, x: Math.round(groupLeft) };
          if (axis === 'right') return { ...layer, x: Math.round(groupRight - layer.width) };
          if (axis === 'center-x') return { ...layer, x: Math.round(groupCenterX - layer.width / 2) };
          if (axis === 'top') return { ...layer, y: Math.round(groupTop) };
          if (axis === 'bottom') return { ...layer, y: Math.round(groupBottom - bounds.height) };
          return { ...layer, y: Math.round(groupCenterY - bounds.height / 2) };
        }),
      );
    }
  }

  function getStageScale() {
    const rect = stageRef.current!.getBoundingClientRect();
    return rect.width / artboardSize.width;
  }

  function pointToPoster(event: React.PointerEvent | PointerEvent) {
    const rect = stageRef.current!.getBoundingClientRect();
    const scale = rect.width / artboardSize.width;
    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale,
      scale,
    };
  }

  function addAtPointer(event: React.MouseEvent) {
    if (event.target !== event.currentTarget) return;
    if (spaceHeld) return;
    const rect = stageRef.current!.getBoundingClientRect();
    const scale = rect.width / artboardSize.width;
    const x = (event.clientX - rect.left) / scale;
    const y = (event.clientY - rect.top) / scale;
    addLayerAt(Math.round(x), Math.round(y));
  }

  function startPan(event: React.PointerEvent) {
    if (!spaceHeld) return false;
    event.preventDefault();
    event.stopPropagation();
    setPanning(true);
    const start = { x: event.clientX, y: event.clientY };
    const origin = viewPan;

    const onMove = (moveEvent: PointerEvent) => {
      setViewPan({
        x: origin.x + moveEvent.clientX - start.x,
        y: origin.y + moveEvent.clientY - start.y,
      });
    };

    const onUp = () => {
      setPanning(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return true;
  }

  function startMarquee(event: React.PointerEvent) {
    if (spaceHeld) return;
    event.preventDefault();
    const rect = stageRef.current!.getBoundingClientRect();
    const scale = rect.width / artboardSize.width;
    const startX = (event.clientX - rect.left) / scale;
    const startY = (event.clientY - rect.top) / scale;

    const onMove = (moveEvent: PointerEvent) => {
      const cx = (moveEvent.clientX - rect.left) / scale;
      const cy = (moveEvent.clientY - rect.top) / scale;
      setMarquee({
        x: Math.min(startX, cx),
        y: Math.min(startY, cy),
        w: Math.abs(cx - startX),
        h: Math.abs(cy - startY),
      });
    };

    const onUp = () => {
      setMarquee((m) => {
        if (m && m.w > 4 && m.h > 4) {
          const hit = layers.filter((layer) => {
            const b = boundsById[layer.id];
            if (!b) return false;
            return b.x < m.x + m.w && b.x + b.width > m.x && b.y < m.y + m.h && b.y + b.height > m.y;
          });
          if (hit.length > 0) {
            const ids = hit.map((l) => l.id);
            setSelectedIds(ids);
            setSelectedId(ids[ids.length - 1]);
          }
        }
        return null;
      });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startDrag(event: React.PointerEvent, layer: TextLayer) {
    if (spaceHeld) { startPan(event); return; }
    if (editingId === layer.id || layer.locked) return;
    event.preventDefault();
    event.stopPropagation();

    // Shift+click: toggle this layer in/out of selection (no drag initiated)
    if (event.shiftKey && !event.altKey) {
      toggleSelect(layer.id);
      return;
    }

    pushUndoSnapshot();

    // Build the set of IDs that will move together
    const currentSelectedIds = editorSnapshotRef.current.selectedIds;
    const isInSelection = currentSelectedIds.includes(layer.id);
    const dragGroupIds: string[] = isInSelection && currentSelectedIds.length > 1
      ? currentSelectedIds
      : [layer.id];

    // Alt+drag → duplicate each layer in the group
    let idMap: Record<string, string> = {};
    if (event.altKey) {
      setLayers((current) => {
        const copies: TextLayer[] = [];
        for (const id of dragGroupIds) {
          const src = current.find((l) => l.id === id);
          if (src) { const copy = { ...src, id: uid() }; idMap[id] = copy.id; copies.push(copy); }
        }
        return [...current, ...copies];
      });
      const newIds = dragGroupIds.map((id) => idMap[id]).filter(Boolean);
      const newPrimary = idMap[layer.id] ?? newIds[0];
      setSelectedIds(newIds);
      setSelectedId(newPrimary);
      setDraggingId(newPrimary);
    } else {
      if (!isInSelection || currentSelectedIds.length === 1) selectOne(layer.id);
      setDraggingId(layer.id);
    }

    const start = pointToPoster(event);
    // Capture origins for every layer in the group
    const snapshotLayers = editorSnapshotRef.current.layers;
    const origins: Record<string, { x: number; y: number }> = {};
    for (const id of dragGroupIds) {
      const src = snapshotLayers.find((l) => l.id === id);
      if (src) origins[id] = { x: src.x, y: src.y };
    }

    // Axis is locked after the first threshold movement while Shift is held.
    let lockedAxis: 'x' | 'y' | null = null;

    const onMove = (moveEvent: PointerEvent) => {
      const rect = stageRef.current!.getBoundingClientRect();
      const scale = rect.width / artboardSize.width;
      const px = (moveEvent.clientX - rect.left) / scale;
      const py = (moveEvent.clientY - rect.top) / scale;
      let dx = px - start.x;
      let dy = py - start.y;

      if (moveEvent.shiftKey) {
        if (!lockedAxis && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
          lockedAxis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        }
        if (lockedAxis === 'x') dy = 0;
        if (lockedAxis === 'y') dx = 0;
      } else {
        lockedAxis = null;
      }

      setLayers((current) => {
        const moved = new Map<string, { x: number; y: number }>();
        for (const srcId of dragGroupIds) {
          const destId = event.altKey ? idMap[srcId] : srcId;
          if (!destId) continue;
          const origin = origins[srcId];
          if (origin) moved.set(destId, { x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) });
        }
        return current.map((item) => {
          const pos = moved.get(item.id);
          return pos ? { ...item, ...pos } : item;
        });
      });
    };

    const onUp = () => {
      setDraggingId(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startRotate(event: React.PointerEvent, layer: TextLayer) {
    if (layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    pushUndoSnapshot();
    selectOne(layer.id);
    setDraggingId(layer.id);

    const bounds = boundsById[layer.id];
    const rect = stageRef.current!.getBoundingClientRect();
    const scale = rect.width / artboardSize.width;

    const centerX = rect.left + (bounds.x + bounds.width / 2) * scale;
    const centerY = rect.top + (bounds.y + bounds.height / 2) * scale;

    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
    const startRotation = layer.rotation ?? 0;

    document.body.style.cursor = 'grabbing';

    const onMove = (ev: PointerEvent) => {
      const angle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX);
      let rotation = startRotation + (angle - startAngle) * (180 / Math.PI);
      if (ev.shiftKey) rotation = Math.round(rotation / 15) * 15;
      updateLayer(layer.id, { rotation }, false);
    };

    const onUp = () => {
      document.body.style.cursor = '';
      setDraggingId(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startResize(event: React.PointerEvent, layer: TextLayer, dir: ResizeDir) {
    if (layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    pushUndoSnapshot();
    selectOne(layer.id);
    setDraggingId(layer.id);

    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = getWidthResizeCursor(layer.rotation);

    const scale = getStageScale();
    const startX = event.clientX;
    const startWidth = layer.width;
    const startX0 = layer.x;

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scale;
      if (dir === 'e' || dir === 'ne' || dir === 'se') {
        updateLayer(layer.id, { width: Math.max(40, Math.round(startWidth + dx)) }, false);
      } else {
        // west side: move left edge, keep right edge fixed
        const newWidth = Math.max(40, Math.round(startWidth - dx));
        const newX = Math.round(startX0 + startWidth - newWidth);
        updateLayer(layer.id, { x: newX, width: newWidth }, false);
      }
    };

    const onUp = () => {
      document.body.style.cursor = previousCursor;
      setDraggingId(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  const activeSel = editingId === selectedLayer?.id ? editingSel : null;
  const selStyle = selectedLayer
    ? getSelectionStyle(
      selectedLayer,
      activeSel?.start ?? 0,
      activeSel?.end ?? [...selectedLayer.text].length,
    )
    : null;
  const hasUnlockedSelection = selectedIds.some((id) => {
    const layer = layers.find((item) => item.id === id);
    return layer && !layer.locked;
  });

  return (
    <main className="app-shell">
      <aside className="panel">
        {/* Artboard */}
        <section className="section">
          <div className="section-title">
            <h2>Artboard</h2>
            <span>{artboardSize.width} x {artboardSize.height}</span>
          </div>
          <div className="artboard-controls">
            <label className="select-field">
              Size
              <select
                value={artboardPreset}
                onChange={(event) => changeArtboard(event.target.value as ArtboardPresetId)}
              >
                {ARTBOARD_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
              </select>
            </label>
            <button className="orientation-button" type="button" onClick={rotateArtboard} title="Rotate artboard">
              <RotateCw size={14} />
              {orientation === 'portrait' ? 'Port' : 'Land'}
            </button>
          </div>
          <label className="color-field">
            Background
            <input
              type="color"
              value={bgColor}
              onPointerDown={pushUndoSnapshot}
              onFocus={pushUndoSnapshot}
              onChange={(event) => setBgColor(event.target.value)}
            />
          </label>
        </section>

        {/* View */}
        <section className="section">
          <div className="section-title">
            <h2>View</h2>
            <span>{zoomLabel(viewZoom, resolvedViewZoom)}</span>
          </div>
          <div className="view-controls">
            <IconButton label="Zoom out" onClick={() => stepZoom(-1)}><Minus size={14} /></IconButton>
            <button className="zoom-readout" type="button" onClick={() => { setViewZoom('fit'); setViewPan({ x: 0, y: 0 }); }} title="Fit to screen">
              <Maximize2 size={13} />
              {zoomLabel(viewZoom, resolvedViewZoom)}
            </button>
            <IconButton label="Zoom in" onClick={() => stepZoom(1)}><Plus size={14} /></IconButton>
          </div>
        </section>

        {/* Layers */}
        <section className="section">
          <div className="section-title">
            <h2>Layers</h2>
            <span>{layers.length}</span>
          </div>
          <div className="layer-list">
            {[...layers].reverse().map((layer) => (
              <div
                key={layer.id}
                className={`layer-row ${selectedIds.includes(layer.id) ? 'is-active' : ''}`}
              >
                <button
                  className="layer-select"
                  type="button"
                  onClick={() => { selectOne(layer.id); setEditingId(null); }}
                >
                  <Type size={11} style={{ flexShrink: 0, opacity: 0.45 }} />
                  <span>{shortLayerName(layer)}</span>
                  <small>{Math.round(layer.fontSize)}</small>
                </button>
                <button
                  className="layer-lock"
                  type="button"
                  title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                  onClick={() => toggleLayerLock(layer.id)}
                >
                  {layer.locked ? <Lock size={12} /> : <LockOpen size={12} />}
                </button>
              </div>
            ))}
          </div>
          <div className="icon-row icon-row--2">
            <IconButton label="Duplicate" onClick={duplicateSelected} disabled={!hasUnlockedSelection}><Copy size={15} /></IconButton>
            <IconButton label="Delete" onClick={deleteSelected} disabled={!hasUnlockedSelection}><Trash2 size={15} /></IconButton>
          </div>
          <div className="button-grid">
            <button type="button" onClick={() => moveLayer(-1)} disabled={!hasUnlockedSelection}>Back</button>
            <button type="button" onClick={() => moveLayer(1)} disabled={!hasUnlockedSelection}>Front</button>
          </div>
          <div className="align-tools">
            <IconButton label="Align layer left" onClick={() => alignSelected('left')} disabled={selectedIds.length === 0}><AlignStartVertical size={14} /></IconButton>
            <IconButton label="Align layer center" onClick={() => alignSelected('center-x')} disabled={selectedIds.length === 0}><AlignCenterVertical size={14} /></IconButton>
            <IconButton label="Align layer right" onClick={() => alignSelected('right')} disabled={selectedIds.length === 0}><AlignEndVertical size={14} /></IconButton>
            <IconButton label="Align layer top" onClick={() => alignSelected('top')} disabled={selectedIds.length === 0}><AlignStartHorizontal size={14} /></IconButton>
            <IconButton label="Align layer middle" onClick={() => alignSelected('center-y')} disabled={selectedIds.length === 0}><AlignCenterHorizontal size={14} /></IconButton>
            <IconButton label="Align layer bottom" onClick={() => alignSelected('bottom')} disabled={selectedIds.length === 0}><AlignEndHorizontal size={14} /></IconButton>
          </div>
        </section>

        {/* Text layer properties */}
        {selectedLayer && !selectedLayer.locked && (
          <section className="section">
            <div className="section-title">
              <h2>Text</h2>
              <span>{shortLayerName(selectedLayer)}</span>
            </div>

            {/* Position */}
            <div className="prop-group">
              <div className="prop-group-label">Position</div>
              <div className="scrub-grid-2">
                <ScrubInput label="X" value={Math.round(selectedLayer.x)} onChangeStart={pushUndoSnapshot} onChange={(v) => patchSelected({ x: v }, false)} step={1} />
                <ScrubInput label="Y" value={Math.round(selectedLayer.y)} onChangeStart={pushUndoSnapshot} onChange={(v) => patchSelected({ y: v }, false)} step={1} />
              </div>
            </div>

            {/* Size */}
            <div className="prop-group">
              <div className="prop-group-label">Width</div>
              <div className="scrub-grid-1">
                <ScrubInput label="W" value={Math.round(selectedLayer.width)} onChangeStart={pushUndoSnapshot} onChange={(v) => patchSelected({ width: Math.max(40, v) }, false)} step={1} min={40} />
              </div>
            </div>

            {/* Rotation */}
            <div className="prop-group">
              <div className="prop-group-label">Rotation</div>
              <div className="scrub-grid-1">
                <ScrubInput label="Angle" value={selectedLayer.rotation ?? 0} onChangeStart={pushUndoSnapshot} onChange={(v) => patchSelected({ rotation: v }, false)} step={0.5} min={-360} max={360} decimals={1} suffix="°" />
              </div>
            </div>

            {/* Font */}
            <div className="prop-group">
              <div className="prop-group-label">Font{selStyle?.fontFamily === null ? ' · mixed' : ''}</div>
              <div className="font-picker">
                <div className="font-picker-group">
                  <div className="font-group-label">한국어</div>
                  <div className="font-grid">
                    {FONTS.filter((f) => f.korean).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`font-item${(selStyle ? selStyle.fontFamily : selectedLayer.fontFamily) === f.id ? ' is-active' : ''}`}
                        style={{ fontFamily: `'${f.id}', 'Apple SD Gothic Neo', sans-serif` }}
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => patchSelectionSpan({ fontFamily: f.id }, { fontFamily: f.id })}
                        title={f.label}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="font-picker-group">
                  <div className="font-group-label">Latin</div>
                  <div className="font-grid">
                    {FONTS.filter((f) => !f.korean).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`font-item${(selStyle ? selStyle.fontFamily : selectedLayer.fontFamily) === f.id ? ' is-active' : ''}`}
                        style={{ fontFamily: `'${f.id}', Helvetica, Arial, sans-serif` }}
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => patchSelectionSpan({ fontFamily: f.id }, { fontFamily: f.id })}
                        title={f.label}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Typography */}
            <div className="prop-group">
              <div className="prop-group-label">Typography</div>
              <div className="scrub-grid-2">
                <ScrubInput label="Size" value={selStyle ? selStyle.fontSize : selectedLayer.fontSize} mixedFallback={selectedLayer.fontSize} onChangeStart={pushUndoSnapshot} onChange={(v) => patchSelectionSpan({ fontSize: clamp(v, 8, 400) }, { fontSize: clamp(v, 8, 400) }, false)} step={1} min={8} max={400} />
                <ScrubInput label="Weight" value={selStyle ? selStyle.fontWeight : selectedLayer.fontWeight} mixedFallback={selectedLayer.fontWeight} onChangeStart={pushUndoSnapshot} onChange={(v) => patchSelectionSpan({ fontWeight: clamp(Math.round(v / 50) * 50, 100, 950) }, { fontWeight: clamp(Math.round(v / 50) * 50, 100, 950) }, false)} step={5} min={100} max={950} decimals={0} />
              </div>
              <div className="scrub-grid-2">
                <ScrubInput label="Line" value={selectedLayer.lineHeight} onChangeStart={pushUndoSnapshot} onChange={(v) => patchSelected({ lineHeight: clamp(v, 0.5, 3) }, false)} step={0.005} min={0.5} max={3} decimals={2} />
                <ScrubInput label="Track" value={selStyle ? selStyle.letterSpacing : selectedLayer.letterSpacing} mixedFallback={selectedLayer.letterSpacing} onChangeStart={pushUndoSnapshot} onChange={(v) => patchSelectionSpan({ letterSpacing: clamp(v, -20, 50) }, { letterSpacing: clamp(v, -20, 50) }, false)} step={0.05} min={-20} max={50} decimals={1} />
              </div>
            </div>

            {/* Alignment + Color */}
            <div className="align-color-row">
              <div className="align-group">
                <IconButton label="Align left" active={selectedLayer.align === 'left'} onClick={() => patchSelected({ align: 'left' })}><AlignLeft size={14} /></IconButton>
                <IconButton label="Align center" active={selectedLayer.align === 'center'} onClick={() => patchSelected({ align: 'center' })}><AlignCenter size={14} /></IconButton>
                <IconButton label="Align right" active={selectedLayer.align === 'right'} onClick={() => patchSelected({ align: 'right' })}><AlignRight size={14} /></IconButton>
              </div>
              <label className="color-chip" title="Text color">
                <input
                  type="color"
                  value={selectedLayer.color}
                  onPointerDown={pushUndoSnapshot}
                  onFocus={pushUndoSnapshot}
                  onChange={(e) => patchSelected({ color: e.target.value }, false)}
                />
              </label>
            </div>
            <div className="scrub-grid-2">
              <ScrubInput label="Opacity" value={(selectedLayer.opacity ?? 1) * 100} onChangeStart={pushUndoSnapshot} onChange={(v) => patchSelected({ opacity: clamp(v, 0, 100) / 100 }, false)} step={1} min={0} max={100} decimals={0} />
            </div>
          </section>
        )}

        {/* Warp */}
        <section className="section">
          <div className="section-title">
            <h2>Warp</h2>
            <span>{previewWarp ? 'on' : 'off'}</span>
          </div>
          <Field label="Gravity" min={0} max={1100} value={settings.strength} onChangeStart={pushUndoSnapshot} onChange={(value) => patchSettings({ strength: value }, false)} />
          <Field label="Decay" min={0.8} max={2.4} step={0.01} value={settings.decay} onChangeStart={pushUndoSnapshot} onChange={(value) => patchSettings({ decay: value }, false)} />
          <Field label="Softness" min={1} max={120} value={settings.epsilon} onChangeStart={pushUndoSnapshot} onChange={(value) => patchSettings({ epsilon: value }, false)} />
          <Field label="Stride" min={4} max={20} value={settings.pointSpacing} onChangeStart={pushUndoSnapshot} onChange={(value) => patchSettings({ pointSpacing: value }, false)} />
          <Field label="Point size" min={0} max={3} step={0.01} value={settings.pointSize} onChangeStart={pushUndoSnapshot} onChange={(value) => patchSettings({ pointSize: value }, false)} />
          <Field label="Motion" min={0} max={0.8} step={0.01} value={settings.motionAmount} onChangeStart={pushUndoSnapshot} onChange={(value) => patchSettings({ motionAmount: value }, false)} />
          <div className="check-row">
            <label>
              <input type="checkbox" checked={settings.animate} onChange={(e) => patchSettings({ animate: e.target.checked })} />
              Animate
            </label>
            <label>
              <input type="checkbox" checked={settings.showField} onChange={(e) => patchSettings({ showField: e.target.checked })} />
              Field grid
            </label>
            <label>
              <input type="checkbox" checked={settings.showMasses} onChange={(e) => patchSettings({ showMasses: e.target.checked })} />
              Mass points
            </label>
          </div>
          <button className={`render-button ${needsRender ? 'is-ready' : ''}`} type="button" onClick={handleRender}>
            <Sparkles size={14} />
            RENDER
          </button>
        </section>

        {/* Sound */}
        <section className="section" style={{ opacity: hasRendered ? 1 : 0.5 }}>
          <div className="section-title">
            <h2>Sound</h2>
            {hasRendered && sonificationEngineRef.current?.isRunning ? (
              <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>● Live</span>
            ) : (
              <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>○ Off</span>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
            <button
              type="button"
              className={`render-button ${hasRendered && !sonificationEngineRef.current?.isRunning ? 'is-ready' : ''}`}
              style={{ flex: 1, margin: 0 }}
              disabled={!hasRendered}
              onClick={() => {
                const engine = sonificationEngineRef.current ?? new SonificationEngine(soundSettings);
                sonificationEngineRef.current = engine;
                if (engine.isRunning) {
                  engine.stop();
                  setSoundSettings((s) => ({ ...s, enabled: false }));
                } else {
                  engine.setSettings(soundSettings);
                  engine.start();
                  setSoundSettings((s) => ({ ...s, enabled: true }));
                }
              }}
            >
              {sonificationEngineRef.current?.isRunning ? '⏹ STOP SOUND' : '▶ PLAY SOUND'}
            </button>
            
            <button
              type="button"
              className="render-button"
              style={{ width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0 }}
              title="Generate new sound variation"
              disabled={!hasRendered || !sonificationEngineRef.current?.isRunning}
              onClick={() => setSoundSettings(s => ({ ...s, seed: Math.floor(Math.random() * 1000000) }))}
            >
              <RotateCw size={15} />
            </button>
          </div>

          <Field 
            label="Volume" 
            min={0} 
            max={1} 
            step={0.01} 
            value={soundSettings.volume} 
            onChange={(v) => {
              setSoundSettings((s) => ({ ...s, volume: v }));
              sonificationEngineRef.current?.setVolume(v);
            }} 
          />

          <div className="check-row" style={{ marginTop: '10px' }}>
            <label style={{ cursor: hasRendered ? 'pointer' : 'not-allowed', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="checkbox"
                checked={includeSoundInMp4}
                disabled={!hasRendered}
                onChange={(e) => setIncludeSoundInMp4(e.target.checked)}
              />
              Include sound in MP4 export
            </label>
          </div>
        </section>

        <footer className="export-bar">
          <button className="solid" type="button" onClick={exportPng}><Download size={15} /> PNG</button>
          <button type="button" onClick={exportPdf}><Download size={15} /> PDF</button>
          <button type="button" onClick={exportWebm} disabled={recording}><Film size={15} /> WEBM</button>
          <button type="button" onClick={exportMp4} disabled={recording}><Film size={15} /> MP4</button>
          <button type="button" onClick={exportGif} disabled={recording}><Film size={15} /> GIF</button>
        </footer>
      </aside>

      <section
        className={`workspace ${spaceHeld ? 'is-space-panning' : ''} ${panning ? 'is-panning' : ''}`}
        ref={workspaceRef}
        onPointerDown={(event) => {
          if (spaceHeld) startPan(event);
        }}
      >
        {historyFeedback && (
          <div className="history-feedback" role="status">
            {historyFeedback === 'Undo' ? <Undo2 size={15} /> : <Redo2 size={15} />}
            {historyFeedback}
          </div>
        )}
        <div className="stage-frame" style={{ transform: `translate(${viewPan.x}px, ${viewPan.y}px)` }}>
          {!webglAvailable && <div className="fallback-note">WebGL unavailable</div>}
          <div
            className="poster-stage"
            ref={stageRef}
            style={{
              aspectRatio: `${artboardSize.width} / ${artboardSize.height}`,
              width: stageDisplayWidth,
            }}
          >
            <canvas ref={canvasRef} width={previewRenderSize.width} height={previewRenderSize.height} />
            <div
              className="interaction-layer"
              style={{
                width: artboardSize.width,
                height: artboardSize.height,
                transform: `scale(${resolvedViewZoom})`,
              }}
              onDoubleClick={addAtPointer}
              onPointerDown={(event) => {
                if (spaceHeld) {
                  startPan(event);
                  return;
                }
                if (event.target === event.currentTarget) {
                  if (!spaceHeld) startMarquee(event);
                  selectOne('');
                  setEditingId(null);
                }
              }}
            >
              {marquee && (
                <div
                  style={{
                    position: 'absolute',
                    left: marquee.x,
                    top: marquee.y,
                    width: marquee.w,
                    height: marquee.h,
                    border: '1px solid #0d99ff',
                    background: 'rgba(13,153,255,0.08)',
                    pointerEvents: 'none',
                  }}
                />
              )}
              {layers.map((layer) => {
                const bounds = boundsById[layer.id];
                const selected = selectedIds.includes(layer.id);
                const editing = layer.id === editingId;
                const locked = Boolean(layer.locked);
                const rot = layer.rotation ?? 0;
                const rotateCss = rot !== 0 ? `rotate(${rot}deg)` : undefined;
                const resizeCursor = getWidthResizeCursor(rot);

                const handleSize = 7;
                const hs = handleSize / 2;
                const rotSize = 14;

                return (
                  <div key={layer.id} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {/* Hitbox or editor — rotated around its center */}
                    {editing ? (
                      <>
                        <div
                          className="layer-editor-preview"
                          aria-hidden="true"
                          style={{
                            left: bounds.x,
                            top: bounds.y,
                            width: bounds.width,
                            minHeight: bounds.height,
                            lineHeight: layer.lineHeight,
                            color: layer.color,
                            opacity: layer.opacity ?? 1,
                            textAlign: layer.align,
                            transform: rotateCss,
                            transformOrigin: 'center center',
                          }}
                        >
                          {richTextRuns(layer).map((run, index) => (
                            <span
                              key={`${index}-${run.text}`}
                              style={{
                                fontFamily: fontFamilyCss(run.style.fontFamily),
                                fontSize: run.style.fontSize,
                                fontWeight: run.style.fontWeight,
                                letterSpacing: run.style.letterSpacing,
                              }}
                            >
                              {run.text}
                            </span>
                          ))}
                        </div>
                        <textarea
                          className="layer-editor"
                          autoFocus
                          value={layer.text}
                          ref={(el) => autoResizeTextarea(el)}
                          style={{
                            left: bounds.x,
                            top: bounds.y,
                            width: bounds.width,
                            height: 'auto',
                            minHeight: bounds.height,
                            fontSize: layer.fontSize,
                            fontWeight: layer.fontWeight,
                            lineHeight: layer.lineHeight,
                            letterSpacing: layer.letterSpacing,
                            caretColor: layer.color,
                            color: 'transparent',
                            textAlign: layer.align,
                            fontFamily: fontFamilyCss(layer.fontFamily || 'Pretendard'),
                            transform: rotateCss,
                            transformOrigin: 'center center',
                            pointerEvents: 'all',
                            overflow: 'hidden',
                            resize: 'none',
                          }}
                          onChange={(event) => {
                            autoResizeTextarea(event.target);
                            const newText = event.target.value;
                            const updatedSpans = adjustSpansForTextChange(layer.text, newText, layer.fontSpans);
                            updateLayer(layer.id, { text: newText, fontSpans: updatedSpans }, false);
                          }}
                          onSelect={(event) => {
                            setEditingSel(textAreaSelectionToCharRange(event.currentTarget));
                          }}
                          onKeyUp={(event) => {
                            autoResizeTextarea(event.currentTarget);
                            setEditingSel(textAreaSelectionToCharRange(event.currentTarget));
                          }}
                          onMouseUp={(event) => {
                            setEditingSel(textAreaSelectionToCharRange(event.currentTarget));
                          }}
                          onBlur={() => finishEditing(layer)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') event.currentTarget.blur();
                          }}
                        />
                      </>
                    ) : (
                      <button
                        type="button"
                        className={`layer-hitbox ${selected ? 'is-selected' : ''} ${locked ? 'is-locked' : ''}`}
                        style={{
                          left: bounds.x,
                          top: bounds.y,
                          width: bounds.width,
                          height: bounds.height,
                          transform: rotateCss,
                          transformOrigin: 'center center',
                          pointerEvents: 'all',
                          cursor: locked ? 'default' : altHeld && selected ? 'copy' : undefined,
                        }}
                        onPointerDown={(event) => startDrag(event, layer)}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          if (locked) return;
                          pushUndoSnapshot();
                          selectOne(layer.id);
                          setEditingId(layer.id);
                        }}
                        title={locked ? 'Locked layer' : layer.text}
                      />
                    )}

                    {/* All handles in a rotated container that matches the layer */}
                    {selected && !locked && (
                      <div
                        style={{
                          position: 'absolute',
                          left: bounds.x,
                          top: bounds.y,
                          width: bounds.width,
                          height: bounds.height,
                          transform: rotateCss,
                          transformOrigin: 'center center',
                          pointerEvents: 'none',
                        }}
                      >
                        {/* Rotation handles — outside corners, only when not editing */}
                        {!editing && (
                          <>
                            {([
                              { key: 'rot-nw', style: { left: -rotSize, top: -rotSize } },
                              { key: 'rot-ne', style: { left: bounds.width, top: -rotSize } },
                              { key: 'rot-sw', style: { left: -rotSize, top: bounds.height } },
                              { key: 'rot-se', style: { left: bounds.width, top: bounds.height } },
                            ] as { key: string; style: React.CSSProperties }[]).map(({ key, style }) => (
                              <div
                                key={key}
                                className="rotation-handle"
                                style={{ position: 'absolute', width: rotSize, height: rotSize, pointerEvents: 'all', ...style }}
                                onPointerDown={(e) => { e.stopPropagation(); startRotate(e, layer); }}
                              />
                            ))}
                          </>
                        )}

                        {/* Resize handles — corners + edges when not editing */}
                        {!editing && (
                          <>
                            {([
                              { dir: 'nw' as ResizeDir, style: { left: -hs, top: -hs, cursor: resizeCursor } },
                              { dir: 'ne' as ResizeDir, style: { left: bounds.width - hs, top: -hs, cursor: resizeCursor } },
                              { dir: 'sw' as ResizeDir, style: { left: -hs, top: bounds.height - hs, cursor: resizeCursor } },
                              { dir: 'se' as ResizeDir, style: { left: bounds.width - hs, top: bounds.height - hs, cursor: resizeCursor } },
                              { dir: 'w' as ResizeDir, style: { left: -hs, top: bounds.height / 2 - hs, cursor: resizeCursor } },
                              { dir: 'e' as ResizeDir, style: { left: bounds.width - hs, top: bounds.height / 2 - hs, cursor: resizeCursor } },
                            ]).map(({ dir, style }) => (
                              <div
                                key={dir}
                                className="resize-handle"
                                style={{ position: 'absolute', width: handleSize, height: handleSize, pointerEvents: 'all', ...style }}
                                onPointerDown={(e) => { e.stopPropagation(); startResize(e, layer, dir); }}
                              />
                            ))}
                          </>
                        )}

                        {/* Width resize handle in editing mode */}
                        {editing && (
                          <div
                            className="resize-handle resize-handle--edit"
                            style={{
                              position: 'absolute',
                              width: handleSize,
                              height: handleSize,
                              left: bounds.width - hs,
                              top: bounds.height / 2 - hs,
                              cursor: resizeCursor,
                              pointerEvents: 'all',
                            }}
                            onPointerDown={(e) => { e.stopPropagation(); startResize(e, layer, 'e'); }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
