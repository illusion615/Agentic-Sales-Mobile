/**
 * Reactive controller for the copilot composer suggestion pills.
 *
 * Drives a small state machine off the conversation so the panel can show:
 *  - `hidden`     — a turn is in flight; the previous pills should fade out.
 *  - `generating` — the reply finished; we're asking the LLM for follow-ups
 *                   (panel shows a skeleton).
 *  - `ready`      — pills are available (LLM-generated, or a static fallback).
 *
 * The LLM call runs in the background while the user reads the reply, keyed by
 * the assistant message id so each completed turn is generated at most once and
 * cached. Stale results (user sent a new message meanwhile) are discarded.
 */

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/contexts/copilot-context';
import type { Locale } from '@/lib/i18n';
import { getContextualSuggestions, type SuggestionPill } from '@/lib/contextual-suggestions';
import { generateFollowupSuggestions } from '@/lib/followup-suggestions';

export type SuggestionStatus = 'hidden' | 'generating' | 'ready';

/** Find the most recent assistant message that is a finished, non-empty reply. */
function lastFinalAssistant(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const isAssistant = m.role === 'assistant' || m.type === 'agent';
    if (
      isAssistant &&
      !m.isStreaming &&
      !m.isThinking &&
      typeof m.content === 'string' &&
      m.content.trim().length > 0
    ) {
      return m;
    }
  }
  return null;
}

/** The last user-authored message (the request that prompted the reply). */
function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user' || m.type === 'user') return m.content ?? '';
  }
  return '';
}

export function useDynamicSuggestions(opts: {
  messages: ChatMessage[];
  isSending: boolean;
  locale: Locale;
  /** When false (e.g. clarification pills are showing) the hook stays idle. */
  enabled: boolean;
}): { status: SuggestionStatus; pills: SuggestionPill[] } {
  const { messages, isSending, locale, enabled } = opts;

  const [status, setStatus] = useState<SuggestionStatus>('ready');
  const [pills, setPills] = useState<SuggestionPill[]>(() =>
    getContextualSuggestions({ hasMessages: messages.length > 0, locale }),
  );

  const cacheRef = useRef<Map<string, SuggestionPill[]>>(new Map());
  const inFlightKeyRef = useRef<string | null>(null);
  const currentKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Clarification/blocking pills take over — the hook output is ignored.
    if (!enabled) {
      currentKeyRef.current = null;
      setStatus('ready');
      return;
    }

    // A turn is in flight → hide current pills (panel fades them out).
    if (isSending) {
      currentKeyRef.current = null;
      setStatus('hidden');
      return;
    }

    // Empty conversation → static starter pills, shown immediately.
    if (messages.length === 0) {
      currentKeyRef.current = '__starter__';
      setPills(getContextualSuggestions({ hasMessages: false, locale }));
      setStatus('ready');
      return;
    }

    const lastFinal = lastFinalAssistant(messages);
    if (!lastFinal) {
      currentKeyRef.current = '__fallback__';
      setPills(getContextualSuggestions({ hasMessages: true, locale }));
      setStatus('ready');
      return;
    }

    const key = `${lastFinal.id}|${locale}`;
    currentKeyRef.current = key;

    const cached = cacheRef.current.get(key);
    if (cached) {
      setPills(cached);
      setStatus('ready');
      return;
    }

    // Already generating for this exact turn → just keep the skeleton.
    if (inFlightKeyRef.current === key) {
      setStatus('generating');
      return;
    }

    // Kick off background generation.
    inFlightKeyRef.current = key;
    setStatus('generating');
    const userText = lastUserText(messages);
    void (async () => {
      const generated = await generateFollowupSuggestions({
        locale,
        lastUser: userText,
        lastAssistant: lastFinal.content,
        lastFunctionCalled: lastFinal.functionCalled,
      });
      inFlightKeyRef.current = null;
      // Stale (user sent a new message / locale changed) → discard.
      if (currentKeyRef.current !== key) return;
      const result =
        generated ??
        getContextualSuggestions({
          hasMessages: true,
          lastFunctionCalled: lastFinal.functionCalled,
          locale,
        });
      cacheRef.current.set(key, result);
      setPills(result);
      setStatus('ready');
    })();
  }, [messages, isSending, locale, enabled]);

  return { status, pills };
}
