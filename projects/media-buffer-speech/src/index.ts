/**
 * Configuration options for pause detection
 */
export interface BufferSpeechOptions {
  /** Duration in seconds to wait for pause before releasing buffer. Default: 2.0 */
  durationSeconds?: number;
  /** Maximum buffer duration in seconds before triggering overflow warning. Default: 60.0 */
  maxBufferSeconds?: number;
  /** Called when buffer overflow or other errors occur */
  onError?: (error: Error) => void;
  /** Called for debug information and internal state logging */
  onDebugLog?: (message: string) => void;
  /** If true, don't emit buffered chunks downstream. Only trigger onBuffered callback. Default: false */
  noEmit?: boolean;
  /** Called when buffer is ready to be processed (after pause detected). Use with noEmit for .tee() patterns */
  onBuffered?: () => void;
}

/**
 * Creates a TransformStream that buffers incoming chunks and releases them
 * after a configurable pause period with no new data.
 *
 * Perfect for detecting natural break points in continuous streams like speech.
 *
 * @example
 * ```typescript
 * // Wait for 2-second pause before processing
 * const pauseDetector = bufferSpeech({
 *   durationSeconds: 2.0,
 *   maxBufferSeconds: 60.0,
 *   onError: (err) => console.error('Buffer overflow:', err)
 * });
 *
 * await audioStream
 *   .pipeThrough(speechFilter())     // Filter for speech
 *   .pipeThrough(pauseDetector)      // Wait for natural pauses
 *   .pipeTo(transcriptionProcessor); // Process complete segments
 *
 * // .tee() pattern for live transcription with turn detection
 * const [liveStream, turnStream] = audioStream.tee();
 *
 * // Branch 1: Live transcription
 * liveStream.pipeThrough(speechFilter()).pipeTo(liveTranscriber);
 *
 * // Branch 2: Turn detection signaling
 * const turnDetector = bufferSpeech({
 *   durationSeconds: 3.0,
 *   noEmit: true,                    // Don't emit chunks
 *   onBuffered: () => {              // Signal when turn is complete
 *     console.log('Turn complete - process accumulated transcript');
 *     processAccumulatedTranscript();
 *   }
 * });
 * turnStream.pipeThrough(speechFilter()).pipeThrough(turnDetector);
 * ```
 */
export function bufferSpeech<T>(options: BufferSpeechOptions = {}): TransformStream<T, T[]> {
  const durationMs = (options.durationSeconds ?? 2.0) * 1000;
  const maxBufferMs = (options.maxBufferSeconds ?? 60.0) * 1000;

  let buffer: T[] = [];
  let pauseTimer: NodeJS.Timeout | null = null;
  let bufferStartTime: number | null = null;
  let chunkCount = 0;

  const debugLog = (message: string) => {
    options.onDebugLog?.(`SpeechBuffer: ${message}`);
  };

  const handleError = (message: string) => {
    const error = new Error(message);
    options.onError?.(error);
    debugLog(`Error: ${message}`);
  };

  const releaseBuffer = (controller: TransformStreamDefaultController<T[]>) => {
    if (buffer.length > 0) {
      const bufferDuration = bufferStartTime ? Date.now() - bufferStartTime : 0;
      debugLog(`Releasing buffer: ${buffer.length} chunks after ${bufferDuration}ms`);

      // Trigger callback for .tee() patterns
      options.onBuffered?.();

      // Only emit downstream if noEmit is false (default behavior)
      if (!options.noEmit) {
        controller.enqueue([...buffer]);
      }

      buffer = [];
      bufferStartTime = null;
      chunkCount = 0;
    }

    if (pauseTimer) {
      clearTimeout(pauseTimer);
      pauseTimer = null;
    }
  };

  const checkBufferOverflow = () => {
    if (bufferStartTime && Date.now() - bufferStartTime > maxBufferMs) {
      handleError(
        `Buffer overflow: ${buffer.length} chunks accumulated over ${maxBufferMs / 1000}s. ` +
          `Consider increasing maxBufferSeconds or checking for continuous input without pauses.`
      );
    }
  };

  return new TransformStream<T, T[]>({
    start: () => {
      debugLog(`Initialized with ${durationMs}ms speech buffering, ${maxBufferMs}ms max buffer`);
    },

    transform: (chunk, controller) => {
      // Initialize buffer timing on first chunk
      if (bufferStartTime === null) {
        bufferStartTime = Date.now();
        debugLog('Started new buffer');
      }

      // Add chunk to buffer
      buffer.push(chunk);
      chunkCount++;
      debugLog(`Buffered chunk ${chunkCount}, total: ${buffer.length} chunks`);

      // Check for buffer overflow
      checkBufferOverflow();

      // Clear existing timer and set new one
      if (pauseTimer) {
        clearTimeout(pauseTimer);
      }

      pauseTimer = setTimeout(() => {
        releaseBuffer(controller);
      }, durationMs);
    },

    flush: (controller) => {
      debugLog('Stream ending, releasing final buffer');
      // Release any buffered content
      releaseBuffer(controller);
    },
  });
}
