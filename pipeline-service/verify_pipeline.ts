import { searchFideByName } from './src/pipeline/fideSearch.js';
import { searchIdsViaGemini } from './src/pipeline/geminiFallback.js';
import { logger } from './src/lib/logger.js';

// Mock logger to avoid clutter
logger.level = 'debug';

async function main() {
    const query = "Magnus Carlsen";
    console.log(`Testing FIDE search for "${query}"...`);
    try {
        const fideResults = await searchFideByName(query);
        console.log(`FIDE Search Results: ${fideResults.length}`);
        if (fideResults.length > 0) {
            console.log('Sample Result:', fideResults[0]);
        } else {
            console.log('FIDE Search returned 0 results (as expected if direct search is blocked/changed).');
        }
    } catch (e) {
        console.error('FIDE Search Error:', e);
    }

    console.log('\nTesting Gemini Fallback...');
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('GEMINI_API_KEY not set! Cannot test fallback.');
        return;
    }

    try {
        const ids = await searchIdsViaGemini(query, apiKey);
        console.log('Gemini Fallback Result:', ids);
        if (ids.fideId) {
            console.log('SUCCESS: Found FIDE ID via Gemini!');
        } else {
            console.log('FAILURE: Did not find FIDE ID via Gemini.');
        }
    } catch (e) {
        console.error('Gemini Fallback Error:', e);
    }
}

main().catch(console.error);
