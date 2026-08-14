import { useCallback, useEffect, useReducer, useRef } from "react";

import { encodePcm16 } from "./pcm";
import {
  beginPcmCapture,
  cleanupVoiceRuntime,
  createVoiceRuntime,
  enqueuePcm,
  stopVoicePlayback,
  type VoiceRuntime,
} from "./voiceAudioRuntime";
import { initialVoiceState, voiceReducer, type VoicePhase } from "./voiceMachine";
import { parseVoiceServerMessage } from "./voiceProtocol";

export function useVoiceSession(studentId: string, sessionId: string | null) {
  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const runtimeRef = useRef<VoiceRuntime>(createVoiceRuntime());
  const runRef = useRef(0);
  const stoppingRef = useRef(false);
  const mutedRef = useRef(false);
  const outputSampleRateRef = useRef(24_000);
  const phaseRef = useRef<VoicePhase>("disconnected");
  const moveTo = useCallback((phase: "connecting" | "listening" | "responding") => {
    if (phaseRef.current === phase) return;
    phaseRef.current = phase;
    dispatch({ type: phase === "connecting" ? "connect" : phase === "listening" ? "listen" : "respond" });
  }, []);

  const stopPlayback = useCallback(() => {
    stopVoicePlayback(runtimeRef.current);
  }, []);

  const cleanup = useCallback((closeSocket = true) => {
    stoppingRef.current = true;
    cleanupVoiceRuntime(runtimeRef.current, closeSocket);
    runtimeRef.current = createVoiceRuntime();
  }, []);

  const fail = useCallback((runId: number, message: string) => {
    if (runId !== runRef.current) return;
    runRef.current += 1;
    cleanup();
    phaseRef.current = "error";
    dispatch({ type: "fail", message });
  }, [cleanup]);

  const playPcm = useCallback((runId: number, data: ArrayBuffer) => {
    if (runId !== runRef.current) return;
    const runtime = runtimeRef.current;
    enqueuePcm(runtime, data, outputSampleRateRef.current, () => {
      if (runId === runRef.current && runtime.playbackSources.size === 0) moveTo("listening");
    });
    moveTo("responding");
  }, [moveTo]);

  const beginCapture = useCallback(async (runId: number) => {
    const runtime = runtimeRef.current;
    await beginPcmCapture(
      runtime,
      (samples) => {
        const socket = runtime.socket;
        if (runId !== runRef.current || mutedRef.current || socket?.readyState !== WebSocket.OPEN) return;
        socket.send(encodePcm16(samples, runtime.context?.sampleRate ?? 48_000));
      },
      () => runId === runRef.current,
    );
    if (runId !== runRef.current) return;
  }, []);

  const connect = useCallback(async () => {
    runRef.current += 1;
    cleanup();
    const runId = runRef.current;
    stoppingRef.current = false;
    mutedRef.current = false;
    moveTo("connecting");
    try {
      const mediaDevices = (navigator as unknown as { mediaDevices?: MediaDevices }).mediaDevices;
      if (!mediaDevices) throw new Error("Este navegador no permite usar el micrófono.");
      const stream = await mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (runId !== runRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      const context = new AudioContext({ latencyHint: "interactive" });
      runtimeRef.current.stream = stream;
      runtimeRef.current.context = context;
      await context.resume();
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const params = new URLSearchParams({ student_id: studentId });
      if (sessionId) params.set("session_id", sessionId);
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws/live?${params.toString()}`);
      runtimeRef.current.socket = socket;
      socket.binaryType = "arraybuffer";
      const handleMessage = (event: MessageEvent) => {
        if (event.data instanceof ArrayBuffer) {
          playPcm(runId, event.data);
          return;
        }
        if (typeof event.data !== "string") {
          fail(runId, "Recibimos audio en un formato inesperado.");
          return;
        }
        const message = parseVoiceServerMessage(event.data);
        if (!message) {
          fail(runId, "Recibimos una respuesta de voz que no pudimos procesar.");
          return;
        }
        if (message.type === "ready") {
          outputSampleRateRef.current = message.sampleRate;
          void beginCapture(runId).then(
            () => moveTo("listening"),
            (error: unknown) => fail(runId, error instanceof Error ? error.message : "No pudimos iniciar el micrófono."),
          );
        } else if (message.type === "transcript") {
          dispatch({ type: "transcript", role: message.role, text: message.text });
          moveTo(message.role === "tutor" ? "responding" : "listening");
        } else if (message.type === "interrupted") {
          stopPlayback();
          moveTo("listening");
        } else if (message.type === "turn_complete") {
          moveTo(runtimeRef.current.playbackSources.size > 0 ? "responding" : "listening");
        } else {
          fail(runId, message.message);
        }
      };
      const handleError = () => fail(runId, "No pudimos conectar la conversación por voz.");
      const handleClose = (event: CloseEvent) => {
        if (stoppingRef.current || runId !== runRef.current) return;
        fail(runId, event.code === 4401
          ? "Tu sesión expiró. Vuelve a identificarte antes de usar voz."
          : "La conversación por voz se desconectó.");
      };
      socket.addEventListener("message", handleMessage);
      socket.addEventListener("error", handleError, { once: true });
      socket.addEventListener("close", handleClose, { once: true });
      runtimeRef.current.socketCleanup = () => {
        socket.removeEventListener("message", handleMessage);
        socket.removeEventListener("error", handleError);
        socket.removeEventListener("close", handleClose);
      };
    } catch (error) {
      const message = error instanceof DOMException && error.name === "NotAllowedError"
        ? "Necesitamos permiso para usar el micrófono."
        : error instanceof Error ? error.message : "No pudimos preparar el audio.";
      fail(runId, message);
    }
  }, [beginCapture, cleanup, fail, moveTo, playPcm, sessionId, stopPlayback, studentId]);

  useEffect(() => {
    void connect();
    return () => {
      runRef.current += 1;
      cleanup();
    };
  }, [connect, cleanup]);

  return {
    state,
    reconnect: connect,
    toggleMute: () => {
      const muted = !state.muted;
      mutedRef.current = muted;
      for (const track of runtimeRef.current.stream?.getAudioTracks() ?? []) track.enabled = !muted;
      dispatch({ type: "mute", muted });
    },
    interrupt: () => {
      stopPlayback();
      moveTo("listening");
    },
    end: () => {
      runRef.current += 1;
      const socket = runtimeRef.current.socket;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "stop_audio" }));
      cleanup();
      mutedRef.current = false;
      phaseRef.current = "disconnected";
      dispatch({ type: "disconnect" });
    },
  };
}
