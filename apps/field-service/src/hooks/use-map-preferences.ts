import { useCallback, useEffect, useState } from 'react';
import {
  BASEMAP_TONES,
  DEFAULT_BASEMAP_TONE,
  type BasemapToneId,
} from '@/lib/basemap-tone';

const TONE_KEY = 'fs-map-tone';
const TRAFFIC_KEY = 'fs-map-traffic';

function readTone(): BasemapToneId {
  try {
    const stored = localStorage.getItem(TONE_KEY);
    return BASEMAP_TONES.some((tone) => tone.id === stored)
      ? (stored as BasemapToneId)
      : DEFAULT_BASEMAP_TONE;
  } catch {
    return DEFAULT_BASEMAP_TONE;
  }
}

function readTraffic(): boolean {
  try {
    return localStorage.getItem(TRAFFIC_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * How the technician wants the map drawn.
 *
 * Remembered across sessions: someone who has already said the map is too busy
 * should not have to say it again every morning. Storage failures degrade to
 * the defaults rather than breaking the screen.
 */
export function useMapPreferences(): {
  toneId: BasemapToneId;
  setToneId: (id: BasemapToneId) => void;
  traffic: boolean;
  toggleTraffic: () => void;
} {
  const [toneId, setToneId] = useState<BasemapToneId>(readTone);
  const [traffic, setTraffic] = useState<boolean>(readTraffic);

  useEffect(() => {
    try {
      localStorage.setItem(TONE_KEY, toneId);
      localStorage.setItem(TRAFFIC_KEY, traffic ? 'on' : 'off');
    } catch {
      // A browser that refuses storage still gets a working map.
    }
  }, [toneId, traffic]);

  return {
    toneId,
    setToneId,
    traffic,
    toggleTraffic: useCallback(() => setTraffic((value) => !value), []),
  };
}
