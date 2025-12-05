import { useState, useEffect, useRef, useCallback } from 'react';
import { ConnectionState, ChatMessage } from '../types';

const MODEL_NAME = 'gpt-4o-mini';

// System instruction for English Tutor
const SYSTEM_INSTRUCTION = `You are a friendly, patient, and encouraging English language tutor.
Your goal is to have a casual conversation with the user to help them practice their spoken English.
If the user makes a significant grammatical error, gently correct them in a natural way (e.g., "Oh, did you mean...?") and then continue the conversation.
Do not be overly pedantic. Keep the tone light and fun.
Speak clearly and at a moderate pace.`;

type SpeechRecognitionConstructor = { new (): SpeechRecognition };

export const useGptTutor = () => {
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
      return localStorage.getItem('openai_api_key') ?? '';
    }

    return '';
  });

  const connectionStateRef = useRef(connectionState);
  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  const micStateRef = useRef(isMicOn);
  useEffect(() => {
    micStateRef.current = isMicOn;
  }, [isMicOn]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('openai_api_key', apiKey);
    }
  }, [apiKey]);

  // Audio Contexts (used for volume visualization only)
  const inputContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const disconnect = useCallback(() => {
    // Stop recognition
    connectionStateRef.current = ConnectionState.DISCONNECTED;
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
      recognitionRef.current = null;
    }

    // Stop Audio Input
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

    setConnectionState(ConnectionState.DISCONNECTED);
    setVolume(0);
  }, []);

  const speakText = (text: string) => {
    if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const buildHistory = (newUserText: string): { role: 'system' | 'user' | 'assistant'; content: string }[] => {
    const history: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: SYSTEM_INSTRUCTION }
    ];

    messages.forEach(msg => {
      history.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.text });
    });

    history.push({ role: 'user', content: newUserText });
    return history;
  };

  const fetchCompletion = async (userText: string): Promise<string> => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: buildHistory(userText),
        temperature: 0.8
      })
    });

    if (!response.ok) {
      throw new Error('OpenAI request failed');
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map((c: any) => c?.text ?? '').join(' ').trim();
    return '';
  };

  const connect = useCallback(async () => {
    if (!apiKey) {
      alert('Please provide a valid OpenAI API Key to start the session.');
      return;
    }

    try {
      setConnectionState(ConnectionState.CONNECTING);

      const SpeechRecognitionClass: SpeechRecognitionConstructor | undefined =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognitionClass) {
        alert('Speech recognition is not supported in this browser.');
        setConnectionState(ConnectionState.ERROR);
        return;
      }

      // Initialize Audio Contexts for volume visualization
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputContextRef.current = new AudioContextClass({ sampleRate: 16000 });

      // Get Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const source = inputContextRef.current.createMediaStreamSource(streamRef.current);
      const processor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!micStateRef.current) {
          setVolume(0);
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        setVolume(rms);
      };

      source.connect(processor);
      processor.connect(inputContextRef.current.destination);

      const recognition: SpeechRecognition = new SpeechRecognitionClass();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setConnectionState(ConnectionState.CONNECTED);
      };

      recognition.onresult = async (event: SpeechRecognitionEvent) => {
        const result = event.results[event.results.length - 1];
        const transcript = result[0].transcript.trim();

        updateStreamingMessage('user', transcript);

        if (result.isFinal) {
          commitMessage('user', transcript);

          // placeholder model message while fetching
          const pendingId = Date.now().toString();
          setMessages(prev => [
            ...prev,
            {
              id: pendingId,
              role: 'model',
              text: 'Thinking...',
              isComplete: false,
              timestamp: Date.now()
            }
          ]);

          try {
            const completion = await fetchCompletion(transcript);
            setMessages(prev => prev.map(msg =>
              msg.id === pendingId
                ? { ...msg, text: completion, isComplete: true }
                : msg
            ));
            speakText(completion);
          } catch (error) {
            console.error(error);
            setMessages(prev => prev.map(msg =>
              msg.id === pendingId
                ? { ...msg, text: 'There was an error contacting OpenAI.', isComplete: true }
                : msg
            ));
            setConnectionState(ConnectionState.ERROR);
          }
        }
      };

      recognition.onend = () => {
        if (connectionStateRef.current === ConnectionState.CONNECTED && micStateRef.current) {
          recognition.start();
        }
      };

      recognition.onerror = () => {
        setConnectionState(ConnectionState.ERROR);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error('Connection failed', e);
      setConnectionState(ConnectionState.ERROR);
    }
  }, [apiKey, isMicOn, connectionState, messages]);

  // Helper to update the "pending" message in the UI list
  const updateStreamingMessage = (role: 'user' | 'model', text: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && !last.isComplete) {
        return [
            ...prev.slice(0, -1),
            { ...last, text }
        ];
      } else {
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
    setIsMicOn(prev => {
      const next = !prev;
      if (!next) {
        recognitionRef.current?.stop();
        setVolume(0);
      } else if (connectionState === ConnectionState.CONNECTED) {
        try {
          recognitionRef.current?.start();
        } catch (e) {
          // ignore
        }
      }
      return next;
    });
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
