
import fetch from 'node-fetch';

async function main() {
    console.log('Testing PDF API endpoint...');
    try {
        const response = await fetch('http://localhost:3000/api/generate-pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}) // Empty body to trigger 400
        });

        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Raw Response:', text);

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

main();
