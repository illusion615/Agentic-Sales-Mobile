/**
 * Voice capability probe (P0 de-risking for the Azure Speech migration).
 *
 * Runs INSIDE the real Power Apps player on a real device to answer the single
 * biggest unknown before we invest in cloud speech: does this device/host let
 * the app capture the microphone (getUserMedia), and what local speech
 * capability exists? Every field below is read-only and safe to gather.
 *
 * getUserMedia MUST be invoked from a user gesture, so runVoiceProbe() is
 * called from a button press on the probe page, never automatically on mount.
 */

import { hasSpeechSynthesis, ensureVoicesReady } from './speech';
import { getLocale, localeLangPrefix } from './i18n';

export interface VoiceProbeResult {
  timestamp: string;
  /** navigator.userAgent — identifies the WebView / browser core. */
  userAgent: string;
  /** Secure context is required for getUserMedia. */
  secureContext: boolean;
  /** True when the app runs inside an iframe (Power Apps player does). */
  inIframe: boolean;
  /** navigator.mediaDevices exists. */
  hasMediaDevices: boolean;
  /** navigator.mediaDevices.getUserMedia exists. */
  hasGetUserMedia: boolean;
  /** Permissions API state for the microphone, if queryable. */
  micPermissionState: string;
  /**
   * Result of actually calling getUserMedia({ audio: true }):
   * 'success' when a stream was obtained (then immediately stopped), otherwise
   * the DOMException name ('NotAllowedError', 'NotFoundError', ...) or 'unsupported'.
   */
  micCaptureResult: string;
  /** Web Speech recognition interface is present (STT). */
  hasSpeechRecognition: boolean;
  /** Web Speech synthesis is present (TTS). */
  hasSpeechSynthesis: boolean;
  /** Number of local synthesis voices available. */
  voiceCount: number;
  /** Distinct BCP-47 languages of the local voices (capped for display). */
  voiceLangs: string[];
  /** Whether a local voice exists for the current app locale. */
  localeVoiceAvailable: boolean;
}

/** True if the microphone was actually captured in the running host. */
export function micWorks(r: VoiceProbeResult): boolean {
  return r.micCaptureResult === 'success';
}

function detectInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin access throws — that itself means we are framed.
    return true;
  }
}

async function probeMicPermissionState(): Promise<string> {
  try {
    const perms = (navigator as unknown as {
      permissions?: { query(d: { name: string }): Promise<{ state: string }> };
    }).permissions;
    if (!perms?.query) return 'unsupported';
    const status = await perms.query({ name: 'microphone' });
    return status?.state ?? 'unknown';
  } catch {
    // Some engines reject the 'microphone' descriptor — not a failure signal.
    return 'unsupported';
  }
}

async function probeMicCapture(): Promise<string> {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) return 'unsupported';
  try {
    const stream = await md.getUserMedia({ audio: true });
    // Release the mic immediately — we only needed to know it opens.
    stream.getTracks().forEach((track) => track.stop());
    return 'success';
  } catch (err) {
    const name = (err as DOMException)?.name;
    return name || String(err);
  }
}

/**
 * Gather the full capability report. Call from a user-gesture handler so the
 * getUserMedia permission prompt is allowed to appear.
 */
export async function runVoiceProbe(): Promise<VoiceProbeResult> {
  const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices;
  const hasGetUserMedia = hasMediaDevices && !!navigator.mediaDevices.getUserMedia;

  const [micPermissionState, micCaptureResult, voices] = await Promise.all([
    probeMicPermissionState(),
    probeMicCapture(),
    ensureVoicesReady().catch(() => [] as SpeechSynthesisVoice[]),
  ]);

  const langPrefix = localeLangPrefix(getLocale());
  const voiceLangs = Array.from(new Set(voices.map((v) => v.lang))).slice(0, 24);
  const localeVoiceAvailable = voices.some((v) => v.lang?.toLowerCase().startsWith(langPrefix.toLowerCase()));

  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };

  return {
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a',
    secureContext: typeof window !== 'undefined' ? window.isSecureContext === true : false,
    inIframe: detectInIframe(),
    hasMediaDevices,
    hasGetUserMedia,
    micPermissionState,
    micCaptureResult,
    hasSpeechRecognition: !!(w.SpeechRecognition || w.webkitSpeechRecognition),
    hasSpeechSynthesis,
    voiceCount: voices.length,
    voiceLangs,
    localeVoiceAvailable,
  };
}

/** Human/agent-readable multi-line report, copyable from the probe page. */
export function formatProbeReport(r: VoiceProbeResult): string {
  return [
    'Voice Capability Probe',
    `time: ${r.timestamp}`,
    `userAgent: ${r.userAgent}`,
    `secureContext: ${r.secureContext}`,
    `inIframe: ${r.inIframe}`,
    `mediaDevices: ${r.hasMediaDevices}`,
    `getUserMedia present: ${r.hasGetUserMedia}`,
    `mic permission state: ${r.micPermissionState}`,
    `mic capture result: ${r.micCaptureResult}`,
    `SpeechRecognition (STT): ${r.hasSpeechRecognition}`,
    `speechSynthesis (TTS): ${r.hasSpeechSynthesis}`,
    `local voice count: ${r.voiceCount}`,
    `locale voice available: ${r.localeVoiceAvailable}`,
    `voice langs: ${r.voiceLangs.join(', ') || '(none)'}`,
  ].join('\n');
}
