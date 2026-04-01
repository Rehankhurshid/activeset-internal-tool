'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Search, FileText, Send, BarChart3, Target, Layers,
  ArrowRight, Sparkles, PenLine, Settings, ListOrdered
} from 'lucide-react';
import { FlatKeyword, TopicItem, QueueItem } from '../types/seo';

interface OverviewTabProps {
  stats: {
    keywords: number;
    highPriority: number;
    queued: number;
    published: number;
    totalWords: number;
  };
  allTopics: TopicItem[];
  allKws: FlatKeyword[];
  onSelectTopic: (topic: string) => void;
  onNavigate: (tab: string) => void;
}

const statCards = [
  { key: 'keywords', label: 'Keywords', icon: Search, color: 'text-teal-500', bg: 'bg-teal-500/10' },
  { key: 'queued', label: 'In Queue', icon: FileText, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { key: 'published', label: 'Published', icon: Send, color: 'text-green-500', bg: 'bg-green-500/10' },
  { key: 'totalWords', label: 'Total Words', icon: BarChart3, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  { key: 'verticals', label: 'Verticals', icon: Layers, color: 'text-orange-500', bg: 'bg-orange-500/10' },
] as const;

export function OverviewTab({ stats, allTopics, allKws, onSelectTopic, onNavigate }: OverviewTabProps) {
  const highPriorityKws = allKws
    .filter(k => k.priority === 'high')
    .sort((a, b) => b.vol - a.vol)
    .slice(0, 5);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((s) => {
          const Icon = s.icon;
          const value = s.key === 'verticals' ? 3 :
            s.key === 'totalWords' ? stats.totalWords.toLocaleString() :
            stats[s.key as keyof typeof stats];
          const sub = s.key === 'keywords' ? `${stats.highPriority} high priority` :
            s.key === 'queued' ? 'Ready for review' :
            s.key === 'published' ? 'Live on Webflow' :
            s.key === 'totalWords' ? 'Generated content' : 'Target markets';

          return (
            <Card key={s.key}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded-md ${s.bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${s.color}`} />
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{s.label}</span>
                </div>
                <p className={`text-2xl font-bold font-mono ${s.color}`}>{value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Recommended Topics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-teal-500 uppercase tracking-wider flex items-center gap-2">
              <Target className="h-4 w-4" />
              Recommended Topics Today
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {allTopics.slice(0, 6).map((t, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-sm font-medium leading-snug truncate">{t.title}</p>
                  <Badge variant="outline" className="mt-1 text-[10px]" style={{ borderColor: `${t.color}40`, color: t.color }}>
                    {t.vertical}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-xs text-teal-500 border-teal-500/20 hover:bg-teal-500/10"
                  onClick={() => onSelectTopic(t.title)}
                >
                  Write <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-teal-500 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Generate Post', icon: PenLine, tab: 'generate' },
                  { label: 'Browse Keywords', icon: Search, tab: 'keywords' },
                  { label: 'Review Queue', icon: ListOrdered, tab: 'queue' },
                  { label: 'Configure API', icon: Settings, tab: 'settings' },
                ].map((a) => {
                  const Icon = a.icon;
                  return (
                    <Button
                      key={a.tab}
                      variant="outline"
                      className="h-auto py-3 px-4 justify-start flex-col items-start gap-1.5 hover:border-teal-500/30 hover:bg-teal-500/5"
                      onClick={() => onNavigate(a.tab)}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-semibold">{a.label}</span>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Top Keyword Opportunities */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-amber-500 uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Top Keyword Opportunities
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {highPriorityKws.map((k, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs font-mono font-medium truncate mr-3">{k.kw}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] text-teal-500 font-mono">{k.vol.toLocaleString()}/mo</span>
                    <div className="flex items-center gap-1.5">
                      <Progress
                        value={k.diff}
                        className="w-12 h-1"
                      />
                      <span className="text-[10px] font-mono font-semibold text-muted-foreground w-5">{k.diff}</span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
