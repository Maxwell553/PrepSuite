# HTML Scraping Improvements

**Date:** February 3, 2026  
**Status:** ✅ API-First Approach with Robust Fallback Implemented

---

## Summary

Implemented API-first approach for FIDE and USCF profile fetching with robust HTML scraping fallback, retry logic, and error monitoring.

---

## Implementation Details

### FIDE Service (`services/fide.ts`)

**API-First Strategy:**
1. Tries 3 different ChessTools API endpoint patterns:
   - `https://api.chesstools.org/fide/{id}`
   - `https://api.chesstools.org/api/fide/player/{id}`
   - `https://api.chesstools.org/players/fide/{id}`

2. **HTML Scraping Fallback** (if API unavailable):
   - Multiple extraction strategies for name (3 strategies)
   - Multiple extraction strategies for rating (3 strategies)
   - Multiple extraction strategies for title (5 strategies)
   - Federation and birth year extraction

3. **Retry Logic:**
   - Up to 2 retries for HTML scraping
   - Exponential backoff (1s, 2s)
   - Timeout handling (5s API, 10s HTML)

4. **Error Tracking:**
   - Sentry warnings for scraping failures
   - Detailed error context (attempt number, error message)

### USCF Service (`services/uscf.ts`)

**API-First Strategy:**
1. Tries 3 different ChessTools API endpoint patterns:
   - `https://api.chesstools.org/uscf/{id}`
   - `https://api.chesstools.org/api/uscf/player/{id}`
   - `https://api.chesstools.org/players/uscf/{id}`

2. **HTML Scraping Fallback** (if API unavailable):
   - Name extraction with ID prefix matching
   - Generic fallback for name extraction
   - Rating extraction from table structure
   - State extraction (if available)

3. **Retry Logic:**
   - Up to 2 retries for HTML scraping
   - Exponential backoff (1s, 2s)
   - Timeout handling (5s API, 10s HTML)

4. **Error Tracking:**
   - Sentry warnings for scraping failures
   - Detailed error context

---

## Benefits

1. **Resilience:** API-first approach reduces dependency on HTML scraping
2. **Reliability:** Multiple extraction strategies prevent silent failures
3. **Monitoring:** Sentry integration tracks scraping failures
4. **Performance:** API calls are faster than HTML scraping
5. **Future-Proof:** Easy to add new API endpoints or update parsing strategies

---

## Testing

- ✅ 12 comprehensive tests added
- ✅ Tests cover API fallback scenarios
- ✅ Tests cover retry logic
- ✅ Tests cover error handling
- ✅ Tests cover multiple extraction strategies

---

## Monitoring

Scraping failures are tracked in Sentry with:
- Service name (fide/uscf)
- Player ID
- Attempt number
- Error message
- Timestamp

This allows monitoring:
- API availability
- HTML scraping success rates
- Common failure patterns
- Site structure changes

---

## Future Enhancements

1. **Rate Limiting:** Add rate limiting for API calls
2. **Caching:** Cache API responses to reduce load
3. **More API Sources:** Add additional API sources if available
4. **Structured Logging:** Enhanced logging for debugging
5. **Metrics:** Track API vs HTML scraping usage rates

---

**Last Updated:** February 3, 2026
