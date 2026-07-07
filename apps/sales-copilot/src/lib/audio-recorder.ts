/**
 * Microphone recorder that produces 16 kHz mono 16-bit PCM WAV (base64).
 *
 * WHY this and not MediaRecorder: MediaRecorder emits webm/opus on Android
 * Chrome, which the Azure Speech short-audio REST API does not reliably accept.
 * Capturing raw PCM via Web Audio and encoding a WAV in the browser gives a
 * deterministic format Azure always accepts (verified end-to-end). It also works
 * in the Android Power Apps WebView, where the browser's own SpeechRecognition
 * service is unavailable.
 *
 * getUserMedia MUST be called from a user gesture (the mic press), so start()
 * is invoked from the pointer-down handler.
 */

const TARGET_RATE = 16000;

export interface AudioRecording {
  /** Stop capture and return the recorded audio as a base64 WAV string. */
  stop: () => Promise<string>;
  /** Abort capture and release the mic without producing audio. */
  cancel: () => void;
}

type AudioCtor = typeof AudioContext;

function getAudioContextCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext || null;
}

/** Begin recording from the default microphone. Rejects if the mic is denied. */
export async function startRecording(): Promise<AudioRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });

  const Ctor = getAudioContextCtor();
  if (!Ctor) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('Web Audio not supported');
  }

  const ctx = new Ctor();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessorNode is deprecated but works in every WebView (unlike
  // AudioWorklet, which needs a separately-served module file).
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  // Route through a muted gain so the processor keeps firing without feeding the
  // mic back to the speakers.
  const mute = ctx.createGain();
  mute.gain.value = 0;

  const chunks: Float32Array[] = [];
  let stopped = false;
  processor.onaudioprocess = (e: AudioProcessingEvent) => {
    if (stopped) return;
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };

  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);

  const inputRate = ctx.sampleRate;

  const release = () => {
    stopped = true;
    try { processor.disconnect(); } catch { /* noop */ }
    try { mute.disconnect(); } catch { /* noop */ }
    try { source.disconnect(); } catch { /* noop */ }
    try { stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    try { void ctx.close(); } catch { /* noop */ }
  };

  return {
    cancel: release,
    stop: async () => {
      release();
      const merged = mergeChunks(chunks);
      const down = downsample(merged, inputRate, TARGET_RATE);
      const wav = encodeWav(down, TARGET_RATE);
      return arrayBufferToBase64(wav);
    },
  };
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Box-average downsample to reduce aliasing (adequate for speech). */
function downsample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate >= inRate || input.length === 0) return input;
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate = rate * blockAlign
  view.setUint16(32, 2, true); // block align = channels * bytesPerSample
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}
