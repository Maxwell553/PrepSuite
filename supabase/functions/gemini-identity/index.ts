import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Gemini API key from environment secrets
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY not found in environment');
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured. Please set it using: supabase secrets set GEMINI_API_KEY=your-key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Function] API key found, length:', geminiApiKey.length);

    // Parse request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { prompt } = requestBody;

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Function] Prompt received, length:', prompt.length);

    // Build request body for Gemini REST API
    const geminiRequestBody = {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    };

    console.log('[Function] Calling Gemini REST API...');

    // Call Gemini REST API - using Gemini 3.0 Flash (latest)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash:generateContent?key=${geminiApiKey}`;
    
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(geminiRequestBody),
    });

    console.log('[Function] Gemini API response status:', geminiResponse.status);

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('[Function] Gemini API error:', errorText);
      throw new Error(`Gemini API error (${geminiResponse.status}): ${errorText}`);
    }

    const geminiData = await geminiResponse.json();
    console.log('[Function] Gemini response received');

    // Extract text from response
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!responseText || responseText.trim().length === 0) {
      console.error('[Function] Empty response from Gemini');
      console.error('[Function] Full response:', JSON.stringify(geminiData, null, 2));
      throw new Error('Empty response from Gemini API');
    }

    console.log('[Function] Response text length:', responseText.length);

    return new Response(
      JSON.stringify({ text: responseText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Function] ========== ERROR ==========');
    console.error('Error in gemini-identity function:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error message:', errorMessage);
    console.error('Error stack:', errorStack);
    console.error('[Function] ============================');
    return new Response(
      JSON.stringify({ 
        error: errorMessage || 'Internal server error',
        details: errorStack ? 'Check function logs for details' : undefined
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
