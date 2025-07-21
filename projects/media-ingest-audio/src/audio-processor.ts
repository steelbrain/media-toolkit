// Simple AudioWorklet processor for processing audio at 16kHz
class ResamplerProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: {[name: string]: Float32Array}): boolean {
    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }

    // Pass through the audio data - AudioContext handles 16kHz conversion
    for (let channel = 0; channel < input.length; channel++) {
      const channelData = input[channel];
      if (channelData.length > 0) {
        this.port.postMessage({
          type: 'audioData',
          data: channelData,
          channel: channel
        });
      }
    }

    return true;
  }
}

registerProcessor('resampler-processor', ResamplerProcessor);
