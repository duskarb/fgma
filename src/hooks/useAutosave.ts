import { useEffect, useRef } from 'react';
import type { RenderSettings, TextLayer } from '../types';
import type { ArtboardPresetId, Orientation } from '../appConfig';

const AUTOSAVE_KEY = 'fgma.autosave.v1';

type AutosaveSnapshot = {
  version: 1;
  savedAt: number;
  layers: TextLayer[];
  selectedId: string;
  selectedIds: string[];
  bgColor: string;
  artboardPreset: ArtboardPresetId;
  orientation: Orientation;
  settings: RenderSettings;
};

type AutosaveState = Omit<AutosaveSnapshot, 'version' | 'savedAt'>;

function isAutosaveSnapshot(value: unknown): value is AutosaveSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AutosaveSnapshot>;
  return candidate.version === 1
    && Array.isArray(candidate.layers)
    && typeof candidate.bgColor === 'string'
    && typeof candidate.artboardPreset === 'string'
    && typeof candidate.orientation === 'string'
    && !!candidate.settings
    && typeof candidate.settings === 'object';
}

export function readAutosave() {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isAutosaveSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function useAutosave(state: AutosaveState) {
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }

    const timeout = window.setTimeout(() => {
      const snapshot: AutosaveSnapshot = {
        version: 1,
        savedAt: Date.now(),
        ...state,
      };

      try {
        window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot));
      } catch {
        // localStorage can fail in private mode or when storage is full.
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [
    state.layers,
    state.selectedId,
    state.selectedIds,
    state.bgColor,
    state.artboardPreset,
    state.orientation,
    state.settings,
  ]);
}
