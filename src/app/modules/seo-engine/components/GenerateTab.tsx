'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Loader2, Sparkles } from 'lucide-react';
import {
  BookOpen, Scale, BarChart3, List, Lightbulb, Wrench, Landmark,
} from 'lucide-react';
import { TEMPLATES } from '../data/templates';
import { TopicItem } from '../types/seo';

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen, Scale, BarChart3, List, Lightbulb, Wrench, Landmark,
};

interface GenerateTabProps {
  selectedTopic: string;
  setSelectedTopic: (topic: string) => void;
  selectedTemplate: string;
  setSelectedTemplate: (template: string) => void;
  generating: boolean;
  genProgress: string;
  allTopics: TopicItem[];
  onGenerate: () => void;
}

export function GenerateTab({
  selectedTopic, setSelectedTopic,
  selectedTemplate, setSelectedTemplate,
  generating, genProgress,
  allTopics, onGenerate,
}: GenerateTabProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <h2 className="text-lg font-bold">Generate SEO Content</h2>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          {/* Topic Input */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-bold text-teal-500 uppercase tracking-wider">
                Target Topic / Keyword
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={selectedTopic}
                onChange={e => setSelectedTopic(e.target.value)}
                placeholder='e.g. "WordPress to Webflow migration guide for SaaS companies"'
                rows={3}
                className="resize-y"
              />
            </CardContent>
          </Card>

          {/* Template Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-bold text-teal-500 uppercase tracking-wider">
                Content Template
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {Object.entries(TEMPLATES).map(([k, t]) => {
                  const Icon = TEMPLATE_ICONS[t.icon] || BookOpen;
                  return (
                    <button
                      key={k}
                      onClick={() => setSelectedTemplate(k)}
                      className={`text-left p-3 rounded-lg border transition-all ${
                        selectedTemplate === k
                          ? 'border-teal-500/40 bg-teal-500/5 ring-1 ring-teal-500/20'
                          : 'border-border hover:border-teal-500/20 hover:bg-muted/50'
                      }`}
                    >
                      <Icon className={`h-5 w-5 mb-1.5 ${selectedTemplate === k ? 'text-teal-500' : 'text-muted-foreground'}`} />
                      <div className="text-xs font-semibold">{t.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{t.words}</div>
                      <Progress value={t.seo} className="mt-2 h-1" />
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Generate Button */}
          <Button
            onClick={onGenerate}
            disabled={!selectedTopic || generating}
            className="w-full h-12 bg-teal-600 hover:bg-teal-700 text-white font-bold"
            size="lg"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {genProgress}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate SEO Blog Post
              </>
            )}
          </Button>
        </div>

        {/* Topic Suggestions Sidebar */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-bold text-amber-500 uppercase tracking-wider">
              Suggested Topics
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[520px] px-4 pb-4">
              <div className="space-y-1">
                {allTopics.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedTopic(t.title)}
                    className={`block w-full text-left px-3 py-2.5 rounded-md text-xs font-medium leading-snug transition-all ${
                      selectedTopic === t.title
                        ? 'bg-teal-500/10 text-teal-500'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <Badge variant="outline" className="text-[9px] py-0 mb-1" style={{ borderColor: `${t.color}30`, color: t.color }}>
                      {t.vertical}
                    </Badge>
                    <br />
                    {t.title}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
