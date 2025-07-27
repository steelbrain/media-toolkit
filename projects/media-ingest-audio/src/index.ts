/**
 * Recommended audio constraints for optimal audio processing
 */
export const RECOMMENDED_AUDIO_CONSTRAINTS: MediaTrackConstraints = Object.freeze({
  sampleRate: 16000,
  channelCount: 1,
});

/**
 * Configuration options for audio ingestion
 */
export interface AudioIngestOptions {
  /** Volume gain multiplier. 1.0 = no change, 2.0 = double volume, 0.5 = half volume. Default: 1.0 */
  gain?: number;
  /** Audio channel index to use (0-based). Default: 0 (first channel) */
  channelId?: number;
  /** Sample rate for the AudioContext. Default: 16000 */
  sampleRate?: number;
}

/**
 * Converts a MediaStream into a ReadableStream of audio data at the specified sample rate
 *
 * @example
 * ```typescript
 * // Basic usage (defaults to first channel, 16kHz)
 * const audioStream = await ingestAudioStream(mediaStream);
 *
 * // With volume boost
 * const audioStream = await ingestAudioStream(mediaStream, { gain: 2.0 });
 *
 * // With volume reduction
 * const audioStream = await ingestAudioStream(mediaStream, { gain: 0.5 });
 *
 * // Use second channel (index 1) of stereo audio
 * const audioStream = await ingestAudioStream(mediaStream, { channelId: 1 });
 *
 * // Use custom sample rate (e.g., 48kHz)
 * const audioStream = await ingestAudioStream(mediaStream, { sampleRate: 48000 });
 *
 * // Combine options: use second channel with volume boost and custom sample rate
 * const audioStream = await ingestAudioStream(mediaStream, { gain: 2.0, channelId: 1, sampleRate: 44100 });
 * ```
 */
export async function ingestAudioStream(mediaStream: MediaStream, options: AudioIngestOptions = {}): Promise<ReadableStream<Float32Array>> {
  if (!mediaStream.getAudioTracks().length) {
    throw new Error('MediaStream must contain at least one audio track');
  }

  let audioContext: AudioContext | null = null;
  let workletNode: AudioWorkletNode | null = null;

  const cleanup = () => {
    if (workletNode) {
      workletNode.disconnect();
      workletNode = null;
    }

    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
  };

  return new ReadableStream<Float32Array>({
    start: async controller => {
      try {
        // Use configurable sample rate, default to 16kHz
        audioContext = new AudioContext({ sampleRate: options.sampleRate ?? 16000 });

        // Load the AudioWorklet module
        await audioContext.audioWorklet.addModule(new URL('./audio-processor', import.meta.url));

        // Create the worklet node with gain and channelId parameters
        workletNode = new AudioWorkletNode(audioContext, 'resampler-processor', {
          processorOptions: {
            gain: options.gain ?? 1.0,
            channelId: options.channelId ?? 0,
          },
        });

        // Listen for processed audio data
        workletNode.port.onmessage = event => {
          if (event.data.type === 'audioData') {
            try {
              controller.enqueue(event.data.data);
            } catch (error) {
              // Stream has been closed/cancelled, cleanup
              cleanup();
            }
          }
        };

        // Connect the MediaStream to the worklet
        const source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(workletNode);

        // Connect to destination to keep the graph alive
        workletNode.connect(audioContext.destination);
      } catch (error) {
        console.error('Failed to setup AudioWorklet:', error);
        throw new Error(
          `AudioWorklet setup failed: ${error != null && typeof error === 'object' && 'message' in error ? error.message : error}`
        );
      }
    },
    cancel: () => {
      cleanup();
    },
  });
}
