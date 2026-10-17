import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectLink } from '@/types';
import { recordableUrlProblem, recordingTargets } from './delivery.recording';

const link = (title: string, url: string, source?: 'auto' | 'manual'): ProjectLink => ({
  id: title,
  title,
  url,
  order: 0,
  ...(source ? { source } : {}),
});

describe('recordingTargets', () => {
  it('prefers the page staging link, and puts the path on the live site', () => {
    const targets = recordingTargets(
      { path: '/pricing', stagingLink: 'https://acme.webflow.io/pricing' },
      { links: [link('Live site', 'https://acme.com')] },
    );
    assert.deepEqual(targets, { staging: 'https://acme.webflow.io/pricing', live: 'https://acme.com/pricing' });
  });

  it('builds staging from the project Staging link when the page has none', () => {
    const targets = recordingTargets({ path: '/' }, { links: [link('Staging', 'acme.webflow.io/some/page')] });
    assert.deepEqual(targets, { staging: 'https://acme.webflow.io/' });
  });

  it('falls back to the sitemap site for live', () => {
    const targets = recordingTargets({ path: '/blog' }, { sitemapUrl: 'https://www.acme.com/sitemap.xml' });
    assert.deepEqual(targets, { live: 'https://www.acme.com/blog' });
  });

  it('ignores sitemap pages whose titles happen to say live or staging', () => {
    const targets = recordingTargets(
      { path: '/demo' },
      { links: [link('Live demo', 'https://other.com/live-demo', 'auto'), link('Live', 'https://acme.com')] },
    );
    assert.deepEqual(targets, { live: 'https://acme.com/demo' });
  });

  it('treats a full-URL path as staging', () => {
    const targets = recordingTargets(
      { path: 'https://acme.webflow.io/about' },
      { links: [link('Live', 'https://acme.com')] },
    );
    assert.deepEqual(targets, { staging: 'https://acme.webflow.io/about', live: 'https://acme.com/about' });
  });

  it('returns nothing when there is nowhere to record from', () => {
    assert.deepEqual(recordingTargets({ path: '/x' }, {}), {});
  });
});

describe('recordableUrlProblem', () => {
  it('allows public sites', () => {
    assert.equal(recordableUrlProblem('https://acme.webflow.io/pricing'), null);
  });

  it('refuses the office network', () => {
    for (const url of [
      'http://localhost:3000/',
      'http://127.0.0.1/',
      'http://192.168.1.10/',
      'http://10.0.0.5/',
      'http://172.20.1.1/',
      'http://169.254.169.254/latest/meta-data',
      'http://router/',
      'http://[::1]/',
      'file:///etc/passwd',
    ]) {
      assert.ok(recordableUrlProblem(url), url);
    }
  });
});
