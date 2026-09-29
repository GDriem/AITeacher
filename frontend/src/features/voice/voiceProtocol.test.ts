import { describe, expect, it } from "vitest";

import { encodePcm16 } from "./pcm";
import { initialVoiceState, voiceReducer } from "./voiceMachine";
import { parseVoiceServerMessage } from "./voiceProtocol";

describe("protocolo público de voz", () => {
  it("tipa mensajes válidos y rechaza mensajes desconocidos", () => {
    expect(parseVoiceServerMessage('{"type":"ready","sample_rate":24000,"supports_interruption":true}')).toEqual({
      type: "ready",
      sampleRate: 24_000,
      supportsInterruption: true,
    });
    expect(parseVoiceServerMessage('{"type":"transcript","role":"tutor","text":"  Hola  "}')).toEqual({
      type: "transcript",
      role: "tutor",
      text: "Hola",
    });
    expect(parseVoiceServerMessage('{"type":"otro"}')).toBeNull();
    expect(parseVoiceServerMessage("sin json")).toBeNull();
  });

  it("recorre la máquina explícita y conserva transcripciones incrementales", () => {
    const connecting = voiceReducer(initialVoiceState, { type: "connect" });
    const listening = voiceReducer(connecting, { type: "listen" });
    const responding = voiceReducer(listening, { type: "respond" });
    const first = voiceReducer(responding, { type: "transcript", role: "tutor", text: "Los embeddings" });
    const second = voiceReducer(first, { type: "transcript", role: "tutor", text: "conservan significado" });
    const failed = voiceReducer(second, { type: "fail", message: "Sin conexión" });

    expect([connecting.phase, listening.phase, responding.phase, failed.phase]).toEqual([
      "connecting", "listening", "responding", "error",
    ]);
    expect(second.transcript.tutor).toBe("Los embeddings conservan significado");
    expect(failed.error).toBe("Sin conexión");
    expect(voiceReducer(failed, { type: "disconnect" })).toEqual(initialVoiceState);
  });

  it("reduce muestras y limita PCM a 16 bits", () => {
    const encoded = new Int16Array(encodePcm16(new Float32Array([-2, -1, 0, 1, 2, 0]), 48_000));
    expect(encoded.length).toBe(2);
    expect(encoded[0]).toBeLessThan(0);
    expect(encoded[1]).toBeGreaterThan(0);
  });
});
