import React from 'react';
import { AudioVisualizerProps } from '../types';

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isSpeaking, volume }) => {
  // Normalize volume for visual scaling (simple heuristic)
  const scale = Math.min(1.0 + volume * 5, 2.5);
  
  return (
    <div className="flex items-center justify-center h-24 w-24 relative">
      {/* Background Pulse */}
      {volume > 0.01 && (
        <div className="absolute inset-0 bg-blue-500 rounded-full opacity-20 animate-pulse-ring"></div>
      )}
      
      {/* Central Circle */}
      <div 
        className={`relative z-10 rounded-full transition-all duration-100 ease-out flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.5)]
          ${isSpeaking ? 'bg-gradient-to-br from-blue-400 to-indigo-600' : 'bg-slate-700'}`}
        style={{ 
          width: '60px', 
          height: '60px',
          transform: `scale(${scale})`
        }}
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="24" 
          height="24" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          className="text-white"
        >
          {isSpeaking ? (
             <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          ) : (
             <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          )}
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      </div>
    </div>
  );
};
