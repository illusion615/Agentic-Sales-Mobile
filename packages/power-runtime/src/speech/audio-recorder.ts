const TARGET_RATE = 16000;

export interface AudioRecording {
  stop: () => Promise<string>;
  cancel: () => void;
}

type AudioCtor = typeof AudioContext;

function getAudioContextCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext ||
    null;
}

/** Record deterministic 16 kHz mono 16-bit PCM WAV for speech recognition. */
export async function startRecording(): Promise<AudioRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const Constructor = getAudioContextCtor();
  if (!Constructor) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('Web Audio not supported');
  }

  const context = new Constructor();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const mute = context.createGain();
  mute.gain.value = 0;
  const chunks: Float32Array[] = [];
  let stopped = false;

  processor.onaudioprocess = (event: AudioProcessingEvent) => {
    if (!stopped) chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);

  const release = () => {
    stopped = true;
    try { processor.disconnect(); } catch { /* noop */ }
    try { mute.disconnect(); } catch { /* noop */ }
    try { source.disconnect(); } catch { /* noop */ }
    try { stream.getTracks().forEach((track) => track.stop()); } catch { /* noop */ }
    try { void context.close(); } catch { /* noop */ }
  };

  return {
    cancel: release,
    stop: async () => {
      release();
      return arrayBufferToBase64(
        encodeWav(downsample(mergeChunks(chunks), context.sampleRate, TARGET_RATE), TARGET_RATE),
      );
    },
  };
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const output = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function downsample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (outputRate >= inputRate || input.length === 0) return input;
  const ratio = inputRate / outputRate;
  const output = new Float32Array(Math.floor(input.length / ratio));
  for (let index = 0; index < output.length; index++) {
    const start = Math.floor(index * ratio);
    const end = Math.min(Math.floor((index + 1) * ratio), input.length);
    let sum = 0;
    for (let sample = start; sample < end; sample++) sum += input[sample];
    output[index] = end > start ? sum / (end - start) : 0;
  }
  return output;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0, offset = 44; index < samples.length; index++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(binary);
}
