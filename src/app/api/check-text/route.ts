import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    try {
        const body = await request.json();
        const { text } = body;

        if (!text || text.length > 20000) {
            return NextResponse.json({ error: 'Text too long or empty' }, { status: 400, headers });
        }

        const params = new URLSearchParams();
        params.append('text', text);
        params.append('language', 'en-US');

        // Filter out some rule categories if needed, but default is good.

        const response = await fetch('https://api.languagetool.org/v2/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
            body: params
        });

        const data = await response.json();
        return NextResponse.json(data, { headers });
    } catch (e) {
        console.error('LT Check Error:', e);
        return NextResponse.json({ error: 'Check failed' }, { status: 500, headers });
    }
}

export async function OPTIONS(request: Request) {
    return NextResponse.json({}, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
}
