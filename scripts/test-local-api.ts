
import fetch from 'node-fetch';

async function main() {
    console.log('Testing local API endpoint...');
    try {
        const response = await fetch('http://localhost:3000/api/ai-gen', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                meetingNotes: "Client wants a modern website for a coffee shop. Budget is $5000.",
                clientName: "Brew Bros",
                agencyName: "My Agency"
            })
        });

        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Raw Response:', text);

        try {
            const json = JSON.parse(text);
            console.log('JSON content:', json);
        } catch (e) {
            console.error('Response is not valid JSON');
        }

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

main();
