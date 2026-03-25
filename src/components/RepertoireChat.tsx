import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, X, Loader2, ChevronRight } from 'lucide-react';
import { ScoutingReport } from '../types';
import { chatWithPipeline } from '../services/pipelineClient';
import { supabase } from '../lib/supabase';

interface RepertoireChatProps {
  report: ScoutingReport;
  onClose?: () => void; // Optional, won't show close button if not provided
  /** When true, show grayed-out state with "Requires sign in" instead of chat */
  requiresSignIn?: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const RepertoireChat: React.FC<RepertoireChatProps> = ({ report, onClose, requiresSignIn }) => {
  const playerName = report.player?.name ?? 'this player';
  const firstName = playerName.split(/\s+/).pop() || playerName;
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hi! I can help you analyze ${playerName}'s repertoire. Ask me about specific openings, lines, or positions.`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  /** Scroll inside the chat panel only — scrollIntoView on the sentinel would scroll the whole page */
  const scrollToBottom = () => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  };

  // New / different report: collapse chat and reset greeting (avoids jumping to chat after "Analyze opponent")
  useEffect(() => {
    setIsExpanded(false);
    setMessages([
      {
        role: 'assistant',
        content: `Hi! I can help you analyze ${playerName}'s repertoire. Ask me about specific openings, lines, or positions.`,
        timestamp: new Date()
      }
    ]);
  }, [report.id, playerName]);

  useEffect(() => {
    if (isExpanded) {
      scrollToBottom();
    }
  }, [messages, isExpanded]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Authentication required. Please log in and try again.');
      }

      // Build conversation history: include the new user message (state not yet updated)
      const allMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userMessage.content },
      ];

      const response = await chatWithPipeline(
        {
          player: report.player,
          whiteOpenings: report.whiteOpenings,
          blackDefenses: report.blackDefenses,
          mostPlayedLines: report.mostPlayedLines,
          preparationSummary: report.preparationSummary,
          blackStrategicSummary: report.blackStrategicSummary,
          games: report.games,
        },
        allMessages,
        session.access_token,
      );

      const assistantMessage: Message = {
        role: 'assistant',
        content: (response || 'I apologize, but I could not generate a response. Please try rephrasing your question.').replace(/\*\*/g, ''),
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Prevent auto-scroll when component mounts or expands
  useEffect(() => {
    // Don't auto-scroll to chat section
    if (chatRef.current && isExpanded) {
      // Small delay to ensure DOM is ready, then scroll smoothly if user expanded
      const timer = setTimeout(() => {
        if (chatRef.current) {
          chatRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isExpanded]);

  if (requiresSignIn) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg opacity-60">
        <div className="w-full flex items-center justify-between p-4 cursor-not-allowed">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-slate-400" />
            <h3 className="text-lg font-semibold text-slate-400">Repertoire Analysis Chat</h3>
          </div>
          <span className="text-sm text-slate-400">Requires sign in</span>
        </div>
      </div>
    );
  }

  if (!isExpanded) {
    return (
      <div className="bg-slate-900 border border-amber-500/20 rounded-2xl shadow-lg shadow-amber-900/5">
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-800/80 transition-colors rounded-2xl"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-amber-400">Repertoire Analysis Chat</h3>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-400/60" />
        </button>
      </div>
    );
  }

  return (
    <div ref={chatRef} className="bg-slate-900 border border-amber-500/20 rounded-2xl shadow-lg shadow-amber-900/5 flex flex-col h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-amber-500/15">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-semibold text-amber-400">Repertoire Analysis Chat</h3>
        </div>
        <button
          onClick={() => setIsExpanded(false)}
          className="p-1 hover:bg-slate-800 rounded transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${message.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-200'
                }`}
            >
              <div className="text-sm whitespace-pre-wrap">{message.content}</div>
              <div className={`text-xs mt-1 ${message.role === 'user' ? 'text-indigo-200' : 'text-slate-400'
                }`}>
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 text-slate-200 rounded-lg p-3">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          </div>
        )}
        {messages.length <= 1 && !isLoading && (
          <div className="flex flex-wrap gap-2 mt-2">
            {[
              `What is ${firstName}'s biggest weakness?`,
              `What should I play against their main opening?`,
              `How does ${firstName} handle time pressure?`,
            ].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => { setInput(chip); }}
                className="text-xs px-3 py-1.5 bg-indigo-600/10 border border-indigo-500/20 text-indigo-300 rounded-full hover:bg-indigo-600/20 hover:border-indigo-500/30 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSend();
            return false;
          }}
          className="flex gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                handleSend();
                return false;
              }
            }}
            placeholder="Ask about specific openings, lines, or positions..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={2}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RepertoireChat;
