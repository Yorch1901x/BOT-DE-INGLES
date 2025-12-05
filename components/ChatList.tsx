import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import { Bot, User } from 'lucide-react';

interface ChatListProps {
  messages: ChatMessage[];
}

export const ChatList: React.FC<ChatListProps> = ({ messages }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
      {messages.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-60">
           <Bot size={64} className="mb-4" />
           <p className="text-xl font-medium">Ready to practice English?</p>
           <p className="text-sm">Click "Start Conversation" below.</p>
        </div>
      )}
      
      {messages.map((msg) => (
        <div 
          key={msg.id} 
          className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
        >
          {/* Avatar */}
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 
            ${msg.role === 'model' ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
            {msg.role === 'model' ? <Bot size={20} /> : <User size={20} />}
          </div>

          {/* Bubble */}
          <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
             <div className={`px-5 py-3 rounded-2xl text-md leading-relaxed shadow-md
               ${msg.role === 'model' 
                 ? 'bg-slate-800 text-slate-100 rounded-tl-none' 
                 : 'bg-emerald-700 text-white rounded-tr-none'
               }
               ${!msg.isComplete ? 'opacity-80' : ''}
             `}>
               {msg.text}
               {!msg.isComplete && (
                 <span className="inline-block w-2 h-2 ml-1 bg-white rounded-full animate-pulse"/>
               )}
             </div>
             <span className="text-xs text-slate-500 mt-1 px-1">
               {msg.role === 'model' ? 'Tutor' : 'You'}
             </span>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
