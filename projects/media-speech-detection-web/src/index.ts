import * as ort from 'onnxruntime-web';

/**
 * Simple VAD event handlers
 */
export interface VADEventHandlers {
  onSpeechStart?: () => void;
  onSpeechEnd?: (speechAudio: Float32Array) => void;
  onMisfire?: () => void;
  onError?: (error: Error) => void;
  onDebugLog?: (message: string) => void;
}

/**
 * Simple VAD configuration options
 */
export interface VADConfig {
  /** Speech detection threshold (0-1). Default: 0.5 */
  threshold?: number;
  /** Minimum speech duration in milliseconds. Default: 160ms */
  minSpeechDurationMs?: number;
  /** Grace period in milliseconds before confirming speech end. Default: 400ms */
  redemptionDurationMs?: number;
  /** Lookback buffer duration in milliseconds for smooth speech start. Default: 384ms */
  lookBackDurationMs?: number;
}

/**
 * Combined options for the simple VAD interface
 */
export interface VADOptions extends VADEventHandlers, VADConfig {
  /** If true, don't emit speech chunks downstream. Only trigger callbacks. Default: false */
  noEmit?: boolean;
}

/**
 * Preloads the Silero VAD ONNX model by fetching it into browser cache.
 *
 * This function fetches the VAD model file to ensure it's cached by the browser,
 * eliminating the network delay when speech detection is first used. The browser's
 * HTTP cache will handle storing and serving the model for subsequent requests.
 *
 * @returns Promise that resolves when the model file has been fetched and cached
 * @throws Error if the model file cannot be fetched
 *
 * @example
 * ```typescript
 * // Preload during app initialization
 * await preloadModel();
 *
 * // Later, speech filters will load faster from browser cache
 * const speechTransform = speechFilter({
 *   onSpeechStart: () => console.log('🎤 Speech started')
 * });
 * ```
 */
export async function preloadModel(): Promise<void> {
  try {
    const modelUrl = new URL('../silero_vad.onnx', import.meta.url).href;
    const response = await fetch(modelUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`);
    }

    // Consume the response to ensure it's fully cached
    await response.arrayBuffer();
  } catch (error) {
    throw new Error(`Failed to preload Silero VAD model: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Speech filter transform stream - filters audio to only output speech chunks
 *
 * Usage:
 * ```typescript
 * const speechTransform = speechFilter({
 *   onSpeechStart: () => console.log('🎤 Speech started'),
 *   onSpeechEnd: () => console.log('🔇 Speech ended')
 * });
 *
 * audioStream.pipeThrough(speechTransform).pipeTo(speechProcessor);
 *
 * // .tee() pattern for events-only processing
 * const [liveStream, eventsStream] = audioStream.tee();
 * liveStream.pipeTo(speechProcessor);
 * eventsStream.pipeThrough(speechFilter({
 *   noEmit: true,                      // Don't emit chunks
 *   onSpeechStart: () => showRecordingIndicator(),
 *   onSpeechEnd: () => hideRecordingIndicator()
 * }));
 * ```
 */
export function speechFilter(options: VADOptions = {}): TransformStream<Float32Array, Float32Array> {
  let vadProcessor: VADProcessor | null = null;

  return new TransformStream<Float32Array, Float32Array>({
    start: async () => {
      vadProcessor = new VADProcessor(options);
      await vadProcessor.initialize();
    },

    transform: async (chunk, controller) => {
      if (!vadProcessor) {
        throw new Error('VAD processor not initialized');
      }

      const speechChunks = await vadProcessor.processChunk(chunk);
      if (speechChunks.length > 0) {
        options.onDebugLog?.(`VAD Transform: Processing ${speechChunks.length} speech chunks`);
      }

      // Only emit chunks downstream if noEmit is false (default behavior)
      if (!options.noEmit) {
        for (const speechChunk of speechChunks) {
          controller.enqueue(speechChunk);
        }
      }
    },

    flush: async controller => {
      if (vadProcessor) {
        const finalChunks = vadProcessor.finalize();

        // Only emit final chunks if noEmit is false
        if (!options.noEmit) {
          for (const chunk of finalChunks) {
            controller.enqueue(chunk);
          }
        }

        await vadProcessor.destroy();
      }
    },
  });
}

/**
 * Internal VAD processor - simplified version of the main implementation
 */
class VADProcessor {
  // Configuration
  private readonly threshold: number;
  private readonly negativeThreshold: number;
  private readonly minSpeechFrames: number;
  private readonly redemptionFrames: number;
  private readonly lookBackFrames: number;

  // Event handlers
  private readonly eventHandlers: VADEventHandlers;

  // ONNX Runtime
  private session: ort.InferenceSession | null = null;
  private state: ort.Tensor | null = null;
  private context: Float32Array = new Float32Array(64);

  // Processing state
  private audioBuffer: Float32Array = new Float32Array(0);
  private speechBuffer: Float32Array[] = [];
  private lookBackBuffer: Float32Array[] = [];

  // VAD state machine
  private vadState: 'silent' | 'detecting' | 'speaking' | 'intermediate' = 'silent';
  private speechFrameCount: number = 0;
  private redemptionCounter: number = 0;
  private speechStartTime: number = 0;
  private frameIndex: number = 0;

  // Constants
  private readonly SAMPLE_RATE = 16000;
  private readonly FRAME_SIZE = 512;
  private readonly CONTEXT_SIZE = 64;

  constructor(options: VADOptions) {
    // Extract event handlers
    this.eventHandlers = {};
    if (options.onSpeechStart) this.eventHandlers.onSpeechStart = options.onSpeechStart;
    if (options.onSpeechEnd) this.eventHandlers.onSpeechEnd = options.onSpeechEnd;
    if (options.onMisfire) this.eventHandlers.onMisfire = options.onMisfire;
    if (options.onError) this.eventHandlers.onError = options.onError;
    if (options.onDebugLog) this.eventHandlers.onDebugLog = options.onDebugLog;

    // Convert configuration to internal units
    this.threshold = Math.max(0.01, Math.min(0.99, options.threshold ?? 0.5));
    this.negativeThreshold = Math.max(0.01, Math.min(this.threshold - 0.01, this.threshold - 0.15));
    this.minSpeechFrames = Math.max(1, Math.round((options.minSpeechDurationMs ?? 160) / 32));
    this.redemptionFrames = Math.max(1, Math.round((options.redemptionDurationMs ?? 400) / 32));
    this.lookBackFrames = Math.max(0, Math.round((options.lookBackDurationMs ?? 384) / 32)); // Default: 12 frames
  }

  async initialize(): Promise<void> {
    if (this.session) return;

    try {
      this.session = await ort.InferenceSession.create(new URL('../silero_vad.onnx', import.meta.url).href);
      this.resetState();
    } catch (error) {
      throw new Error(`Failed to initialize Silero VAD model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async processChunk(chunk: Float32Array): Promise<Float32Array[]> {
    const outputChunks: Float32Array[] = [];

    // Add to audio buffer
    this.audioBuffer = this.appendBuffer(this.audioBuffer, chunk);

    // Process complete frames
    while (this.audioBuffer.length >= this.FRAME_SIZE) {
      const frame = this.audioBuffer.slice(0, this.FRAME_SIZE);
      this.audioBuffer = this.audioBuffer.slice(this.FRAME_SIZE);

      // Maintain lookback buffer
      this.updateLookBackBuffer(frame);

      // Detect speech
      const speechProbability = await this.detectSpeech(frame);
      if (speechProbability > 0) {
        // Only log when there's some chance of speech
        this.eventHandlers.onDebugLog?.(
          `VAD: Frame ${this.frameIndex}, probability: ${speechProbability.toFixed(3)}, state: ${this.vadState}`
        );
      }
      const speechChunks = await this.handleSpeechDetection(speechProbability, frame);

      outputChunks.push(...speechChunks);
      this.frameIndex++;
    }

    return outputChunks;
  }

  finalize(): Float32Array[] {
    const outputChunks: Float32Array[] = [];

    if (this.vadState === 'speaking' || this.vadState === 'intermediate') {
      const speechDurationSeconds = (Date.now() - this.speechStartTime) / 1000;
      this.resetSpeechState();

      if (speechDurationSeconds >= (this.minSpeechFrames * this.FRAME_SIZE) / this.SAMPLE_RATE) {
        this.eventHandlers.onSpeechEnd?.(new Float32Array(0));
      } else {
        this.eventHandlers.onMisfire?.();
      }
    }

    return outputChunks;
  }

  async destroy(): Promise<void> {
    this.session = null;
    this.state = null;
    this.audioBuffer = new Float32Array(0);
    this.speechBuffer = [];
    this.lookBackBuffer = [];
    this.context.fill(0);
  }

  private resetState(): void {
    const zeros = new Float32Array(2 * 1 * 128).fill(0);
    this.state = new ort.Tensor('float32', zeros, [2, 1, 128]);
    this.context.fill(0);
    this.vadState = 'silent';
    this.speechFrameCount = 0;
    this.redemptionCounter = 0;
    this.speechStartTime = 0;
    this.frameIndex = 0;
    this.audioBuffer = new Float32Array(0);
    this.speechBuffer = [];
    this.lookBackBuffer = [];
  }

  private updateLookBackBuffer(frame: Float32Array): void {
    if (this.lookBackFrames === 0) return;

    // Only build lookback buffer during silence
    // Don't clear it during other states - it gets cleared when used
    if (this.vadState === 'silent') {
      this.lookBackBuffer.push(new Float32Array(frame));
      if (this.lookBackBuffer.length > this.lookBackFrames) {
        this.lookBackBuffer.shift();
      }
    }
  }

  private async detectSpeech(audioFrame: Float32Array): Promise<number> {
    if (!this.session || !this.state) {
      return 0;
    }

    // Create contextual frame
    const contextualFrame = new Float32Array(this.CONTEXT_SIZE + audioFrame.length);
    contextualFrame.set(this.context);
    contextualFrame.set(audioFrame, this.CONTEXT_SIZE);

    try {
      // Create input tensors
      const audioTensor = new ort.Tensor('float32', contextualFrame, [1, contextualFrame.length]);
      const srTensor = new ort.Tensor('int64', new BigInt64Array([BigInt(this.SAMPLE_RATE)]), [1]);

      // Run inference
      const results = await this.session.run({
        input: audioTensor,
        state: this.state,
        sr: srTensor,
      });

      // Update state and context
      this.state = results.stateN as ort.Tensor;
      this.context.set(contextualFrame.slice(-this.CONTEXT_SIZE));

      return (results.output as ort.Tensor).data[0] as number;
    } catch (error) {
      this.eventHandlers.onError?.(error instanceof Error ? error : new Error(String(error)));
      // Update context even on error to maintain continuity
      this.context.set(contextualFrame.slice(-this.CONTEXT_SIZE));
      return 0;
    }
  }

  private async handleSpeechDetection(probability: number, frame: Float32Array): Promise<Float32Array[]> {
    const outputChunks: Float32Array[] = [];
    const speechState = this.classifySpeechState(probability);

    switch (this.vadState) {
      case 'silent':
        if (speechState === 'speech') {
          this.vadState = 'detecting';
          this.speechFrameCount = 1;
          this.speechBuffer = [new Float32Array(frame)];
        }
        break;

      case 'detecting':
        if (speechState === 'speech') {
          this.speechFrameCount++;
          this.speechBuffer.push(new Float32Array(frame));

          if (this.speechFrameCount >= this.minSpeechFrames) {
            this.vadState = 'speaking';
            this.speechStartTime = Date.now();
            this.redemptionCounter = 0;

            // Output lookback + speech buffer (natural audio context)
            const speechFrames = [...this.lookBackBuffer, ...this.speechBuffer];
            const lookbackCount = this.lookBackBuffer.length;
            const speechCount = this.speechBuffer.length;
            this.lookBackBuffer = [];
            this.eventHandlers.onDebugLog?.(
              `VAD: Speech confirmed! Outputting ${speechFrames.length} frames (${lookbackCount} lookback + ${speechCount} speech)`
            );
            outputChunks.push(...speechFrames);
            this.speechBuffer = [];

            this.eventHandlers.onSpeechStart?.();
          }
        } else if (speechState === 'non-speech') {
          this.vadState = 'silent';
          this.speechFrameCount = 0;
          this.speechBuffer = [];
        }
        break;

      case 'speaking':
        if (speechState === 'non-speech') {
          this.vadState = 'intermediate';
          this.redemptionCounter = 1;
        } else if (speechState === 'intermediate') {
          this.vadState = 'intermediate';
          this.redemptionCounter = Math.max(1, this.redemptionCounter);
        } else {
          this.redemptionCounter = 0;
          this.eventHandlers.onDebugLog?.(`VAD: Continuing speech - outputting frame`);
          outputChunks.push(new Float32Array(frame));
        }
        break;

      case 'intermediate':
        if (speechState === 'speech') {
          this.vadState = 'speaking';
          this.redemptionCounter = 0;
          outputChunks.push(new Float32Array(frame));
        } else {
          // Continue outputting intermediate frames during redemption period
          outputChunks.push(new Float32Array(frame));
          this.redemptionCounter++;
          if (this.redemptionCounter >= this.redemptionFrames) {
            this.endSpeechSegment();
          }
        }
        break;
    }

    return outputChunks;
  }

  private classifySpeechState(probability: number): 'speech' | 'intermediate' | 'non-speech' {
    if (probability >= this.threshold) {
      return 'speech';
    } else if (probability >= this.negativeThreshold) {
      return 'intermediate';
    } else {
      return 'non-speech';
    }
  }

  private endSpeechSegment(): void {
    const speechDurationSeconds = (Date.now() - this.speechStartTime) / 1000;
    this.resetSpeechState();

    if (speechDurationSeconds >= (this.minSpeechFrames * this.FRAME_SIZE) / this.SAMPLE_RATE) {
      this.eventHandlers.onSpeechEnd?.(new Float32Array(0));
    } else {
      this.eventHandlers.onMisfire?.();
    }
  }

  private resetSpeechState(): void {
    this.vadState = 'silent';
    this.speechFrameCount = 0;
    this.redemptionCounter = 0;
    this.speechBuffer = [];
  }

  private appendBuffer(buffer: Float32Array, newData: Float32Array): Float32Array {
    if (newData.length === 0) return buffer;
    if (buffer.length === 0) return new Float32Array(newData);

    const combined = new Float32Array(buffer.length + newData.length);
    combined.set(buffer);
    combined.set(newData, buffer.length);
    return combined;
  }
}
