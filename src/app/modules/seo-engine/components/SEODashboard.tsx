'use client';

import { useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, Search, PenLine, ListOrdered, Eye, Settings,
} from 'lucide-react';
import { KEYWORD_DB } from '../data/keywords';
import { TEMPLATES } from '../data/templates';
import { QueueItem, SEOConfig, AutomationConfig, FlatKeyword, TopicItem } from '../types/seo';
import { OverviewTab } from './OverviewTab';
import { KeywordsTab } from './KeywordsTab';
import { GenerateTab } from './GenerateTab';
import { QueueTab } from './QueueTab';
import { PreviewTab } from './PreviewTab';
import { SettingsTab } from './SettingsTab';
import { toast } from 'sonner';

type TabId = 'dashboard' | 'keywords' | 'generate' | 'queue' | 'preview' | 'settings';

export function SEODashboard() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('how-to');
  const [previewItem, setPreviewItem] = useState<QueueItem | null>(null);
  const [config, setConfig] = useState<SEOConfig>({ siteId: '', collectionId: '', apiToken: '', claudeKey: '' });
  const [automation, setAutomation] = useState<AutomationConfig>({ enabled: false, time: '09:00', perDay: 1, autoPublish: false });
  const [publishingId, setPublishingId] = useState<number | null>(null);

  // Flatten keywords
  const allKws: FlatKeyword[] = Object.entries(KEYWORD_DB).flatMap(([v, d]) =>
    d.keywords.map(k => ({ ...k, vertical: v, vColor: d.color }))
  );

  const allTopics: TopicItem[] = Object.entries(KEYWORD_DB).flatMap(([v, d]) =>
    d.topics.map(t => ({ title: t, vertical: v, color: d.color }))
  );

  const stats = {
    keywords: allKws.length,
    highPriority: allKws.filter(k => k.priority === 'high').length,
    queued: queue.filter(q => q.status === 'ready').length,
    published: queue.filter(q => q.status === 'published').length,
    totalWords: queue.reduce((s, q) => s + (q.wordCount || 0), 0),
  };

  const generateContent = useCallback(async () => {
    if (!selectedTopic || generating) return;
    setGenerating(true);
    setGenProgress('Analyzing keyword intent & competition...');

    try {
      await new Promise(r => setTimeout(r, 600));
      setGenProgress('Generating SEO-optimized content via Claude API...');

      const template = TEMPLATES[selectedTemplate];
      const response = await fetch('/api/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: selectedTopic,
          templateLabel: template?.label,
          templateStructure: template?.structure,
          templateWords: template?.words,
          apiKey: config.claudeKey || undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `API error: ${response.status}`);
      }

      const parsed = await response.json();

      setGenProgress('Parsing and scoring content...');

      const item: QueueItem = {
        id: Date.now(),
        ...parsed,
        template: selectedTemplate,
        vertical: Object.entries(KEYWORD_DB).find(([, d]) => d.topics.includes(selectedTopic))?.[0] || 'General',
        status: 'ready',
        createdAt: new Date().toISOString(),
        wordCount: (parsed.body || '').split(/\s+/).length,
      };

      setQueue(prev => [item, ...prev]);
      setPreviewItem(item);
      setTab('preview');
      toast.success('Blog post generated successfully!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      toast.error(message);
    } finally {
      setGenerating(false);
      setGenProgress('');
    }
  }, [selectedTopic, selectedTemplate, generating, config.claudeKey]);

  const publishToWebflow = useCallback(async (item: QueueItem) => {
    if (!config.collectionId || !config.apiToken) {
      toast.error('Configure Webflow API credentials in Settings first.');
      setTab('settings');
      return;
    }

    setPublishingId(item.id);

    try {
      const res = await fetch('/api/seo/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionId: config.collectionId,
          apiToken: config.apiToken,
          title: item.title,
          slug: item.slug,
          body: item.body,
          excerpt: item.excerpt,
          metaTitle: item.metaTitle,
          metaDescription: item.metaDescription,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Webflow API returned ${res.status}`);
      }

      const now = new Date().toISOString();
      setQueue(prev => prev.map(q =>
        q.id === item.id ? { ...q, status: 'published' as const, publishedAt: now } : q
      ));
      if (previewItem?.id === item.id) {
        setPreviewItem(p => p ? { ...p, status: 'published' as const, publishedAt: now } : null);
      }
      toast.success('Published to Webflow!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Publish failed';
      toast.error(`Publish failed: ${message}. Make sure your field slugs match: name, slug, post-body, post-summary, meta-title, meta-description`);
    } finally {
      setPublishingId(null);
    }
  }, [config, previewItem]);

  const handleSelectTopic = (topic: string) => {
    setSelectedTopic(topic);
    setTab('generate');
  };

  const handlePreview = (item: QueueItem) => {
    setPreviewItem(item);
    setTab('preview');
  };

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; count?: number; hide?: boolean }[] = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'keywords', label: 'Keywords', icon: Search },
    { id: 'generate', label: 'Generate', icon: PenLine },
    { id: 'queue', label: 'Queue', icon: ListOrdered, count: stats.queued },
    { id: 'preview', label: 'Preview', icon: Eye, hide: !previewItem },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      {/* Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-wider">Claude API → Review → Webflow CMS</span>
        </div>
        <Badge
          variant="outline"
          className={automation.enabled
            ? 'bg-teal-500/10 text-teal-500 border-teal-500/20'
            : 'text-muted-foreground'
          }
        >
          {automation.enabled ? `Daily at ${automation.time} IST` : 'Manual mode'}
        </Badge>
      </div>

      {/* Tab Navigation */}
      <nav className="flex gap-1 border-b pb-px overflow-x-auto">
        {tabs.filter(t => !t.hide).map(t => {
          const Icon = t.icon;
          return (
            <Button
              key={t.id}
              variant={tab === t.id ? 'secondary' : 'ghost'}
              size="sm"
              className={`gap-1.5 text-xs shrink-0 ${tab === t.id ? 'text-teal-500' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {(t.count ?? 0) > 0 && (
                <Badge className="ml-1 h-4 px-1.5 text-[9px] bg-teal-500/15 text-teal-500 border-0">
                  {t.count}
                </Badge>
              )}
            </Button>
          );
        })}
      </nav>

      {/* Tab Content */}
      {tab === 'dashboard' && (
        <OverviewTab
          stats={stats}
          allTopics={allTopics}
          allKws={allKws}
          onSelectTopic={handleSelectTopic}
          onNavigate={(t) => setTab(t as TabId)}
        />
      )}

      {tab === 'keywords' && (
        <KeywordsTab
          allKws={allKws}
          onSelectKeyword={handleSelectTopic}
        />
      )}

      {tab === 'generate' && (
        <GenerateTab
          selectedTopic={selectedTopic}
          setSelectedTopic={setSelectedTopic}
          selectedTemplate={selectedTemplate}
          setSelectedTemplate={setSelectedTemplate}
          generating={generating}
          genProgress={genProgress}
          allTopics={allTopics}
          onGenerate={generateContent}
        />
      )}

      {tab === 'queue' && (
        <QueueTab
          queue={queue}
          publishingId={publishingId}
          onPreview={handlePreview}
          onPublish={publishToWebflow}
          onNavigateGenerate={() => setTab('generate')}
        />
      )}

      {tab === 'preview' && previewItem && (
        <PreviewTab
          item={previewItem}
          publishingId={publishingId}
          onBack={() => setTab('queue')}
          onPublish={publishToWebflow}
        />
      )}

      {tab === 'settings' && (
        <SettingsTab
          config={config}
          setConfig={setConfig}
          automation={automation}
          setAutomation={setAutomation}
        />
      )}
    </div>
  );
}
