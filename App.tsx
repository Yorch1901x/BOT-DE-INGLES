import React from 'react';
import { useGeminiLive } from './hooks/useGeminiLive';
import { ConnectionState } from './types';
import { AudioVisualizer } from './components/AudioVisualizer';
import { ChatList } from './components/ChatList';
import { Mic, MicOff, Phone, PhoneOff, Settings2 } from 'lucide-react';

const App: React.FC = () => {
  const { 
    connectionState, 
    connect, 
    disconnect, 
    messages, 
    volume, 
    isMicOn, 
    toggleMic 
  } = useGeminiLive();

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  return (
    <div className="h-screen w-full flex flex-col bg-slate-950 text-slate-100 relative overflow-hidden">
      
      {/* Header */}
      <header className="flex-none p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500 p-2 rounded-lg">
             <Settings2 size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">English Practice Tutor</h1>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-slate-500'}`} />
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                {connectionState === ConnectionState.CONNECTED ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area (Chat) */}
      <main className="flex-1 flex flex-col relative min-h-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />
        <ChatList messages={messages} />
      </main>

      {/* Control Bar */}
      <footer className="flex-none p-6 border-t border-slate-800 bg-slate-900/80 backdrop-blur-lg z-20">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-6">
          
          {/* Audio Visualizer Area */}
          <div className="flex-1 flex items-center gap-4">
             <div className="relative w-16 h-16 flex items-center justify-center bg-slate-800 rounded-2xl border border-slate-700/50">
                {isConnected ? (
                  <AudioVisualizer isSpeaking={volume > 0.01} volume={volume} />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-600">
                    <MicOff size={24} />
                  </div>
                )}
             </div>
             <div className="flex flex-col">
               <span className="text-sm font-medium text-slate-200">
                 {isConnected ? (isMicOn ? "Listening..." : "Microphone Muted") : "Start Session"}
               </span>
               <span className="text-xs text-slate-500">
                 {isConnected ? "Speak naturally to practice." : "Connect to begin."}
               </span>
             </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-4">
            
            {/* Mic Toggle */}
            <button
              onClick={toggleMic}
              disabled={!isConnected}
              className={`p-4 rounded-full transition-all duration-200 ${
                !isConnected 
                  ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                  : isMicOn 
                    ? 'bg-slate-800 text-white hover:bg-slate-700' 
                    : 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'
              }`}
              title="Toggle Microphone"
            >
              {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
            </button>

            {/* Connect/Disconnect Main Button */}
            {!isConnected ? (
              <button
                onClick={connect}
                disabled={isConnecting}
                className="flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-semibold transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnecting ? (
                  <>
                     <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                     Connecting...
                  </>
                ) : (
                  <>
                    <Phone size={20} />
                    Start Conversation
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={disconnect}
                className="flex items-center gap-3 px-8 py-4 bg-red-600/10 border border-red-600/50 text-red-500 hover:bg-red-600 hover:text-white rounded-full font-semibold transition-all"
              >
                <PhoneOff size={20} />
                End Session
              </button>
            )}

          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
