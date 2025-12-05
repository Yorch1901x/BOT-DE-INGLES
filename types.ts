export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isComplete: boolean;
  timestamp: number;
}

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export interface AudioVisualizerProps {
  isSpeaking: boolean;
  volume: number;
}

export interface ControlBarProps {
  connectionState: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
  isMicOn: boolean;
  onToggleMic: () => void;
}
