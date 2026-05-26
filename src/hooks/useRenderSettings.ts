import { useCallback, useState } from 'react';
import type { RenderSettings } from '../types';
import { initialSettings } from '../appConfig';

export function useRenderSettings(recordSnapshot: () => void) {
  const [settings, setSettings] = useState<RenderSettings>(initialSettings);

  const patchSettings = useCallback((patch: Partial<RenderSettings>, recordHistory = true) => {
    if (recordHistory) recordSnapshot();
    setSettings((current) => ({ ...current, ...patch }));
  }, [recordSnapshot]);

  return { settings, setSettings, patchSettings };
}
