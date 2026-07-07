import { useCallback, useEffect, useRef, useState } from 'react';
import {
  hasSpeechSynthesis,
  hasLocalVoiceFor,
  primeSpeech,
  ensureVoicesReady,
  stripMarkdown,
  splitIntoSegments,
} from '@/lib/speech';
import { synthesizeSpeech, prefetchSpeech } from '@/lib/azure-tts';

// ---------------------------------------------------------------------------
// useSpeechPlayer — the single shared text-to-speech player.
//
// Every voice feature in the app (Copilot bubble, Settings preview, Insight /
// Brief Me playback, Brief page) drives audio through this one hook. Each
// screen keeps its OWN buttons, animations and progress UI; this hook only owns
// the mechanics that everyone kept re-implementing differently:
//   - engine selection: local Web Speech when the device has a matching voice
//     (free + instant), else Azure Neural TTS via the speech connector (revives
//     read-aloud on GMS-less WebViews like Huawei where getVoices() is empty)
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
  /** Resolve the SpeechSynthesisVoice to use for the LOCAL engine (per utterance). */
  getVoice?: () => SpeechSynthesisVoice | null;
  /**
   * Azure Neural voice name for the connector engine (e.g. 'zh-CN-XiaoxiaoNeural').
   * Used only when the local engine is unavailable. Omit to let the Function
   * pick a sensible default voice for the locale.
   */
  getAzureVoice?: () => string | undefined;
  /**
   * User preference for which engine to use: 'auto' (local when a matching
   * device voice exists, else Azure), 'local' (prefer the device voice), or
   * 'azure' (always the connector). Defaults to 'auto'.
   */
  getEnginePref?: () => 'auto' | 'local' | 'azure';
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
  // Fallback timer that advances the session if a segment's completion event is
  // never delivered (some Android WebViews silently drop <audio>.onended and
  // SpeechSynthesisUtterance.onend), so one dropped event can't freeze the
  // whole read-aloud after the first segment.
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Engine resolved once per play() session: 'local' Web Speech or 'azure'
  // Neural TTS via the connector.
  const engineRef = useRef<'local' | 'azure'>('local');
  // The <audio> element playing the current Azure segment (null on local).
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const stopAzureAudio = useCallback(() => {
    const el = audioElRef.current;
    if (!el) return;
    audioElRef.current = null;
    try {
      el.pause();
      el.onended = null;
      el.onerror = null;
      el.src = '';
    } catch {
      /* ignore */
    }
  }, []);

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
  // Dispatches each segment to the engine chosen for this session (engineRef).
  const speak = useCallback((trackIndex: number, segIndex: number, runId: number) => {
    if (runId !== runIdRef.current) return;
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

    // Shared "this segment finished, go to the next" continuation. `done`
    // guards against the engine's completion event AND the watchdog both firing
    // for the same segment (which would skip one).
    let done = false;
    const advance = () => {
      if (done) return;
      done = true;
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      if (runId !== runIdRef.current) return;
      const pause = o.segmentPauseMs ?? 0;
      if (pause > 0) {
        pauseTimerRef.current = setTimeout(() => speak(trackIndex, segIndex + 1, runId), pause);
      } else {
        speak(trackIndex, segIndex + 1, runId);
      }
    };

    // Completion-event safety net (see watchdogRef). If neither the engine's
    // end event nor its error arrives within a generous upper bound of the
    // spoken duration, advance anyway. The bound is deliberately long so it
    // never clips real speech; a clean onend/onended clears it first.
    const estMs = Math.max(2500, Math.ceil((segText.length * 260) / (o.getRate?.() ?? 1)) + 2500);
    const armWatchdog = () => {
      watchdogRef.current = setTimeout(() => {
        watchdogRef.current = null;
        if (done || runId !== runIdRef.current) return;
        // Don't fire over a deliberate pause — wait it out and re-check.
        if (stateRef.current.isPaused) {
          armWatchdog();
          return;
        }
        advance();
      }, estMs);
    };

    // Azure Neural TTS via the connector: synthesize the segment to an MP3 data
    // URL and play it through an <audio> element, chaining on `ended`.
    if (engineRef.current === 'azure') {
      const lang = o.getLang ? o.getLang() : 'en-US';
      const voice = o.getAzureVoice?.();
      // Warm the next segment while this one plays so playback stays gapless.
      const nextText = segments[segIndex + 1];
      if (nextText) prefetchSpeech(nextText, lang, voice);
      synthesizeSpeech(segText, lang, voice).then(
        (url) => {
          if (runId !== runIdRef.current) return;
          const audio = new Audio(url);
          audioElRef.current = audio;
          if (o.getRate) audio.playbackRate = o.getRate();
          audio.onended = () => {
            if (audioElRef.current === audio) audioElRef.current = null;
            advance();
          };
          audio.onerror = () => {
            if (runId !== runIdRef.current) return;
            o.onError?.(new Error('Azure TTS: audio playback failed'));
            finish(runId);
          };
          void audio.play().catch((err: unknown) => {
            if (runId !== runIdRef.current) return;
            o.onError?.(err);
            finish(runId);
          });
          armWatchdog();
        },
        (err: unknown) => {
          if (runId !== runIdRef.current) return;
          o.onError?.(err);
          finish(runId);
        }
      );
      return;
    }

    // Local Web Speech engine.
    if (!hasSpeechSynthesis) {
      finish(runId);
      return;
    }
    const utt = new SpeechSynthesisUtterance(segText);
    utt.lang = o.getLang ? o.getLang() : 'en-US';
    utt.rate = o.getRate ? o.getRate() : 1.0;
    utt.pitch = 1.0;
    const voice = o.getVoice?.();
    if (voice) utt.voice = voice;

    utt.onend = () => advance();
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
    armWatchdog();
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
    if (tracks.length === 0) return;

    clearPauseTimer();
    if (hasSpeechSynthesis) window.speechSynthesis.cancel();
    stopAzureAudio();
    runIdRef.current += 1;
    const runId = runIdRef.current;
    tracksRef.current = tracks;

    const idx = Math.min(Math.max(startIndex, 0), tracks.length - 1);
    setState({ isActive: true, isPaused: false, trackIndex: idx, segmentIndex: 0, activeId: tracks[idx].id });
    optsRef.current.onTrackChange?.(idx, tracks[idx]);

    // Priming above already unlocked the engine, so this async hop is safe.
    void ensureVoicesReady().then(() => {
      if (runId !== runIdRef.current) return;
      // Engine for this session: honor the user's preference when set. 'auto'
      // and 'local' prefer a matching device voice (free + instant) and fall
      // back to Azure; 'azure' always uses the connector.
      const lang = optsRef.current.getLang ? optsRef.current.getLang() : 'en-US';
      const pref = optsRef.current.getEnginePref?.() ?? 'auto';
      engineRef.current = pref === 'azure' ? 'azure' : hasLocalVoiceFor(lang) ? 'local' : 'azure';
      speak(idx, 0, runId);
    });
  }, [clearPauseTimer, speak, stopAzureAudio]);

  const pause = useCallback(() => {
    clearPauseTimer();
    if (engineRef.current === 'azure') {
      audioElRef.current?.pause();
    } else if (hasSpeechSynthesis) {
      window.speechSynthesis.pause();
    }
    setState((s) => (s.isActive ? { ...s, isPaused: true } : s));
  }, [clearPauseTimer]);

  const resume = useCallback(() => {
    if (engineRef.current === 'azure') {
      void audioElRef.current?.play().catch(() => {
        /* ignore */
      });
    } else if (hasSpeechSynthesis) {
      window.speechSynthesis.resume();
    }
    setState((s) => (s.isActive ? { ...s, isPaused: false } : s));
  }, []);

  const stop = useCallback(() => {
    runIdRef.current += 1;
    clearPauseTimer();
    if (hasSpeechSynthesis) window.speechSynthesis.cancel();
    stopAzureAudio();
    setState(IDLE);
  }, [clearPauseTimer, stopAzureAudio]);

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
      stopAzureAudio();
    };
  }, [stopAzureAudio]);

  return { state, prime, play, pause, resume, stop, next, prev, restart };
}
