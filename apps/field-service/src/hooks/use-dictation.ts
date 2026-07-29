/**
 * Browser dictation via the Web Speech API.
 *
 * Speech is the only capture mode that can fail for reasons outside the app —
 * no engine, denied microphone, an unsupported language — so support is
 * reported rather than assumed, and the UI hides the control when it is
 * missing instead of offering a button that does nothing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDictation(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  const supported = recognitionConstructor() !== null;

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    // Detach before stopping so the instance's own end event cannot resurrect state.
    recognitionRef.current = null;
    setListening(false);
    recognition?.stop();
  }, []);

  const start = useCallback(() => {
    if (recognitionRef.current) return;
    const Constructor = recognitionConstructor();
    if (!Constructor) return;

    const recognition = new Constructor();
    recognitionRef.current = recognition;
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, i) => event.results[i][0].transcript)
        .join('')
        .trim();
      if (transcript) callbackRef.current(transcript);
    };
    const finish = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        setListening(false);
      }
    };
    recognition.onend = finish;
    recognition.onerror = finish;

    try {
      recognition.start();
      setListening(true);
    } catch {
      finish();
    }
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return { supported, listening, start, stop };
}
