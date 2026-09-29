export interface VoiceRuntime {
  analyser: AnalyserNode | null;
  capture: AudioWorkletNode | null;
  context: AudioContext | null;
  playbackCursor: number;
  playbackSources: Set<AudioBufferSourceNode>;
  silentGain: GainNode | null;
  socket: WebSocket | null;
  socketCleanup: (() => void) | null;
  source: MediaStreamAudioSourceNode | null;
  stream: MediaStream | null;
}

export function createVoiceRuntime(): VoiceRuntime {
  return {
    analyser: null,
    capture: null,
    context: null,
    playbackCursor: 0,
    playbackSources: new Set(),
    silentGain: null,
    socket: null,
    socketCleanup: null,
    source: null,
    stream: null,
  };
}

export function stopVoicePlayback(runtime: VoiceRuntime) {
  for (const source of runtime.playbackSources) {
    try { source.stop(); } catch { /* The source already ended. */ }
  }
  runtime.playbackSources.clear();
  if (runtime.context) runtime.playbackCursor = runtime.context.currentTime;
}

export function cleanupVoiceRuntime(runtime: VoiceRuntime, closeSocket = true) {
  stopVoicePlayback(runtime);
  runtime.capture?.port.close();
  runtime.capture?.disconnect();
  runtime.source?.disconnect();
  runtime.analyser?.disconnect();
  runtime.silentGain?.disconnect();
  runtime.socketCleanup?.();
  for (const track of runtime.stream?.getTracks() ?? []) track.stop();
  if (closeSocket && runtime.socket && runtime.socket.readyState < WebSocket.CLOSING) {
    runtime.socket.close(1000, "voice cleanup");
  }
  if (runtime.context && runtime.context.state !== "closed") void runtime.context.close();
}

export async function beginPcmCapture(
  runtime: VoiceRuntime,
  onSamples: (samples: Float32Array) => void,
  isCurrent: () => boolean,
) {
  if (!runtime.context || !runtime.stream || runtime.capture) return;
  const audioWorklet = (runtime.context as unknown as { audioWorklet?: AudioWorklet }).audioWorklet;
  if (!audioWorklet || typeof AudioWorkletNode === "undefined") {
    throw new Error("Este navegador no admite captura de audio en tiempo real.");
  }
  await audioWorklet.addModule("/static/pcm-capture-worklet.js?v=1");
  if (!isCurrent()) return;
  runtime.source = runtime.context.createMediaStreamSource(runtime.stream);
  runtime.analyser = runtime.context.createAnalyser();
  runtime.analyser.fftSize = 256;
  runtime.analyser.smoothingTimeConstant = 0.72;
  runtime.capture = new AudioWorkletNode(runtime.context, "pcm-capture");
  runtime.silentGain = runtime.context.createGain();
  runtime.silentGain.gain.value = 0;
  runtime.capture.port.onmessage = (event: MessageEvent<Float32Array>) => onSamples(event.data);
  runtime.source.connect(runtime.analyser);
  runtime.analyser.connect(runtime.capture);
  runtime.capture.connect(runtime.silentGain);
  runtime.silentGain.connect(runtime.context.destination);
}

export function enqueuePcm(runtime: VoiceRuntime, data: ArrayBuffer, sampleRate: number, onEnded: () => void) {
  if (!runtime.context) return;
  const pcm = new Int16Array(data);
  const buffer = runtime.context.createBuffer(1, pcm.length, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < pcm.length; index += 1) channel[index] = (pcm[index] ?? 0) / 0x8000;
  const source = runtime.context.createBufferSource();
  source.buffer = buffer;
  source.connect(runtime.context.destination);
  runtime.playbackCursor = Math.max(runtime.context.currentTime, runtime.playbackCursor);
  source.start(runtime.playbackCursor);
  runtime.playbackCursor += buffer.duration;
  runtime.playbackSources.add(source);
  source.addEventListener("ended", () => {
    runtime.playbackSources.delete(source);
    onEnded();
  }, { once: true });
}
