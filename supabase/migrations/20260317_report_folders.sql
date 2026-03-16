-- Migration: Report Folders - nameable folders for batch reports
-- Description: Adds report_folders table and folder_id to scouting_reports
--              so batch reports can be saved into a named folder visible in history.

-- ============================================================================
-- REPORT FOLDERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.report_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_folders_user_id ON public.report_folders (user_id);

ALTER TABLE public.report_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own folders"
ON public.report_folders FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own folders"
ON public.report_folders FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own folders"
ON public.report_folders FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own folders"
ON public.report_folders FOR DELETE
USING (auth.uid() = user_id);

-- ============================================================================
-- ADD FOLDER_ID TO SCOUTING REPORTS
-- ============================================================================
ALTER TABLE public.scouting_reports
ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.report_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scouting_reports_folder_id ON public.scouting_reports (folder_id) WHERE folder_id IS NOT NULL;
