// Simple AudioWorklet processor for processing audio at 16kHz with volume gain
class ResamplerProcessor extends AudioWorkletProcessor {
  private gain: number;
  private channelId: number;

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    // Get gain from processor options, default to 1.0 (no change)
    this.gain = options?.processorOptions?.gain ?? 1.0;
    // Get channel ID from processor options, default to 0 (first channel)
    this.channelId = options?.processorOptions?.channelId ?? 0;
  }

  process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: { [name: string]: Float32Array }): boolean {
    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }

    // Ensure the requested channel exists
    if (this.channelId >= input.length) {
      // If requested channel doesn't exist, fallback to first channel
      this.channelId = 0;
    }

    // Process only the specified channel
    const channelData = input[this.channelId];
    if (channelData && channelData.length > 0) {
      // Apply volume gain if not 1.0 (optimization: skip multiplication when no gain change)
      let processedData: Float32Array;
      if (this.gain !== 1.0) {
        // Create new array and apply gain
        processedData = new Float32Array(channelData.length);
        for (let i = 0; i < channelData.length; i++) {
          processedData[i] = channelData[i] * this.gain;
        }
      } else {
        // No gain change, pass through original data
        processedData = channelData;
      }

      this.port.postMessage({
        type: 'audioData',
        data: processedData,
        channel: this.channelId,
      });
    }

    return true;
  }
}

registerProcessor('resampler-processor', ResamplerProcessor);
