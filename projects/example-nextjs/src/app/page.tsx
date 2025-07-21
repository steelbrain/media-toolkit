'use client';

import { bufferSpeech } from '@steelbrain/media-buffer-speech';
import { ingestAudioStream, RECOMMENDED_AUDIO_CONSTRAINTS } from '@steelbrain/media-ingest-audio';
import { speechFilter } from '@steelbrain/media-speech-detection-web';
import { useRef, useState } from 'react';
import styles from './page.module.css';

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speechEvents, setSpeechEvents] = useState<string[]>([]);
  const [speechBuffer, setSpeechBuffer] = useState<Float32Array[]>([]);
  const [bufferedSegments, setBufferedSegments] = useState<Float32Array[][]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const addSpeechEvent = (event: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setSpeechEvents(prev => [...prev.slice(-9), `${timestamp}: ${event}`]);
  };

  const clearSpeechBuffer = () => {
    setSpeechBuffer([]);
    setBufferedSegments([]);
    addSpeechEvent('🗑️ Speech buffer cleared');
  };

  const playRecordedSpeech = async () => {
    if (speechBuffer.length === 0) {
      addSpeechEvent('❌ No speech recorded to play');
      return;
    }

    try {
      setIsPlaying(true);
      addSpeechEvent(`🔊 Playing ${speechBuffer.length} speech chunks...`);

      // Initialize AudioContext if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      }

      const audioContext = audioContextRef.current;

      // Resume AudioContext if suspended (required by browser policies)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Concatenate all speech chunks
      const totalSamples = speechBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
      const combinedAudio = new Float32Array(totalSamples);

      let offset = 0;
      for (const chunk of speechBuffer) {
        combinedAudio.set(chunk, offset);
        offset += chunk.length;
      }

      // Our audio data is 16kHz, but AudioContext might be at different rate
      const contextSampleRate = audioContext.sampleRate;
      const audioDataSampleRate = 16000; // Our VAD processes at 16kHz

      console.log(`AudioContext: ${contextSampleRate}Hz, Audio data: ${audioDataSampleRate}Hz, Length: ${combinedAudio.length} samples`);

      let finalSampleRate = audioDataSampleRate;

      // If context sample rate differs from our audio data, we need to handle it
      if (contextSampleRate !== audioDataSampleRate) {
        finalSampleRate = audioDataSampleRate;
        addSpeechEvent(`⚠️ Sample rate mismatch: Context=${contextSampleRate}Hz, Data=${audioDataSampleRate}Hz`);
      }

      // Create AudioBuffer with the correct sample rate for our audio data
      const audioBuffer = audioContext.createBuffer(1, combinedAudio.length, finalSampleRate);
      audioBuffer.copyToChannel(combinedAudio, 0);

      // Create and play audio
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      source.onended = () => {
        setIsPlaying(false);
        addSpeechEvent('✅ Playback completed');
      };

      source.start(0);
    } catch (err) {
      console.error('Error playing audio:', err);
      setIsPlaying(false);
      addSpeechEvent(`❌ Playback error: ${(err as Error).message}`);
    }
  };

  const requestMicrophone = async () => {
    try {
      setError(null);
      setSpeechEvents([]);
      setSpeechBuffer([]); // Clear previous speech buffer
      setBufferedSegments([]); // Clear buffered segments
      setIsRecording(true);

      // Create abort controller for cleanup
      abortControllerRef.current = new AbortController();

      console.log('Requesting microphone access...');
      addSpeechEvent('🎤 Requesting microphone access...');

      // Request microphone access
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: RECOMMENDED_AUDIO_CONSTRAINTS,
      });

      console.log('Microphone access granted:', mediaStream);
      addSpeechEvent('✅ Microphone access granted');

      // Convert to 16kHz ReadableStream
      const audioStream = await ingestAudioStream(mediaStream, {
        gain: 2,
      });

      addSpeechEvent('🔄 Initializing Speech Detection...');

      // Create speech detection transform stream with simplified interface
      const speechTransform = speechFilter({
        onSpeechStart: () => {
          console.log('🎤 Speech started!');
          addSpeechEvent('🎤 Speech started');
        },

        onSpeechEnd: () => {
          console.log('🔇 Speech ended');
          addSpeechEvent('🔇 Speech ended');
        },

        onVadMisfire: () => {
          console.log('⚠️ VAD misfire (speech segment too short)');
          addSpeechEvent('⚠️ Speech misfire');
        },

        // Zero-configuration defaults work great, but you can customize:
        threshold: 0.5, // Speech detection threshold
        minSpeechDurationMs: 100, // Minimum speech duration
        redemptionDurationMs: 2000, // Grace period for pauses
        lookBackDurationMs: 384, // Lookback buffer for natural audio context (12 frames)
      });

      // Create speech buffer that waits 3 seconds after speech ends
      const speechBuffer = bufferSpeech({
        durationSeconds: 3.0,
        maxBufferSeconds: 60.0,
        onError: error => {
          console.error('Speech buffer error:', error);
          addSpeechEvent(`❌ Buffer error: ${error.message}`);
        },
      });

      // Create speech collector to capture buffered speech segments
      const speechCollector = new WritableStream<Float32Array[]>({
        write: segments => {
          console.log(`Speech segment received: ${segments.length} chunks`);

          // Store buffered segments
          setBufferedSegments(prev => [...prev, segments]);

          // Also store individual chunks for playback compatibility
          setSpeechBuffer(prev => [...prev, ...segments]);

          // Update UI with segment info
          const totalSamples = segments.reduce((sum, chunk) => sum + chunk.length, 0);
          addSpeechEvent(`📦 Segment: ${segments.length} chunks (${totalSamples} samples)`);
        },
      });

      addSpeechEvent('🎧 Speech detection initialized, buffering speech...');

      // Chain the pipeline: audio → speech detection filter → speech buffer → segment collector
      await audioStream
        .pipeThrough(speechTransform, { signal: abortControllerRef.current.signal })
        .pipeThrough(speechBuffer, { signal: abortControllerRef.current.signal })
        .pipeTo(speechCollector, { signal: abortControllerRef.current.signal });
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error accessing microphone:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        addSpeechEvent(`❌ Error: ${err.message}`);
      }
    } finally {
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRecording(false);
    const speechChunks = speechBuffer.length;
    const segments = bufferedSegments.length;
    addSpeechEvent(`⏹️ Recording stopped (${segments} segments, ${speechChunks} chunks captured)`);
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <ol>
          <li>Click the button below to test advanced Speech Detection using Silero VAD.</li>
          <li>Complete Speech Processing Pipeline:</li>
          <ul>
            <li>
              <strong>Streaming Pipeline</strong> - Clean `pipeThrough()` interface with three packages
            </li>
            <li>
              <strong>Speech Detection</strong> - Filter audio for speech vs silence (Silero VAD)
            </li>
            <li>
              <strong>Speech Buffering</strong> - Buffer speech until 3-second pauses (natural turns)
            </li>
            <li>
              <strong>Event-Driven</strong> - Simple callback-based events and error handling
            </li>
            <li>
              <strong>Zero Configuration</strong> - Works perfectly with optimal defaults
            </li>
            <li>
              <strong>Conversation Turns</strong> - Detects natural conversation boundaries
            </li>
            <li>
              <strong>Complete Segments</strong> - Process full utterances instead of fragments
            </li>
          </ul>
        </ol>

        <div style={{ margin: '2rem 0', textAlign: 'center' }}>
          {!isRecording ? (
            <button
              onClick={requestMicrophone}
              style={{
                padding: '1rem 2rem',
                fontSize: '1.1rem',
                backgroundColor: '#0070f3',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              🎤 Start Speech Detection
            </button>
          ) : (
            <button
              onClick={stopRecording}
              style={{
                padding: '1rem 2rem',
                fontSize: '1.1rem',
                backgroundColor: '#ff4444',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              ⏹️ Stop Speech Detection
            </button>
          )}

          {/* Speech Playback Controls */}
          {speechBuffer.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <button
                onClick={playRecordedSpeech}
                disabled={isPlaying}
                style={{
                  padding: '0.8rem 1.5rem',
                  fontSize: '1rem',
                  backgroundColor: isPlaying ? '#888' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isPlaying ? 'not-allowed' : 'pointer',
                  marginRight: '0.5rem',
                }}
              >
                {isPlaying ? '🔊 Playing...' : `🔊 Play Speech (${speechBuffer.length} chunks)`}
              </button>

              <button
                onClick={clearSpeechBuffer}
                disabled={isPlaying}
                style={{
                  padding: '0.8rem 1.5rem',
                  fontSize: '1rem',
                  backgroundColor: isPlaying ? '#888' : '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isPlaying ? 'not-allowed' : 'pointer',
                }}
              >
                🗑️ Clear Buffer
              </button>
            </div>
          )}

          {error && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: '#ffebee',
                color: '#c62828',
                borderRadius: '4px',
                border: '1px solid #ffcdd2',
              }}
            >
              Error: {error}
            </div>
          )}

          {isRecording && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: '#e8f5e8',
                color: '#2e7d32',
                borderRadius: '4px',
                border: '1px solid #c8e6c9',
              }}
            >
              ✅ Speech Pipeline Active - Buffering speech until 3-second pauses!
              <br />📊 Speech Buffer: {speechBuffer.length} chunks, {bufferedSegments.length} segments captured
            </div>
          )}

          {!isRecording && speechBuffer.length > 0 && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: '#fff3cd',
                color: '#856404',
                borderRadius: '4px',
                border: '1px solid #ffeaa7',
              }}
            >
              🎵 {bufferedSegments.length} speech segments ({speechBuffer.length} chunks) ready for playback
            </div>
          )}

          {speechEvents.length > 0 && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: '#f3f4f6',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                textAlign: 'left',
                maxHeight: '200px',
                overflowY: 'auto',
              }}
            >
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#374151' }}>Speech Detection Events:</h4>
              {speechEvents.map(event => (
                <div
                  key={event}
                  style={{
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    margin: '0.25rem 0',
                    color: event.includes('🎤') ? '#059669' : event.includes('🔇') ? '#dc2626' : '#6b7280',
                  }}
                >
                  {event}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '2rem', fontSize: '0.9rem', color: '#6b7280', textAlign: 'left' }}>
            <h3>Complete Speech Processing Pipeline:</h3>

            <pre style={{ backgroundColor: '#f8f9fa', padding: '1rem', borderRadius: '4px', overflow: 'auto' }}>
              {`import { speechFilter } from '@steelbrain/media-speech-detection-web';
import { bufferSpeech } from '@steelbrain/media-buffer-speech';

// Speech detection: filter for speech vs silence
const speechTransform = speechFilter({
  onSpeechStart: () => console.log('🎤 Speech started'),
  onSpeechEnd: () => console.log('🔇 Speech ended'),
  threshold: 0.5
});

// Speech buffering: wait for natural conversation pauses
const speechBuffer = bufferSpeech({
  durationSeconds: 3.0,          // Wait 3s after speech ends
  maxBufferSeconds: 60.0         // Buffer overflow protection
});

// Complete pipeline: detection → buffering → processing
await audioStream
  .pipeThrough(speechTransform)  // Filter for speech
  .pipeThrough(speechBuffer)     // Buffer until pauses
  .pipeTo(segmentProcessor);     // Process complete segments`}
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}
