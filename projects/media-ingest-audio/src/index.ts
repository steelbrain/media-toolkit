/**
 * Recommended audio constraints for optimal audio processing
 */
export const RECOMMENDED_AUDIO_CONSTRAINTS: MediaTrackConstraints = Object.freeze({
  sampleRate: 16000,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true
});

/**
 * Converts a MediaStream into a ReadableStream of 16kHz audio data
 */
export async function ingestAudioStream(mediaStream: MediaStream): Promise<ReadableStream<Float32Array>> {
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
    start: async (controller) => {

      try {
        // Use 16kHz sample rate like the example snippet
        audioContext = new AudioContext({ sampleRate: 16000 });

        // Load the AudioWorklet module
        await audioContext.audioWorklet.addModule(new URL('./audio-processor', import.meta.url));

        // Create the worklet node
        workletNode = new AudioWorkletNode(audioContext, 'resampler-processor');

        // Listen for processed audio data
        workletNode.port.onmessage = (event) => {
          if (event.data.type === 'audioData') {
            controller.enqueue(event.data.data);
          }
        };

        // Connect the MediaStream to the worklet
        const source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(workletNode);

        // Connect to destination to keep the graph alive
        workletNode.connect(audioContext.destination);

      } catch (error) {
        console.error('Failed to setup AudioWorklet:', error);
        throw new Error('AudioWorklet setup failed: ' + (error as Error).message);
      }
    },
    cancel: () => {
      cleanup();
    }
  });
}
