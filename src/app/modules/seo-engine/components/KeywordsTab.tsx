'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FlatKeyword } from '../types/seo';
import { KEYWORD_DB } from '../data/keywords';

interface KeywordsTabProps {
  allKws: FlatKeyword[];
  onSelectKeyword: (keyword: string) => void;
}

export function KeywordsTab({ allKws, onSelectKeyword }: KeywordsTabProps) {
  const [vertical, setVertical] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('priority');

  const filteredKws = allKws
    .filter(k => (vertical === 'all' || k.vertical === vertical) && (!search || k.kw.includes(search.toLowerCase())))
    .sort((a, b) => {
      if (sortBy === 'volume') return b.vol - a.vol;
      if (sortBy === 'difficulty') return a.diff - b.diff;
      if (sortBy === 'cpc') return parseFloat(b.cpc.replace('$', '')) - parseFloat(a.cpc.replace('$', ''));
      const p: Record<string, number> = { high: 3, medium: 2, low: 1 };
      return (p[b.priority] || 0) - (p[a.priority] || 0);
    });

  const intentColors: Record<string, string> = {
    Commercial: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    Comparison: 'bg-red-400/10 text-red-400 border-red-400/20',
    Informational: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
  };

  const priorityColors: Record<string, string> = {
    high: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
    medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    low: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Keyword Intelligence</h2>
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={vertical === 'all' ? 'secondary' : 'outline'}
            size="sm"
            className="text-xs"
            onClick={() => setVertical('all')}
          >
            All
          </Button>
          {Object.keys(KEYWORD_DB).map(v => (
            <Button
              key={v}
              variant={vertical === v ? 'secondary' : 'outline'}
              size="sm"
              className="text-xs"
              onClick={() => setVertical(v)}
            >
              {v}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter keywords..."
          className="flex-1"
        />
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="priority">Sort: Priority</SelectItem>
            <SelectItem value="volume">Sort: Volume</SelectItem>
            <SelectItem value="difficulty">Sort: Difficulty</SelectItem>
            <SelectItem value="cpc">Sort: CPC</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Header */}
          <div className="grid grid-cols-[1fr_72px_72px_90px_72px_72px_60px] px-4 py-2.5 border-b bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            <span>Keyword</span>
            <span>Volume</span>
            <span>KD</span>
            <span>Intent</span>
            <span>CPC</span>
            <span>Priority</span>
            <span></span>
          </div>

          <ScrollArea className="h-[520px]">
            {filteredKws.map((k, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_72px_72px_90px_72px_72px_60px] px-4 py-2.5 items-center border-b border-border/30 hover:bg-muted/30 transition-colors"
              >
                <div>
                  <span className="text-sm font-mono font-medium">{k.kw}</span>
                  <div className="mt-0.5">
                    <Badge variant="outline" className="text-[9px] py-0" style={{ borderColor: `${k.vColor}30`, color: k.vColor }}>
                      {k.cluster}
                    </Badge>
                  </div>
                </div>
                <span className="text-sm font-mono font-semibold">{k.vol.toLocaleString()}</span>
                <div className="flex items-center gap-1.5">
                  <Progress value={k.diff} className="w-10 h-1" />
                  <span className="text-[10px] font-mono font-semibold text-muted-foreground">{k.diff}</span>
                </div>
                <Badge variant="outline" className={`text-[10px] py-0 w-fit ${intentColors[k.intent] || ''}`}>
                  {k.intent}
                </Badge>
                <span className="text-xs font-mono text-green-500">{k.cpc}</span>
                <Badge variant="outline" className={`text-[10px] py-0 w-fit ${priorityColors[k.priority] || ''}`}>
                  {k.priority}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px] text-teal-500 border-teal-500/20 hover:bg-teal-500/10"
                  onClick={() => onSelectKeyword(k.kw)}
                >
                  Write
                </Button>
              </div>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {filteredKws.length} keywords — Click &quot;Write&quot; to generate content for any keyword
      </p>
    </div>
  );
}
