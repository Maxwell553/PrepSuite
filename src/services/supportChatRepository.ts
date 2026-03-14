import { supabase } from '../lib/supabase';

export type SupportCategory = 'question' | 'bug' | 'feature';

export interface SupportChatMessage {
  id?: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  category?: SupportCategory | null;
  created_at?: string;
}

export interface SupportFeedback {
  id?: string;
  user_id: string;
  category: SupportCategory;
  content: string;
  created_at?: string;
}

export const supportChatRepository = {
  /** Load chat history for a user, optionally filtered by category. Ordered by created_at. */
  async getChatHistory(userId: string, category?: SupportCategory | null): Promise<SupportChatMessage[]> {
    let query = supabase
      .from('support_chat_messages')
      .select('id, role, content, category, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (category) {
      // Messages in a thread share the same category (user + assistant both store it)
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as SupportChatMessage[];
  },

  /** Save a chat message and optionally persist to support_feedback for team review */
  async saveMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    category?: SupportCategory | null
  ): Promise<void> {
    const { error: msgError } = await supabase.from('support_chat_messages').insert({
      user_id: userId,
      role,
      content,
      category: category ?? null,
    });

    if (msgError) throw msgError;

    // When user sends a bug/feature/question, also save to support_feedback for team review
    if (role === 'user' && category) {
      const { error: fbError } = await supabase.from('support_feedback').insert({
        user_id: userId,
        category,
        content,
      });
      if (fbError) {
        // Log but don't fail - chat message was saved
        console.warn('[SupportChat] Failed to save feedback:', fbError);
      }
    }
  },

  /** Save assistant response (chat history only, no feedback). Category required for per-category history. */
  async saveAssistantMessage(userId: string, content: string, category: SupportCategory): Promise<void> {
    await this.saveMessage(userId, 'assistant', content, category);
  },
};
