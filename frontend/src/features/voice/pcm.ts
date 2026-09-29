export function encodePcm16(samples: Float32Array, inputRate: number, outputRate = 16_000) {
  const downsampled = downsample(samples, inputRate, outputRate);
  const pcm = new Int16Array(downsampled.length);
  for (let index = 0; index < downsampled.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, downsampled[index] ?? 0));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm.buffer;
}

function downsample(samples: Float32Array, inputRate: number, outputRate: number) {
  if (inputRate <= outputRate) return samples;
  const ratio = inputRate / outputRate;
  const result = new Float32Array(Math.round(samples.length / ratio));
  for (let index = 0; index < result.length; index += 1) {
    const start = Math.round(index * ratio);
    const end = Math.min(samples.length, Math.round((index + 1) * ratio));
    let sum = 0;
    for (let offset = start; offset < end; offset += 1) sum += samples[offset] ?? 0;
    result[index] = sum / Math.max(1, end - start);
  }
  return result;
}
