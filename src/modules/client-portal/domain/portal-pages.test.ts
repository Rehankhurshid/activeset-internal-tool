import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { portalPages, portalPageState } from './portal-pages';
import { feedbackLinks, withPagesInReview } from './client-portal.projection';
import type { ProjectPage } from '@/modules/delivery';
import type { TimelineStageSource } from './client-timeline';

const disciplines = [
  { id: 'copy', label: 'Copy', order: 0 },
  { id: 'design', label: 'Design', order: 1 },
  { id: 'dev_desktop', label: 'Dev — desktop', order: 2 },
  { id: 'dev_mobile', label: 'Dev — mobile', order: 3 },
];
// A Development-only project: the client writes the copy and designs.
const owners = { copy: 'client', design: 'client', dev_desktop: 'activeset', dev_mobile: 'activeset' } as const;

const page = (id: string, work: ProjectPage['work'], extra: Partial<ProjectPage> = {}): ProjectPage => ({
  id, path: `/${id}`, title: id[0].toUpperCase() + id.slice(1), order: 0, work, createdAt: '', updatedAt: '', ...extra,
});

describe('portalPageState', () => {
  it('is ready once our columns are built, whatever their design is doing', () => {
    const built = { copy: 'not_required', design: 'in_progress', dev_desktop: 'completed', dev_mobile: 'completed' } as const;
    assert.equal(portalPageState({ work: built }, disciplines, owners), 'ready');
  });

  it('is being built, waiting on them, or not started', () => {
    assert.equal(portalPageState({ work: { dev_desktop: 'completed', dev_mobile: 'in_progress' } }, disciplines, owners), 'building');
    assert.equal(portalPageState({ work: { design: 'not_started' } }, disciplines, owners), 'waiting');
    assert.equal(portalPageState({ work: { copy: 'completed', design: 'completed' } }, disciplines, owners), 'planned');
  });
});

describe('portalPages', () => {
  it('sends only the name, staging link, state and their own parts, in the grid order', () => {
    const pages = portalPages([
      page('product', { design: 'in_progress', copy: 'not_required', dev_desktop: 'completed', dev_mobile: 'completed' }, {
        order: 1, stagingLink: 'https://site.webflow.io/product', assignee: 'dev@activeset.co', reviewComment: 'internal', designLink: 'https://figma.com/x',
      }),
      page('home', { design: 'not_started' }, { order: 0, stagingLink: 'javascript:alert(1)' }),
    ], disciplines, owners);
    assert.deepEqual(pages, [
      { id: 'home', title: 'Home', state: 'waiting', theirs: ['Your copy: not in yet', 'Your design: not in yet'] },
      { id: 'product', title: 'Product', state: 'ready', stagingUrl: 'https://site.webflow.io/product', theirs: ['Your design: in revision'] },
    ]);
  });
});

describe('the review step and pages', () => {
  const step = (id: string, state: 'done' | 'current' | 'upcoming', extra = {}) => ({ id, title: id, state, ...extra });
  const sources = (): TimelineStageSource[] => [{
    stage: { id: 'dev', title: 'Development', deliverables: [], files: [] },
    steps: [
      step('Pages built', 'current'),
      step('Review on staging', 'upcoming', {
        review: true, owner: 'client', url: 'https://site.webflow.io/', urlLabel: 'Staging site',
        links: [
          { label: 'Staging site', url: 'https://site.webflow.io/' },
          { label: 'Leave feedback in MarkUp', url: 'https://app.markup.io/x', help: { label: 'How to use MarkUp (video)', url: 'https://youtu.be/1' } },
        ],
      }),
    ],
  }];
  const pages = portalPages([
    page('home', { dev_desktop: 'completed', dev_mobile: 'completed' }, { stagingLink: 'https://site.webflow.io/' }),
    page('blog', { dev_desktop: 'in_progress' }),
  ], disciplines, owners);

  it('starts the review as soon as a page is ready, saying how many', () => {
    const [review] = withPagesInReview(sources(), pages)[0].steps.slice(1);
    assert.equal(review.state, 'current');
    assert.equal(review.note, '1 of 2 pages ready for your review');
    assert.deepEqual(withPagesInReview(sources(), pages.slice(1)), sources(), 'nothing ready, nothing moves');
  });

  it('offers the MarkUp board and its how-to beside the pages, not the staging site', () => {
    assert.deepEqual(feedbackLinks(sources(), pages), [
      { label: 'Leave feedback in MarkUp', url: 'https://app.markup.io/x', help: { label: 'How to use MarkUp (video)', url: 'https://youtu.be/1' } },
    ]);
  });
});
