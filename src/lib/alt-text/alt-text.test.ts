import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractImageContexts } from './context';
import { precheck } from './prepare';
import { MAX_ALT_CHARS, fileNameOf, judgmentSchema, systemPrompt, userPrompt } from './taxonomy';
import { echoesFileName, stripRedundantOpener, truncateAlt, validateJudgment, altForRecordPortrait } from './validate';
import { ALT_KINDS, type ImageContext, type ImageFacts, type RawJudgment } from './types';

/**
 * The model is not exercised here — a test that needs a 6 GB model running is
 * a test nobody runs. What is covered is everything that decides the answer
 * around it: the cheap rules, the repairs, and the context extraction that
 * feeds the prompt. Two of these cases are regressions from real output on
 * activeset.co and are named as such.
 */

function facts(over: Partial<ImageFacts> = {}): ImageFacts {
  return {
    width: 800,
    height: 600,
    format: 'webp',
    bytes: 50_000,
    aspect: 800 / 600,
    hasAlpha: false,
    entropy: 4,
    maxChannelStdev: 60,
    ...over,
  };
}

function judgment(over: Partial<RawJudgment> = {}): RawJudgment {
  return {
    observation: 'A photograph of something',
    visible_text: '',
    kind: 'informative',
    certainty: 'high',
    alt: 'A woman inspecting a turbine blade',
    long_description: '',
    ...over,
  };
}

const context = (over: Partial<ImageContext> = {}): ImageContext => ({ src: 'https://x.test/a/photo.jpg', ...over });

describe('precheck', () => {
  it('settles the cases no model is needed for', () => {
    assert.equal(precheck(facts({ width: 1, height: 1, maxChannelStdev: 0 }), context())?.kind, 'decorative');
    assert.equal(precheck(facts({ maxChannelStdev: 0.2 }), context())?.kind, 'decorative');
    assert.equal(
      precheck(facts({ width: 900, height: 2, aspect: 450 }), context())?.kind,
      'decorative',
    );
    assert.equal(precheck(facts(), context({ markedPresentational: true }))?.kind, 'decorative');
  });

  it('does not call a two-tone logo decorative', () => {
    // Regression: the Udemy wordmark on activeset.co is 1740x1740 with an
    // entropy of 0.31 — lower than most photographs, because it has two
    // colours — and a low-entropy rule here called it "a gradient or wash".
    const wordmark = facts({ width: 1740, height: 1740, aspect: 1, entropy: 0.31, maxChannelStdev: 38.1 });
    assert.equal(precheck(wordmark, context()), undefined);
  });

  it('sends anything with real variation to the model', () => {
    assert.equal(precheck(facts({ width: 48, height: 48 }), context()), undefined);
    assert.equal(precheck(facts({ width: 1200, height: 90, aspect: 13.3 }), context()), undefined);
  });
});

describe('validate', () => {
  it('drops the openers a vision model cannot stop writing', () => {
    for (const [input, expected] of [
      ['Image of a red bicycle', 'A red bicycle'],
      ['A photo showing two engineers', 'Two engineers'],
      ['This image shows a harbour at dusk', 'A harbour at dusk'],
      ['Screenshot of the billing page', 'The billing page'],
      ['alt: A cat', 'A cat'],
    ] as const) {
      assert.equal(stripRedundantOpener(input), expected, input);
    }
  });

  it('forces an empty alt for a decorative image and says so', () => {
    const result = validateJudgment(judgment({ kind: 'decorative', alt: 'A soft blue gradient' }), context());
    assert.equal(result.alt, '');
    assert.equal(result.needsReview, false);
    assert.match(result.notes[0], /decorative/i);
  });

  it('will not turn a photograph into its own wordmark', () => {
    // Regression: a photograph of a branded lorry was classified text_image,
    // and swapping in the transcription produced alt="IVECO".
    const result = validateJudgment(
      judgment({ kind: 'text_image', visible_text: 'IVECO', alt: 'Blue lorry at a loading bay' }),
      context(),
    );
    assert.equal(result.alt, 'Blue lorry at a loading bay');
    assert.equal(result.needsReview, true);
    assert.match(result.notes.join(' '), /more likely a photograph/i);
  });

  it('prefers the verbatim transcription when the image really is text', () => {
    const transcript = 'From 5K to 500K. Financing for Latino businesses, in Spanish, no fuss.';
    const result = validateJudgment(
      judgment({ kind: 'text_image', visible_text: transcript, alt: 'A banner about business loans' }),
      context(),
    );
    assert.equal(result.alt, transcript);
  });

  it('flags a transcription too long to be an alt attribute', () => {
    const result = validateJudgment(
      judgment({ kind: 'text_image', visible_text: 'word '.repeat(60), alt: 'A pricing table' }),
      context(),
    );
    assert.equal(result.needsReview, true);
    assert.match(result.notes.join(' '), /more text than fits/i);
  });

  it('trims at a word boundary and flags it', () => {
    const long = 'A wide shot of the assembly floor with six technicians fitting rotor blades to a nacelle before it is craned out';
    const result = validateJudgment(judgment({ alt: `${long} and loaded onto the transporter` }), context());
    assert.ok(result.alt.length <= MAX_ALT_CHARS);
    assert.ok(!result.alt.endsWith(' '));
    assert.equal(result.needsReview, true);
  });

  it('catches an alt that is only the file name', () => {
    assert.equal(echoesFileName('Team photo 2024', 'https://x.test/team-photo-2024.jpg'), true);
    assert.equal(echoesFileName('Two people at a desk', 'https://x.test/team-photo-2024.jpg'), false);
    // Webflow prefixes every asset with a 24-character id; it is not part of the name.
    assert.equal(echoesFileName('Hero banner', 'https://x.test/69f1f98e16ad2a104acb7581_hero-banner.webp'), true);
  });

  it('flags an alt that only repeats the caption', () => {
    const result = validateJudgment(
      judgment({ alt: 'The new Brighton office' }),
      context({ caption: 'The new Brighton office' }),
    );
    assert.equal(result.needsReview, true);
    assert.match(result.notes.join(' '), /repeats the caption/i);
  });

  it('calls an image that is the whole of a link functional, whatever the model said', () => {
    // Regression: on the Cache nav, two product icons were labelled by their
    // destination and a third was described as "House with person inside,
    // dollar sign". Being the sole content of a link is a rule, not a guess.
    const result = validateJudgment(
      judgment({ kind: 'icon', alt: 'House with person inside, dollar sign' }),
      context({ linkHref: 'https://usecache.com/collar-advance', linkText: '' }),
    );
    assert.equal(result.kind, 'functional');
    assert.equal(result.needsReview, true);
    assert.match(result.notes.join(' '), /name where it goes/i);
  });

  it('leaves a link alone when it has its own text besides the image', () => {
    const result = validateJudgment(
      judgment({ kind: 'informative', alt: 'Two engineers at a bench' }),
      context({ linkHref: 'https://x.test/post', linkText: 'Read the case study' }),
    );
    assert.equal(result.kind, 'informative');
  });

  it('asks for a human whenever the model was unsure', () => {
    assert.equal(validateJudgment(judgment({ certainty: 'low' }), context()).needsReview, true);
    assert.equal(validateJudgment(judgment({ certainty: 'high' }), context()).needsReview, false);
  });

  it('treats a missing description on a non-decorative image as a failure', () => {
    const result = validateJudgment(judgment({ alt: '   ' }), context());
    assert.equal(result.alt, '');
    assert.equal(result.needsReview, true);
  });

  it('truncates on a word boundary rather than mid-word', () => {
    assert.equal(truncateAlt('one two three four five', 13), 'one two three');
    assert.equal(truncateAlt('short', 13), 'short');
  });
});

describe('prompt', () => {
  it('offers every category to the model and nothing else', () => {
    const schema = judgmentSchema(ALT_KINDS) as {
      properties: { kind: { enum: string[] } };
      required: string[];
    };
    assert.deepEqual(schema.properties.kind.enum, ALT_KINDS);
    // Field order is the reasoning chain: what it sees, then what it reads,
    // then the category, and only then the alt.
    assert.deepEqual(schema.required, [
      'observation',
      'visible_text',
      'kind',
      'certainty',
      'alt',
      'long_description',
    ]);
  });

  it('states the two orderings that were got wrong in practice', () => {
    const prompt = systemPrompt();
    assert.match(prompt, /inside a link .* it is functional/i);
    assert.match(prompt, /browser chrome, a device frame/i);
  });

  it('puts the page context in front of the model', () => {
    const prompt = userPrompt(
      context({
        heading: 'Our people',
        linkHref: 'https://example.com/team/priya',
        pageCount: 294,
        caption: 'Priya at the Brighton office',
      }),
    );
    assert.match(prompt, /Our people/);
    assert.match(prompt, /team\/priya/);
    assert.match(prompt, /294 pages/);
    assert.match(prompt, /Priya at the Brighton office/);
  });

  it('strips the Webflow asset id from a file name', () => {
    assert.equal(fileNameOf('https://cdn.test/69f1f98e16ad2a104acb7581_udemy1.webp'), 'udemy1.webp');
    assert.equal(fileNameOf('https://cdn.test/a/hero%20shot.png'), 'hero shot.png');
  });
});

describe('page context', () => {
  const html = `<html><head><title>ActiveSet — Work</title></head><body>
    <nav><a href="/"><img src="/logo.svg"></a></nav>
    <main>
      <section class="card">
        <a href="https://keatech.com"><img class="recent_project-img" src="/keatech.webp"></a>
        <h3>Keatech</h3>
        <p>Logistics platform for a haulage group.</p>
      </section>
      <figure>
        <img src="/floor.jpg" srcset="/floor-400.jpg 400w, /floor-1600.jpg 1600w">
        <figcaption>The assembly floor in Ipswich</figcaption>
      </figure>
      <img src="/spacer.gif" role="presentation">
      <img src="/described.jpg" alt="Already described">
    </main></body></html>`;

  const images = extractImageContexts(html, 'https://www.activeset.co/work');

  it('skips images that already have alt text', () => {
    assert.equal(images.some((i) => i.src.endsWith('/described.jpg')), false);
    assert.equal(images.length, 4);
  });

  it('takes the heading from the image own card, not the one before it', () => {
    // Regression: a card grid puts the image before its title, so "nearest
    // heading above" labelled the Peak XV screenshot "Luca".
    const keatech = images.find((i) => i.src.endsWith('/keatech.webp'));
    assert.equal(keatech?.heading, 'Keatech');
  });

  it('records the link an image sits inside', () => {
    const keatech = images.find((i) => i.src.endsWith('/keatech.webp'));
    assert.equal(keatech?.linkHref, 'https://keatech.com/');
    assert.equal(keatech?.className, 'recent_project-img');
    assert.equal(keatech?.region, 'main');
  });

  it('picks the widest source from srcset, and reads the caption', () => {
    const floor = images.find((i) => i.src.includes('floor'));
    assert.equal(floor?.src, 'https://www.activeset.co/floor-1600.jpg');
    assert.equal(floor?.caption, 'The assembly floor in Ipswich');
  });

  it('notices markup that already says the image is presentational', () => {
    const spacer = images.find((i) => i.src.endsWith('/spacer.gif'));
    assert.equal(spacer?.markedPresentational, true);
  });

  it('knows which images are in the nav', () => {
    const logo = images.find((i) => i.src.endsWith('/logo.svg'));
    assert.equal(logo?.region, 'nav');
    assert.equal(logo?.linkHref, 'https://www.activeset.co/');
  });
});

describe('altForRecordPortrait', () => {
  it('keeps a portrait that is exactly the name on its CMS record', () => {
    assert.deepEqual(altForRecordPortrait('Rajan Anandan', 'Rajan Anandan'), { alt: 'Rajan Anandan', trimmed: false });
  });

  it('trims a job title the model invented', () => {
    // Real: a plain headshot, no text in it, and no role anywhere in the CMS.
    assert.deepEqual(altForRecordPortrait('Jevyn Ong, Head of Design', 'Jevyn Ong'), { alt: 'Jevyn Ong', trimmed: true });
  });

  it('trims the CMS field name leaking in as a description', () => {
    // Real: the field's name went in as the title attribute.
    assert.deepEqual(altForRecordPortrait('Numaan Ashraf, Headshot', 'Numaan Ashraf'), { alt: 'Numaan Ashraf', trimmed: true });
  });

  it('keeps words that can actually be read in the image', () => {
    assert.deepEqual(
      altForRecordPortrait('Priya Rao speaking at Surge Summit', 'Priya Rao', 'SURGE SUMMIT 2025 speaking'),
      { alt: 'Priya Rao speaking at Surge Summit', trimmed: false },
    );
  });

  it('holds a portrait that names someone other than the record', () => {
    assert.equal(altForRecordPortrait('Rajan Anandan', 'Shailesh Lakhani'), null);
  });

  it('holds a portrait that names no one', () => {
    assert.equal(altForRecordPortrait('A man in a blue shirt smiling', 'Numaan Ashraf'), null);
  });
});
