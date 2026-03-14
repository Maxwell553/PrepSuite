-- Migration: Support Chat and Feedback
-- Date: 2026-03-15
-- Description: Tables for support chat history and feedback (bug reports, feature requests, questions)

-- ============================================================================
-- SUPPORT CHAT MESSAGES (conversation history)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.support_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    category TEXT CHECK (category IN ('question', 'bug', 'feature')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_chat_messages_user_id ON public.support_chat_messages (user_id);
CREATE INDEX IF NOT EXISTS idx_support_chat_messages_created_at ON public.support_chat_messages (user_id, created_at);

ALTER TABLE public.support_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own support chat messages"
ON public.support_chat_messages FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own support chat messages"
ON public.support_chat_messages FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- SUPPORT FEEDBACK (bug reports, feature requests, questions for team review)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.support_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('question', 'bug', 'feature')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_feedback_user_id ON public.support_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_support_feedback_category ON public.support_feedback (category);
CREATE INDEX IF NOT EXISTS idx_support_feedback_created_at ON public.support_feedback (created_at DESC);

ALTER TABLE public.support_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own support feedback"
ON public.support_feedback FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can read their own feedback (optional, for "my submissions" view)
CREATE POLICY "Users can read own support feedback"
ON public.support_feedback FOR SELECT
USING (auth.uid() = user_id);
