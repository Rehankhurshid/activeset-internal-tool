import test from 'node:test';
import assert from 'node:assert/strict';

import type { ExtendedContentSnapshot, PageJudgment } from '@/types';

import {
  JUDGMENT_MAX_AGE_MS,
  buildPageJudgmentInput,
  readJudgment,
  shouldJudgePage,
} from './page-judgment';

const NOW = new Date('2026-09-19T12:00:00.000Z');

function judgment(overrides: Partial<PageJudgment> = {}): PageJudgment {
  return { checkedAt: NOW.toISOString(), ...overrides };
}

function snapshot(overrides: Partial<ExtendedContentSnapshot> = {}): ExtendedContentSnapshot {
  return {
    title: 'Roasting classes in Leeds',
    h1: 'Learn to roast',
    metaDescription: 'Weekend roasting classes for home baristas.',
    wordCount: 640,
    headings: [],
    images: [],
    links: [],
    sections: [],
    bodyTextHash: 'body-hash',
    ...overrides,
  };
}

test('readJudgment leaves the middle band uncertain rather than calling it', () => {
  assert.equal(readJudgment(0.92), 'pass');
  assert.equal(readJudgment(0.75), 'pass');
  assert.equal(readJudgment(0.6), 'uncertain');
  assert.equal(readJudgment(0.5), 'uncertain');
  assert.equal(readJudgment(0.36), 'uncertain');
  assert.equal(readJudgment(0.35), 'fail');
  assert.equal(readJudgment(0.02), 'fail');
});

test('readJudgment treats an absent probability as unchecked, not as a fail', () => {
  assert.equal(readJudgment(undefined), 'unchecked');
  assert.equal(readJudgment(Number.NaN), 'unchecked');
});

test('shouldJudgePage judges a page that has never been judged', () => {
  assert.equal(
    shouldJudgePage({ previousFullHash: 'abc', fullHash: 'abc', now: NOW }),
    true,
  );
});

test('shouldJudgePage skips a page whose content is unchanged', () => {
  assert.equal(
    shouldJudgePage({
      previousJudgment: judgment(),
      previousFullHash: 'abc',
      fullHash: 'abc',
      now: NOW,
    }),
    false,
  );
});

test('shouldJudgePage judges again when the content moved', () => {
  assert.equal(
    shouldJudgePage({
      previousJudgment: judgment(),
      previousFullHash: 'abc',
      fullHash: 'def',
      now: NOW,
    }),
    true,
  );
});

test('shouldJudgePage judges when either hash is missing, rather than assuming unchanged', () => {
  assert.equal(
    shouldJudgePage({ previousJudgment: judgment(), fullHash: 'abc', now: NOW }),
    true,
  );
  assert.equal(
    shouldJudgePage({ previousJudgment: judgment(), previousFullHash: 'abc', now: NOW }),
    true,
  );
});

test('shouldJudgePage refreshes an unchanged page once the judgment ages out', () => {
  const stale = new Date(NOW.getTime() - JUDGMENT_MAX_AGE_MS - 1000);
  const fresh = new Date(NOW.getTime() - JUDGMENT_MAX_AGE_MS + 1000);

  assert.equal(
    shouldJudgePage({
      previousJudgment: judgment({ checkedAt: stale.toISOString() }),
      previousFullHash: 'abc',
      fullHash: 'abc',
      now: NOW,
    }),
    true,
  );
  assert.equal(
    shouldJudgePage({
      previousJudgment: judgment({ checkedAt: fresh.toISOString() }),
      previousFullHash: 'abc',
      fullHash: 'abc',
      now: NOW,
    }),
    false,
  );
});

test('shouldJudgePage judges when the stored timestamp cannot be read', () => {
  assert.equal(
    shouldJudgePage({
      previousJudgment: judgment({ checkedAt: 'not a date' }),
      previousFullHash: 'abc',
      fullHash: 'abc',
      now: NOW,
    }),
    true,
  );
});

test('buildPageJudgmentInput stitches copy from the body preview and every section', () => {
  const input = buildPageJudgmentInput({
    url: 'https://example.com/classes',
    snapshot: snapshot({
      bodyTextPreview: 'Weekend classes in our Leeds roastery.',
      sections: [
        { selector: 'section', headingText: 'What you learn', wordCount: 40, textPreview: 'Profiles and cupping.' },
        { selector: 'section', headingText: '', wordCount: 20, textPreview: 'Lorem ipsum dolor sit amet.' },
      ],
    }),
  });

  assert.ok(input.copy?.includes('Weekend classes in our Leeds roastery.'));
  assert.ok(input.copy?.includes('What you learn: Profiles and cupping.'));
  // The filler is in the third block, past the 500-char preview the scanner
  // stores — catching it there is the whole reason sections are stitched in.
  assert.ok(input.copy?.includes('Lorem ipsum dolor sit amet.'));
});

test('buildPageJudgmentInput puts main-content images ahead of page furniture', () => {
  const furniture = Array.from({ length: 12 }, (_, idx) => ({
    src: `https://cdn.example.com/chrome-${idx}.svg`,
    alt: 'logo',
    inMainContent: false,
  }));

  const input = buildPageJudgmentInput({
    url: 'https://example.com/classes',
    snapshot: snapshot({
      images: [
        ...furniture,
        { src: 'https://cdn.example.com/roastery.jpg', alt: 'The roastery', inMainContent: true },
      ],
    }),
  });

  assert.equal(input.images?.length, 12);
  assert.equal(input.images?.[0].src, 'https://cdn.example.com/roastery.jpg');
});

test('buildPageJudgmentInput passes spelling flags through with their suggestions', () => {
  const input = buildPageJudgmentInput({
    url: 'https://example.com/classes',
    snapshot: snapshot(),
    spellingIssues: [
      { word: 'Chemex', suggestion: 'Chemise' },
      { word: 'recieve', suggestion: 'receive' },
    ],
  });

  assert.deepEqual(input.spellingCandidates, [
    { word: 'Chemex', suggestion: 'Chemise' },
    { word: 'recieve', suggestion: 'receive' },
  ]);
});

test('buildPageJudgmentInput omits empty fields so no question is asked about them', () => {
  const input = buildPageJudgmentInput({
    url: 'https://example.com/blank',
    snapshot: snapshot({ title: '', metaDescription: '', h1: '' }),
    spellingIssues: [],
  });

  assert.equal(input.title, undefined);
  assert.equal(input.metaDescription, undefined);
  assert.equal(input.h1, undefined);
  assert.equal(input.copy, undefined);
  assert.equal(input.images, undefined);
  assert.equal(input.spellingCandidates, undefined);
});
