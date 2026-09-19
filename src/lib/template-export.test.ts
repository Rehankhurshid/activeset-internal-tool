import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdownToTemplate, templateToMarkdown } from './template-export';
import type { SOPTemplate } from '@/types';

/**
 * The Checklist Creator round-trips a template through Markdown every time
 * someone switches to the Markdown tab and back, so anything this format drops
 * is not merely absent from an export — it is deleted from the template on the
 * next save. That has already cost the shipped SOP its notes and assignees, and
 * a how-to is the field it would hurt most to lose, so every field an item can
 * carry gets a case here.
 */

const template: Partial<SOPTemplate> = {
  name: 'Webflow build',
  icon: '🧱',
  description: 'How we run a Webflow build.',
  sections: [
    {
      title: 'Input',
      emoji: '📥',
      order: 0,
      role: 'kickoff',
      items: [
        {
          title: 'Hold the kickoff call',
          status: 'not_started',
          order: 0,
          // Deliberately several lines, one of them blank: this is prose typed
          // into a Textarea, not a label.
          howTo: 'Walk the client through the plan.\n\nAgree the sync cadence before you leave the call.',
          blocking: true,
          assignee: 'rehan@activeset.co',
          dueDate: '2026-10-01',
          notes: 'Last time the assets arrived a week late.',
        },
        {
          title: 'Collect brand assets',
          status: 'not_started',
          order: 1,
          links: [
            { label: 'Brand kit', url: 'https://example.com/brand' },
            { label: 'Drive folder', url: 'https://drive.example.com/assets' },
          ],
          referenceLink: 'https://example.com/legacy-reference',
          hoverImage: 'https://example.com/shot.png',
        },
      ],
    },
    {
      title: 'Build',
      emoji: '🔨',
      order: 1,
      role: 'pages',
      items: [{ title: 'Develop the pages', status: 'not_started', order: 0 }],
    },
    {
      title: 'Review',
      emoji: '👀',
      order: 2,
      role: 'client_review',
      items: [{ title: 'Send the staging link', status: 'not_started', order: 0 }],
    },
    {
      title: 'Launch',
      emoji: '🚀',
      order: 3,
      role: 'launch',
      items: [
        { title: 'Every page has a title', status: 'not_started', order: 0, autoCheck: 'page_title' },
        { title: 'Point the domain', status: 'not_started', order: 1 },
      ],
    },
  ],
};

describe('Markdown round trip', () => {
  const parsed = parseMarkdownToTemplate(templateToMarkdown(template));
  const input = parsed.sections?.find((s) => s.title === 'Input');

  it('keeps the template name, icon and description', () => {
    assert.equal(parsed.name, 'Webflow build');
    assert.equal(parsed.icon, '🧱');
    assert.equal(parsed.description, 'How we run a Webflow build.');
  });

  it('keeps every section, in order', () => {
    assert.deepEqual(parsed.sections?.map((s) => s.title), ['Input', 'Build', 'Review', 'Launch']);
  });

  it('keeps the role, which is what Delivery does at that stage', () => {
    assert.deepEqual(parsed.sections?.map((s) => s.role), [
      'kickoff',
      'pages',
      'client_review',
      'launch',
    ]);
  });

  it('keeps an item scan signal', () => {
    const launch = parsed.sections?.find((s) => s.title === 'Launch');
    assert.equal(launch?.items[0].autoCheck, 'page_title');
    assert.equal(launch?.items[1].autoCheck, undefined);
  });

  it('keeps a multi-line how-to, blank line and all', () => {
    assert.equal(
      input?.items[0].howTo,
      'Walk the client through the plan.\n\nAgree the sync cadence before you leave the call.',
    );
  });

  it('keeps every link, with its label and in order', () => {
    assert.deepEqual(input?.items[1].links, [
      { label: 'Brand kit', url: 'https://example.com/brand' },
      { label: 'Drive folder', url: 'https://drive.example.com/assets' },
    ]);
  });

  it('keeps notes and assignee, which used to be erased on every tab switch', () => {
    assert.equal(input?.items[0].notes, 'Last time the assets arrived a week late.');
    assert.equal(input?.items[0].assignee, 'rehan@activeset.co');
  });

  it('keeps the blocking flag and the due date', () => {
    assert.equal(input?.items[0].blocking, true);
    assert.equal(input?.items[0].dueDate, '2026-10-01');
    assert.equal(input?.items[1].blocking, undefined);
  });

  it('keeps the legacy single reference link and the hover image', () => {
    assert.deepEqual(input?.items.map((i) => i.title), ['Hold the kickoff call', 'Collect brand assets']);
    assert.equal(input?.items[1].referenceLink, 'https://example.com/legacy-reference');
    assert.equal(input?.items[1].hoverImage, 'https://example.com/shot.png');
  });

  it('survives a second trip unchanged', () => {
    // The writer has to emit what its own parser reads, or the template drifts a
    // little every time someone opens the Markdown tab.
    assert.equal(templateToMarkdown(parsed), templateToMarkdown(template));
  });
});

describe('a role written by hand', () => {
  it('is read case-insensitively, and spaces count as underscores', () => {
    const parsed = parseMarkdownToTemplate('# T\n\n## Review\n\n> Role: Client Review\n\n- [ ] Something\n');
    assert.equal(parsed.sections?.[0].role, 'client_review');
  });

  it('is ignored when it names a role that does not exist', () => {
    // Better untagged than tagged with something no screen will ever match.
    const parsed = parseMarkdownToTemplate('# T\n\n## Input\n\n> Role: handover\n\n- [ ] Something\n');
    assert.equal(parsed.sections?.[0].role, undefined);
  });

  it('does not swallow the description of a template that has no sections', () => {
    const parsed = parseMarkdownToTemplate('# T\n\n> Role: kickoff\n\n---\n');
    assert.equal(parsed.description, 'Role: kickoff');
  });
});

describe('the legacy stage tag', () => {
  it('is read as the role of the same name', () => {
    const parsed = parseMarkdownToTemplate('# T\n\n## Input\n\n> Stage: KICKOFF\n\n- [ ] Something\n');
    assert.equal(parsed.sections?.[0].role, 'kickoff');
  });

  it('is ignored when it names a stage that does not exist', () => {
    const parsed = parseMarkdownToTemplate('# T\n\n## Input\n\n> Stage: handover\n\n- [ ] Something\n');
    assert.equal(parsed.sections?.[0].role, undefined);
  });

  it('is written back out as a role, so a template migrates by being opened', () => {
    const legacy: Partial<SOPTemplate> = {
      name: 'T',
      sections: [{ title: 'Input', emoji: '📥', order: 0, stage: 'launch', items: [] }],
    };
    const md = templateToMarkdown(legacy);
    assert.match(md, /> Role: launch/);
    assert.doesNotMatch(md, /> Stage:/);
  });
});

describe('sub-bullets the parser does not recognise', () => {
  const md = [
    '# T',
    '',
    '## Input',
    '',
    '- [ ] Something',
    '  - 🎲 Priority: high',
    '  - just a stray line',
    '  - 📋 How-to: Do the thing.',
    '',
  ].join('\n');

  it('are dropped without corrupting the item', () => {
    const item = parseMarkdownToTemplate(md).sections?.[0].items[0];
    assert.equal(item?.title, 'Something');
    assert.equal(item?.howTo, 'Do the thing.');
    assert.equal(item?.notes, undefined);
    assert.equal(item?.referenceLink, undefined);
  });
});

describe('the older emoji-only sub-bullets', () => {
  it('still read as a reference link, an image and a scan signal', () => {
    const md = [
      '# T',
      '',
      '## Input',
      '',
      '- [ ] Something',
      '  - 🔗 https://example.com/one',
      '  - 🖼️ https://example.com/shot.png',
      '  - 🔍 page_title',
      '',
    ].join('\n');
    const item = parseMarkdownToTemplate(md).sections?.[0].items[0];
    assert.equal(item?.referenceLink, 'https://example.com/one');
    assert.equal(item?.hoverImage, 'https://example.com/shot.png');
    assert.equal(item?.autoCheck, 'page_title');
  });

  it('reads a bare URL under Link: as an unlabelled link', () => {
    const md = '# T\n\n## Input\n\n- [ ] Something\n  - 🔗 Link: https://example.com/one\n';
    const item = parseMarkdownToTemplate(md).sections?.[0].items[0];
    assert.deepEqual(item?.links, [{ label: '', url: 'https://example.com/one' }]);
  });
});
