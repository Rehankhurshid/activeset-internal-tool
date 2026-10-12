import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PortalStageView } from './client-portal.types';
import { portalLinks } from './portal-links';

const stage = (steps: PortalStageView['steps']): PortalStageView => ({ id: 's', title: 'Web Design', state: 'current', steps }) as PortalStageView;

describe('portalLinks', () => {
  it('lists the website, each step’s link in order, then shared files, once each', () => {
    const links = portalLinks({
      websiteUrl: 'https://assetplus.in',
      stages: [stage([
        { id: 'a', title: 'References, assets & sitemap', state: 'done', url: 'https://docs.google.com/s', urlLabel: 'Sitemap' },
        { id: 'b', title: 'Moodboarding', state: 'done', url: 'https://figma.com/m', urlLabel: 'Moodboard' },
        { id: 'c', title: 'Wireframes', state: 'upcoming' },
      ])],
      files: [{ id: 'f', title: 'Brand guide', url: 'https://drive.google.com/b' }, { id: 'g', title: 'Moodboard again', url: 'https://figma.com/m' }],
    });
    assert.deepEqual(links.map((l) => [l.title, l.note]), [
      ['Your website', undefined],
      ['Sitemap', 'References, assets & sitemap'],
      ['Moodboard', 'Moodboarding'],
      ['Brand guide', undefined],
    ]);
  });

  it('keeps a how-to on its link instead of listing it', () => {
    const links = portalLinks({
      stages: [stage([{
        id: 'r', title: 'Review on staging', state: 'upcoming', url: 'https://app.markup.io/x', urlLabel: 'Leave feedback in MarkUp',
        links: [{ label: 'Leave feedback in MarkUp', url: 'https://app.markup.io/x', help: { label: 'How to use MarkUp (video)', url: 'https://youtu.be/1' } }],
      }])],
      files: [],
    });
    assert.equal(links.length, 1);
    assert.deepEqual(links[0].help, { label: 'How to use MarkUp (video)', url: 'https://youtu.be/1' });
  });

  it('counts a trailing slash as the same link', () => {
    const links = portalLinks({
      websiteUrl: 'https://site.webflow.io',
      stages: [stage([{ id: 'r', title: 'Review on staging', state: 'upcoming', url: 'https://site.webflow.io/', urlLabel: 'Staging site' }])],
      files: [],
    });
    assert.deepEqual(links.map((l) => l.title), ['Your website']);
  });
});
