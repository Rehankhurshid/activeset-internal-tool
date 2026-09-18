import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdownToTemplate, templateToMarkdown } from './template-export';
import type { SOPTemplate } from '@/types';

/**
 * The Checklist Creator round-trips a template through Markdown every time
 * someone switches to the Markdown tab and back, so anything this format drops
 * is not merely absent from an export — it is deleted from the template on the
 * next save. The stage tag drives the Kickoff and Launch screens, which makes
 * that an expensive thing to lose quietly.
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
      stage: 'kickoff',
      items: [
        { title: 'Hold the kickoff call', status: 'not_started', order: 0 },
        {
          title: 'Collect brand assets',
          status: 'not_started',
          order: 1,
          referenceLink: 'https://example.com/brand',
        },
      ],
    },
    {
      title: 'Build',
      emoji: '🔨',
      order: 1,
      items: [{ title: 'Develop the pages', status: 'not_started', order: 0 }],
    },
    {
      title: 'Launch',
      emoji: '🚀',
      order: 2,
      stage: 'launch',
      items: [
        { title: 'Every page has a title', status: 'not_started', order: 0, autoCheck: 'page_title' },
        { title: 'Point the domain', status: 'not_started', order: 1 },
      ],
    },
  ],
};

describe('Markdown round trip', () => {
  const parsed = parseMarkdownToTemplate(templateToMarkdown(template));

  it('keeps the template name, icon and description', () => {
    assert.equal(parsed.name, 'Webflow build');
    assert.equal(parsed.icon, '🧱');
    assert.equal(parsed.description, 'How we run a Webflow build.');
  });

  it('keeps every section, in order', () => {
    assert.deepEqual(parsed.sections?.map((s) => s.title), ['Input', 'Build', 'Launch']);
  });

  it('keeps the stage tag, which the Delivery screens read', () => {
    assert.deepEqual(parsed.sections?.map((s) => s.stage), ['kickoff', undefined, 'launch']);
  });

  it('keeps an item scan signal', () => {
    const launch = parsed.sections?.find((s) => s.title === 'Launch');
    assert.equal(launch?.items[0].autoCheck, 'page_title');
    assert.equal(launch?.items[1].autoCheck, undefined);
  });

  it('keeps a reference link, and the items it belongs to', () => {
    const input = parsed.sections?.find((s) => s.title === 'Input');
    assert.deepEqual(input?.items.map((i) => i.title), ['Hold the kickoff call', 'Collect brand assets']);
    assert.equal(input?.items[1].referenceLink, 'https://example.com/brand');
  });

  it('survives a second trip unchanged', () => {
    // The writer has to emit what its own parser reads, or the template drifts a
    // little every time someone opens the Markdown tab.
    assert.equal(templateToMarkdown(parsed), templateToMarkdown(template));
  });
});

describe('a stage tag written by hand', () => {
  it('is read case-insensitively', () => {
    const parsed = parseMarkdownToTemplate('# T\n\n## Input\n\n> Stage: KICKOFF\n\n- [ ] Something\n');
    assert.equal(parsed.sections?.[0].stage, 'kickoff');
  });

  it('is ignored when it names a stage that does not exist', () => {
    // Better untagged than tagged with something no screen will ever match.
    const parsed = parseMarkdownToTemplate('# T\n\n## Input\n\n> Stage: handover\n\n- [ ] Something\n');
    assert.equal(parsed.sections?.[0].stage, undefined);
  });

  it('does not swallow the description of a template that has no sections', () => {
    const parsed = parseMarkdownToTemplate('# T\n\n> Stage: kickoff\n\n---\n');
    assert.equal(parsed.description, 'Stage: kickoff');
  });
});
