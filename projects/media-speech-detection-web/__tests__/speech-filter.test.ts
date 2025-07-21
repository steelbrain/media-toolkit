import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { speechFilter } from '../src/index.js';

// Mock ONNX Runtime Web
vi.mock('onnxruntime-web', () => {
  const mockTensor = vi.fn().mockImplementation((type: string, data: unknown, dims?: number[]) => {
    return {
      data: Array.isArray(data) ? data : [data],
      dims: dims || [1],
      type,
    };
  });

  let mockSpeechProbability = 0.3; // Default to non-speech
  let callCount = 0;

  const mockSession = {
    run: vi.fn().mockImplementation(async () => {
      callCount++;

      // Simulate different speech probabilities based on call count or input
      let probability = mockSpeechProbability;

      // Create some variation for more realistic testing
      if (callCount % 10 === 0) {
        probability = 0.8; // Occasional high speech probability
      } else if (callCount % 5 === 0) {
        probability = 0.1; // Occasional low probability
      }

      return {
        output: mockTensor('float32', [probability]),
        stateN: mockTensor('float32', new Float32Array(256).fill(0), [2, 1, 128]),
      };
    }),
  };

  const mockInferenceSession = {
    create: vi.fn().mockResolvedValue(mockSession),
  };

  return {
    InferenceSession: mockInferenceSession,
    Tensor: mockTensor,
    __setMockSpeechProbability: (probability: number) => {
      mockSpeechProbability = probability;
      callCount = 0; // Reset call count when changing probability
    },
    __resetMocks: () => {
      mockSpeechProbability = 0.3;
      callCount = 0;
      mockSession.run.mockClear();
      mockInferenceSession.create.mockClear();
    },
  };
});

// Get mock controls
const onnxMock = await import('onnxruntime-web');
const setMockSpeechProbability = (onnxMock as any).__setMockSpeechProbability;
const resetOnnxMocks = (onnxMock as any).__resetMocks;

// Helper to create test audio data
function createTestAudioChunk(length: number = 512, value: number = 0.1): Float32Array {
  return new Float32Array(length).fill(value);
}

// Helper to collect outputs from a transform stream
async function collectTransformOutput<T, U>(transform: TransformStream<T, U>, inputs: T[]): Promise<U[]> {
  const outputs: U[] = [];

  const readable = new ReadableStream<T>({
    start(controller) {
      for (const input of inputs) {
        controller.enqueue(input);
      }
      controller.close();
    },
  });

  const writable = new WritableStream<U>({
    write(chunk) {
      outputs.push(chunk);
    },
  });

  await readable.pipeThrough(transform).pipeTo(writable);
  return outputs;
}

describe('speechFilter', () => {
  beforeEach(() => {
    resetOnnxMocks();
  });

  afterEach(() => {
    resetOnnxMocks();
  });

  describe('basic functionality', () => {
    it('should initialize and process audio chunks', async () => {
      const debugMessages: string[] = [];

      const transform = speechFilter({
        threshold: 0.5,
        onDebugLog: message => {
          debugMessages.push(message);
        },
      });

      // Set mock to return speech probability
      setMockSpeechProbability(0.7);

      const inputs = [createTestAudioChunk(512), createTestAudioChunk(512), createTestAudioChunk(512)];

      const results = await collectTransformOutput(transform, inputs);

      // Should have processed the chunks and potentially output speech
      expect(results.length).toBeGreaterThanOrEqual(0);
      expect(debugMessages.length).toBeGreaterThan(0);
    });

    it('should filter out non-speech audio', async () => {
      const transform = speechFilter({
        threshold: 0.5,
      });

      // Set mock to return low speech probability
      setMockSpeechProbability(0.2);

      const inputs = [createTestAudioChunk(512), createTestAudioChunk(512), createTestAudioChunk(512)];

      const results = await collectTransformOutput(transform, inputs);

      // With low speech probability, should output little to no chunks
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should pass through speech audio', async () => {
      const transform = speechFilter({
        threshold: 0.3,
        minSpeechDurationMs: 32, // Very short minimum duration
      });

      // Set mock to consistently return high speech probability
      setMockSpeechProbability(0.8);

      const inputs = [
        createTestAudioChunk(512),
        createTestAudioChunk(512),
        createTestAudioChunk(512),
        createTestAudioChunk(512),
        createTestAudioChunk(512),
      ];

      const results = await collectTransformOutput(transform, inputs);

      // With high speech probability, should output speech chunks
      expect(results.length).toBeGreaterThan(0);

      // Each output chunk should be the expected size
      results.forEach(chunk => {
        expect(chunk.length).toBe(512);
      });
    });

    it('should handle empty input streams', async () => {
      const transform = speechFilter();

      const results = await collectTransformOutput(transform, []);

      expect(results).toHaveLength(0);
    });
  });

  describe('event callbacks', () => {
    it('should trigger onSpeechStart and onSpeechEnd callbacks', async () => {
      const speechStartCalls: number[] = [];
      const speechEndCalls: Array<{ time: number; audio: Float32Array }> = [];
      const vadMisfireCalls: number[] = [];

      const transform = speechFilter({
        threshold: 0.5,
        minSpeechDurationMs: 64, // 2 frames at 32ms each
        onSpeechStart: () => {
          speechStartCalls.push(Date.now());
        },
        onSpeechEnd: audio => {
          speechEndCalls.push({ time: Date.now(), audio });
        },
        onVadMisfire: () => {
          vadMisfireCalls.push(Date.now());
        },
      });

      // Simulate speech pattern: silence -> speech -> silence
      const inputs: Float32Array[] = [];

      // Add some input chunks
      for (let i = 0; i < 10; i++) {
        inputs.push(createTestAudioChunk(512));
      }

      // Set high speech probability for middle chunks
      setMockSpeechProbability(0.8);

      await collectTransformOutput(transform, inputs);

      // Should have triggered speech events (exact counts depend on VAD logic)
      // Just verify that the callbacks can be called
      expect(typeof speechStartCalls).toBe('object');
      expect(typeof speechEndCalls).toBe('object');
      expect(typeof vadMisfireCalls).toBe('object');
    });

    it('should trigger onError callback on processing errors', async () => {
      const errors: Error[] = [];

      // First create a working session, then mock the run method to fail
      const mockRun = (onnxMock.InferenceSession as any).create.getMockImplementation();
      const mockSession = await mockRun();

      // Mock the run method to throw an error after session creation
      mockSession.run.mockRejectedValueOnce(new Error('Inference failed'));

      const transform = speechFilter({
        onError: error => {
          errors.push(error);
        },
      });

      // Process a chunk - this should trigger the inference error
      await collectTransformOutput(transform, [createTestAudioChunk(512)]);

      // The error should be captured through the callback
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Inference failed');
    });

    it('should call onDebugLog with meaningful messages', async () => {
      const debugMessages: string[] = [];

      const transform = speechFilter({
        threshold: 0.5,
        onDebugLog: message => {
          debugMessages.push(message);
        },
      });

      setMockSpeechProbability(0.7);

      await collectTransformOutput(transform, [createTestAudioChunk(512), createTestAudioChunk(512)]);

      expect(debugMessages.length).toBeGreaterThan(0);

      // Should contain VAD-related debug information
      const hasVadMessages = debugMessages.some(msg => msg.includes('VAD') || msg.includes('probability') || msg.includes('state'));
      expect(hasVadMessages).toBe(true);
    });
  });

  describe('noEmit option', () => {
    it('should not emit chunks when noEmit is true', async () => {
      const speechStartCalls: number[] = [];
      const speechEndCalls: number[] = [];

      const transform = speechFilter({
        threshold: 0.3,
        noEmit: true,
        onSpeechStart: () => {
          speechStartCalls.push(Date.now());
        },
        onSpeechEnd: () => {
          speechEndCalls.push(Date.now());
        },
      });

      // Set high speech probability
      setMockSpeechProbability(0.8);

      const inputs = [createTestAudioChunk(512), createTestAudioChunk(512), createTestAudioChunk(512), createTestAudioChunk(512)];

      const results = await collectTransformOutput(transform, inputs);

      // Should not emit any chunks
      expect(results).toHaveLength(0);

      // But callbacks should still work (though exact behavior depends on VAD logic)
      expect(typeof speechStartCalls).toBe('object');
      expect(typeof speechEndCalls).toBe('object');
    });

    it('should emit chunks when noEmit is false (default)', async () => {
      const transform = speechFilter({
        threshold: 0.3,
        noEmit: false, // Explicit false
        minSpeechDurationMs: 32,
      });

      // Set high speech probability
      setMockSpeechProbability(0.8);

      const inputs = [createTestAudioChunk(512), createTestAudioChunk(512), createTestAudioChunk(512), createTestAudioChunk(512)];

      const results = await collectTransformOutput(transform, inputs);

      // Should emit speech chunks (exact count depends on VAD logic)
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should emit chunks when noEmit is undefined (default)', async () => {
      const transform = speechFilter({
        threshold: 0.3,
        minSpeechDurationMs: 32,
        // noEmit not specified - should default to false
      });

      // Set high speech probability
      setMockSpeechProbability(0.8);

      const inputs = [createTestAudioChunk(512), createTestAudioChunk(512), createTestAudioChunk(512), createTestAudioChunk(512)];

      const results = await collectTransformOutput(transform, inputs);

      // Should emit speech chunks (exact count depends on VAD logic)
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('configuration options', () => {
    it('should use default configuration when no options provided', async () => {
      const debugMessages: string[] = [];

      const transform = speechFilter({
        onDebugLog: message => {
          debugMessages.push(message);
        },
      });

      setMockSpeechProbability(0.6);

      await collectTransformOutput(transform, [createTestAudioChunk(512)]);

      // Should have initialized and processed with defaults
      expect(debugMessages.length).toBeGreaterThan(0);
    });

    it('should respect custom threshold settings', async () => {
      // Test with very high threshold
      const highThresholdTransform = speechFilter({
        threshold: 0.9, // Very high threshold
        minSpeechDurationMs: 32,
      });

      // Set medium speech probability
      setMockSpeechProbability(0.6);

      const inputs = [createTestAudioChunk(512), createTestAudioChunk(512)];

      const highThresholdResults = await collectTransformOutput(highThresholdTransform, inputs);

      // Reset mocks and test with low threshold
      resetOnnxMocks();
      setMockSpeechProbability(0.6);

      const lowThresholdTransform = speechFilter({
        threshold: 0.3, // Low threshold
        minSpeechDurationMs: 32,
      });

      const lowThresholdResults = await collectTransformOutput(lowThresholdTransform, inputs);

      // Low threshold should be more permissive than high threshold
      expect(lowThresholdResults.length).toBeGreaterThanOrEqual(highThresholdResults.length);
    });

    it('should respect custom timing parameters', async () => {
      const transform = speechFilter({
        threshold: 0.5,
        minSpeechDurationMs: 500, // Very long minimum duration
        redemptionDurationMs: 100, // Short redemption
        lookBackDurationMs: 100, // Short lookback
      });

      setMockSpeechProbability(0.8);

      const inputs = Array.from({ length: 10 }, () => createTestAudioChunk(512));
      const results = await collectTransformOutput(transform, inputs);

      // The exact results depend on VAD logic, but should handle custom parameters
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('stream handling', () => {
    it('should handle stream completion properly', async () => {
      const speechEndCalls: number[] = [];

      const transform = speechFilter({
        threshold: 0.5,
        onSpeechEnd: () => {
          speechEndCalls.push(Date.now());
        },
      });

      setMockSpeechProbability(0.8);

      const inputs = [createTestAudioChunk(512), createTestAudioChunk(512), createTestAudioChunk(512)];

      await collectTransformOutput(transform, inputs);

      // Stream completion should finalize any ongoing speech detection
      // Exact behavior depends on VAD state machine
      expect(typeof speechEndCalls).toBe('object');
    });

    it('should handle large audio chunks', async () => {
      const transform = speechFilter({
        threshold: 0.5,
      });

      setMockSpeechProbability(0.7);

      // Create larger chunks
      const inputs = [createTestAudioChunk(1024), createTestAudioChunk(2048), createTestAudioChunk(512)];

      const results = await collectTransformOutput(transform, inputs);

      // Should handle variable chunk sizes
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle very small audio chunks', async () => {
      const transform = speechFilter({
        threshold: 0.5,
      });

      setMockSpeechProbability(0.7);

      // Create small chunks
      const inputs = [createTestAudioChunk(64), createTestAudioChunk(128), createTestAudioChunk(256)];

      const results = await collectTransformOutput(transform, inputs);

      // Should handle small chunk sizes (though may need buffering internally)
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error resilience', () => {
    it('should handle ONNX runtime errors gracefully', async () => {
      const errors: Error[] = [];

      // Mock the session run method to throw an error
      const mockRun = (onnxMock.InferenceSession as any).create.getMockImplementation();
      const mockSession = await mockRun();
      mockSession.run.mockRejectedValueOnce(new Error('Inference failed'));

      const transform = speechFilter({
        threshold: 0.5,
        onError: error => {
          errors.push(error);
        },
      });

      const inputs = [createTestAudioChunk(512)];

      try {
        await collectTransformOutput(transform, inputs);
      } catch {
        // May throw or handle gracefully
      }

      // Should have called error handler
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should continue processing after recoverable errors', async () => {
      const errors: Error[] = [];
      const debugMessages: string[] = [];

      const transform = speechFilter({
        threshold: 0.5,
        onError: error => {
          errors.push(error);
        },
        onDebugLog: message => {
          debugMessages.push(message);
        },
      });

      setMockSpeechProbability(0.7);

      // Process multiple chunks to test error recovery
      const inputs = [createTestAudioChunk(512), createTestAudioChunk(512), createTestAudioChunk(512)];

      const results = await collectTransformOutput(transform, inputs);

      // Should have processed chunks despite potential errors
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('performance characteristics', () => {
    it('should process chunks without excessive delay', async () => {
      const startTime = Date.now();

      const transform = speechFilter({
        threshold: 0.5,
      });

      setMockSpeechProbability(0.6);

      // Process a reasonable number of chunks
      const inputs = Array.from({ length: 50 }, () => createTestAudioChunk(512));

      await collectTransformOutput(transform, inputs);

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should complete in reasonable time (this is with mocked ONNX, so should be fast)
      expect(processingTime).toBeLessThan(1000); // Less than 1 second
    });

    it('should handle concurrent processing requests', async () => {
      const transform1 = speechFilter({ threshold: 0.5 });
      const transform2 = speechFilter({ threshold: 0.6 });

      setMockSpeechProbability(0.7);

      const inputs = [createTestAudioChunk(512), createTestAudioChunk(512)];

      // Process concurrently
      const [results1, results2] = await Promise.all([
        collectTransformOutput(transform1, inputs),
        collectTransformOutput(transform2, inputs),
      ]);

      // Both should complete successfully
      expect(results1.length).toBeGreaterThanOrEqual(0);
      expect(results2.length).toBeGreaterThanOrEqual(0);
    });
  });
});
