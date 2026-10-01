import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChecklistItemField, ProjectLink } from '@/types';
import { linksFromValues, mergeProjectLinks } from './checklist-links';

const markup: ChecklistItemField = { id: 'markup', label: 'MarkUp folder', type: 'url' };
const link = (id: string, title: string, url: string, extra: Partial<ProjectLink> = {}): ProjectLink => ({ id, title, url, order: 0, ...extra });
let n = 0;
const newId = () => `new${++n}`;

describe('checklist links', () => {
  it('reads a tagged url field, borrowing the tag from the agency basics for old checklists', () => {
    assert.deepEqual(linksFromValues([markup], { markup: 'https://app.markup.io/x' }), [
      { title: 'MarkUp', matches: ['Feedback URL', 'MarkUp folder', 'Feedback'], url: 'https://app.markup.io/x' },
    ]);
  });

  it('ignores untagged fields, blanks and things that are not links', () => {
    const notes: ChecklistItemField = { id: 'notes', label: 'Notes', type: 'url' };
    assert.deepEqual(linksFromValues([notes, markup], { notes: 'https://a.b', markup: 'folder name' }), []);
  });

  it('fills an existing link of another name instead of adding a second one', () => {
    const { links, changed } = mergeProjectLinks(
      [link('a', 'Feedback URL', ''), link('b', 'Live', 'https://x.co', { order: 3 })],
      [{ title: 'MarkUp', matches: ['Feedback URL'], url: 'https://app.markup.io/x' }],
      newId,
    );
    assert.deepEqual(changed, ['a']);
    assert.equal(links[0].url, 'https://app.markup.io/x');
    assert.equal(links.length, 2);
  });

  it('adds a manual link at the end when there is none, and changes nothing when it is already there', () => {
    const first = mergeProjectLinks([link('b', 'Live', 'https://x.co', { order: 3 })], [{ title: 'MarkUp', matches: [], url: 'https://m.io' }], newId);
    assert.deepEqual(first.links[1], { id: first.changed[0], title: 'MarkUp', url: 'https://m.io', order: 4, source: 'manual' });
    assert.deepEqual(mergeProjectLinks(first.links, [{ title: 'MarkUp', matches: [], url: 'https://m.io' }], newId).changed, []);
  });

  it('never takes over a page the app discovered', () => {
    const { links } = mergeProjectLinks([link('p', 'MarkUp', 'https://site.co/markup', { source: 'auto' })], [{ title: 'MarkUp', matches: [], url: 'https://m.io' }], newId);
    assert.equal(links.length, 2);
    assert.equal(links[0].url, 'https://site.co/markup');
  });
});
