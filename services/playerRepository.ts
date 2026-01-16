
import { supabase } from '../lib/supabase';
import { ScoutingReport } from '../types';

export interface VerifiedPlayerData {
    full_name: string;
    fide_id: string;
    uscf_id: string;
    chess_com_username: string;
    lichess_username: string;
    metadata: Record<string, unknown>;
}

export const playerRepository = {
    /**
     * Checks if a player exists by FIDE/USCF IDs.
     * Searches for a match on EITHER Fide ID OR USCF ID.
     */
    async findVerifiedPlayer(fideId: string, uscfId: string) {
        if (!fideId && !uscfId) {
            console.log('[Repository] No IDs provided for player lookup');
            return null;
        }

        console.log(`[Repository] Searching for player with FIDE: ${fideId}, USCF: ${uscfId}`);

        // Try FIDE ID first (most reliable)
        if (fideId) {
            const { data: fideMatch, error: fideError } = await supabase
                .from('players')
                .select('*')
                .eq('fide_id', fideId)
                .maybeSingle();

            if (fideError) {
                console.error('[Repository] Error searching by FIDE ID:', fideError);
            } else if (fideMatch) {
                console.log(`[Repository] Found player by FIDE ID: ${fideMatch.id}`);
                return fideMatch;
            }
        }

        // Try USCF ID if no FIDE match
        if (uscfId) {
            const { data: uscfMatch, error: uscfError } = await supabase
                .from('players')
                .select('*')
                .eq('uscf_id', uscfId)
                .maybeSingle();

            if (uscfError) {
                console.error('[Repository] Error searching by USCF ID:', uscfError);
            } else if (uscfMatch) {
                console.log(`[Repository] Found player by USCF ID: ${uscfMatch.id}`);
                return uscfMatch;
            }
        }

        console.log('[Repository] No existing player found');
        return null;
    },

    /**
     * Creates a new verified player record or updates an existing one.
     */
    async createVerifiedPlayer(data: VerifiedPlayerData) {
        // First try to find an existing player by either ID
        const existing = await this.findVerifiedPlayer(data.fide_id, data.uscf_id);

        let result;
        if (existing) {
            console.log(`[Repository] Found existing player ${existing.id}, updating...`);
            // Update existing record, preserving existing IDs if new ones aren't provided (though they should be for the match)
            // We merge the new data in.
            const { data: updatedPlayer, error } = await supabase
                .from('players')
                .update({
                    full_name: data.full_name || existing.full_name,
                    fide_id: data.fide_id || existing.fide_id,
                    uscf_id: data.uscf_id || existing.uscf_id,
                    chess_com_username: data.chess_com_username || existing.chess_com_username,
                    lichess_username: data.lichess_username || existing.lichess_username,
                    metadata: { ...existing.metadata, ...data.metadata }, // Merge metadata
                    last_scanned_at: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select()
                .single();

            if (error) throw error;
            result = updatedPlayer;
        } else {
            console.log('[Repository] Creating completely new player record...');
            console.log('[Repository] Player data:', {
                full_name: data.full_name,
                fide_id: data.fide_id,
                uscf_id: data.uscf_id,
                chess_com_username: data.chess_com_username,
                lichess_username: data.lichess_username
            });
            // Insert new
            const insertData = {
                full_name: data.full_name,
                fide_id: data.fide_id || null,
                uscf_id: data.uscf_id || null,
                chess_com_username: data.chess_com_username || null,
                lichess_username: data.lichess_username || null,
                metadata: data.metadata || {},
                last_scanned_at: new Date().toISOString()
            };
            
            console.log('[Repository] Inserting player with data:', JSON.stringify(insertData, null, 2));
            
            const { data: newPlayer, error } = await supabase
                .from('players')
                .insert(insertData)
                .select()
                .single();

            if (error) {
                console.error('[Repository] Error creating player:', error);
                console.error('[Repository] Error code:', error.code);
                console.error('[Repository] Error message:', error.message);
                console.error('[Repository] Error details:', JSON.stringify(error, null, 2));
                
                // If it's a unique constraint violation, try to find the existing player
                if (error.code === '23505' || error.message?.includes('unique')) {
                    console.log('[Repository] Unique constraint violation detected, attempting to find existing player...');
                    const existing = await this.findVerifiedPlayer(data.fide_id, data.uscf_id);
                    if (existing) {
                        console.log('[Repository] Found existing player after constraint violation:', existing.id);
                        // Update the existing player instead
                        const { data: updatedPlayer, error: updateError } = await supabase
                            .from('players')
                            .update({
                                full_name: data.full_name || existing.full_name,
                                fide_id: data.fide_id || existing.fide_id,
                                uscf_id: data.uscf_id || existing.uscf_id,
                                chess_com_username: data.chess_com_username || existing.chess_com_username,
                                lichess_username: data.lichess_username || existing.lichess_username,
                                metadata: { ...existing.metadata, ...data.metadata },
                                last_scanned_at: new Date().toISOString()
                            })
                            .eq('id', existing.id)
                            .select()
                            .single();
                        
                        if (updateError) {
                            console.error('[Repository] Error updating existing player:', updateError);
                            throw updateError;
                        }
                        console.log('[Repository] Updated existing player successfully:', updatedPlayer?.id);
                        result = updatedPlayer;
                    } else {
                        throw error;
                    }
                } else {
                    throw error;
                }
            } else {
                console.log('[Repository] Player created successfully:', newPlayer?.id);
            result = newPlayer;
            }
        }

        return result;
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
        console.log(`[Repository] Attempting to save report for player ${playerId} and user ${userId}`);
        console.log(`[Repository] Report ID: ${report.id}, Report keys:`, Object.keys(report));
        
        // Validate required fields
        if (!playerId || !userId || !report.id) {
            throw new Error(`Missing required fields: playerId=${!!playerId}, userId=${!!userId}, reportId=${!!report.id}`);
        }
        
        const { data, error } = await supabase
            .from('scouting_reports')
            .insert({
                player_id: playerId,
                report_data: report,
                user_id: userId
            })
            .select()
            .single();

        if (error) {
            console.error('[Repository] Error saving report:', error);
            console.error('[Repository] Error details:', JSON.stringify(error, null, 2));
            throw error;
        }
        console.log('[Repository] Successfully saved report to Supabase:', data?.id);
    },

    /**
     * Deletes a scouting report by ID.
     */
    async deleteReport(reportId: string) {
        console.log(`[Repository] Deleting report ${reportId}`);
        const { error, count } = await supabase
            .from('scouting_reports')
            .delete({ count: 'exact' })
            .eq('id', reportId);

        if (error) {
            console.error('[Repository] Error deleting report:', error);
            throw error;
        }

        console.log(`[Repository] Delete operation completed. Rows deleted: ${count}`);

        if (count === 0) {
            console.warn('[Repository] WARNING: Delete returned success but 0 rows were affected. This usually indicates a Row Level Security (RLS) policy is preventing the delete, or the record does not exist.');
            throw new Error('Database delete failed (0 rows affected). Please check your RLS policies.');
        }
    },

    /**
     * Fetches the complete report history for a specific user.
     */
    async getUserHistory(userId: string) {
        console.log(`[Repository] Fetching history for user ${userId}`);
        const { data, error } = await supabase
            .from('scouting_reports')
            .select(`
                *,
                players (*)
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Repository] Error fetching user history:', error);
            return [];
        }

        console.log(`[Repository] Successfully fetched ${data?.length || 0} history records`);
        return data.map(row => ({
            ...(row.report_data as ScoutingReport),
            id: row.id // Use the DB row ID
        }));
    }
};
