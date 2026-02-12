import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeadersForRequest } from "../_shared/cors.ts";

serve(async (req) => {
  // Generate unique request ID for tracking
  const requestId = crypto.randomUUID();
  
  // Log request details for debugging
  const origin = req.headers.get('origin');
  console.log(`[Function] [${requestId}] Request received:`, {
    method: req.method,
    origin: origin || 'no origin header',
    url: req.url,
  });
  
  // Get CORS headers based on request origin
  // Always get CORS headers first to ensure they're available even on errors
  let corsHeaders: Record<string, string>;
  try {
    corsHeaders = getCorsHeadersForRequest(req);
    console.log('[Function] CORS headers:', corsHeaders);
  } catch (corsError) {
    // Fallback CORS headers if helper fails (use strict origin in production)
    console.error('[Function] CORS helper error:', corsError);
    const isProduction = Deno.env.get('ENVIRONMENT') === 'production';
    const fallbackOrigin = isProduction ? 'https://prepsuite.ai' : '*';
    corsHeaders = {
      'Access-Control-Allow-Origin': fallbackOrigin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
  }
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('[Function] CORS preflight request');
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
    // Google Search enabled by default for identity resolution (needed for finding usernames)
    const useGoogleSearch = requestBody.useGoogleSearch !== false; // Default to true for identity resolution
    
    // Generic wrapper: do NOT hardcode search sites - the prompt specifies what to search
    // (FIDE/USCF prompts use site:ratings.fide.com, site:ratings.uschess.org;
    //  Chess.com/Lichess prompts use site:chess.com, site:lichess.org)
    const optimizedPrompt = `You are a chess database search agent. You MUST use Google Search to find the requested information.
1. Perform the search(es) specified in the prompt below (use the exact site: queries it mentions)
2. Extract information from the search results - do NOT guess or infer from your training data
3. For username discovery: search site:chess.com and site:lichess.org to find player profile URLs, then extract usernames from those URLs
4. Return ONLY raw JSON. Do NOT wrap in \`\`\`json or markdown code blocks - output the JSON object directly with no other text.

${prompt}`;
    
    const geminiRequestBody: any = {
      contents: [
        {
          parts: [{ text: optimizedPrompt }]
        }
      ],
      generationConfig: {
        maxOutputTokens: 2048, // Enough for complete JSON (avoids truncation + markdown wrapper)
        temperature: 0.0, // Zero temperature for most deterministic responses
      }
    };
    
    // Enable Google Search if requested
    if (useGoogleSearch) {
      geminiRequestBody.tools = [
        {
          googleSearch: {}
        }
      ];
      console.log('[Function] Google Search enabled with optimized config');
    } else {
      console.log('[Function] Google Search disabled');
    }

    console.log(`[Function] [${requestId}] Calling Gemini REST API...`);

    // Call Gemini REST API - using Gemini 3 Flash Preview
    // Model name: gemini-3-flash-preview
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`;
    
    // Add timeout to prevent function timeout (Supabase functions have ~60s timeout)
    // Set to 55 seconds to maximize time for Google Search while staying under Supabase limit
    // Google Search can take 30-90 seconds for comprehensive searches
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error(`[Function] [${requestId}] Request timeout after 55 seconds - aborting`);
      controller.abort();
    }, 55000); // 55 second timeout - maximum time for Google Search (stays under Supabase's ~60s limit)
    
    // Retry logic for transient failures (network errors and 503 overloaded)
    const maxRetries = 2;
    let geminiResponse: Response | null = null;
    let lastFetchError: any = null;
    let lastErrorText: string | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[Function] [${requestId}] Retry attempt ${attempt}/${maxRetries}...`);
          // Exponential backoff with jitter: 2s, 4s
          const backoffMs = 2000 * attempt + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
        
        geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(geminiRequestBody),
          signal: controller.signal,
        });
        
        console.log(`[Function] [${requestId}] Gemini API response status (attempt ${attempt + 1}):`, geminiResponse.status);
        
        // If successful, break out of retry loop
        if (geminiResponse.ok) {
          clearTimeout(timeoutId);
          break;
        }
        
        // If 503 (model overloaded) and we have retries left, continue
        if (geminiResponse.status === 503 && attempt < maxRetries) {
          lastErrorText = await geminiResponse.text();
          console.warn(`[Function] [${requestId}] Model overloaded (503) on attempt ${attempt + 1}, will retry...`);
          geminiResponse = null; // Reset so we retry
          continue;
        }
        
        // For other errors or final retry, break and handle below
        clearTimeout(timeoutId);
        break;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        lastFetchError = fetchError;
        
        if (fetchError.name === 'AbortError' || fetchError.message?.includes('aborted')) {
          console.error(`[Function] [${requestId}] Request timeout after 55 seconds`);
          
          // If Google Search was enabled and timed out, suggest retrying without it
          if (useGoogleSearch) {
            return new Response(
              JSON.stringify({ 
                error: 'Request timeout. Google Search took too long (over 55 seconds).',
                code: 504,
                suggestion: 'Retry with useGoogleSearch: false, or try a simpler player name.',
                retryWithoutSearch: true,
                requestId
              }),
              { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          return new Response(
            JSON.stringify({ 
              error: 'Request timeout. The Gemini API call took too long (over 55 seconds).',
              code: 504,
              suggestion: 'Try a simpler query or check function logs. This may be a temporary issue.',
              requestId
            }),
            { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // For network errors, retry if we have attempts left
        if (attempt < maxRetries) {
          console.warn(`[Function] [${requestId}] Network error on attempt ${attempt + 1}, will retry...`, fetchError.message);
          continue;
        }
        
        // If all retries exhausted, throw
        throw fetchError;
      }
    }
    
    if (!geminiResponse || !geminiResponse.ok) {
      const errorText = lastErrorText || (geminiResponse ? await geminiResponse.text() : 'No response received');
      console.error(`[Function] [${requestId}] Gemini API error:`, errorText);
      
      // Handle rate limiting specifically
      if (geminiResponse && geminiResponse.status === 429) {
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        console.error(`[Function] [${requestId}] Rate limit (429) detected:`, errorData);
        return new Response(
          JSON.stringify({ 
            error: `Rate limit exceeded (429). Please wait before retrying.`,
            details: errorData,
            code: 429,
            requestId
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Handle 503 (model overloaded) with helpful message
      if (geminiResponse && geminiResponse.status === 503) {
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        console.error(`[Function] [${requestId}] Model overloaded (503) after retries:`, errorData);
        return new Response(
          JSON.stringify({ 
            error: `Gemini API server error (503). This is usually temporary.`,
            details: errorData,
            code: 503,
            requestId,
            suggestion: 'Please retry in a few moments.'
          }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // For other 500 errors from Gemini, provide more context
      if (geminiResponse && geminiResponse.status >= 500) {
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        console.error(`[Function] [${requestId}] Gemini API ${geminiResponse.status} error:`, errorData);
        return new Response(
          JSON.stringify({ 
            error: `Gemini API server error (${geminiResponse.status}). This is usually temporary.`,
            details: errorData,
            code: geminiResponse.status,
            requestId,
            suggestion: 'Please retry in a few moments.'
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: `Gemini API error (${geminiResponse?.status || 500}): ${errorText}`,
          code: geminiResponse?.status || 500,
          requestId
        }),
        { status: geminiResponse?.status && geminiResponse.status >= 500 ? 500 : (geminiResponse?.status || 500), headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let geminiData: any;
    try {
      // First get the response as text to check format
      const responseText = await geminiResponse.text();
      
      // Check if response is actually JSON
      if (!responseText.trim().startsWith('{') && !responseText.trim().startsWith('[')) {
        console.error(`[Function] [${requestId}] Response is not JSON:`, responseText.substring(0, 200));
        
        // Check if it's an HTML error page
        if (responseText.includes('<html>') || responseText.includes('<!DOCTYPE')) {
          return new Response(
            JSON.stringify({ 
              error: 'Gemini API returned HTML error page',
              details: 'The API endpoint may be incorrect or unavailable',
              requestId
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        return new Response(
          JSON.stringify({ 
            error: 'Invalid response format from Gemini API',
            details: 'Response is not JSON',
            preview: responseText.substring(0, 200),
            requestId
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      geminiData = JSON.parse(responseText);
    } catch (jsonError) {
      console.error(`[Function] [${requestId}] Failed to parse Gemini response as JSON:`, jsonError);
      const responseText = await geminiResponse.text();
      console.error(`[Function] [${requestId}] Raw response:`, responseText.substring(0, 500));
      return new Response(
        JSON.stringify({ 
          error: 'Invalid response format from Gemini API',
          details: 'Response could not be parsed as JSON',
          preview: responseText.substring(0, 200),
          requestId
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[Function] [${requestId}] Gemini response received`);

    // Extract text from response - check multiple possible structures
    // Google Search results should be automatically included in the text response
    const candidate = geminiData.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    
    // Find text part (may be mixed with function calls)
    let responseText = '';
    for (const part of parts) {
      if (part.text) {
        responseText = part.text;
        break;
      }
    }
    
    // Fallback to other possible text locations
    if (!responseText) {
      responseText = candidate?.content?.text ||
                     geminiData.text ||
                     '';
    }
    
    // Check finishReason for safety/content filtering
    const finishReason = candidate?.finishReason;
    
    // Handle MAX_TOKENS (truncation) - retry with higher token limit
    if (finishReason === 'MAX_TOKENS') {
      console.warn(`[Function] [${requestId}] Response truncated (MAX_TOKENS), retrying with higher limit...`);
      
      // Retry with much higher token limit
      const retryRequestBody: any = {
        contents: geminiRequestBody.contents,
        generationConfig: {
          ...geminiRequestBody.generationConfig,
          maxOutputTokens: 2048
        }
      };
      
      // Disable Google Search for retry to avoid timeout
      if (useGoogleSearch) {
        console.log(`[Function] [${requestId}] Retrying without Google Search to avoid timeout`);
      }
      
      try {
        const retryResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(retryRequestBody),
          signal: controller.signal,
        });
        
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryCandidate = retryData.candidates?.[0];
          const retryParts = retryCandidate?.content?.parts || [];
          let retryText = '';
          for (const part of retryParts) {
            if (part.text) {
              retryText = part.text;
              break;
            }
          }
          
          if (retryText && retryText.trim().length > 0) {
            console.log(`[Function] [${requestId}] Retry with higher token limit successful, length: ${retryText.length}`);
            return new Response(
              JSON.stringify({ text: retryText, requestId }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      } catch (retryError) {
        console.error(`[Function] [${requestId}] Retry request failed:`, retryError);
        // Continue with original response if retry fails
      }
    }
    
    // Handle MALFORMED_FUNCTION_CALL by retrying without Google Search
    if ((!responseText || responseText.trim().length === 0) && finishReason === 'MALFORMED_FUNCTION_CALL') {
      console.warn(`[Function] [${requestId}] Malformed function call detected, retrying without Google Search...`);
      
      // Retry without Google Search as fallback
      const fallbackRequestBody: any = {
        contents: geminiRequestBody.contents,
        generationConfig: {
          ...geminiRequestBody.generationConfig,
          maxOutputTokens: 2048
        }
      };
      
      try {
        const fallbackResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fallbackRequestBody),
          signal: controller.signal,
        });
        
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          const fallbackParts = fallbackData.candidates?.[0]?.content?.parts || [];
          let fallbackText = '';
          for (const part of fallbackParts) {
            if (part.text) {
              fallbackText = part.text;
              break;
            }
          }
          
          if (fallbackText && fallbackText.trim().length > 0) {
            console.log(`[Function] [${requestId}] Fallback response successful`);
            return new Response(
              JSON.stringify({ text: fallbackText, requestId }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      } catch (fallbackError) {
        console.error(`[Function] [${requestId}] Fallback request failed:`, fallbackError);
      }
    }
    
    if (!responseText || responseText.trim().length === 0) {
      console.error(`[Function] [${requestId}] Empty response from Gemini`);
      console.error(`[Function] [${requestId}] Full response:`, JSON.stringify(geminiData, null, 2));
      
      // Check if content was blocked by safety filters
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        return new Response(
          JSON.stringify({ 
            error: 'Content was blocked by safety filters',
            finishReason,
            code: 400,
            requestId
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Check if there's an error in the response
      if (geminiData.error) {
        return new Response(
          JSON.stringify({ 
            error: geminiData.error.message || 'Gemini API error',
            details: geminiData.error,
            requestId
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: 'Empty response from Gemini API',
          details: {
            finishReason,
            hasCandidates: !!geminiData.candidates,
            candidatesLength: geminiData.candidates?.length || 0,
            message: 'The API returned no text content. This may be due to content filtering or an unexpected response structure.'
          },
          requestId
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Function] [${requestId}] Response text length:`, responseText.length);
    console.log(`[Function] [${requestId}] Finish reason:`, finishReason);
    
    // Warn if response was truncated
    if (finishReason === 'MAX_TOKENS') {
      console.warn(`[Function] [${requestId}] WARNING: Response was truncated due to MAX_TOKENS limit. Response length: ${responseText.length}`);
    }

    return new Response(
      JSON.stringify({ text: responseText, requestId, finishReason }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    } catch (error) {
    console.error(`[Function] [${requestId}] ========== ERROR ==========`);
    console.error(`[Function] [${requestId}] Error in gemini-identity function:`, error);
    console.error(`[Function] [${requestId}] Error type:`, error?.constructor?.name);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`[Function] [${requestId}] Error message:`, errorMessage);
    console.error(`[Function] [${requestId}] Error stack:`, errorStack);
    
    // Log additional error details
    if (error && typeof error === 'object') {
      console.error(`[Function] [${requestId}] Error keys:`, Object.keys(error));
      console.error(`[Function] [${requestId}] Full error:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    }
    
    console.error(`[Function] [${requestId}] ============================`);
    
    // Ensure CORS headers are always included in error response
    const errorHeaders = {
      ...corsHeaders,
      'Content-Type': 'application/json',
    };
    
    // Determine appropriate status code
    let statusCode = 500;
    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      statusCode = 504;
    } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      statusCode = 502; // Bad Gateway for network issues
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage || 'Internal server error',
        details: errorStack ? 'Check function logs for details' : undefined,
        type: error?.constructor?.name || 'Unknown',
        requestId
      }),
      { status: statusCode, headers: errorHeaders }
    );
  }
});
