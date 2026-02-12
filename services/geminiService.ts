import { supabase } from '../lib/supabase';
import { getEnvConfig } from '../lib/env';

/**
 * Service for calling Gemini API via Supabase Edge Functions
 * This keeps the API key secure on the server side
 */
export const geminiService = {
  /**
   * Calls Gemini API WITHOUT Google Search (for FIDE/USCF ID lookup using Gemini's knowledge)
   */
  async generateContentWithoutSearch(prompt: string): Promise<string> {
    const config = getEnvConfig();
    console.log('[Gemini] Calling gemini-identity function (no Google Search)...');
    
    try {
      // Get session if available, but also pass anon key for unauthenticated requests
      const { data: { session } } = await supabase.auth.getSession();
      
      // Build headers - use session token if available, otherwise use anon key
      const headers: Record<string, string> = {
        'apikey': config.supabaseAnonKey
      };
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
        console.log('[Gemini] Using authenticated session');
      } else {
        console.log('[Gemini] No session found, using anon key');
      }
      
      // Disable Google Search for FIDE/USCF ID searches (use Gemini's knowledge only)
      const { data, error } = await supabase.functions.invoke('gemini-identity', {
        body: { 
          prompt,
          useGoogleSearch: false // Disabled for FIDE/USCF searches - use Gemini's knowledge only
        },
        headers
      });

      console.log('[Gemini] Function response data:', data);
      console.log('[Gemini] Function response error:', error);

      if (error) {
        // Enhanced error extraction (same as report function)
        console.error('[Gemini] ========== ERROR DETAILS ==========');
        console.error('[Gemini] Error object:', error);
        console.error('[Gemini] Error type:', error.constructor?.name);
        console.error('[Gemini] Error name:', (error as any)?.name);
        console.error('[Gemini] Error message:', error.message);
        console.error('[Gemini] Error keys:', Object.keys(error));
        console.error('[Gemini] Full error JSON:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        
        const errorAny = error as any;
        console.error('[Gemini] error.status:', errorAny.status);
        console.error('[Gemini] error.statusCode:', errorAny.statusCode);
        console.error('[Gemini] error.context:', errorAny.context);
        console.error('[Gemini] error.response:', errorAny.response);
        console.error('[Gemini] error.value:', errorAny.value);
        console.error('[Gemini] error.message:', errorAny.message);
        
        let errorStatus = errorAny.status || errorAny.statusCode || 500;
        let errorMessage = error.message || 'Unknown error';
        let errorData: any = null;
        
        // Try to extract error from response context
        if (errorAny.context) {
          errorData = errorAny.context.data || errorAny.context.body || errorAny.context;
          if (errorData && typeof errorData === 'object') {
            console.error('[Gemini] Error response:', JSON.stringify(errorData, null, 2));
            if (errorData.error) errorMessage = errorData.error;
            else if (errorData.message) errorMessage = errorData.message;
            // Extract status code from error data if available
            if (errorData.code && !errorStatus) errorStatus = errorData.code;
          }
          
          // Try to read response body if it's a Response object
          if (errorAny.context instanceof Response) {
            try {
              const responseText = await errorAny.context.text();
              console.error('[Gemini] Response body:', responseText);
              const parsed = JSON.parse(responseText);
              errorData = parsed;
              if (parsed.error) errorMessage = parsed.error;
              else if (parsed.message) errorMessage = parsed.message;
              // Extract status code from parsed response (prioritize this)
              if (parsed.code) errorStatus = parsed.code;
            } catch (e) {
              console.error('[Gemini] Failed to parse response body:', e);
            }
          }
        }
        
        // Also check error.value (Supabase FunctionsHttpError structure)
        if (errorAny.value) {
          console.error('[Gemini] error.value:', errorAny.value);
          if (typeof errorAny.value === 'string') {
            try {
              const parsed = JSON.parse(errorAny.value);
              errorData = parsed;
              if (parsed.error) errorMessage = parsed.error;
              else if (parsed.message) errorMessage = parsed.message;
              // Extract status code from parsed value
              if (parsed.code && !errorStatus) errorStatus = parsed.code;
            } catch (e) {
              // Not JSON, use as-is
              errorMessage = errorAny.value;
            }
          } else if (typeof errorAny.value === 'object') {
            errorData = errorAny.value;
            if (errorAny.value.error) errorMessage = errorAny.value.error;
            else if (errorAny.value.message) errorMessage = errorAny.value.message;
            // Extract status code from error value
            if (errorAny.value.code && !errorStatus) errorStatus = errorAny.value.code;
          }
        }
        
        // Final attempt: parse error message to extract code if it contains JSON
        // This handles cases where the error details are embedded in the message string
        if (errorMessage.includes('{')) {
          try {
            const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              // Always update errorStatus if we find a code in the parsed JSON
              if (parsed.code) {
                errorStatus = parsed.code;
                console.log('[Gemini] Extracted error code from message:', parsed.code);
              }
              if (parsed.error && !errorMessage.includes(parsed.error)) {
                errorMessage = parsed.error;
              }
              // Merge with existing errorData
              errorData = { ...errorData, ...parsed };
            }
          } catch (e) {
            // Ignore parse errors
            console.warn('[Gemini] Failed to parse JSON from error message:', e);
          }
        }
        
        console.error('[Gemini] ======================================');
        console.error('[Gemini] Final errorStatus:', errorStatus);
        console.error('[Gemini] Final errorMessage:', errorMessage);
        
        // Handle 401 specifically (often "Invalid JWT" = expired token)
        if (errorStatus === 401) {
          const authMsg = errorMessage?.toLowerCase().includes('jwt') || errorMessage?.toLowerCase().includes('invalid')
            ? 'Your session may have expired. Please log out and log in again.'
            : `Authentication failed (401). ${errorMessage}`;
          throw new Error(authMsg);
        }
        
        // Handle FunctionsFetchError (network/connection issues)
        if (errorAny.name === 'FunctionsFetchError' || errorMessage.includes('Failed to send a request')) {
          throw new Error(`Failed to reach Edge Function. The function may not be deployed or there's a network issue. Error: ${errorMessage}`);
        }
        
        if (!errorStatus || errorStatus === 0) {
          throw new Error(`Failed to reach Edge Function. Error: ${errorMessage}. Check if the function is deployed: supabase functions deploy gemini-identity`);
        }
        
        // Include error data in message if available
        const errorDetails = errorData ? ` Details: ${JSON.stringify(errorData)}` : '';
        throw new Error(`Gemini API error (${errorStatus}): ${errorMessage}${errorDetails}`);
      }

      // Check if the response itself indicates an error
      if (data && data.error) {
        console.error('[Gemini] Edge Function returned error:', data.error);
        throw new Error(`Edge Function error: ${data.error}`);
      }

      if (!data || !data.text) {
        console.error('[Gemini] Empty or invalid response:', data);
        throw new Error('Empty response from Gemini API');
      }

      return data.text;
    } catch (err: any) {
      console.error('[Gemini] ========== EXCEPTION CAUGHT ==========');
      console.error('[Gemini] Exception type:', err?.constructor?.name);
      console.error('[Gemini] Exception message:', err?.message);
      console.error('[Gemini] Exception stack:', err?.stack);
      console.error('[Gemini] Full exception:', err);
      
      if (err && typeof err === 'object') {
        const errAny = err as any;
        console.error('[Gemini] err.status:', errAny.status);
        console.error('[Gemini] err.context:', errAny.context);
        if (errAny.context) {
          const errorData = errAny.context.data || errAny.context.body || errAny.context;
          console.error('[Gemini] Error data from context:', JSON.stringify(errorData, null, 2));
        }
      }
      console.error('[Gemini] ======================================');
      
      if (err.message) {
        throw err;
      }
      throw new Error(`Failed to call Gemini API: ${err.toString()}`);
    }
  },

  /**
   * Calls Gemini API WITH Google Search (for username discovery on chess.com/lichess)
   */
  async generateContentWithSearch(prompt: string): Promise<string> {
    const config = getEnvConfig();
    console.log('[Gemini] Calling gemini-identity function...');
    
    try {
      // Get session if available, but also pass anon key for unauthenticated requests
      const { data: { session } } = await supabase.auth.getSession();
      
      // Build headers - use session token if available, otherwise use anon key
      const headers: Record<string, string> = {
        'apikey': config.supabaseAnonKey
      };
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
        console.log('[Gemini] Using authenticated session');
      } else {
        console.log('[Gemini] No session found, using anon key');
      }
      
      // Enable Google Search for identity resolution (needed for finding player IDs/usernames)
      // Using optimized prompts to ensure fast searches
      const { data, error } = await supabase.functions.invoke('gemini-identity', {
        body: { 
          prompt,
          useGoogleSearch: true // Enabled for identity resolution
        },
        headers
      });

      console.log('[Gemini] Function response data:', data);
      console.log('[Gemini] Function response error:', error);

      if (error) {
        // Enhanced error extraction (same as report function)
        console.error('[Gemini] ========== ERROR DETAILS ==========');
        console.error('[Gemini] Error object:', error);
        console.error('[Gemini] Error type:', error.constructor?.name);
        console.error('[Gemini] Error name:', (error as any)?.name);
        console.error('[Gemini] Error message:', error.message);
        console.error('[Gemini] Error keys:', Object.keys(error));
        console.error('[Gemini] Full error JSON:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        
        const errorAny = error as any;
        console.error('[Gemini] error.status:', errorAny.status);
        console.error('[Gemini] error.statusCode:', errorAny.statusCode);
        console.error('[Gemini] error.context:', errorAny.context);
        console.error('[Gemini] error.response:', errorAny.response);
        console.error('[Gemini] error.value:', errorAny.value);
        console.error('[Gemini] error.message:', errorAny.message);
        
        let errorStatus = errorAny.status || errorAny.statusCode || 500;
        let errorMessage = error.message || 'Unknown error';
        let errorData: any = null;
        
        // Try to extract error from response context
        if (errorAny.context) {
          errorData = errorAny.context.data || errorAny.context.body || errorAny.context;
          if (errorData && typeof errorData === 'object') {
            console.error('[Gemini] Error response:', JSON.stringify(errorData, null, 2));
            if (errorData.error) errorMessage = errorData.error;
            else if (errorData.message) errorMessage = errorData.message;
            // Extract status code from error data if available
            if (errorData.code && !errorStatus) errorStatus = errorData.code;
          }
          
          // Try to read response body if it's a Response object
          if (errorAny.context instanceof Response) {
            try {
              const responseText = await errorAny.context.text();
              console.error('[Gemini] Response body:', responseText);
              const parsed = JSON.parse(responseText);
              errorData = parsed;
              if (parsed.error) errorMessage = parsed.error;
              else if (parsed.message) errorMessage = parsed.message;
              // Extract status code from parsed response (prioritize this)
              if (parsed.code) errorStatus = parsed.code;
            } catch (e) {
              console.error('[Gemini] Failed to parse response body:', e);
            }
          }
        }
        
        // Also check error.value (Supabase FunctionsHttpError structure)
        if (errorAny.value) {
          console.error('[Gemini] error.value:', errorAny.value);
          if (typeof errorAny.value === 'string') {
            try {
              const parsed = JSON.parse(errorAny.value);
              errorData = parsed;
              if (parsed.error) errorMessage = parsed.error;
              else if (parsed.message) errorMessage = parsed.message;
              // Extract status code from parsed value
              if (parsed.code && !errorStatus) errorStatus = parsed.code;
            } catch (e) {
              // Not JSON, use as-is
              errorMessage = errorAny.value;
            }
          } else if (typeof errorAny.value === 'object') {
            errorData = errorAny.value;
            if (errorAny.value.error) errorMessage = errorAny.value.error;
            else if (errorAny.value.message) errorMessage = errorAny.value.message;
            // Extract status code from error value
            if (errorAny.value.code && !errorStatus) errorStatus = errorAny.value.code;
          }
        }
        
        // Final attempt: parse error message to extract code if it contains JSON
        // This handles cases where the error details are embedded in the message string
        if (errorMessage.includes('{')) {
          try {
            const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              // Always update errorStatus if we find a code in the parsed JSON
              if (parsed.code) {
                errorStatus = parsed.code;
                console.log('[Gemini] Extracted error code from message:', parsed.code);
              }
              if (parsed.error && !errorMessage.includes(parsed.error)) {
                errorMessage = parsed.error;
              }
              // Merge with existing errorData
              errorData = { ...errorData, ...parsed };
            }
          } catch (e) {
            // Ignore parse errors
            console.warn('[Gemini] Failed to parse JSON from error message:', e);
          }
        }
        
        console.error('[Gemini] ======================================');
        console.error('[Gemini] Final errorStatus:', errorStatus);
        console.error('[Gemini] Final errorMessage:', errorMessage);
        
        // Handle timeout (504) and bad gateway (502) errors with retry
        // 502 can occur when the edge function times out at infrastructure level
        // Also check error message for timeout indicators
        const isTimeoutError = errorStatus === 504 || 
                               errorMessage.includes('timeout') || 
                               errorMessage.includes('504') ||
                               (errorData && errorData.code === 504);
        const isBadGateway = errorStatus === 502 || 
                             errorMessage.includes('502') ||
                             (errorData && errorData.code === 502);
        
        if (isTimeoutError || isBadGateway) {
          console.log(`[Gemini] ${isTimeoutError ? 'Timeout' : 'Bad Gateway'} detected (status: ${errorStatus}), will retry without Google Search...`);
          
          // Retry with exponential backoff (up to 2 retries)
          for (let retryAttempt = 0; retryAttempt < 2; retryAttempt++) {
            try {
              const backoffMs = 2000 * Math.pow(2, retryAttempt); // 2s, 4s
              const jitter = Math.random() * 1000; // 0-1s jitter
              console.log(`[Gemini] Retry attempt ${retryAttempt + 1}/2 after ${Math.round((backoffMs + jitter) / 1000)}s...`);
              await new Promise(resolve => setTimeout(resolve, backoffMs + jitter));
              
              const { data: retryData, error: retryError } = await supabase.functions.invoke('gemini-identity', {
                body: { 
                  prompt,
                  useGoogleSearch: false // Always retry without Google Search to avoid timeouts
                },
                headers
              });
              
              if (retryError) {
                console.error(`[Gemini] Retry attempt ${retryAttempt + 1} failed:`, retryError);
                if (retryAttempt === 1) {
                  // Last retry failed
                  throw new Error(`${isTimeoutError ? 'Timeout' : 'Bad Gateway'} occurred (${errorStatus}). All retries exhausted. This may be a temporary issue - please try again in a moment.`);
                }
                continue; // Try next retry
              }
              
              if (retryData && retryData.text) {
                console.log(`[Gemini] Retry attempt ${retryAttempt + 1} succeeded`);
                return retryData.text;
              } else {
                console.warn(`[Gemini] Retry attempt ${retryAttempt + 1} returned empty data`);
                if (retryAttempt === 1) {
                  // Return empty string on last retry so caller can handle gracefully
                  return '';
                }
                continue; // Try next retry
              }
            } catch (retryErr: any) {
              console.error(`[Gemini] Retry attempt ${retryAttempt + 1} exception:`, retryErr);
              if (retryAttempt === 1) {
                // Last retry failed
                throw new Error(`${isTimeoutError ? 'Timeout' : 'Bad Gateway'} occurred (${errorStatus}). All retries exhausted. Error: ${retryErr.message || 'Unknown error'}`);
              }
              continue; // Try next retry
            }
          }
        }
        
        // Handle 401 specifically (often "Invalid JWT" = expired token)
        if (errorStatus === 401) {
          const authMsg = errorMessage?.toLowerCase().includes('jwt') || errorMessage?.toLowerCase().includes('invalid')
            ? 'Your session may have expired. Please log out and log in again.'
            : `Authentication failed (401). ${errorMessage}`;
          throw new Error(authMsg);
        }
        
        // Handle FunctionsFetchError (network/connection issues)
        if (errorAny.name === 'FunctionsFetchError' || errorMessage.includes('Failed to send a request')) {
          throw new Error(`Failed to reach Edge Function. The function may not be deployed or there's a network issue. Error: ${errorMessage}`);
        }
        
        if (!errorStatus || errorStatus === 0) {
          throw new Error(`Failed to reach Edge Function. Error: ${errorMessage}. Check if the function is deployed: supabase functions deploy gemini-identity`);
        }
        
        // Include error data in message if available
        const errorDetails = errorData ? ` Details: ${JSON.stringify(errorData)}` : '';
        throw new Error(`Gemini API error (${errorStatus}): ${errorMessage}${errorDetails}`);
      }

      // Check if the response itself indicates an error
      if (data && data.error) {
        console.error('[Gemini] Edge Function returned error:', data.error);
        throw new Error(`Edge Function error: ${data.error}`);
      }

      if (!data || !data.text) {
        console.error('[Gemini] Empty or invalid response:', data);
        throw new Error('Empty response from Gemini API');
      }

      return data.text;
    } catch (err: any) {
      console.error('[Gemini] ========== EXCEPTION CAUGHT ==========');
      console.error('[Gemini] Exception type:', err?.constructor?.name);
      console.error('[Gemini] Exception message:', err?.message);
      console.error('[Gemini] Exception stack:', err?.stack);
      console.error('[Gemini] Full exception:', err);
      
      if (err && typeof err === 'object') {
        const errAny = err as any;
        console.error('[Gemini] err.status:', errAny.status);
        console.error('[Gemini] err.context:', errAny.context);
        if (errAny.context) {
          const errorData = errAny.context.data || errAny.context.body || errAny.context;
          console.error('[Gemini] Error data from context:', JSON.stringify(errorData, null, 2));
        }
      }
      console.error('[Gemini] ======================================');
      
      if (err.message) {
        throw err;
      }
      throw new Error(`Failed to call Gemini API: ${err.toString()}`);
    }
  },

  /**
   * Calls Gemini API for long-form chat (repertoire Q&A). Plain text only, no JSON, high token limit.
   */
  async generateChatResponse(prompt: string): Promise<string> {
    const config = getEnvConfig();
    console.log('[Gemini] Calling gemini-chat function...');

    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'apikey': config.supabaseAnonKey };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    const { data, error } = await supabase.functions.invoke('gemini-chat', {
      body: { prompt },
      headers,
    });

    if (error) {
      const errAny = error as any;
      const status = errAny?.status ?? errAny?.statusCode ?? 500;
      const message = errAny?.message ?? error.message ?? 'Unknown error';
      throw new Error(`Gemini chat error (${status}): ${message}`);
    }

    if (data?.error) {
      throw new Error(typeof data.error === 'string' ? data.error : data.error?.message ?? 'Chat error');
    }

    if (!data?.text) {
      throw new Error('Empty response from Gemini chat');
    }

    return data.text;
  },

  /**
   * Calls Gemini API for report generation with JSON schema
   */
  async generateContentWithSchema(
    prompt: string | Array<{ role: string; parts: Array<{ text: string }> }>,
    responseSchema: any
  ): Promise<any> {
    const config = getEnvConfig();
    console.log('[Gemini] Calling gemini-report function...');
    
    // Retry logic for handling intermittent failures
    // Increased retries for 503 errors (model overloaded)
    const maxRetries = 2; // Allow 2 retries for 503 errors (model overloaded)
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[Gemini] Retry attempt ${attempt}/${maxRetries}...`);
          // Exponential backoff with jitter: wait 2s, then 4s (increased to respect rate limits)
          const backoffMs = 2000 * Math.pow(2, attempt - 1);
          const jitter = Math.random() * 1000; // Add random 0-1s jitter
          await new Promise(resolve => setTimeout(resolve, backoffMs + jitter));
        }
        
        // Get session and refresh if needed (tokens expire after ~1 hour; 401 Invalid JWT often means expired)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          console.error('[Gemini] User not authenticated:', sessionError?.message);
          throw new Error('Authentication required. Please log in and try again.');
        }

        // Refresh session to get a fresh token (avoids 401 Invalid JWT from expired tokens)
        const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
        const tokenToUse = refreshedSession?.access_token ?? session.access_token;
        if (refreshError) {
          console.warn('[Gemini] Session refresh failed (using existing token):', refreshError.message);
        }

        console.log('[Gemini] Session available, access token length:', tokenToUse?.length || 0);
        
        const result = await supabase.functions.invoke('gemini-report', {
          body: { prompt, responseSchema },
          headers: {
            'Authorization': `Bearer ${tokenToUse}`,
            'apikey': config.supabaseAnonKey
          }
        });
        
        const { data, error } = result;
      
        if (error) {
          console.error('[Gemini] ========== ERROR DETAILS ==========');
          console.error('[Gemini] Error object:', error);
          console.error('[Gemini] Error type:', error?.constructor?.name);
          console.error('[Gemini] Error keys:', Object.keys(error || {}));
          
          const errorAny = error as any;
          let errorStatus = errorAny?.status || errorAny?.statusCode || 500;
          let errorMessage = errorAny?.message || 'Unknown error';
          let errorBody = null;
        
        // Log all error properties for debugging
        console.error('[Gemini] error.status:', errorAny?.status);
        console.error('[Gemini] error.statusCode:', errorAny?.statusCode);
        console.error('[Gemini] error.context:', errorAny?.context);
        console.error('[Gemini] error.context type:', typeof errorAny?.context);
        console.error('[Gemini] error.context keys:', errorAny?.context ? Object.keys(errorAny.context) : 'none');
        console.error('[Gemini] error.response:', errorAny?.response);
        console.error('[Gemini] Full error JSON:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        
        // Try to extract error from context (Supabase FunctionsHttpError structure)
        // FunctionsHttpError.context may contain the Response object or error data
        if (errorAny?.context) {
          // The context might be a Response object
          if (errorAny.context instanceof Response) {
            try {
              const clonedResponse = errorAny.context.clone();
              errorBody = await clonedResponse.json().catch(async () => {
                // If JSON fails, try text
                const textResponse = errorAny.context.clone();
                const text = await textResponse.text();
                return { message: text };
              });
              
              if (errorBody) {
                errorMessage = errorBody.message || errorBody.error || errorMessage;
                if (errorBody.code) {
                  errorStatus = errorBody.code;
                }
              }
            } catch (e) {
              console.error('[Gemini] Failed to read Response from context:', e);
            }
          } 
          // Check if context has a response property
          else if (errorAny.context.response && errorAny.context.response instanceof Response) {
            try {
              const clonedResponse = errorAny.context.response.clone();
              errorBody = await clonedResponse.json().catch(async () => {
                const textResponse = errorAny.context.response.clone();
                const text = await textResponse.text();
                return { message: text };
              });
              
              if (errorBody) {
                errorMessage = errorBody.message || errorBody.error || errorMessage;
                if (errorBody.code) {
                  errorStatus = errorBody.code;
                }
              }
            } catch (e) {
              console.error('[Gemini] Failed to read Response from context.response:', e);
            }
          }
          // Context might be a plain object with error data
          else if (typeof errorAny.context === 'object' && Object.keys(errorAny.context).length > 0) {
            errorBody = errorAny.context;
            if (errorBody.message) {
              errorMessage = errorBody.message;
            } else if (errorBody.error) {
              errorMessage = typeof errorBody.error === 'string' ? errorBody.error : errorBody.error.message || errorMessage;
            }
            if (errorBody.code) {
              errorStatus = errorBody.code;
            }
          }
        }
        
        // Also check if error has a response property
        if (errorAny?.response && errorAny.response instanceof Response) {
          try {
            const responseBody = await errorAny.response.clone().json().catch(() => null);
            if (responseBody) {
              errorBody = responseBody;
              errorMessage = responseBody.message || responseBody.error || errorMessage;
              if (responseBody.code) {
                errorStatus = responseBody.code;
              }
            }
          } catch (e) {
            // Ignore
          }
        }
        
        // If context is empty object, try to infer from error message
        if (!errorBody && errorAny?.message) {
          const messageMatch = errorAny.message.match(/\((\d+)\)/);
          if (messageMatch) {
            errorStatus = parseInt(messageMatch[1]);
          }
          
          // If error message mentions JWT or 401, provide helpful context
          if (errorAny.message.includes('401') || errorAny.message.includes('JWT') || errorAny.message.includes('Unauthorized')) {
            errorMessage = 'Authentication failed. Please ensure you are logged in and try again. If the issue persists, check the Supabase function logs.';
            errorStatus = 401;
          }
        }
        
        console.error('[Gemini] Extracted error status:', errorStatus);
        console.error('[Gemini] Extracted error message:', errorMessage);
        console.error('[Gemini] Error body:', errorBody);
        console.error('[Gemini] Full error JSON:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        console.error('[Gemini] ======================================');
        
          // Check if this is a retryable error (500, 503, incomplete JSON, etc.)
          // 503 = Service Unavailable / Model Overloaded - retry with backoff
          // Do NOT retry on 429 (rate limit) - wait longer or fail gracefully
          const isRetryable = (errorStatus === 500 || 
                             errorStatus === 503 ||
                             errorMessage.includes('overloaded') ||
                             errorMessage.includes('unavailable') ||
                             errorMessage.includes('incomplete') || 
                             errorMessage.includes('truncated') ||
                             errorMessage.includes('valid JSON')) &&
                             errorStatus !== 429; // Never retry immediately on rate limit
          
          // If rate limited, provide helpful message
          if (errorStatus === 429) {
            console.error('[Gemini] Rate limit hit (429). Please wait before retrying.');
            throw new Error('Rate limit exceeded. Please wait a few moments and try again. If this persists, check your Google AI Studio quota.');
          }
          
          // If 503 (overloaded), use longer backoff
          if (errorStatus === 503 || errorMessage.includes('overloaded')) {
            console.warn(`[Gemini] Model overloaded (503) detected, will retry with longer backoff...`);
            if (attempt < maxRetries) {
              // Longer backoff for 503: 5s, 10s, 20s
              const backoffMs = 5000 * Math.pow(2, attempt);
              const jitter = Math.random() * 2000; // 0-2s jitter
              console.log(`[Gemini] Waiting ${Math.round((backoffMs + jitter) / 1000)}s before retry...`);
              await new Promise(resolve => setTimeout(resolve, backoffMs + jitter));
              lastError = new Error(errorMessage);
              continue; // Retry the request
            } else {
              throw new Error(`Model is overloaded (503). Please try again in a few moments. This is usually temporary.`);
            }
          }
          
          // If retryable and we have retries left, continue to retry
          if (isRetryable && attempt < maxRetries) {
            console.warn(`[Gemini] Retryable error detected (${errorStatus}), will retry...`);
            lastError = new Error(errorMessage);
            continue; // Retry the request
          }
          
          // Provide detailed error message with helpful context
          const finalMessage = errorBody 
            ? `Gemini API error (${errorStatus}): ${errorMessage}`
            : `Edge Function error (${errorStatus}): ${errorMessage}. Check Supabase function logs for details.`;
          
          throw new Error(finalMessage);
        }

        // Check if the response itself indicates an error
        if (data && data.error) {
          const errorMsg = typeof data.error === 'string' ? data.error : data.error.message || 'Unknown error';
          console.error('[Gemini] Edge Function returned error:', errorMsg);
          
          // Check if retryable
          const isRetryable = errorMsg.includes('incomplete') || errorMsg.includes('truncated') || errorMsg.includes('valid JSON');
          if (isRetryable && attempt < maxRetries) {
            console.warn(`[Gemini] Retryable error in response, will retry...`);
            lastError = new Error(errorMsg);
            continue; // Retry the request
          }
          
          throw new Error(`Edge Function error: ${errorMsg}`);
        }

        if (!data) {
          console.error('[Gemini] Empty response:', data);
          if (attempt < maxRetries) {
            console.warn('[Gemini] Empty response, will retry...');
            lastError = new Error('Empty response from Gemini API');
            continue; // Retry the request
          }
          throw new Error('Empty response from Gemini API');
        }

        // Handle both direct data and nested data.data format
        const responseData = data.data || data;
        if (!responseData) {
          console.error('[Gemini] No data in response:', data);
          if (attempt < maxRetries) {
            console.warn('[Gemini] No data in response, will retry...');
            lastError = new Error('No data in response');
            continue; // Retry the request
          }
          throw new Error('Empty response from Gemini API');
        }

        // Success! Return the data
        console.log('[Gemini] Successfully received response on attempt', attempt + 1);
        return responseData;
      } catch (err: any) {
        // If this is the last attempt, throw the error
        if (attempt >= maxRetries) {
          console.error('[Gemini] ========== EXCEPTION CAUGHT (Final Attempt) ==========');
          console.error('[Gemini] Exception type:', err?.constructor?.name);
          console.error('[Gemini] Exception message:', err?.message);
          console.error('[Gemini] Exception stack:', err?.stack);
          console.error('[Gemini] Full exception:', err);
          console.error('[Gemini] Exception keys:', err ? Object.keys(err) : 'null');
          
          // Try to extract error details from FunctionsHttpError
          if (err && typeof err === 'object') {
            const errAny = err as any;
            console.error('[Gemini] err.status:', errAny.status);
            console.error('[Gemini] err.statusCode:', errAny.statusCode);
            console.error('[Gemini] err.context:', errAny.context);
            console.error('[Gemini] err.response:', errAny.response);
            
            if (errAny.context) {
              const errorData = errAny.context.data || errAny.context.body || errAny.context;
              console.error('[Gemini] Error data from context:', JSON.stringify(errorData, null, 2));
            }
          }
          console.error('[Gemini] ======================================');
          
          if (err.message) {
            throw err;
          }
          throw new Error(`Failed to call Gemini API after ${maxRetries + 1} attempts: ${err.toString()}`);
        } else {
          // Store error and retry
          console.warn(`[Gemini] Attempt ${attempt + 1} failed, will retry...`, err?.message);
          lastError = err;
        }
      }
    }
    
    // If we get here, all retries failed
    if (lastError) {
      throw lastError;
    }
    
    throw new Error('Failed to call Gemini API: Unknown error');
  }
};
