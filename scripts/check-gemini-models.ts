
import fs from 'fs';
import path from 'path';

async function listModels() {
    try {
        // Read .env.local manually to get the key
        const envPath = path.join(process.cwd(), '.env.local');
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const apiKeyMatch = envContent.match(/GEMINI_API_KEY=(.*)/);

        if (!apiKeyMatch) {
            console.error('GEMINI_API_KEY not found in .env.local');
            return;
        }

        const apiKey = apiKeyMatch[1].trim();
        let pageToken = '';
        let allModels: any[] = [];

        do {
            console.log(`Fetching models${pageToken ? ' (next page)...' : '...'}`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.error(`Error: ${response.status} ${response.statusText}`);
                console.error(await response.text());
                return;
            }

            const data = await response.json();
            if (data.models) {
                allModels = allModels.concat(data.models);
            }
            pageToken = data.nextPageToken;
        } while (pageToken);

        console.log(`\nTotal models found: ${allModels.length}`);


        // Test generation with gemini-flash-latest
        const modelToTest = 'models/gemini-flash-latest';
        console.log(`\nTesting generation with ${modelToTest}...`);

        const genResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelToTest}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: "Hello, tell me a joke." }]
                }]
            })
        });

        if (genResponse.ok) {
            const genData = await genResponse.json();
            console.log('Generation successful:', genData.candidates?.[0]?.content?.parts?.[0]?.text);
        } else {
            console.error('Generation failed:', await genResponse.text());
        }

    } catch (error) {
        console.error('Failed to list models:', error);
    }
}

listModels();
