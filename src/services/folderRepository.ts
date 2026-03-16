import { supabase } from '../lib/supabase';

export interface ReportFolder {
    id: string;
    user_id: string;
    name: string;
    created_at: string;
}

export const folderRepository = {
    /**
     * Creates a new report folder for the user.
     */
    async createFolder(userId: string, name: string): Promise<ReportFolder> {
        const { data, error } = await supabase
            .from('report_folders')
            .insert({ user_id: userId, name: name.trim() || 'Untitled Folder' })
            .select()
            .single();

        if (error) {
            console.error('[FolderRepository] Error creating folder:', error);
            throw error;
        }
        return data as ReportFolder;
    },
};
