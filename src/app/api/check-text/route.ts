import { NextResponse } from 'next/server';
import { hybridSpellChecker } from '@/lib/spellChecker';

export async function POST(request: Request) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    try {
        const body = await request.json();
        const { text, useNspell = false } = body;

        if (!text || text.length > 20000) {
            return NextResponse.json({ error: 'Text too long or empty' }, { status: 400, headers });
        }

        // If useNspell is true, force offline mode with nspell
        if (useNspell) {
            try {
                const result = await hybridSpellChecker.check(text, { forceOffline: true });

                // Convert to LanguageTool-compatible format
                const matches = result.typos.map(word => ({
                    message: `Possible spelling mistake found`,
                    shortMessage: 'Spelling mistake',
                    offset: text.indexOf(word),
                    length: word.length,
                    rule: {
                        id: 'MORFOLOGIK_RULE_EN_US',
                        issueType: 'misspelling',
                        category: { id: 'TYPOS', name: 'Possible Typo' }
                    },
                    context: { text: word, offset: 0, length: word.length }
                }));

                return NextResponse.json({
                    matches,
                    language: { name: 'English (US)', code: 'en-US' },
                    software: { name: 'nspell-hybrid', version: '1.0.0' }
                }, { headers });
            } catch (nspellError) {
                console.error('nspell check failed, falling back to LanguageTool:', nspellError);
                // Continue to LanguageTool API below
            }
        }

        // Try LanguageTool API
        const params = new URLSearchParams();
        params.append('text', text);
        params.append('language', 'en-US');

        // Use self-hosted URL if available, otherwise fallback to public API
        const ltUrl = process.env.LANGUAGETOOL_URL
            ? `${process.env.LANGUAGETOOL_URL}/check`
            : 'https://api.languagetool.org/v2/check';

        const response = await fetch(ltUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
            body: params
        });

        if (!response.ok) {
            // If LanguageTool fails, fallback to nspell
            console.warn('LanguageTool API failed, using nspell fallback');
            const result = await hybridSpellChecker.check(text, { forceOffline: true });

            const matches = result.typos.map(word => ({
                message: `Possible spelling mistake found`,
                shortMessage: 'Spelling mistake',
                offset: text.indexOf(word),
                length: word.length,
                rule: {
                    id: 'MORFOLOGIK_RULE_EN_US',
                    issueType: 'misspelling',
                    category: { id: 'TYPOS', name: 'Possible Typo' }
                },
                context: { text: word, offset: 0, length: word.length }
            }));

            return NextResponse.json({
                matches,
                language: { name: 'English (US)', code: 'en-US' },
                software: { name: 'nspell-fallback', version: '1.0.0' }
            }, { headers });
        }

        const data = await response.json();
        return NextResponse.json(data, { headers });
    } catch (e) {
        console.error('Spell check error:', e);

        // Final fallback: try nspell
        try {
            const body = await request.json();
            const result = await hybridSpellChecker.check(body.text, { forceOffline: true });

            const matches = result.typos.map((word: string) => ({
                message: `Possible spelling mistake found`,
                shortMessage: 'Spelling mistake',
                offset: body.text.indexOf(word),
                length: word.length,
                rule: {
                    id: 'MORFOLOGIK_RULE_EN_US',
                    issueType: 'misspelling',
                    category: { id: 'TYPOS', name: 'Possible Typo' }
                },
                context: { text: word, offset: 0, length: word.length }
            }));

            return NextResponse.json({
                matches,
                language: { name: 'English (US)', code: 'en-US' },
                software: { name: 'nspell-emergency-fallback', version: '1.0.0' }
            }, { headers });
        } catch (fallbackError) {
            return NextResponse.json({ error: 'Check failed' }, { status: 500, headers });
        }
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
