import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionState, ChatMessage } from '../types';
import { decodeBase64, pcmToAudioBuffer, float32ToPCM16 } from '../utils/audioUtils';

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';

// System instruction for English Tutor
const SYSTEM_INSTRUCTION = `You are a friendly, patient, and encouraging English language tutor. 
Your goal is to have a casual conversation with the user to help them practice their spoken English.
If the user makes a significant grammatical error, gently correct them in a natural way (e.g., "Oh, did you mean...?") and then continue the conversation. 
Do not be overly pedantic. Keep the tone light and fun. 
Speak clearly and at a moderate pace.`;

export const useGeminiLive = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [volume, setVolume] = useState<number>(0);
  const [isMicOn, setIsMicOn] = useState<boolean>(true);
  const [apiKey, setApiKey] = useState<string>(() => {
    const viteEnvKey = (import.meta as any).env?.VITE_API_KEY as string | undefined;
    if (viteEnvKey) return viteEnvKey;

    const processEnvKey = (typeof process !== 'undefined'
      ? (process as any).env?.API_KEY
      : undefined) as string | undefined;
    if (processEnvKey) return processEnvKey;

    if (typeof window !== 'undefined') {
      return localStorage.getItem('genai_api_key') ?? '';
    }

    return '';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('genai_api_key', apiKey);
    }
  }, [apiKey]);

  // Audio Contexts
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Session Refs
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Transcription Buffers
  const currentInputTranscription = useRef<string>('');
  const currentOutputTranscription = useRef<string>('');

  const disconnect = useCallback(() => {
    // 1. Close session if possible (Note: SDK doesn't have an explicit close on the session object easily accessible if promise not resolved, but usually we just stop sending).
    // Actually, we can trigger a close by dropping references and stopping contexts.
    
    // 2. Stop Audio Input
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    // 3. Stop Audio Output
    audioSourcesRef.current.forEach(source => source.stop());
    audioSourcesRef.current.clear();
    
    if (outputContextRef.current) {
      outputContextRef.current.close();
      outputContextRef.current = null;
    }

    // 4. Reset State
    setConnectionState(ConnectionState.DISCONNECTED);
    nextStartTimeRef.current = 0;
    currentInputTranscription.current = '';
    currentOutputTranscription.current = '';
  }, []);

  const connect = useCallback(async () => {
    if (!apiKey) {
      alert('Please provide a valid Gemini API Key to start the session.');
      return;
    }

    try {
      setConnectionState(ConnectionState.CONNECTING);

      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      outputContextRef.current = new AudioContextClass({ sampleRate: 24000 });

      // Get Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey });

      // Connect to Gemini Live
      sessionPromiseRef.current = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: SYSTEM_INSTRUCTION,
          inputAudioTranscription: { model: 'gemini-2.5-flash' },
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setConnectionState(ConnectionState.CONNECTED);
            
            // Setup Input Processing (Microphone -> Model)
            if (!inputContextRef.current || !streamRef.current) return;

            const source = inputContextRef.current.createMediaStreamSource(streamRef.current);
            const processor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = processor;

            processor.onaudioprocess = (e) => {
              if (!isMicOn) return; // Mute logic

              const inputData = e.inputBuffer.getChannelData(0);
              
              // Calculate volume for visualizer
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
              }
              const rms = Math.sqrt(sum / inputData.length);
              setVolume(rms);

              // Send to Gemini
              const { base64, blob } = float32ToPCM16(inputData);
              
              if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then(session => {
                   session.sendRealtimeInput({
                     media: {
                       mimeType: 'audio/pcm;rate=16000',
                       data: base64
                     }
                   });
                });
              }
            };

            source.connect(processor);
            processor.connect(inputContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputContextRef.current) {
              const ctx = outputContextRef.current;
              const audioBuffer = pcmToAudioBuffer(decodeBase64(base64Audio), ctx);
              
              // Audio scheduling logic
              const now = ctx.currentTime;
              // Ensure we don't schedule in the past
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, now);
              
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.start(nextStartTimeRef.current);
              
              // Add to set for cleanup
              audioSourcesRef.current.add(source);
              source.onended = () => audioSourcesRef.current.delete(source);

              // Advance time
              nextStartTimeRef.current += audioBuffer.duration;
            }

            // Handle Transcriptions
            const outputText = message.serverContent?.outputTranscription?.text;
            const inputText = message.serverContent?.inputTranscription?.text;
            const turnComplete = message.serverContent?.turnComplete;

            if (outputText) {
              currentOutputTranscription.current += outputText;
              updateStreamingMessage('model', currentOutputTranscription.current);
            }

            if (inputText) {
              currentInputTranscription.current += inputText;
              updateStreamingMessage('user', currentInputTranscription.current);
            }

            if (turnComplete) {
              // Finalize the turn
              if (currentInputTranscription.current) {
                commitMessage('user', currentInputTranscription.current);
                currentInputTranscription.current = '';
              }
              if (currentOutputTranscription.current) {
                 commitMessage('model', currentOutputTranscription.current);
                 currentOutputTranscription.current = '';
              }
            }
            
            // Handle Interruption
            if (message.serverContent?.interrupted) {
               // Stop current audio
               audioSourcesRef.current.forEach(src => src.stop());
               audioSourcesRef.current.clear();
               nextStartTimeRef.current = 0;
               // If model was interrupted, finalize whatever partial text we had
               if (currentOutputTranscription.current) {
                 commitMessage('model', currentOutputTranscription.current);
                 currentOutputTranscription.current = '';
               }
            }
          },
          onclose: () => {
            setConnectionState(ConnectionState.DISCONNECTED);
          },
          onerror: (err) => {
            console.error(err);
            setConnectionState(ConnectionState.ERROR);
          }
        }
      });

    } catch (e) {
      console.error("Connection failed", e);
      setConnectionState(ConnectionState.ERROR);
    }
  }, [apiKey, isMicOn]);

  // Helper to update the "pending" message in the UI list
  const updateStreamingMessage = (role: 'user' | 'model', text: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && !last.isComplete) {
        // Update existing pending message
        return [
            ...prev.slice(0, -1),
            { ...last, text }
        ];
      } else {
        // Create new pending message if previous was complete or different role
        // However, if we just finished a 'user' turn and now getting 'model', we just add.
        // But if we are streaming, we want to update the ONE pending message.
        // A simple heuristic: if the very last message is not complete and matches role, update it.
        // If the last message is complete or different role, add new one.
        return [
            ...prev,
            {
                id: Date.now().toString(),
                role,
                text,
                isComplete: false,
                timestamp: Date.now()
            }
        ];
      }
    });
  };

  // Helper to mark a message as complete
  const commitMessage = (role: 'user' | 'model', text: string) => {
    setMessages(prev => {
       const last = prev[prev.length - 1];
       if (last && last.role === role && !last.isComplete) {
         return [
           ...prev.slice(0, -1),
           { ...last, text, isComplete: true }
         ];
       }
       // Fallback if no pending message found (rare with turnComplete)
       return [
         ...prev,
         {
           id: Date.now().toString(),
           role,
           text,
           isComplete: true,
           timestamp: Date.now()
         }
       ];
    });
  };

  const toggleMic = () => {
    setIsMicOn(prev => !prev);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connectionState,
    connect,
    disconnect,
    messages,
    volume,
    isMicOn,
    toggleMic,
    apiKey,
    setApiKey
  };
};
