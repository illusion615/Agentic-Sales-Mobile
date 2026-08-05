import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSpeechInputMode,
  hasWebSpeechRecognition,
  resolveSpeechInputMode,
  SPEECH_INPUT_MODE_EVENT,
  startRecording,
  type AudioRecording,
  type SpeechInputMode,
} from '@agentic/power-runtime';
import { getSpeechProxyConfig } from '@/data/speech-config';
import { transcribeSpeech } from '@/data/speech-transcriber';

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort?(): void;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function useDictation({
  value,
  onChange,
  locale = 'zh-CN',
}: {
  value: string;
  onChange: (value: string) => void;
  locale?: string;
}) {
  const [preferred, setPreferred] = useState<SpeechInputMode>(getSpeechInputMode);
  const [azureReady, setAzureReady] = useState(false);
  const [webBlocked, setWebBlocked] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef('');
  const sessionRef = useRef<{
    recording: AudioRecording | null;
    stopRequested: boolean;
    canceled: boolean;
  } | null>(null);

  useEffect(() => {
    const handler = (event: Event) => setPreferred((event as CustomEvent<SpeechInputMode>).detail);
    window.addEventListener(SPEECH_INPUT_MODE_EVENT, handler);
    return () => window.removeEventListener(SPEECH_INPUT_MODE_EVENT, handler);
  }, []);

  useEffect(() => {
    let canceled = false;
    void getSpeechProxyConfig().then((config) => {
      if (!canceled) setAzureReady(config.ready);
    });
    return () => {
      canceled = true;
    };
  }, []);

  const mode = resolveSpeechInputMode(preferred, {
    azureReady,
    webSpeechReady: hasWebSpeechRecognition() && !webBlocked,
  });
  const supported = mode !== 'device-ime';

  const stopWeb = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    setListening(false);
    try { recognition?.stop(); } catch { try { recognition?.abort?.(); } catch { /* noop */ } }
  }, []);

  const startWeb = useCallback(() => {
    if (recognitionRef.current) return;
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setWebBlocked(true);
      setError('当前浏览器不支持语音识别');
      return;
    }
    const recognition = new Constructor();
    recognitionRef.current = recognition;
    recognition.lang = locale;
    recognition.continuous = true;
    recognition.interimResults = true;
    baseTextRef.current = value ? `${value.trimEnd()} ` : '';
    const current = () => recognitionRef.current === recognition;
    recognition.onstart = () => { if (current()) setListening(true); };
    recognition.onresult = (event) => {
      if (!current()) return;
      const transcript = Array.from({ length: event.results.length }, (_, index) =>
        event.results[index][0].transcript,
      ).join('');
      onChange(baseTextRef.current + transcript);
    };
    recognition.onend = () => {
      if (!current()) return;
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onerror = (event) => {
      if (!current()) return;
      recognitionRef.current = null;
      setListening(false);
      const reason = event.error ?? '';
      if (reason !== 'no-speech' && reason !== 'aborted') {
        if (reason === 'service-not-allowed') setWebBlocked(true);
        setError(reason === 'not-allowed' ? '请允许使用麦克风' : '语音识别失败，请重试');
      }
    };
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setError('无法启动语音识别');
    }
  }, [locale, onChange, value]);

  const finishAzure = useCallback(async (session: { recording: AudioRecording | null }) => {
    if (sessionRef.current === session) sessionRef.current = null;
    setListening(false);
    if (!session.recording) return;
    setTranscribing(true);
    try {
      const transcript = await transcribeSpeech(await session.recording.stop(), locale);
      if (transcript) onChange(baseTextRef.current + transcript);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '语音识别失败，请重试');
    } finally {
      setTranscribing(false);
    }
  }, [locale, onChange]);

  const toggleAzure = useCallback(() => {
    if (transcribing) return;
    const active = sessionRef.current;
    if (active) {
      active.stopRequested = true;
      if (active.recording) void finishAzure(active);
      return;
    }
    baseTextRef.current = value ? `${value.trimEnd()} ` : '';
    setError(null);
    setListening(true);
    const session = { recording: null as AudioRecording | null, stopRequested: false, canceled: false };
    sessionRef.current = session;
    void startRecording().then(
      (recording) => {
        if (session.canceled) return recording.cancel();
        session.recording = recording;
        if (session.stopRequested) void finishAzure(session);
      },
      () => {
        if (sessionRef.current === session) sessionRef.current = null;
        setListening(false);
        setError('请允许使用麦克风');
      },
    );
  }, [finishAzure, transcribing, value]);

  const toggle = useCallback(() => {
    setError(null);
    if (mode === 'web-speech') {
      if (listening) stopWeb();
      else startWeb();
    } else if (mode === 'azure') {
      toggleAzure();
    }
  }, [listening, mode, startWeb, stopWeb, toggleAzure]);

  useEffect(() => () => {
    try { recognitionRef.current?.abort?.(); } catch { /* noop */ }
    const session = sessionRef.current;
    if (session) {
      session.canceled = true;
      try { session.recording?.cancel(); } catch { /* noop */ }
    }
  }, []);

  return { supported, listening, transcribing, mode, error, toggle };
}
