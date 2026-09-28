import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseInline, parseSummary } from './meeting-summary';

describe('parseSummary', () => {
  it('reads Fathom’s headings, nested bullets, bold and links', () => {
    const blocks = parseSummary(
      [
        '## Meeting Purpose',
        'Agree the homepage direction.',
        '',
        '## Key Takeaways',
        '  - **Homepage**: approved [12:04](https://fathom.video/share/abc?timestamp=724)',
        '    - Hero copy to follow',
        '  - Launch stays on 2 Nov',
      ].join('\n'),
    );
    assert.equal(blocks.length, 4);
    assert.equal(blocks[0].type, 'heading');
    assert.equal(blocks[1].type, 'paragraph');
    const list = blocks[3];
    assert.equal(list.type, 'list');
    if (list.type !== 'list') return;
    assert.deepEqual(list.items.map((i) => i.depth), [0, 1, 0], 'Fathom’s two-space indent is the top level');
    assert.deepEqual(list.items[0].content, [
      { type: 'strong', text: 'Homepage' },
      { type: 'text', text: ': approved ' },
      { type: 'link', text: '12:04', href: 'https://fathom.video/share/abc?timestamp=724' },
    ]);
  });

  it('never lets markup or a script link through', () => {
    const inline = parseInline('<img src=x onerror=alert(1)> [click](javascript:alert(1))');
    assert.deepEqual(inline, [{ type: 'text', text: '<img src=x onerror=alert(1)> click' }]);
    assert.ok(inline.every((part) => part.type !== 'link'));
  });

  it('is empty for nothing', () => {
    assert.deepEqual(parseSummary(''), []);
    assert.deepEqual(parseSummary(undefined), []);
  });
});
