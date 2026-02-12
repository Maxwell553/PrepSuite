import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeadersForRequest } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeadersForRequest(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      console.log('[gemini-chat] Authorization header present');
    } else {
      console.warn('[gemini-chat] No Authorization header');
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      console.error('[gemini-chat] GEMINI_API_KEY not found');
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let requestBody: { prompt?: string };
    try {
      requestBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { prompt } = requestBody;
    if (!prompt || typeof prompt !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Prompt is required (string)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[gemini-chat] Prompt length:', prompt.length);

    // Plain text generation - NO JSON mode, NO schema, high token limit for long answers
    const geminiRequestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 16384,
        temperature: 0.7,
      },
    };

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiRequestBody),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('[gemini-chat] Gemini error:', geminiResponse.status, errorText);
      return new Response(
        JSON.stringify({
          error: `Gemini API error: ${errorText}`,
          code: geminiResponse.status,
        }),
        {
          status: geminiResponse.status >= 500 ? 500 : geminiResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const rawBody = await geminiResponse.text();
    let geminiData: any;
    try {
      geminiData = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error('[gemini-chat] Failed to parse Gemini response as JSON:', parseErr);
      return new Response(
        JSON.stringify({ error: 'Invalid response from Gemini API', details: rawBody?.slice(0, 300) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const text =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ??
      geminiData?.candidates?.[0]?.content?.text ??
      (typeof geminiData?.candidates?.[0]?.content?.parts?.[0] === 'string' ? geminiData.candidates[0].content.parts[0] : '') ??
      '';

    if (!text || (typeof text === 'string' && !text.trim())) {
      const blockReason = geminiData?.candidates?.[0]?.finishReason;
      console.error('[gemini-chat] Empty response from Gemini', { blockReason, hasCandidates: !!geminiData?.candidates?.length });
      return new Response(
        JSON.stringify({
          error: 'Empty response from Gemini',
          details: blockReason ? `finishReason: ${blockReason}` : undefined,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[gemini-chat] Response length:', text.length);
    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[gemini-chat] Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
