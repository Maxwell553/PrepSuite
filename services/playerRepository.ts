
import { supabase } from '../lib/supabase';
import { ScoutingReport } from '../types';

export interface VerifiedPlayerData {
    full_name: string;
    fide_id: string;
    uscf_id: string;
    chess_com_username: string;
    lichess_username: string;
    metadata: any;
}

export const playerRepository = {
    /**
     * Checks if a player exists by FIDE/USCF IDs.
     */
    async findVerifiedPlayer(fideId: string, uscfId: string) {
        if (!fideId || !uscfId) return null;

        const { data, error } = await supabase
            .from('players')
            .select('*')
            .eq('fide_id', fideId)
            .eq('uscf_id', uscfId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found"
            console.error('Error finding player:', error);
        }

        return data;
    },

    /**
     * Creates a new verified player record.
     */
    async createVerifiedPlayer(data: VerifiedPlayerData) {
        // Upsert based on IDs to avoid duplicates if race condition
        const { data: newPlayer, error } = await supabase
            .from('players')
            .upsert({
                full_name: data.full_name,
                fide_id: data.fide_id,
                uscf_id: data.uscf_id,
                chess_com_username: data.chess_com_username,
                lichess_username: data.lichess_username,
                metadata: data.metadata,
                last_scanned_at: new Date().toISOString()
            }, { onConflict: 'fide_id,uscf_id' }) // Constraint requires unique index
            .select()
            .single();

        if (error) {
            console.error('Error creating player:', error);
            throw error;
        }
        return newPlayer;
    },

    /**
     * Gets the latest valid scouting report for a player.
     */
    async getLatestReport(playerId: string) {
        const { data, error } = await supabase
            .from('scouting_reports')
            .select('*')
            .eq('player_id', playerId)
            .gt('valid_until', new Date().toISOString()) // Only future valid_until
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching report:', error);
        }

        if (data) {
            return data.report_data as ScoutingReport;
        }
        return null;
    },

    /**
     * Saves a new scouting report.
     */
    async saveReport(playerId: string, report: ScoutingReport, userId: string) {
        const { error } = await supabase
            .from('scouting_reports')
            .insert({
                player_id: playerId,
                report_data: report,
                user_id: userId
            });

    },

    /**
     * Fetches the complete report history for a specific user.
     */
    async getUserHistory(userId: string) {
        const { data, error } = await supabase
            .from('scouting_reports')
            .select(`
                *,
                players (*)
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching user history:', error);
            return [];
        }

        return data.map(row => ({
            ...(row.report_data as ScoutingReport),
            id: row.id // Use the DB row ID
        }));
    }
};
