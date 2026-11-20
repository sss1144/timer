import { useMemo } from 'react';
import { useActiveTimer, usePresets, useSettings } from '../db/hooks';
import { livePresets, planOf, resolvePreset } from './presets';

/** タイマーの状態と、使うプリセット。読み込み中は timer が undefined */
export function useTimerState() {
  const timer = useActiveTimer();
  const settings = useSettings();
  const presetRows = usePresets();
  const presets = useMemo(() => livePresets(presetRows ?? []), [presetRows]);
  const preset = useMemo(
    () => (timer && presetRows ? resolvePreset(timer, presets, settings.lastPresetId) : null),
    [timer, presetRows, presets, settings.lastPresetId],
  );
  const plan = useMemo(() => planOf(preset), [preset]);
  return { timer: presetRows ? timer : undefined, settings, presets, preset, plan };
}
