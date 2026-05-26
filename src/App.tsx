import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignCenter,
  AlignLeft,
  AlignRight,
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
import type { ArtboardSize, RenderSettings, TextLayer } from './types';
import { createPosterTexture, estimateLayerBounds } from './rendering/posterTexture';
import { WebglPosterRenderer } from './rendering/webglPosterRenderer';
import {
  ARTBOARD_PRESETS,
  FONTS,
  getArtboardPreset,
  initialLayers,
  initialSettings,
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
  onChange,
  onChangeStart,
  min,
  max,
  step = 1,
  decimals,
  suffix,
}: {
  label: string;
  value: number;
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
    dragState.current = { startX: e.clientX, startVal: value, dragged: false, changeStarted: false };
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
        setEditVal(fmt(value));
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
        <span className="scrub-value">{fmt(value)}</span>
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
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
  });

  settingsRef.current = settings;
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
      }
    });
    return () => { cancelled = true; };
  }, [layers, bgColor, artboardSize, previewRenderSize, editingId]);

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
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
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
      if (e.code === 'Space') {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (e.key === '[') {
        e.preventDefault();
        moveLayer(-1);
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        moveLayer(1);
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
  }, [editingId, selectedId, layers]);

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
    if (!selectedLayer || selectedLayer.locked) return;
    if (recordHistory) pushUndoSnapshot();
    setLayers((current) =>
      current.map((layer) => (layer.id === selectedLayer.id ? { ...layer, ...patch } : layer)),
    );
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
    if (!selectedLayer || selectedLayer.locked) return;
    pushUndoSnapshot();
    const copy = { ...selectedLayer, id: uid(), locked: false, x: selectedLayer.x + 24, y: selectedLayer.y + 24 };
    setLayers((current) => [...current, copy]);
    selectOne(copy.id);
  }

  function deleteSelected() {
    if (!selectedLayer || selectedLayer.locked) return;
    pushUndoSnapshot();
    const next = layers.filter((layer) => layer.id !== selectedLayer.id);
    setLayers(next);
    selectOne(next[0]?.id ?? '');
  }

  function moveLayer(direction: -1 | 1) {
    if (!selectedLayer || selectedLayer.locked) return;
    const index = layers.findIndex((layer) => layer.id === selectedLayer.id);
    const nextIndex = Math.min(layers.length - 1, Math.max(0, index + direction));
    if (index === nextIndex) return;
    pushUndoSnapshot();
    const next = [...layers];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    setLayers(next);
  }

  function alignSelected(axis: 'left' | 'center' | 'right') {
    const targets = layers.filter((l) => selectedIds.includes(l.id) && !l.locked);
    if (targets.length === 0) return;
    pushUndoSnapshot();
    setLayers((current) =>
      current.map((layer) => {
        if (!selectedIds.includes(layer.id) || layer.locked) return layer;
        if (axis === 'left') return { ...layer, x: 0 };
        if (axis === 'right') return { ...layer, x: Math.round(artboardSize.width - layer.width) };
        // center
        return { ...layer, x: Math.round((artboardSize.width - layer.width) / 2) };
      }),
    );
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

    // For alt+shift: axis is locked after first threshold movement
    let lockedAxis: 'x' | 'y' | null = null;

    const onMove = (moveEvent: PointerEvent) => {
      const rect = stageRef.current!.getBoundingClientRect();
      const scale = rect.width / artboardSize.width;
      const px = (moveEvent.clientX - rect.left) / scale;
      const py = (moveEvent.clientY - rect.top) / scale;
      let dx = px - start.x;
      let dy = py - start.y;

      // Axis lock: alt+shift constrains to the dominant axis
      if (event.altKey && moveEvent.shiftKey) {
        if (!lockedAxis && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
          lockedAxis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        }
        if (lockedAxis === 'x') dy = 0;
        if (lockedAxis === 'y') dx = 0;
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
            {layers.map((layer) => (
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
            <IconButton label="Duplicate" onClick={duplicateSelected} disabled={!selectedLayer || selectedLayer.locked}><Copy size={15} /></IconButton>
            <IconButton label="Delete" onClick={deleteSelected} disabled={!selectedLayer || selectedLayer.locked}><Trash2 size={15} /></IconButton>
          </div>
          <div className="button-grid">
            <button type="button" onClick={() => moveLayer(-1)} disabled={!selectedLayer || selectedLayer.locked}>Back</button>
            <button type="button" onClick={() => moveLayer(1)} disabled={!selectedLayer || selectedLayer.locked}>Front</button>
          </div>
          <div className="align-tools">
            <IconButton label="Align to left" onClick={() => alignSelected('left')} disabled={selectedIds.length === 0}><AlignHorizontalJustifyStart size={14} /></IconButton>
            <IconButton label="Align horizontal center" onClick={() => alignSelected('center')} disabled={selectedIds.length === 0}><AlignHorizontalJustifyCenter size={14} /></IconButton>
            <IconButton label="Align to right" onClick={() => alignSelected('right')} disabled={selectedIds.length === 0}><AlignHorizontalJustifyEnd size={14} /></IconButton>
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
              <div className="prop-group-label">Font</div>
              <div className="font-picker">
                <div className="font-picker-group">
                  <div className="font-group-label">한국어</div>
                  <div className="font-grid">
                    {FONTS.filter((f) => f.korean).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`font-item${selectedLayer.fontFamily === f.id ? ' is-active' : ''}`}
                        style={{ fontFamily: `'${f.id}', 'Apple SD Gothic Neo', sans-serif` }}
                        onClick={() => patchSelected({ fontFamily: f.id })}
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
                        className={`font-item${selectedLayer.fontFamily === f.id ? ' is-active' : ''}`}
                        style={{ fontFamily: `'${f.id}', Helvetica, Arial, sans-serif` }}
                        onClick={() => patchSelected({ fontFamily: f.id })}
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
                <ScrubInput label="Size" value={selectedLayer.fontSize} onChangeStart={pushUndoSnapshot} onChange={(v) => patchSelected({ fontSize: clamp(v, 8, 400) }, false)} step={1} min={8} max={400} />
                <ScrubInput label="Weight" value={selectedLayer.fontWeight} onChangeStart={pushUndoSnapshot} onChange={(v) => patchSelected({ fontWeight: clamp(Math.round(v / 50) * 50, 100, 950) }, false)} step={5} min={100} max={950} decimals={0} />
              </div>
              <div className="scrub-grid-2">
                <ScrubInput label="Line" value={selectedLayer.lineHeight} onChangeStart={pushUndoSnapshot} onChange={(v) => patchSelected({ lineHeight: clamp(v, 0.5, 3) }, false)} step={0.005} min={0.5} max={3} decimals={2} />
                <ScrubInput label="Track" value={selectedLayer.letterSpacing} onChangeStart={pushUndoSnapshot} onChange={(v) => patchSelected({ letterSpacing: clamp(v, -20, 50) }, false)} step={0.05} min={-20} max={50} decimals={1} />
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
          <Field label="Point size" min={1} max={15} step={0.5} value={settings.pointSize} onChangeStart={pushUndoSnapshot} onChange={(value) => patchSettings({ pointSize: value }, false)} />
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
                      <textarea
                        className="layer-editor"
                        autoFocus
                        value={layer.text}
                        style={{
                          left: bounds.x,
                          top: bounds.y,
                          width: bounds.width,
                          minHeight: bounds.height,
                          fontSize: layer.fontSize,
                          fontWeight: layer.fontWeight,
                          lineHeight: layer.lineHeight,
                          letterSpacing: layer.letterSpacing,
                          color: layer.color,
                          opacity: layer.opacity ?? 1,
                          textAlign: layer.align,
                          fontFamily: `'${layer.fontFamily || 'Pretendard'}', 'Apple SD Gothic Neo', Helvetica, Arial, sans-serif`,
                          transform: rotateCss,
                          transformOrigin: 'center center',
                          pointerEvents: 'all',
                        }}
                        onChange={(event) => updateLayer(layer.id, { text: event.target.value }, false)}
                        onBlur={() => finishEditing(layer)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') event.currentTarget.blur();
                        }}
                      />
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
