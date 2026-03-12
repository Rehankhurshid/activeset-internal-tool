import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractSearchableTextFromHtml,
  extractTitleTag,
  findTextMatchSummary,
  normalizeSearchText,
} from './website-text-check';

test('extractSearchableTextFromHtml strips non-content tags and decodes entities', () => {
  const html = `
    <html>
      <head>
        <title>Pricing &amp; Plans</title>
        <style>.hidden { display: none; }</style>
      </head>
      <body>
        <main>
          <h1>Pricing&nbsp;Table</h1>
          <p>Find the right &#39;plan&#39; here.</p>
        </main>
        <script>window.__DATA__ = "ignore me";</script>
      </body>
    </html>
  `;

  assert.equal(
    extractSearchableTextFromHtml(html),
    `Pricing Table Find the right 'plan' here.`
  );
});

test('findTextMatchSummary counts matches and returns contextual snippets', () => {
  const text = normalizeSearchText(`
    Home hero copy goes here.
    Pricing starts today and pricing updates weekly.
    Contact sales for custom pricing.
  `);

  const result = findTextMatchSummary(text, 'pricing');

  assert.equal(result.occurrences, 3);
  assert.equal(result.snippets.length, 3);
  assert.ok(result.snippets.every((snippet) => /pricing/i.test(snippet)));
});

test('extractTitleTag returns normalized title text', () => {
  assert.equal(
    extractTitleTag('<title>\n  Example&nbsp;Page  </title>'),
    'Example Page'
  );
});
