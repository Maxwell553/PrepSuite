import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, X, Loader2, ChevronRight } from 'lucide-react';
import { geminiService } from '../services/geminiService';
import { ScoutingReport } from '../types';

interface RepertoireChatProps {
  report: ScoutingReport;
  onClose?: () => void; // Optional, won't show close button if not provided
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const RepertoireChat: React.FC<RepertoireChatProps> = ({ report, onClose }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hi! I can help you analyze ${report.player.name}'s repertoire. Ask me about specific openings, lines, or positions. For example: "What does ${report.player.name} play against the Yugoslav Attack?" or "What's their response to 1.e4 c5 2.Nf3 d6 3.d4?"`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      // Build context about the player's repertoire
      const whiteOpenings = report.whiteOpenings?.slice(0, 10).map(op => 
        `${op.name} (${op.totalGames} games, ${(op.winRate * 100).toFixed(1)}% win rate)`
      ).join('\n') || 'No white openings data available';

      const blackDefenses = report.blackDefenses?.slice(0, 10).map(def => 
        `${def.name} (${def.totalGames} games, ${(def.winRate * 100).toFixed(1)}% win rate)`
      ).join('\n') || 'No black defenses data available';

      const mostPlayedWhite = report.mostPlayedLines?.white?.slice(0, 5).map(line => 
        `${line.moves.join(' ')} (${line.games} games, ${(line.frequency * 100).toFixed(1)}% frequency)`
      ).join('\n') || 'No white lines data available';

      const mostPlayedBlack = report.mostPlayedLines?.black?.slice(0, 5).map(line => 
        `${line.moves.join(' ')} (${line.games} games, ${(line.frequency * 100).toFixed(1)}% frequency)`
      ).join('\n') || 'No black lines data available';

      const prompt = `You are an expert chess analyst helping to understand ${report.player.name}'s repertoire.

⚠️ CRITICAL: "White Openings" = what ${report.player.name} PLAYS when they have the WHITE pieces. "Black Defenses" = what they PLAY when they have the BLACK pieces. NEVER confuse these. If asked "what do they play as Black?", answer from Black Defenses only. If asked "what do they play as White?", answer from White Openings only.

Player Information:
- Name: ${report.player.name}
- FIDE Rating: ${report.player.currentRating != null && report.player.currentRating > 0 ? report.player.currentRating : 'Not found'}
- USCF Rating: ${report.player.uscfRating != null && report.player.uscfRating > 0 ? report.player.uscfRating : 'Not found'}
- Country: ${report.player.country || 'Unknown'}

White Openings (what ${report.player.name} plays when they have WHITE):
${whiteOpenings}

Black Defenses (what ${report.player.name} plays when they have BLACK):
${blackDefenses}

Most Played White Lines:
${mostPlayedWhite}

Most Played Black Lines:
${mostPlayedBlack}

Strategic Summary:
${report.preparationSummary || 'No summary available'}

Black Strategic Summary:
${report.blackStrategicSummary || 'No summary available'}

User Question: ${userMessage.content}

Instructions:
1. Answer the user's question about ${report.player.name}'s repertoire based on the data provided above
2. ⚠️ CRITICAL: Provide a COMPREHENSIVE, DETAILED answer. Do NOT be brief or concise. Expand on your answer with:
   - Specific examples from the data
   - Detailed explanations of patterns
   - Context about when and how the player uses certain openings/lines
   - Comparisons between different options
   - Strategic implications
   - Any relevant nuances or details
3. Be specific and cite actual openings/lines when possible
4. ⚠️ CRITICAL STATISTICAL SIGNIFICANCE RULES:
   - NEVER use words like "often", "typically", "usually", "frequently", "tends to", "prefers" unless the pattern appears in 10+ games. Do NOT cite lines that "appeared twice" - that is not a pattern.
   - If a line appears in ONLY 1 game, say "played once" or "appeared in one game" - DO NOT say "often plays" or "typically plays"
   - If a line appears in 2 games, say "played twice" or "appeared in 2 games" - DO NOT generalize
   - Only use generalization language when a pattern appears in at least 5+ games
   - Always cite actual game counts: "played X times in Y games" or "appears in Z% of games"
5. If the player has played a specific line, mention the EXACT frequency and win rate (e.g., "played 8 times in 30 games, with a 62.5% win rate")
6. If the player hasn't played a specific line, say so explicitly and suggest what they actually play instead (with game counts)
7. Use chess notation (e.g., 1.e4 c5 2.Nf3 d6) when discussing specific lines
8. If asked about a specific position, analyze what the player actually plays from similar positions and cite how many times it appeared
9. Do NOT reference specific game numbers (e.g. "Game 19", "Games 4, 10, 11"). Describe aggregate patterns and trends instead.
9. FORMATTING: DO NOT use ** (double asterisks) for bold text. ONLY use * (single asterisk) at the beginning of bullet points or list items. Write all text in plain format without markdown bold formatting.
10. Provide a thorough, detailed response that fully addresses the user's question. Do not truncate or abbreviate your answer.

Answer:`;

      // Use dedicated chat function (plain text, no length limit)
      const response = await geminiService.generateChatResponse(prompt);
      
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

  if (!isExpanded) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-800 transition-colors rounded-2xl"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-400" />
            <h3 className="text-lg font-semibold text-white">Repertoire Analysis Chat</h3>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <div ref={chatRef} className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg flex flex-col h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-400" />
          <h3 className="text-lg font-semibold text-white">Repertoire Analysis Chat</h3>
        </div>
        <button
          onClick={() => setIsExpanded(false)}
          className="p-1 hover:bg-slate-800 rounded transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-200'
              }`}
            >
              <div className="text-sm whitespace-pre-wrap">{message.content}</div>
              <div className={`text-xs mt-1 ${
                message.role === 'user' ? 'text-indigo-200' : 'text-slate-400'
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
        <div ref={messagesEndRef} />
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
