/**
 * Speech-input runtime for the Copilot composer.
 *
 * Owns the whole voice-to-text state machine so the composer component stays a
 * pure consumer:
 *  - mode resolution (Web Speech → device keyboard → Azure) via lib/speech-input
 *  - Web Speech dictation (hold-to-talk / tap-to-toggle gesture, interim results)
 *  - Azure record-and-transcribe session (getUserMedia is async, so the stop tap
 *    is tracked as intent and finalises whenever the recorder actually opens)
 *  - graceful fallback: an unexpected Web Speech failure marks it blocked so Auto
 *    drops to the next input method
 *
 * The composer binds `onMic*` to the mic button and renders from `isListening`,
 * `isTranscribing`, `showMic`, `recordSeconds`. It never touches SpeechRecognition
 * or the connector directly.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { toast } from '@/lib/toast-utils';
import { getSpeechInputMode, speechLang, t, type Locale, type SpeechInputMode } from '@/lib/i18n';
import { hasWebSpeechRecognition, isAzureSpeechReady, resolveSpeechInputMode } from '@/lib/speech-input';
import { startRecording, type AudioRecording } from '@/lib/audio-recorder';
import { transcribeSpeech } from '@/lib/azure-stt';

const TAP_THRESHOLD_MS = 300;

export interface UseSpeechInputArgs {
  locale: Locale;
  /** Current composer text — dictation is appended to it. */
  inputValue: string;
  setInputValue: (value: string) => void;
}

export interface SpeechInputController {
  /** Recording / listening in progress (Web Speech live or Azure mic open). */
  isListening: boolean;
  /** Azure audio is being transcribed after a recording stops. */
  isTranscribing: boolean;
  /** Whether the in-app mic should be shown (false for the device-keyboard mode). */
  showMic: boolean;
  /** Elapsed seconds for the live "listening" indicator. */
  recordSeconds: number;
  onMicPointerDown: (e: ReactPointerEvent) => void;
  onMicPointerUp: () => void;
  onMicPointerLeave: () => void;
  onMicClick: () => void;
}

export function useSpeechInput({ locale, inputValue, setInputValue }: UseSpeechInputArgs): SpeechInputController {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speechInputMode, setSpeechInputModeState] = useState<SpeechInputMode>(() => getSpeechInputMode());
  const [azureSpeechReady, setAzureSpeechReady] = useState(false);
  const [webSpeechBlocked, setWebSpeechBlocked] = useState(false);
  const baseTextRef = useRef('');
  const recognitionRef = useRef<any>(null);
  const listenModeRef = useRef<'idle' | 'hold' | 'toggle'>('idle');
  const pressStartRef = useRef(0);
  const suppressNextUpRef = useRef(false);
  // Recording session. `startRecording()` (getUserMedia) is async, so the
  // recorder may not exist yet when the user taps stop. We track the whole
  // session — the live recorder plus stop/cancel intent — so the stop tap
  // always finalises correctly no matter how slow the mic is to open.
  const sessionRef = useRef<{
    recording: AudioRecording | null;
    stopRequested: boolean;
    canceled: boolean;
  } | null>(null);
  const webSpeechReady = hasWebSpeechRecognition() && !webSpeechBlocked;
  const resolvedSpeechInputMode = resolveSpeechInputMode(speechInputMode, {
    azureReady: azureSpeechReady,
    webSpeechReady,
  });
  const speechSupported = resolvedSpeechInputMode !== 'device-ime';

  useEffect(() => {
    const handler = (e: Event) => setSpeechInputModeState((e as CustomEvent<SpeechInputMode>).detail);
    window.addEventListener('speechinputmode-changed', handler);
    return () => window.removeEventListener('speechinputmode-changed', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void isAzureSpeechReady().then((ready) => {
      if (!cancelled) setAzureSpeechReady(ready);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopWebSpeechListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    // Detach the instance BEFORE stopping it. Its trailing onend / onerror
    // ('aborted') then fails the identity guard in startWebSpeechListening and is
    // ignored, so a purposeful stop can never reset state that belongs to a
    // freshly-started next session. This is the real fix — not swallowing the
    // 'aborted' error string.
    recognitionRef.current = null;
    listenModeRef.current = 'idle';
    setIsListening(false);
    try {
      rec.stop();
    } catch {
      try { rec.abort(); } catch { /* noop */ }
    }
  }, []);

  const startWebSpeechListening = useCallback(() => {
    // Synchronous guard on the instance ref (NOT the async isListening state):
    // never open a second recognition over a live one.
    if (recognitionRef.current) return;
    const w = window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setWebSpeechBlocked(true);
      toast.error(t('speechNotSupported', locale));
      return;
    }

    const recognition = new SR();
    recognition.lang = speechLang(locale);
    recognition.continuous = true;
    recognition.interimResults = true;
    baseTextRef.current = inputValue ? inputValue.trimEnd() + ' ' : '';
    // Claim the slot synchronously so a rapid second tap sees an active instance.
    recognitionRef.current = recognition;

    // Every handler is scoped to THIS instance. A late callback from a previous
    // (already-stopped or replaced) recognition fails this guard and becomes a
    // no-op, which structurally removes the stale-callback corruption that made
    // every other tap flicker-and-fail.
    const isCurrent = () => recognitionRef.current === recognition;

    recognition.onstart = () => {
      if (!isCurrent()) return;
      setIsListening(true);
    };
    recognition.onresult = (event: any) => {
      if (!isCurrent()) return;
      let transcript = '';
      for (let resultIndex = 0; resultIndex < event.results.length; resultIndex++) {
        transcript += event.results[resultIndex][0].transcript;
      }
      setInputValue(baseTextRef.current + transcript);
    };
    recognition.onerror = (event: any) => {
      if (!isCurrent()) return; // stale instance (e.g. our own stop/abort) → ignore
      recognitionRef.current = null;
      listenModeRef.current = 'idle';
      setIsListening(false);
      const error = String(event.error || '');
      if (error === 'no-speech' || error === 'aborted') {
        // no-speech: nothing was said. aborted on the CURRENT instance: a
        // transient engine hiccup — reset cleanly and let the next tap retry.
        // Do NOT block Web Speech and do NOT toast.
        return;
      }
      if (error === 'service-not-allowed') {
        setWebSpeechBlocked(true);
        toast.error(t('speechNotSupported', locale));
      } else if (error === 'not-allowed') {
        toast.error(t('micPermissionDenied', locale));
      } else {
        setWebSpeechBlocked(true);
        toast.error(t('speechRecognitionError', locale, { error }));
      }
    };
    recognition.onend = () => {
      if (!isCurrent()) return; // stale → ignore
      recognitionRef.current = null;
      listenModeRef.current = 'idle';
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch {
      // start() throws if the engine is still releasing the previous session —
      // release the slot (do NOT permanently block) so the next tap retries.
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setIsListening(false);
    }
  }, [inputValue, locale, setInputValue]);

  // Stop the live recorder and transcribe. Runs once per session.
  const finalizeSession = useCallback(
    async (session: { recording: AudioRecording | null }) => {
      if (sessionRef.current === session) sessionRef.current = null;
      const rec = session.recording;
      setIsListening(false);
      if (!rec) return;
      setIsTranscribing(true);
      try {
        const wav = await rec.stop();
        const text = await transcribeSpeech(wav, speechLang(locale));
        if (text) {
          setInputValue(baseTextRef.current + text);
        } else {
          toast(t('noSpeechDetected', locale));
        }
      } catch (err) {
        toast.error(t('speechRecognitionError', locale, { error: (err as Error)?.message || 'stt' }));
      } finally {
        setIsTranscribing(false);
      }
    },
    [locale, setInputValue]
  );

  const toggleAzureListening = useCallback(() => {
    if (isTranscribing) return;
    const active = sessionRef.current;
    if (active) {
      // Second tap → stop and transcribe (or finalise as soon as the mic opens).
      active.stopRequested = true;
      if (active.recording) finalizeSession(active);
      return;
    }
    // First tap → start.
    baseTextRef.current = inputValue ? inputValue.trimEnd() + ' ' : '';
    const session = { recording: null as AudioRecording | null, stopRequested: false, canceled: false };
    sessionRef.current = session;
    setIsListening(true); // banner shows the moment you tap
    startRecording().then(
      (rec) => {
        if (session.canceled) {
          rec.cancel();
          return;
        }
        session.recording = rec;
        // The user may have already tapped stop before the mic finished opening.
        if (session.stopRequested) finalizeSession(session);
      },
      (err) => {
        if (sessionRef.current === session) sessionRef.current = null;
        setIsListening(false);
        const name = (err as Error)?.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          toast.error(t('micPermissionDenied', locale));
        } else {
          toast.error(t('speechStartFailed', locale));
        }
      }
    );
  }, [isTranscribing, inputValue, locale, finalizeSession]);

  const onMicPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (resolvedSpeechInputMode !== 'web-speech') return;
      e.preventDefault();
      if (listenModeRef.current === 'toggle') {
        stopWebSpeechListening();
        listenModeRef.current = 'idle';
        suppressNextUpRef.current = true;
        return;
      }
      pressStartRef.current = Date.now();
      listenModeRef.current = 'hold';
      startWebSpeechListening();
    },
    [resolvedSpeechInputMode, startWebSpeechListening, stopWebSpeechListening]
  );

  const onMicPointerUp = useCallback(() => {
    if (resolvedSpeechInputMode !== 'web-speech') return;
    if (suppressNextUpRef.current) {
      suppressNextUpRef.current = false;
      return;
    }
    if (listenModeRef.current !== 'hold') return;
    const duration = Date.now() - pressStartRef.current;
    if (duration < TAP_THRESHOLD_MS) {
      listenModeRef.current = 'toggle';
    } else {
      stopWebSpeechListening();
      listenModeRef.current = 'idle';
    }
  }, [resolvedSpeechInputMode, stopWebSpeechListening]);

  const onMicPointerLeave = useCallback(() => {
    if (resolvedSpeechInputMode !== 'web-speech') return;
    if (listenModeRef.current === 'hold') {
      stopWebSpeechListening();
      listenModeRef.current = 'idle';
    }
  }, [resolvedSpeechInputMode, stopWebSpeechListening]);

  const onMicClick = useCallback(() => {
    if (resolvedSpeechInputMode === 'azure') toggleAzureListening();
  }, [resolvedSpeechInputMode, toggleAzureListening]);

  // Release the mic if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      try {
        const rec = recognitionRef.current;
        recognitionRef.current = null;
        rec?.abort();
      } catch {
        /* noop */
      }
      const s = sessionRef.current;
      if (s) {
        s.canceled = true;
        try {
          s.recording?.cancel();
        } catch {
          /* noop */
        }
      }
      sessionRef.current = null;
    };
  }, []);

  // Elapsed recording time (seconds) for the live "listening" indicator.
  const [recordSeconds, setRecordSeconds] = useState(0);
  useEffect(() => {
    if (!isListening) {
      setRecordSeconds(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setRecordSeconds(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [isListening]);

  return {
    isListening,
    isTranscribing,
    showMic: speechSupported,
    recordSeconds,
    onMicPointerDown,
    onMicPointerUp,
    onMicPointerLeave,
    onMicClick,
  };
}
