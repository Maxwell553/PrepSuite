import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, HelpCircle, Bug, Lightbulb } from 'lucide-react';
import { supportChatWithPipeline } from '../services/pipelineClient';
import { supportChatRepository, type SupportCategory } from '../services/supportChatRepository';
import { supabase } from '../lib/supabase';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  category?: SupportCategory | null;
}

const CATEGORY_OPTIONS: { value: SupportCategory; label: string; icon: React.ReactNode }[] = [
  { value: 'question', label: 'Ask a question', icon: <HelpCircle className="w-5 h-5" /> },
  { value: 'bug', label: 'Report a bug', icon: <Bug className="w-5 h-5" /> },
  { value: 'feature', label: 'Request a feature', icon: <Lightbulb className="w-5 h-5" /> },
];

const CATEGORY_PROMPTS: Record<SupportCategory, string> = {
  question: "What would you like to know about PrepSuite?",
  bug: "Describe the bug you encountered. Include steps to reproduce if possible.",
  feature: "Tell us about the feature you'd like to see.",
};

const CATEGORY_GREETINGS: Record<SupportCategory, string> = {
  question: "Hi! I'm the PrepSuite support assistant. What would you like to know?",
  bug: "Hi! I'm the PrepSuite support assistant. Describe the bug you encountered below.",
  feature: "Hi! I'm the PrepSuite support assistant. Tell us about the feature you'd like to see.",
};

interface SupportChatProps {
  isLoggedIn: boolean;
}

const SupportChat: React.FC<SupportChatProps> = ({ isLoggedIn }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<SupportCategory | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Show category selector greeting when no category is selected
  useEffect(() => {
    if (isOpen && isLoggedIn && !selectedCategory) {
      setMessages([
        {
          role: 'assistant',
          content: "Choose how I can help below.",
          timestamp: new Date(),
        },
      ]);
    }
  }, [isOpen, isLoggedIn, selectedCategory]);

  // Load chat history for the selected category when it changes
  useEffect(() => {
    if (!isOpen || !isLoggedIn || !selectedCategory) return;

    const loadHistory = async () => {
      setLoadingHistory(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const history = await supportChatRepository.getChatHistory(user.id, selectedCategory);
        if (history.length > 0) {
          setMessages(
            history.map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
              timestamp: new Date(m.created_at ?? 0),
              category: m.category ?? undefined,
            }))
          );
        } else {
          setMessages([
            {
              role: 'assistant',
              content: CATEGORY_GREETINGS[selectedCategory],
              timestamp: new Date(),
            },
          ]);
        }
      } catch (err) {
        console.error('[SupportChat] Failed to load history:', err);
        setMessages([
          {
            role: 'assistant',
            content: CATEGORY_GREETINGS[selectedCategory],
            timestamp: new Date(),
          },
        ]);
      } finally {
        setLoadingHistory(false);
      }
    };

    loadHistory();
  }, [isOpen, isLoggedIn, selectedCategory]);

  const handleCategorySelect = (category: SupportCategory) => {
    setSelectedCategory(category);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !isLoggedIn || !selectedCategory) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
      category: selectedCategory,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Please sign in to use support chat.');
      }

      const userId = session.user.id;

      // Save user message to Supabase (history + feedback)
      await supportChatRepository.saveMessage(
        userId,
        'user',
        userMessage.content,
        selectedCategory
      );

      const allMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userMessage.content },
      ];

      const response = await supportChatWithPipeline(
        allMessages,
        session.access_token,
        selectedCategory
      );

      const assistantContent =
        response || 'I could not generate a response. Please try again.';
      const assistantMessage: Message = {
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Save assistant response to Supabase (with category for per-category history)
      await supportChatRepository.saveAssistantMessage(userId, assistantContent, selectedCategory);

      // Keep text box open with same category so user can continue the conversation
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Something went wrong'}. Please try again.`,
          timestamp: new Date(),
        },
      ]);
      // Keep category selected so user can retry
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartOver = () => {
    // Reset to category selector; history for current category is preserved in DB
    setSelectedCategory(null);
  };

  if (!isLoggedIn) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {isOpen && (
        <div className="w-[380px] max-w-[calc(100vw-3rem)] h-[520px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/80">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-indigo-400" />
              <span className="font-semibold text-white">Support</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
              aria-label="Close chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loadingHistory ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-200'
                      }`}
                    >
                      {msg.role === 'user' && msg.category && (
                        <span className="text-xs opacity-80 block mb-1">
                          {CATEGORY_OPTIONS.find((c) => c.value === msg.category)?.label}
                        </span>
                      )}
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 rounded-xl px-3 py-2">
                      <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          <div className="p-3 border-t border-slate-700 space-y-3">
            {!loadingHistory && (
              <>
                {selectedCategory ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        {CATEGORY_PROMPTS[selectedCategory]}
                      </span>
                      <button
                        type="button"
                        onClick={handleStartOver}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        Change
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type your message..."
                        className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        disabled={isLoading}
                      />
                      <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
                      >
                        {isLoading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-2">
                    <span className="text-xs text-slate-400 block">
                      How can I help?
                    </span>
                    <div className="grid grid-cols-1 gap-2">
                      {CATEGORY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => handleCategorySelect(opt.value)}
                          className="flex items-center gap-3 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-indigo-500/50 rounded-lg text-left text-sm text-white transition-colors"
                        >
                          {opt.icon}
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-indigo-600 hover:bg-indigo-500 rounded-full shadow-lg flex items-center justify-center text-white transition-all hover:scale-105"
        aria-label={isOpen ? 'Close support chat' : 'Open support chat'}
      >
        <MessageCircle className="w-7 h-7" />
      </button>
    </div>
  );
};

export default SupportChat;
