import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bufferSpeech } from '../src/index.js';

// Helper to create test data
function createTestChunk(value: number, length: number = 1): Float32Array {
  return new Float32Array(length).fill(value);
}

describe('bufferSpeech', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic functionality', () => {
    it('should buffer chunks and release after pause', async () => {
      const outputs: Float32Array[][] = [];
      const transform = bufferSpeech<Float32Array>({
        durationSeconds: 1.0,
      });

      const writable = new WritableStream<Float32Array[]>({
        write(chunk) {
          outputs.push(chunk);
        },
      });

      // Start the pipeline
      const pipelinePromise = new ReadableStream<Float32Array>({
        start(controller) {
          // Send 3 chunks quickly
          controller.enqueue(createTestChunk(1));
          controller.enqueue(createTestChunk(2));
          controller.enqueue(createTestChunk(3));
          controller.close();
        },
      })
        .pipeThrough(transform)
        .pipeTo(writable);

      // Fast-forward time to trigger buffer release
      await vi.advanceTimersByTimeAsync(1100);
      await pipelinePromise;

      expect(outputs).toHaveLength(1);
      expect(outputs[0]).toHaveLength(3);
      expect(outputs[0][0][0]).toBe(1);
      expect(outputs[0][1][0]).toBe(2);
      expect(outputs[0][2][0]).toBe(3);
    });

    it('should reset timer when new chunks arrive', async () => {
      const outputs: Float32Array[][] = [];
      const debugMessages: string[] = [];

      const transform = bufferSpeech<Float32Array>({
        durationSeconds: 0.5, // Shorter duration for faster test
        onDebugLog: message => {
          debugMessages.push(message);
        },
      });

      let controller: ReadableStreamDefaultController<Float32Array> | undefined;
      const readable = new ReadableStream<Float32Array>({
        start(ctrl) {
          controller = ctrl;
        },
      });

      const writable = new WritableStream<Float32Array[]>({
        write(chunk) {
          outputs.push(chunk);
        },
      });

      // Start the pipeline but don't close the stream
      const pipelinePromise = readable.pipeThrough(transform).pipeTo(writable);

      // Send first chunk
      controller?.enqueue(createTestChunk(1));
      await vi.advanceTimersByTimeAsync(10); // Small delay for processing

      // Wait 300ms - should not release yet (duration is 500ms)
      await vi.advanceTimersByTimeAsync(300);
      expect(outputs).toHaveLength(0);

      // Send second chunk - this should reset the timer
      controller?.enqueue(createTestChunk(2));
      await vi.advanceTimersByTimeAsync(10);

      // Wait another 300ms (total 600ms from first chunk, but only 300ms from second chunk)
      await vi.advanceTimersByTimeAsync(300);
      expect(outputs).toHaveLength(0); // Should not have released yet

      // Wait another 250ms (total 550ms from second chunk)
      await vi.advanceTimersByTimeAsync(250);

      // Now close the stream to complete the test
      controller?.close();
      await pipelinePromise;

      // Should have captured both chunks
      expect(outputs).toHaveLength(1);
      expect(outputs[0]).toHaveLength(2);
    });

    it('should handle empty streams', async () => {
      const outputs: Float32Array[][] = [];
      const transform = bufferSpeech<Float32Array>();

      await new ReadableStream<Float32Array>({
        start(controller) {
          controller.close();
        },
      })
        .pipeThrough(transform)
        .pipeTo(
          new WritableStream<Float32Array[]>({
            write(chunk) {
              outputs.push(chunk);
            },
          })
        );

      expect(outputs).toHaveLength(0);
    });
  });

  describe('noEmit option', () => {
    it('should not emit chunks when noEmit is true', async () => {
      const outputs: Float32Array[][] = [];
      const onBufferedCalls: number[] = [];

      const transform = bufferSpeech<Float32Array>({
        durationSeconds: 0.5,
        noEmit: true,
        onBuffered: () => {
          onBufferedCalls.push(Date.now());
        },
      });

      const pipelinePromise = new ReadableStream<Float32Array>({
        start(controller) {
          controller.enqueue(createTestChunk(1));
          controller.enqueue(createTestChunk(2));
          controller.close();
        },
      })
        .pipeThrough(transform)
        .pipeTo(
          new WritableStream<Float32Array[]>({
            write(chunk) {
              outputs.push(chunk);
            },
          })
        );

      await vi.advanceTimersByTimeAsync(600);
      await pipelinePromise;

      // Should not have emitted any chunks
      expect(outputs).toHaveLength(0);

      // But should have called onBuffered
      expect(onBufferedCalls).toHaveLength(1);
    });

    it('should emit chunks when noEmit is false (default)', async () => {
      const outputs: Float32Array[][] = [];
      const onBufferedCalls: number[] = [];

      const transform = bufferSpeech<Float32Array>({
        durationSeconds: 0.5,
        noEmit: false,
        onBuffered: () => {
          onBufferedCalls.push(Date.now());
        },
      });

      const pipelinePromise = new ReadableStream<Float32Array>({
        start(controller) {
          controller.enqueue(createTestChunk(1));
          controller.enqueue(createTestChunk(2));
          controller.close();
        },
      })
        .pipeThrough(transform)
        .pipeTo(
          new WritableStream<Float32Array[]>({
            write(chunk) {
              outputs.push(chunk);
            },
          })
        );

      await vi.advanceTimersByTimeAsync(600);
      await pipelinePromise;

      // Should have emitted chunks
      expect(outputs).toHaveLength(1);
      expect(outputs[0]).toHaveLength(2);

      // And should have called onBuffered
      expect(onBufferedCalls).toHaveLength(1);
    });

    it('should work with multiple buffer releases', async () => {
      const outputs: Float32Array[][] = [];
      const onBufferedCalls: number[] = [];

      const transform = bufferSpeech<Float32Array>({
        durationSeconds: 0.3,
        noEmit: true,
        onBuffered: () => {
          onBufferedCalls.push(onBufferedCalls.length + 1);
        },
      });

      let resolveSecondBatch: (() => void) | undefined;
      const secondBatchPromise = new Promise<void>(resolve => {
        resolveSecondBatch = resolve;
      });

      const readable = new ReadableStream<Float32Array>({
        async start(controller) {
          // First batch
          controller.enqueue(createTestChunk(1));
          controller.enqueue(createTestChunk(2));

          // Wait for test to control timing
          await secondBatchPromise;

          controller.enqueue(createTestChunk(3));
          controller.enqueue(createTestChunk(4));

          controller.close();
        },
      });

      const pipelinePromise = readable.pipeThrough(transform).pipeTo(
        new WritableStream<Float32Array[]>({
          write(chunk) {
            outputs.push(chunk);
          },
        })
      );

      // Advance time to trigger first buffer release
      await vi.advanceTimersByTimeAsync(400);
      expect(onBufferedCalls).toHaveLength(1);

      // Now allow second batch to be sent
      resolveSecondBatch?.();
      await vi.advanceTimersByTimeAsync(50);

      // Advance more time to trigger second buffer release
      await vi.advanceTimersByTimeAsync(400);
      await pipelinePromise;

      expect(outputs).toHaveLength(0); // noEmit = true
      expect(onBufferedCalls).toHaveLength(2);
      expect(onBufferedCalls).toEqual([1, 2]);
    });
  });

  describe('error handling', () => {
    it('should trigger onError for buffer overflow', async () => {
      const errors: Error[] = [];
      const outputs: Float32Array[][] = [];

      const transform = bufferSpeech<Float32Array>({
        durationSeconds: 2.0,
        maxBufferSeconds: 1.0, // Very short max buffer time
        onError: error => {
          errors.push(error);
        },
      });

      // Keep sending chunks for longer than maxBufferSeconds
      const readable = new ReadableStream<Float32Array>({
        async start(controller) {
          // Send chunks every 100ms for 1.5 seconds (longer than maxBufferSeconds)
          for (let i = 0; i < 15; i++) {
            controller.enqueue(createTestChunk(i));
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          controller.close();
        },
      });

      const pipelinePromise = readable.pipeThrough(transform).pipeTo(
        new WritableStream<Float32Array[]>({
          write(chunk) {
            outputs.push(chunk);
          },
        })
      );

      // Advance time to trigger buffer overflow
      await vi.advanceTimersByTimeAsync(1100);

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Buffer overflow');
      // Don't check exact chunk count as timing may vary
      expect(errors[0].message).toMatch(/\d+ chunks accumulated/);

      // Continue and finish the pipeline
      await vi.advanceTimersByTimeAsync(2000);
      await pipelinePromise;
    });

    it('should continue working after error', async () => {
      const errors: Error[] = [];
      const outputs: Float32Array[][] = [];

      const transform = bufferSpeech<Float32Array>({
        durationSeconds: 1.0,
        maxBufferSeconds: 0.5,
        onError: error => {
          errors.push(error);
        },
      });

      const readable = new ReadableStream<Float32Array>({
        async start(controller) {
          // First batch - will cause overflow
          for (let i = 0; i < 10; i++) {
            controller.enqueue(createTestChunk(i));
            await new Promise(resolve => setTimeout(resolve, 60));
          }

          // Wait for buffer to clear, then send more
          await new Promise(resolve => setTimeout(resolve, 1200));

          // Second batch - should work normally
          controller.enqueue(createTestChunk(100));
          controller.enqueue(createTestChunk(101));

          controller.close();
        },
      });

      const pipelinePromise = readable.pipeThrough(transform).pipeTo(
        new WritableStream<Float32Array[]>({
          write(chunk) {
            outputs.push(chunk);
          },
        })
      );

      // Let the first batch cause an overflow
      await vi.advanceTimersByTimeAsync(700);
      expect(errors).toHaveLength(1);

      // Let the buffer clear and process second batch
      await vi.advanceTimersByTimeAsync(2000);
      await pipelinePromise;

      // Should have processed both batches despite the error
      expect(outputs).toHaveLength(2);
      expect(outputs[0]).toHaveLength(10); // First batch (with overflow)
      expect(outputs[1]).toHaveLength(2); // Second batch
    });
  });

  describe('debug logging', () => {
    it('should call onDebugLog with meaningful messages', async () => {
      const debugMessages: string[] = [];

      const transform = bufferSpeech<Float32Array>({
        durationSeconds: 0.5,
        onDebugLog: message => {
          debugMessages.push(message);
        },
      });

      const pipelinePromise = new ReadableStream<Float32Array>({
        start(controller) {
          controller.enqueue(createTestChunk(1));
          controller.enqueue(createTestChunk(2));
          controller.close();
        },
      })
        .pipeThrough(transform)
        .pipeTo(
          new WritableStream<Float32Array[]>({
            write() {}, // Consume output
          })
        );

      await vi.advanceTimersByTimeAsync(600);
      await pipelinePromise;

      expect(debugMessages.length).toBeGreaterThan(0);
      expect(debugMessages.some(msg => msg.includes('Initialized'))).toBe(true);
      expect(debugMessages.some(msg => msg.includes('Started new buffer'))).toBe(true);
      expect(debugMessages.some(msg => msg.includes('Buffered chunk'))).toBe(true);
      expect(debugMessages.some(msg => msg.includes('Releasing buffer'))).toBe(true);
    });
  });

  describe('configuration options', () => {
    it('should use default values when no options provided', async () => {
      const debugMessages: string[] = [];

      const transform = bufferSpeech<Float32Array>({
        onDebugLog: message => {
          debugMessages.push(message);
        },
      });

      // Start the transform to trigger initialization
      const pipelinePromise = new ReadableStream<Float32Array>({
        start(controller) {
          controller.enqueue(createTestChunk(1));
          controller.close();
        },
      })
        .pipeThrough(transform)
        .pipeTo(
          new WritableStream<Float32Array[]>({
            write() {}, // Consume output
          })
        );

      await vi.advanceTimersByTimeAsync(100);

      // Check initialization message contains default values
      const initMessage = debugMessages.find(msg => msg.includes('Initialized'));
      expect(initMessage).toBeDefined();
      expect(initMessage).toContain('2000ms speech buffering');
      expect(initMessage).toContain('60000ms max buffer');

      await vi.advanceTimersByTimeAsync(2100);
      await pipelinePromise;
    });

    it('should respect custom duration settings', async () => {
      const outputs: Float32Array[][] = [];

      const transform = bufferSpeech<Float32Array>({
        durationSeconds: 0.2, // Very short duration
      });

      const pipelinePromise = new ReadableStream<Float32Array>({
        start(controller) {
          controller.enqueue(createTestChunk(1));
          controller.close();
        },
      })
        .pipeThrough(transform)
        .pipeTo(
          new WritableStream<Float32Array[]>({
            write(chunk) {
              outputs.push(chunk);
            },
          })
        );

      // Should release after 200ms, but might release immediately on stream close
      await vi.advanceTimersByTimeAsync(250);
      await pipelinePromise;
      expect(outputs).toHaveLength(1);
    });
  });

  describe('stream completion', () => {
    it('should flush buffer on stream end', async () => {
      const outputs: Float32Array[][] = [];

      const transform = bufferSpeech<Float32Array>({
        durationSeconds: 10.0, // Very long duration - should not trigger normally
      });

      const pipelinePromise = new ReadableStream<Float32Array>({
        start(controller) {
          controller.enqueue(createTestChunk(1));
          controller.enqueue(createTestChunk(2));
          // Close immediately without waiting for duration
          controller.close();
        },
      })
        .pipeThrough(transform)
        .pipeTo(
          new WritableStream<Float32Array[]>({
            write(chunk) {
              outputs.push(chunk);
            },
          })
        );

      await pipelinePromise;

      // Should have flushed the buffer on stream end
      expect(outputs).toHaveLength(1);
      expect(outputs[0]).toHaveLength(2);
    });

    it('should handle flush with noEmit option', async () => {
      const outputs: Float32Array[][] = [];
      const onBufferedCalls: number[] = [];

      const transform = bufferSpeech<Float32Array>({
        durationSeconds: 10.0,
        noEmit: true,
        onBuffered: () => {
          onBufferedCalls.push(Date.now());
        },
      });

      const pipelinePromise = new ReadableStream<Float32Array>({
        start(controller) {
          controller.enqueue(createTestChunk(1));
          controller.close();
        },
      })
        .pipeThrough(transform)
        .pipeTo(
          new WritableStream<Float32Array[]>({
            write(chunk) {
              outputs.push(chunk);
            },
          })
        );

      await pipelinePromise;

      // Should not emit but should call onBuffered
      expect(outputs).toHaveLength(0);
      expect(onBufferedCalls).toHaveLength(1);
    });
  });
});
