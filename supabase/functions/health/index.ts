import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeadersForRequest } from '../_shared/cors.ts';

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: 'ok' | 'error';
    edgeFunctions: 'ok' | 'error';
  };
  version?: string;
}

serve(async (req) => {
  // Get CORS headers based on request origin
  const corsHeaders = getCorsHeadersForRequest(req);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const healthChecks: HealthCheckResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok',
        edgeFunctions: 'ok',
      },
    };

    // Check database connectivity
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
      
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { error } = await supabase.from('players').select('id').limit(1);
        
        if (error) {
          healthChecks.checks.database = 'error';
          healthChecks.status = 'degraded';
        }
      } else {
        healthChecks.checks.database = 'error';
        healthChecks.status = 'degraded';
      }
    } catch (error) {
      console.error('[Health] Database check failed:', error);
      healthChecks.checks.database = 'error';
      healthChecks.status = 'unhealthy';
    }

    // Check edge functions are accessible (basic check)
    // In a real implementation, you might ping other edge functions
    healthChecks.checks.edgeFunctions = 'ok';

    // Determine overall status
    const hasErrors = Object.values(healthChecks.checks).some(check => check === 'error');
    if (hasErrors && healthChecks.status === 'healthy') {
      healthChecks.status = 'degraded';
    }

    const statusCode = healthChecks.status === 'healthy' ? 200 : 
                      healthChecks.status === 'degraded' ? 200 : 503;

    return new Response(
      JSON.stringify(healthChecks),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: statusCode,
      }
    );
  } catch (error) {
    console.error('[Health] Health check failed:', error);
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 503,
      }
    );
  }
});
