import fs from 'fs';

async function testFideLocal() {
    console.log(`Testing FIDE from local file...`);
    try {
        const html = fs.readFileSync('fide.html', 'utf-8');

        // New Robust Logic
        const titleMatch = html.match(/<title>([^<]+) FIDE Profile<\/title>/i);
        const divMatch = html.match(/<div class="profile-top-title">([^<]+)<\/div>/);
        const rawName = titleMatch ? titleMatch[1] : (divMatch ? divMatch[1] : null);

        const ratingMatch = html.match(/Std\. rating\s*<\/div>\s*<div[^>]*>([\d]+)/i);

        console.log('FIDE Name match:', rawName ? rawName.trim() : 'NULL');
        console.log('FIDE Rating match:', ratingMatch ? ratingMatch[1] : 'NULL (Optional)');
    } catch (e) {
        console.error('FIDE Local Test failed:', e);
    }
}

async function testUscfLocal(uscfId) {
    console.log(`Testing USCF form local file...`);
    try {
        const html = fs.readFileSync('uscf.html', 'utf-8');

        // New Robust Logic
        const nameRegex = new RegExp(`<font[^>]*>\\s*<b>\\s*${uscfId}:?\\s*([^<]+)<\\/b>`, 'i');
        const nameMatch = html.match(nameRegex);

        // Fallback check
        let genericName = 'NULL';
        if (!nameMatch) {
            const genericMatch = html.match(/<font size=["']?\+1["']?>\s*<b>([^<]+)<\/b>/i);
            if (genericMatch) {
                genericName = genericMatch[1].trim().replace(/^\d+:\s*/, '') + " (Fallback)";
            }
        }

        const ratingMatch = html.match(/Regular Rating\s*:?\s*<b>\s*(\d+)/i);

        console.log('USCF Name match:', nameMatch ? nameMatch[1].trim() : genericName);
        console.log('USCF Rating match:', ratingMatch ? ratingMatch[1] : 'NULL (Optional)');
    } catch (e) {
        console.error('USCF Local Test failed:', e);
    }
}

(async () => {
    await testFideLocal();
    await testUscfLocal('12560382');
})();
