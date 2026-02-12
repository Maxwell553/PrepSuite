import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeadersForRequest } from "../_shared/cors.ts";

serve(async (req) => {
  // Get CORS headers based on request origin
  const corsHeaders = getCorsHeadersForRequest(req);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[delete-user] No Authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Authorization header is required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Supabase environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    
    if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseAnonKey) {
      console.error('[delete-user] Missing Supabase environment variables');
      console.error('[delete-user] SUPABASE_URL:', supabaseUrl ? 'present' : 'missing');
      console.error('[delete-user] SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceRoleKey ? 'present' : 'missing');
      console.error('[delete-user] SUPABASE_ANON_KEY:', supabaseAnonKey ? 'present' : 'missing');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create authenticated client to verify the user
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify the user is authenticated
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError) {
      console.error('[delete-user] Authentication error:', userError);
      console.error('[delete-user] Error details:', JSON.stringify(userError, null, 2));
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: userError.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!user) {
      console.error('[delete-user] No user found after authentication');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - user not found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log('[delete-user] User authenticated:', userId);

    // Create admin client to perform deletion
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Delete user's scouting reports (explicit deletion, though cascade will handle it)
    console.log('[delete-user] Deleting user scouting reports...');
    const { error: reportsError } = await supabaseAdmin
      .from('scouting_reports')
      .delete()
      .eq('user_id', userId);

    if (reportsError) {
      console.error('[delete-user] Error deleting scouting reports:', reportsError);
      // Continue with account deletion even if reports deletion fails
    } else {
      console.log('[delete-user] Scouting reports deleted successfully');
    }

    // Delete the user account from auth.users
    console.log('[delete-user] Deleting user account...');
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error('[delete-user] Error deleting user:', deleteError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to delete user account',
          details: deleteError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[delete-user] User account deleted successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Account and all associated data have been permanently deleted'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[delete-user] ========== ERROR ==========');
    console.error('Error in delete-user function:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error message:', errorMessage);
    console.error('Error stack:', errorStack);
    console.error('[delete-user] ============================');
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage || 'Internal server error',
        details: errorStack ? 'Check function logs for details' : undefined
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
