'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles, Globe, RefreshCw, Code2, Copy, Check } from 'lucide-react';
import { SEOConfig, AutomationConfig } from '../types/seo';
import { getRichElementsEmbed } from '../data/rich-elements';
import { toast } from 'sonner';

interface SettingsTabProps {
  config: SEOConfig;
  setConfig: React.Dispatch<React.SetStateAction<SEOConfig>>;
  automation: AutomationConfig;
  setAutomation: React.Dispatch<React.SetStateAction<AutomationConfig>>;
}

export function SettingsTab({ config, setConfig, automation, setAutomation }: SettingsTabProps) {
  const [copied, setCopied] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(getRichElementsEmbed()).then(() => {
      setCopied(true);
      toast.success('Embed code copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="space-y-4 max-w-2xl animate-in fade-in duration-300">
      <h2 className="text-lg font-bold">Configuration</h2>

      {/* Claude API */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-teal-500" />
            <CardTitle className="text-sm text-teal-500">Claude API</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Uses Claude Sonnet to generate content. Your API key is sent server-side via the API route.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">API Key (optional if ANTHROPIC_API_KEY env is set)</Label>
            <Input
              type="password"
              value={config.claudeKey}
              onChange={e => setConfig(p => ({ ...p, claudeKey: e.target.value }))}
              placeholder="sk-ant-..."
              className="mt-1"
            />
          </div>
          <div className="p-3 rounded-lg bg-teal-500/5 border border-teal-500/10">
            <p className="text-xs text-teal-500 leading-relaxed">
              Content generation uses the system prompt trained on ActiveSet&apos;s brand, services, and writing guidelines. Includes E-E-A-T signals, AEO/GEO optimization, and FAQ schema generation.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Webflow CMS */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm text-amber-500">Webflow CMS</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Connect to publish blog posts directly to your Webflow CMS collection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Site ID</Label>
            <Input
              value={config.siteId}
              onChange={e => setConfig(p => ({ ...p, siteId: e.target.value }))}
              placeholder="Project Settings > General > Site ID"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Blog Collection ID</Label>
            <Input
              value={config.collectionId}
              onChange={e => setConfig(p => ({ ...p, collectionId: e.target.value }))}
              placeholder="CMS > Blog Posts > Settings > Collection ID"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">API Token (v2)</Label>
            <Input
              type="password"
              value={config.apiToken}
              onChange={e => setConfig(p => ({ ...p, apiToken: e.target.value }))}
              placeholder="webflow.com/dashboard > Integrations > API Token"
              className="mt-1"
            />
          </div>
          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
            <p className="text-xs text-amber-500 leading-relaxed">
              Your CMS Blog collection needs these field slugs: <code className="bg-black/20 px-1 rounded text-[10px]">name</code>,{' '}
              <code className="bg-black/20 px-1 rounded text-[10px]">slug</code>,{' '}
              <code className="bg-black/20 px-1 rounded text-[10px]">post-body</code>,{' '}
              <code className="bg-black/20 px-1 rounded text-[10px]">post-summary</code>,{' '}
              <code className="bg-black/20 px-1 rounded text-[10px]">meta-title</code>,{' '}
              <code className="bg-black/20 px-1 rounded text-[10px]">meta-description</code>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Automation */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-purple-500" />
            <CardTitle className="text-sm text-purple-500">Daily Automation</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Auto-generate content daily. Posts land in the queue for your review before publishing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={automation.enabled}
              onCheckedChange={checked => setAutomation(p => ({ ...p, enabled: checked }))}
            />
            <Label className="text-sm font-semibold">Enable daily auto-generation</Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Time (IST)</Label>
              <Input
                type="time"
                value={automation.time}
                onChange={e => setAutomation(p => ({ ...p, time: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Posts / Day</Label>
              <Select
                value={String(automation.perDay)}
                onValueChange={v => setAutomation(p => ({ ...p, perDay: Number(v) }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 post</SelectItem>
                  <SelectItem value="2">2 posts</SelectItem>
                  <SelectItem value="3">3 posts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/10">
            <p className="text-xs text-purple-500 leading-relaxed">
              Semi-automated mode: Topics are auto-selected from your keyword database, content is generated via Claude API, and posts land in your queue for review. You click &quot;Publish&quot; when ready.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Rich Elements Embed Code */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-teal-500" />
            <CardTitle className="text-sm text-teal-500">Rich Blog Elements</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Copy this code into your Webflow site to enable interactive blog elements (callouts, accordions, stats, timelines, code blocks, and more).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleCopyEmbed}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {copied ? (
                <><Check className="h-4 w-4 mr-2" /> Copied!</>
              ) : (
                <><Copy className="h-4 w-4 mr-2" /> Copy Embed Code</>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowEmbed(!showEmbed)}
            >
              {showEmbed ? 'Hide Code' : 'Preview Code'}
            </Button>
          </div>

          {showEmbed && (
            <ScrollArea className="h-[300px] rounded-lg border bg-gray-950 p-4">
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                {getRichElementsEmbed()}
              </pre>
            </ScrollArea>
          )}

          <div className="p-3 rounded-lg bg-teal-500/5 border border-teal-500/10 space-y-2">
            <p className="text-xs text-teal-500 font-semibold">How to install:</p>
            <ol className="text-xs text-teal-600 space-y-1.5 list-decimal list-inside">
              <li>Copy the embed code above</li>
              <li>In Webflow, go to <strong>Project Settings → Custom Code → Footer Code</strong></li>
              <li>Paste the code and save</li>
              <li>Publish your site — all blog posts will now render rich elements</li>
            </ol>
          </div>

          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
            <p className="text-xs text-amber-500 font-semibold mb-1">Supported Elements (16 types):</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-amber-600">
              <span>Auto Table of Contents</span>
              <span>Callout Boxes (4 types)</span>
              <span>Stats/Metrics Row</span>
              <span>Comparison Table</span>
              <span>Numbered Steps</span>
              <span>Pros &amp; Cons</span>
              <span>FAQ Accordion</span>
              <span>Call-to-Action Block</span>
              <span>Timeline</span>
              <span>Code Block + Copy</span>
              <span>Pull Quote</span>
              <span>Score/Progress Bar</span>
              <span>Key Takeaway</span>
              <span>Feature Grid</span>
              <span>Labeled Divider</span>
              <span>Scroll Animations</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
