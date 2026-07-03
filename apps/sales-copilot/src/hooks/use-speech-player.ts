import { useCallback, useEffect, useRef, useState } from 'react';
import {
  hasSpeechSynthesis,
  primeSpeech,
  ensureVoicesReady,
  stripMarkdown,
  splitIntoSegments,
} from '@/lib/speech';

// ---------------------------------------------------------------------------
// useSpeechPlayer — the single shared text-to-speech player.
//
// Every voice feature in the app (Copilot bubble, Settings preview, Insight /
// Brief Me playback, Brief page) drives audio through this one hook. Each
// screen keeps its OWN buttons, animations and progress UI; this hook only owns
// the mechanics that everyone kept re-implementing differently:
//   - mobile gesture unlock (primeSpeech) done correctly, every time
//   - async voice-list readiness before the first utterance
//   - multi-segment / multi-track queueing with clean cancel (runId guard)
//   - pause / resume / stop / next / prev
//   - iOS "stuck after cancel" defensive resume
//
// A "track" is one logical unit (a chat message, an insight card, a briefing
// chapter). Each track is spoken as one or more segments with a short pause
// between them; tracks auto-advance with an optional longer pause between them.
// ---------------------------------------------------------------------------

export interface SpeechTrack {
  /** Stable id so callers can tell which track is currently speaking. */
  id: string;
  /** Raw text; Markdown is stripped (unless strip:false) then segmented. */
  text?: string;
  /** Pre-built segments; when provided, `text` segmentation is skipped. */
  segments?: string[];
}

export interface SpeechPlayerState {
  /** A playback session is running (speaking OR paused). */
  isActive: boolean;
  isPaused: boolean;
  trackIndex: number;
  segmentIndex: number;
  /** id of the track currently being spoken, or null when idle. */
  activeId: string | null;
}

export interface SpeechPlayerOptions {
  /** BCP-47 lang for each utterance (e.g. 'zh-CN'). */
  getLang?: () => string;
  /** Resolve the SpeechSynthesisVoice to use (per utterance). */
  getVoice?: () => SpeechSynthesisVoice | null;
  /** Playback rate (per utterance); read fresh so speed toggles apply. */
  getRate?: () => number;
  /** Strip Markdown from track.text before segmenting. Default true. */
  strip?: boolean;
  /** Pause between segments within a track (ms). Default 0. */
  segmentPauseMs?: number;
  /** Pause between tracks (ms). Default 0. */
  trackPauseMs?: number;
  onTrackChange?: (index: number, track: SpeechTrack) => void;
  onSegmentChange?: (trackIndex: number, segIndex: number, text: string) => void;
  /** Fired when the whole session ends naturally (not on manual stop). */
  onEnd?: () => void;
  onError?: (error: unknown) => void;
}

const IDLE: SpeechPlayerState = {
  isActive: false,
  isPaused: false,
  trackIndex: 0,
  segmentIndex: 0,
  activeId: null,
};

export function useSpeechPlayer(options: SpeechPlayerOptions = {}) {
  const [state, setState] = useState<SpeechPlayerState>(IDLE);

  // Latest options/state without re-creating callbacks on every render.
  const optsRef = useRef(options);
  optsRef.current = options;
  const stateRef = useRef(state);
  stateRef.current = state;

  const tracksRef = useRef<SpeechTrack[]>([]);
  // Bumped on every cancel / new session so a stale queued onend cannot revive
  // playback after the user paused, skipped, or stopped.
  const runIdRef = useRef(0);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  const segmentsFor = useCallback((track: SpeechTrack): string[] => {
    if (track.segments && track.segments.length > 0) return track.segments;
    const raw = track.text ?? '';
    const text = optsRef.current.strip === false ? raw.trim() : stripMarkdown(raw);
    if (!text) return [];
    return splitIntoSegments(text);
  }, []);

  const finish = useCallback((runId: number) => {
    if (runId !== runIdRef.current) return;
    runIdRef.current += 1;
    clearPauseTimer();
    setState(IDLE);
    optsRef.current.onEnd?.();
  }, [clearPauseTimer]);

  // Recursive segment speaker. Guarded by runId so cancels abort cleanly.
  const speak = useCallback((trackIndex: number, segIndex: number, runId: number) => {
    if (runId !== runIdRef.current) return;
    if (!hasSpeechSynthesis) return;
    const o = optsRef.current;
    const tracks = tracksRef.current;
    const track = tracks[trackIndex];
    if (!track) {
      finish(runId);
      return;
    }
    const segments = segmentsFor(track);

    // End of this track — advance to the next, or finish the session.
    if (segIndex >= segments.length) {
      const nextIdx = trackIndex + 1;
      if (nextIdx < tracks.length) {
        setState((s) => ({ ...s, trackIndex: nextIdx, segmentIndex: 0, activeId: tracks[nextIdx].id }));
        o.onTrackChange?.(nextIdx, tracks[nextIdx]);
        pauseTimerRef.current = setTimeout(
          () => speak(nextIdx, 0, runId),
          o.trackPauseMs ?? 0
        );
      } else {
        finish(runId);
      }
      return;
    }

    const segText = segments[segIndex];
    setState((s) => ({
      ...s,
      isActive: true,
      isPaused: false,
      trackIndex,
      segmentIndex: segIndex,
      activeId: track.id,
    }));
    o.onSegmentChange?.(trackIndex, segIndex, segText);

    const utt = new SpeechSynthesisUtterance(segText);
    utt.lang = o.getLang ? o.getLang() : 'en-US';
    utt.rate = o.getRate ? o.getRate() : 1.0;
    utt.pitch = 1.0;
    const voice = o.getVoice?.();
    if (voice) utt.voice = voice;

    utt.onend = () => {
      if (runId !== runIdRef.current) return;
      const pause = o.segmentPauseMs ?? 0;
      if (pause > 0) {
        pauseTimerRef.current = setTimeout(() => speak(trackIndex, segIndex + 1, runId), pause);
      } else {
        speak(trackIndex, segIndex + 1, runId);
      }
    };
    utt.onerror = (e: SpeechSynthesisErrorEvent) => {
      // Cancel/interrupt are expected when we stop or skip — not real errors.
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      if (runId !== runIdRef.current) return;
      optsRef.current.onError?.(e);
      finish(runId);
    };

    window.speechSynthesis.speak(utt);
    // iOS sometimes leaves the queue paused right after a cancel(); nudging
    // resume() here makes the freshly queued utterance actually start.
    try {
      window.speechSynthesis.resume();
    } catch {
      /* ignore */
    }
  }, [finish, segmentsFor]);

  /**
   * Unlock the speech engine synchronously inside a user gesture. Call this in
   * a click handler BEFORE any await when the audio itself must wait on a
   * network/data step (e.g. generating insights before playing them).
   */
  const prime = useCallback(() => {
    primeSpeech();
  }, []);

  /** Start (or restart) a playback session. Primes the engine first. */
  const play = useCallback((tracks: SpeechTrack[], startIndex = 0) => {
    primeSpeech(); // must be the first thing — keeps the gesture valid
    if (!hasSpeechSynthesis || tracks.length === 0) return;

    clearPauseTimer();
    window.speechSynthesis.cancel();
    runIdRef.current += 1;
    const runId = runIdRef.current;
    tracksRef.current = tracks;

    const idx = Math.min(Math.max(startIndex, 0), tracks.length - 1);
    setState({ isActive: true, isPaused: false, trackIndex: idx, segmentIndex: 0, activeId: tracks[idx].id });
    optsRef.current.onTrackChange?.(idx, tracks[idx]);

    // Priming above already unlocked the engine, so this async hop is safe.
    void ensureVoicesReady().then(() => {
      if (runId !== runIdRef.current) return;
      speak(idx, 0, runId);
    });
  }, [clearPauseTimer, speak]);

  const pause = useCallback(() => {
    if (!hasSpeechSynthesis) return;
    clearPauseTimer();
    window.speechSynthesis.pause();
    setState((s) => (s.isActive ? { ...s, isPaused: true } : s));
  }, [clearPauseTimer]);

  const resume = useCallback(() => {
    if (!hasSpeechSynthesis) return;
    window.speechSynthesis.resume();
    setState((s) => (s.isActive ? { ...s, isPaused: false } : s));
  }, []);

  const stop = useCallback(() => {
    runIdRef.current += 1;
    clearPauseTimer();
    if (hasSpeechSynthesis) window.speechSynthesis.cancel();
    setState(IDLE);
  }, [clearPauseTimer]);

  const next = useCallback(() => {
    const tracks = tracksRef.current;
    const cur = stateRef.current.trackIndex;
    if (cur < tracks.length - 1) play(tracks, cur + 1);
  }, [play]);

  const prev = useCallback(() => {
    const tracks = tracksRef.current;
    const cur = stateRef.current.trackIndex;
    if (cur > 0) play(tracks, cur - 1);
  }, [play]);

  /** Re-speak the current track from its start (e.g. after a speed change). */
  const restart = useCallback(() => {
    const tracks = tracksRef.current;
    if (tracks.length > 0) play(tracks, stateRef.current.trackIndex);
  }, [play]);

  // Stop audio when the consuming component unmounts.
  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      if (hasSpeechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  return { state, prime, play, pause, resume, stop, next, prev, restart };
}
