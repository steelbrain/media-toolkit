import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type AudioIngestOptions, ingestAudioStream, RECOMMENDED_AUDIO_CONSTRAINTS } from '../src/index.js';

// Mock browser APIs
const mockAudioContext = vi.fn();
const mockAudioWorkletNode = vi.fn();
const mockMediaStreamSource = vi.fn();

beforeEach(() => {
  // Reset mocks
  vi.clearAllMocks();

  // Mock global AudioContext
  global.AudioContext = mockAudioContext.mockImplementation(() => ({
    audioWorklet: {
      addModule: vi.fn().mockResolvedValue(undefined),
    },
    createMediaStreamSource: mockMediaStreamSource.mockReturnValue({
      connect: vi.fn(),
    }),
    close: vi.fn(),
  }));

  // Mock AudioWorkletNode
  global.AudioWorkletNode = mockAudioWorkletNode.mockImplementation(() => ({
    port: {
      onmessage: null,
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
});

describe('RECOMMENDED_AUDIO_CONSTRAINTS', () => {
  it('should export correct audio constraints', () => {
    expect(RECOMMENDED_AUDIO_CONSTRAINTS).toEqual({
      sampleRate: 16000,
      channelCount: 1,
    });
  });

  it('should be a frozen object', () => {
    expect(Object.isFrozen(RECOMMENDED_AUDIO_CONSTRAINTS)).toBe(true);
  });
});

describe('ingestAudioStream', () => {
  it('should throw error for MediaStream without audio tracks', async () => {
    const mockMediaStream = {
      getAudioTracks: vi.fn().mockReturnValue([]),
    } as unknown as MediaStream;

    await expect(ingestAudioStream(mockMediaStream)).rejects.toThrow('MediaStream must contain at least one audio track');
  });

  it('should return ReadableStream for valid MediaStream', async () => {
    const mockMediaStream = {
      getAudioTracks: vi.fn().mockReturnValue([{ kind: 'audio' }]),
    } as unknown as MediaStream;

    const stream = await ingestAudioStream(mockMediaStream);

    expect(stream).toBeInstanceOf(ReadableStream);
    expect(mockAudioContext).toHaveBeenCalledWith({ sampleRate: 16000 });
  });

  it('should handle AudioWorklet setup errors', async () => {
    const mockMediaStream = {
      getAudioTracks: vi.fn().mockReturnValue([{ kind: 'audio' }]),
    } as unknown as MediaStream;

    // Mock AudioContext to throw error during setup
    global.AudioContext = vi.fn().mockImplementation(() => ({
      audioWorklet: {
        addModule: vi.fn().mockRejectedValue(new Error('Worklet load failed')),
      },
      close: vi.fn(),
    }));

    const stream = await ingestAudioStream(mockMediaStream);

    // The stream should still be created, but error should be thrown during start
    expect(stream).toBeInstanceOf(ReadableStream);

    // Test that start throws error by trying to get a reader
    const reader = stream.getReader();

    // This would trigger the start method and should throw
    await expect(reader.read()).rejects.toThrow('AudioWorklet setup failed');
  });

  it('should pass gain parameter to AudioWorkletNode', async () => {
    const mockMediaStream = {
      getAudioTracks: vi.fn().mockReturnValue([{ kind: 'audio' }]),
    } as unknown as MediaStream;

    const options: AudioIngestOptions = { gain: 2.5 };
    await ingestAudioStream(mockMediaStream, options);

    expect(mockAudioWorkletNode).toHaveBeenCalledWith(expect.anything(), 'resampler-processor', {
      processorOptions: {
        gain: 2.5,
        channelId: 0,
      },
    });
  });

  it('should use default gain of 1.0 when no options provided', async () => {
    const mockMediaStream = {
      getAudioTracks: vi.fn().mockReturnValue([{ kind: 'audio' }]),
    } as unknown as MediaStream;

    await ingestAudioStream(mockMediaStream);

    expect(mockAudioWorkletNode).toHaveBeenCalledWith(expect.anything(), 'resampler-processor', {
      processorOptions: {
        gain: 1.0,
        channelId: 0,
      },
    });
  });

  it('should use default gain of 1.0 when gain is undefined', async () => {
    const mockMediaStream = {
      getAudioTracks: vi.fn().mockReturnValue([{ kind: 'audio' }]),
    } as unknown as MediaStream;

    await ingestAudioStream(mockMediaStream, {});

    expect(mockAudioWorkletNode).toHaveBeenCalledWith(expect.anything(), 'resampler-processor', {
      processorOptions: {
        gain: 1.0,
        channelId: 0,
      },
    });
  });

  it('should handle zero gain', async () => {
    const mockMediaStream = {
      getAudioTracks: vi.fn().mockReturnValue([{ kind: 'audio' }]),
    } as unknown as MediaStream;

    await ingestAudioStream(mockMediaStream, { gain: 0 });

    expect(mockAudioWorkletNode).toHaveBeenCalledWith(expect.anything(), 'resampler-processor', {
      processorOptions: {
        gain: 0,
        channelId: 0,
      },
    });
  });

  it('should handle fractional gain values', async () => {
    const mockMediaStream = {
      getAudioTracks: vi.fn().mockReturnValue([{ kind: 'audio' }]),
    } as unknown as MediaStream;

    await ingestAudioStream(mockMediaStream, { gain: 0.25 });

    expect(mockAudioWorkletNode).toHaveBeenCalledWith(expect.anything(), 'resampler-processor', {
      processorOptions: {
        gain: 0.25,
        channelId: 0,
      },
    });
  });
});
