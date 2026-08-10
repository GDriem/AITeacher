class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.batchSize = 2048;
    this.batch = new Float32Array(this.batchSize);
    this.offset = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let index = 0; index < channel.length; index += 1) {
      this.batch[this.offset] = channel[index];
      this.offset += 1;
      if (this.offset === this.batchSize) {
        const completed = this.batch;
        this.port.postMessage(completed, [completed.buffer]);
        this.batch = new Float32Array(this.batchSize);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
