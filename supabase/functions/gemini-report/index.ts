import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeadersForRequest } from "../_shared/cors.ts";

serve(async (req) => {
  console.log('[Function] Request received');
  
  // Get CORS headers based on request origin
  const corsHeaders = getCorsHeadersForRequest(req);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('[Function] CORS preflight');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[Function] Processing request...');
    
    // Supabase infrastructure automatically verifies JWTs before requests reach this function
    // If the request reaches here, the JWT is already valid (similar to gemini-identity)
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      console.log('[Function] Authorization header present - JWT verified by Supabase infrastructure');
    } else {
      console.warn('[Function] No Authorization header - but request reached function (may be from test interface)');
    }
    
    // Get Gemini API key from environment secrets
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      console.error('[Function] GEMINI_API_KEY not found');
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Function] API key found, length:', geminiApiKey.length);

    // Parse request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('[Function] Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ code: 400, message: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { prompt, responseSchema } = requestBody;

    if (!prompt) {
      console.error('[Function] Missing prompt');
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Function] Prompt length:', typeof prompt === 'string' ? prompt.length : 'array');

    // Handle prompt format
    const promptText = typeof prompt === 'string' 
      ? prompt 
      : prompt.map((p: any) => p.parts.map((part: any) => part.text).join('')).join('\n');

    // Build Gemini request
    const geminiRequestBody: any = {
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: { 
        responseMimeType: "application/json",
        maxOutputTokens: 65536, // Maximum allowed - prevents truncation (finishReason: MAX_TOKENS)
        temperature: 0.7 // Balanced creativity for comprehensive reports
      }
    };

    if (responseSchema) {
      geminiRequestBody.generationConfig.responseSchema = responseSchema;
    }

    console.log('[Function] Calling Gemini API...');

    // Call Gemini REST API - using Gemini 3 Flash Preview (latest)
    // Model name: gemini-3-flash-preview
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`;
    
    // Retry logic for 503 errors (model overloaded)
    const maxRetries = 2;
    let geminiResponse: Response | null = null;
    let lastError: string | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 5s, 10s
        const backoffMs = 5000 * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 2000; // 0-2s jitter
        console.log(`[Function] Retry attempt ${attempt}/${maxRetries} after ${Math.round((backoffMs + jitter) / 1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs + jitter));
      }
      
      geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiRequestBody),
      });

      console.log(`[Function] Gemini response status (attempt ${attempt + 1}):`, geminiResponse.status);

      // If successful, break out of retry loop
      if (geminiResponse.ok) {
        break;
      }
      
      // If 503 and we have retries left, continue
      if (geminiResponse.status === 503 && attempt < maxRetries) {
        const errorText = await geminiResponse.text();
        console.warn(`[Function] Model overloaded (503) on attempt ${attempt + 1}, will retry...`);
        lastError = errorText;
        continue;
      }
      
      // For other errors or final retry, break and handle below
      break;
    }

    if (!geminiResponse || !geminiResponse.ok) {
      const errorText = lastError || (geminiResponse ? await geminiResponse.text() : 'No response received');
      console.error('[Function] Gemini error:', errorText);
      
      // Handle rate limiting specifically
      if (geminiResponse && geminiResponse.status === 429) {
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        console.error('[Function] Rate limit (429) detected:', errorData);
        return new Response(
          JSON.stringify({ 
            error: `Rate limit exceeded (429). Please wait before retrying.`,
            details: errorData,
            code: 429
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
        
        console.error('[Function] Model overloaded (503) after retries:', errorData);
        return new Response(
          JSON.stringify({ 
            error: `Gemini API server error (503). This is usually temporary.`,
            details: errorData,
            code: 503,
            suggestion: 'Please retry in a few moments.'
          }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${errorText}`, code: geminiResponse?.status || 500 }),
        { status: (geminiResponse?.status && geminiResponse.status >= 500) ? 500 : (geminiResponse?.status || 500), headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!geminiResponse) {
      return new Response(
        JSON.stringify({ error: 'No response received from Gemini API' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiData = await geminiResponse.json();
    let responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    console.log('[Function] Response text length:', responseText.length);
    console.log('[Function] Response finish reason:', geminiData.candidates?.[0]?.finishReason);

    if (!responseText) {
      console.error('[Function] Empty response');
      return new Response(
        JSON.stringify({ error: 'Empty response from Gemini' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if response was truncated (finishReason indicates truncation)
    const finishReason = geminiData.candidates?.[0]?.finishReason;
    const isTruncated = finishReason === 'MAX_TOKENS' || finishReason === 'OTHER';
    
    if (isTruncated) {
      console.warn('[Function] Response was truncated by Gemini (finishReason:', finishReason, ')');
    }

    // Check if response might be truncated (common with large responses)
    if (responseText.length > 100000) {
      console.warn('[Function] Large response detected, may be truncated');
    }

    // Helper function to check if JSON appears complete
    const isJsonComplete = (jsonStr: string): boolean => {
      const trimmed = jsonStr.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
      
      // Count braces/brackets to check balance
      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      let escapeNext = false;
      
      for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (inString) continue;
        
        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
        if (char === '[') openBrackets++;
        if (char === ']') openBrackets--;
      }
      
      return openBraces === 0 && openBrackets === 0;
    };

    // Parse JSON with improved error handling
    let parsedResponse;
    try {
      // Try direct JSON parse first
      parsedResponse = JSON.parse(responseText);
      console.log('[Function] Successfully parsed JSON directly');
    } catch (parseError: any) {
      console.warn('[Function] Direct JSON parse failed, trying extraction and repair...', parseError.message);
      
      // Check if JSON appears incomplete
      const jsonStart = responseText.indexOf('{');
      const jsonEnd = responseText.lastIndexOf('}');
      
      if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
        console.error('[Function] No valid JSON structure found');
        return new Response(
          JSON.stringify({ 
            error: 'Gemini response does not contain valid JSON. Response may be incomplete.',
            responseLength: responseText.length,
            finishReason: finishReason,
            responsePreview: responseText.substring(0, 500),
            lastChars: responseText.substring(Math.max(0, responseText.length - 100))
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Try extracting JSON object
      const extractedJson = responseText.substring(jsonStart, jsonEnd + 1);
      
      // Helper to count brace/bracket imbalance
      const getImbalance = (s: string): { braces: number; brackets: number } => {
        let openBraces = 0, openBrackets = 0, inString = false, escapeNext = false;
        const quote = '"';
        for (let i = 0; i < s.length; i++) {
          const c = s[i];
          if (escapeNext) { escapeNext = false; continue; }
          if (c === '\\') { escapeNext = true; continue; }
          if (c === quote && !escapeNext) { inString = !inString; continue; }
          if (inString) continue;
          if (c === '{') openBraces++;
          if (c === '}') openBraces--;
          if (c === '[') openBrackets++;
          if (c === ']') openBrackets--;
        }
        return { braces: openBraces, brackets: openBrackets };
      };

      // Check if extracted JSON appears complete
      if (!isJsonComplete(extractedJson)) {
        console.error('[Function] Extracted JSON appears incomplete (unbalanced braces)');
        console.error('[Function] Last 200 chars:', extractedJson.substring(Math.max(0, extractedJson.length - 200)));
        
        let repairedJson = extractedJson;
        let foundComplete = false;
        
        // Strategy 1: Find last complete JSON by trimming from end (extractedJson is 0-based)
        for (let i = extractedJson.length - 1; i >= 0; i--) {
          const testJson = extractedJson.substring(0, i + 1);
          if (isJsonComplete(testJson)) {
            repairedJson = testJson;
            foundComplete = true;
            console.log('[Function] Found complete JSON ending at position', i, '(trimmed', extractedJson.length - i - 1, 'chars)');
            break;
          }
        }
        
        // Strategy 2: If truncation cut off the end, try closing with missing } and ]
        if (!foundComplete) {
          const { braces, brackets } = getImbalance(extractedJson);
          if (braces > 0 || brackets > 0) {
            const suffix = ']'.repeat(Math.max(0, brackets)) + '}'.repeat(Math.max(0, braces));
            const closed = extractedJson + suffix;
            if (isJsonComplete(closed)) {
              try {
                parsedResponse = JSON.parse(closed);
                console.log('[Function] Successfully parsed JSON closed with', suffix.length, 'chars');
                foundComplete = true;
              } catch {
                // Fall through to error
              }
            }
          }
        }
        
        if (!foundComplete) {
          return new Response(
            JSON.stringify({ 
              error: 'Gemini response contains incomplete JSON that could not be repaired. The response may have been truncated.',
              responseLength: responseText.length,
              finishReason: finishReason,
              extractedLength: extractedJson.length,
              responsePreview: responseText.substring(0, 500),
              lastChars: responseText.substring(Math.max(0, responseText.length - 200))
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        if (!parsedResponse) {
          try {
            parsedResponse = JSON.parse(repairedJson);
            console.log('[Function] Successfully parsed repaired JSON');
          } catch (repairError) {
            console.error('[Function] Failed to parse repaired JSON:', repairError);
            return new Response(
              JSON.stringify({ 
                error: 'Gemini response contains incomplete JSON that could not be repaired.',
                responseLength: responseText.length,
                finishReason: finishReason,
                responsePreview: responseText.substring(0, 500)
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      } else {
        // Extracted JSON appears complete, try parsing it
        try {
          parsedResponse = JSON.parse(extractedJson);
          console.log('[Function] Successfully parsed extracted JSON');
        } catch (extractError) {
          console.error('[Function] Failed to parse extracted JSON:', extractError);
          return new Response(
            JSON.stringify({ 
              error: 'Gemini response does not contain valid JSON. Response may be incomplete.',
              responseLength: responseText.length,
              finishReason: finishReason,
              responsePreview: responseText.substring(0, 500)
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    console.log('[Function] Success!');
    return new Response(
      JSON.stringify({ data: parsedResponse }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Function] ========== UNHANDLED ERROR ==========');
    console.error('[Function] Error type:', error?.constructor?.name);
    console.error('[Function] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[Function] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[Function] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error('[Function] ======================================');
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error && error.stack ? { stack: error.stack } : {};
    
    return new Response(
      JSON.stringify({ 
        code: 500,
        message: errorMessage,
        ...errorDetails
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
