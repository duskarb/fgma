import { useCallback, useMemo, useState } from 'react';
import type { TextLayer } from '../types';
import { initialLayers } from '../appConfig';

export function useTextLayers() {
  const [layers, setLayers] = useState<TextLayer[]>(initialLayers);
  const [selectedId, setSelectedId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedLayer = useMemo(
    () => layers.find((layer) => layer.id === selectedId) ?? null,
    [layers, selectedId],
  );

  const selectOne = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedIds(id ? [id] : []);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setSelectedId(next.length > 0 ? next[next.length - 1] : '');
      return next;
    });
  }, []);

  return {
    layers,
    setLayers,
    selectedId,
    setSelectedId,
    selectedIds,
    setSelectedIds,
    selectedLayer,
    selectOne,
    toggleSelect,
  };
}
