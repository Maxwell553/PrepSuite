import { supabase } from '../lib/supabase';
import { getEnvConfig } from '../lib/env';

/**
 * Service for calling Gemini API via Supabase Edge Functions
 * This keeps the API key secure on the server side
 */
export const geminiService = {
  /**
   * Calls Gemini API for identity resolution (username discovery)
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
      
      const { data, error } = await supabase.functions.invoke('gemini-identity', {
        body: { prompt },
        headers
      });

      console.log('[Gemini] Function response data:', data);
      console.log('[Gemini] Function response error:', error);

      if (error) {
        // Enhanced error extraction (same as report function)
        console.error('[Gemini] ========== ERROR DETAILS ==========');
        console.error('[Gemini] Error object:', error);
        console.error('[Gemini] Error type:', error.constructor?.name);
        console.error('[Gemini] Error message:', error.message);
        console.error('[Gemini] Error keys:', Object.keys(error));
        
        const errorAny = error as any;
        console.error('[Gemini] error.status:', errorAny.status);
        console.error('[Gemini] error.statusCode:', errorAny.statusCode);
        console.error('[Gemini] error.context:', errorAny.context);
        console.error('[Gemini] error.response:', errorAny.response);
        
        let errorStatus = errorAny.status || errorAny.statusCode || 500;
        let errorMessage = error.message || 'Unknown error';
        
        // Try to extract error from response context
        if (errorAny.context) {
          const errorData = errorAny.context.data || errorAny.context.body || errorAny.context;
          if (errorData && typeof errorData === 'object') {
            console.error('[Gemini] Error response:', JSON.stringify(errorData, null, 2));
            if (errorData.error) errorMessage = errorData.error;
            else if (errorData.message) errorMessage = errorData.message;
          }
          
          // Try to read response body if it's a Response object
          if (errorAny.context instanceof Response) {
            try {
              const responseText = await errorAny.context.text();
              console.error('[Gemini] Response body:', responseText);
              const parsed = JSON.parse(responseText);
              if (parsed.error) errorMessage = parsed.error;
              else if (parsed.message) errorMessage = parsed.message;
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
        
        console.error('[Gemini] ======================================');
        
        // Handle 401 specifically
        if (errorStatus === 401) {
          throw new Error(`Authentication failed (401). Please check your Supabase configuration. Error: ${errorMessage}`);
        }
        
        if (!errorStatus || errorStatus === 0) {
          throw new Error(`Failed to reach Edge Function. Error: ${errorMessage}`);
        }
        
        throw new Error(`Gemini API error (${errorStatus}): ${errorMessage}`);
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
   * Calls Gemini API for report generation with JSON schema
   */
  async generateContentWithSchema(
    prompt: string | Array<{ role: string; parts: Array<{ text: string }> }>,
    responseSchema: any
  ): Promise<any> {
    const config = getEnvConfig();
    console.log('[Gemini] Calling gemini-report function...');
    
    // Retry logic for handling intermittent failures
    // Reduced retries and increased backoff to avoid rate limits
    const maxRetries = 1; // Reduced from 2 to minimize rate limit issues
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
        
        // Get session to ensure it's available and manually pass Authorization header
        // This ensures the token is sent even if automatic injection fails
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          console.error('[Gemini] User not authenticated:', sessionError?.message);
          throw new Error('Authentication required. Please log in and try again.');
        }

        console.log('[Gemini] Session available, access token length:', session.access_token?.length || 0);
        
        // Manually pass Authorization header - Supabase client should do this automatically,
        // but explicit passing ensures it's sent correctly
        const result = await supabase.functions.invoke('gemini-report', {
          body: { prompt, responseSchema },
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
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
        
          // Check if this is a retryable error (500, incomplete JSON, etc.)
          // Do NOT retry on 429 (rate limit) - wait longer or fail gracefully
          const isRetryable = (errorStatus === 500 || 
                             errorMessage.includes('incomplete') || 
                             errorMessage.includes('truncated') ||
                             errorMessage.includes('valid JSON')) &&
                             errorStatus !== 429; // Never retry immediately on rate limit
          
          // If rate limited, provide helpful message
          if (errorStatus === 429) {
            console.error('[Gemini] Rate limit hit (429). Please wait before retrying.');
            throw new Error('Rate limit exceeded. Please wait a few moments and try again. If this persists, check your Google AI Studio quota.');
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
