import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { topic, templateLabel, templateStructure, templateWords, apiKey } = await request.json();

    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return NextResponse.json({ error: 'Claude API key is required. Add it in Settings or set ANTHROPIC_API_KEY env variable.' }, { status: 400 });
    }

    const { SYSTEM_PROMPT } = await import('@/app/modules/seo-engine/data/system-prompt');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Write a ${templateLabel || 'blog post'} about: "${topic}"

Target structure: ${templateStructure || 'Intro -> Body -> CTA'}
Target word count: ${templateWords || '1,800-2,500'}

Requirements:
- This must rank on Google for the target keyword
- Include genuine Webflow-specific insights that show real expertise
- Add FAQ section with schema-ready Q&As
- Suggest internal links to ActiveSet's services
- Make the opening hook impossible to skip
- Every section should provide actionable value`,
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Claude API error: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const text = data.content?.map((i: { text?: string }) => i.text || '').join('') || '';
    const clean = text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      parsed = {
        title: topic,
        slug: topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        metaTitle: topic.substring(0, 60),
        metaDescription: `Expert guide on ${topic} from ActiveSet, a Webflow Expert Partner agency.`,
        excerpt: `A comprehensive guide about ${topic} by ActiveSet Technologies.`,
        body: `<h2>${topic}</h2>${text.split('\n').map((p: string) => `<p>${p}</p>`).join('')}`,
        primaryKeyword: topic.toLowerCase(),
        secondaryKeywords: [],
        internalLinks: [],
        faqSchema: [],
        estimatedReadTime: '5 min',
        seoScore: 72,
      };
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('SEO generate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
