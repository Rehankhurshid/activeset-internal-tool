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
          fields: [
            { id: 'call-date', label: 'Call date', type: 'date', expected: true },
            {
              id: 'recording',
              label: 'Recording link',
              type: 'url',
              placeholder: 'https://fathom.video/…',
            },
            { id: 'attendees', label: 'Who attended', type: 'emails' },
            // The id has drifted from the label — renamed after values were
            // recorded against it — and the label has brackets of its own.
            { id: 'notes-taken', label: 'Summary (Fathom)', type: 'text' },
          ],
          template: {
            label: 'Copy the cadence question',
            body: 'Hi Sam,\n\nHow often would you like to sync?',
            options: ['Weekly', 'Every two weeks'],
          },
          // Project data. It must never reach the Markdown, or the next client
          // inherits this one's answers.
          values: { 'call-date': '2026-09-18' },
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
      items: [
        {
          title: 'Send the staging link',
          status: 'not_started',
          order: 0,
          // No label, no options: the plainest message there is.
          template: { body: 'The staging link is ready: {{url}}' },
        },
      ],
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

  it('keeps every field, with its type, placeholder and expected flag', () => {
    assert.deepEqual(input?.items[0].fields, [
      { id: 'call-date', label: 'Call date', type: 'date', expected: true },
      {
        id: 'recording',
        label: 'Recording link',
        type: 'url',
        placeholder: 'https://fathom.video/…',
      },
      { id: 'attendees', label: 'Who attended', type: 'emails' },
      { id: 'notes-taken', label: 'Summary (Fathom)', type: 'text' },
    ]);
  });

  it('keeps the message, blank line in the body and all', () => {
    assert.deepEqual(input?.items[0].template, {
      label: 'Copy the cadence question',
      body: 'Hi Sam,\n\nHow often would you like to sync?',
      options: ['Weekly', 'Every two weeks'],
    });
  });

  it('keeps a message that is only a body', () => {
    const review = parsed.sections?.find((s) => s.title === 'Review');
    assert.deepEqual(review?.items[0].template, { body: 'The staging link is ready: {{url}}' });
  });

  it('never writes what a project recorded', () => {
    // `values` belongs to the project that ticked the step. A template carrying
    // it would hand one client's dates to the next.
    const md = templateToMarkdown(template);
    assert.doesNotMatch(md, /2026-09-18/);
    assert.equal(input?.items[0].values, undefined);
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

describe('a field written by hand', () => {
  const fieldsOf = (md: string) => parseMarkdownToTemplate(md).sections?.[0].items[0].fields;
  const wrap = (...bullets: string[]) =>
    ['# T', '', '## Input', '', '- [ ] Something', ...bullets, ''].join('\n');

  it('gets an id from its label, and a unique one when two labels agree', () => {
    const fields = fieldsOf(
      wrap('  - 🧾 Field: Call date (date)', '  - 🧾 Field: Call date (url)'),
    );
    assert.deepEqual(fields?.map((f) => f.id), ['call-date', 'call-date-2']);
  });

  it('defaults to free text when it says nothing about its type', () => {
    assert.deepEqual(fieldsOf(wrap('  - 🧾 Field: Anything at all')), [
      { id: 'anything-at-all', label: 'Anything at all', type: 'text' },
    ]);
  });

  it('keeps a label that merely ends in a parenthesis', () => {
    // The tail only counts when every token in it is one we know, or half the
    // label disappears into a type nobody asked for.
    assert.deepEqual(fieldsOf(wrap('  - 🧾 Field: Recording link (Fathom)')), [
      { id: 'recording-link-fathom', label: 'Recording link (Fathom)', type: 'text' },
    ]);
  });

  it('takes its type and expected flag from separate lines too', () => {
    const fields = fieldsOf(
      wrap(
        '  - 🧾 Field: Call date',
        '  - 🧾 Field type: DATE',
        '  - 🧾 Field expected: yes',
        '  - 🧾 Field id: kickoff-date',
        '  - 🧾 Field placeholder: When did it happen?',
      ),
    );
    assert.deepEqual(fields, [
      {
        id: 'kickoff-date',
        label: 'Call date',
        type: 'date',
        expected: true,
        placeholder: 'When did it happen?',
      },
    ]);
  });

  it('ignores an attribute with no field above it, and a key nobody knows', () => {
    const fields = fieldsOf(
      wrap(
        '  - 🧾 Field placeholder: nothing to attach to',
        '  - 🧾 Field: Call date (date)',
        '  - 🎲 Field colour: red',
      ),
    );
    assert.deepEqual(fields, [{ id: 'call-date', label: 'Call date', type: 'date' }]);
  });

  it('round-trips a drifted id rather than re-deriving it from the label', () => {
    const md = wrap('  - 🧾 Field: Call date (date)', '  - 🧾 Field id: kickoff-date');
    const again = templateToMarkdown(parseMarkdownToTemplate(md));
    assert.match(again, /🧾 Field id: kickoff-date/);
    assert.equal(fieldsOf(again)?.[0].id, 'kickoff-date');
  });
});

describe('a message written by hand', () => {
  it('collects its label, its body lines and its options in order', () => {
    const md = [
      '# T',
      '',
      '## Input',
      '',
      '- [ ] Ask about the cadence',
      '  - 💬 Message label: Copy this',
      '  - 💬 Message: Hi Sam,',
      '  - 💬 Message: ',
      '  - 💬 Message: How often should we sync?',
      '  - 💬 Option: Weekly',
      '  - 💬 Option: Every two weeks',
      '',
    ].join('\n');
    const item = parseMarkdownToTemplate(md).sections?.[0].items[0];
    assert.deepEqual(item?.template, {
      label: 'Copy this',
      body: 'Hi Sam,\n\nHow often should we sync?',
      options: ['Weekly', 'Every two weeks'],
    });
  });

  it('is still a message when only its options were written', () => {
    // A body it has to be given later is better than an item that silently
    // loses the choices someone typed.
    const md = '# T\n\n## Input\n\n- [ ] Pick one\n  - 💬 Option: Weekly\n';
    const item = parseMarkdownToTemplate(md).sections?.[0].items[0];
    assert.deepEqual(item?.template, { body: '', options: ['Weekly'] });
  });

  it('does not leak from one item into the next', () => {
    const md = [
      '# T',
      '',
      '## Input',
      '',
      '- [ ] First',
      '  - 💬 Message: Hello',
      '- [ ] Second',
      '',
    ].join('\n');
    const items = parseMarkdownToTemplate(md).sections?.[0].items;
    assert.deepEqual(items?.[0].template, { body: 'Hello' });
    assert.equal(items?.[1].template, undefined);
  });
});
