
import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';

async function main() {
    const envPath = path.join(process.cwd(), '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const apiKeyMatch = envContent.match(/GEMINI_API_KEY=(.*)/);

    if (!apiKeyMatch) {
        console.error('GEMINI_API_KEY not found in .env.local');
        return;
    }
    const apiKey = apiKeyMatch[1].trim();

    const ai = new GoogleGenAI({ apiKey });

    // Fallback to a known working model
    const model = "gemini-flash-latest";
    console.log(`Testing ${model}...`);
    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: "Explain how AI works in a few words",
        });
        console.log('Success!');
        console.log(response.text);
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
