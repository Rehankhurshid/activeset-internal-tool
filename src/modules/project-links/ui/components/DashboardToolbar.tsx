'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Search, Filter, Check, X } from 'lucide-react';
import { type ProjectTag } from '@/modules/project-links';
import { PROJECT_TAG_LABELS } from '@/types';
import { PROJECT_TAG_TONES } from '@/lib/ui-tones';
import { cn } from '@/lib/utils';

export type StatusFilter = 'all' | 'maintenance' | 'active' | 'paused' | 'closed' | 'paid';

export const ALL_TAGS: ProjectTag[] = ['retainer', 'one_time', 'subscription', 'maintenance', 'consulting'];

interface StatusFilterOption {
  value: StatusFilter;
  label: string;
  count: number;
}

interface DashboardToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  statusOptions: StatusFilterOption[];
  activeTags: ProjectTag[];
  onToggleTag: (tag: ProjectTag) => void;
  onClearTags: () => void;
  onNewProject: () => void;
}

export function DashboardToolbar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  activeTags,
  onToggleTag,
  onClearTags,
  onNewProject,
}: DashboardToolbarProps) {
  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-11 w-full pl-9 sm:h-9"
            aria-label="Search projects"
          />
        </div>

        <div className="-mx-3 overflow-x-auto px-3 scrollbar-hidden sm:mx-0 sm:px-0">
          <Tabs
            value={statusFilter}
            onValueChange={(value) => onStatusFilterChange(value as StatusFilter)}
          >
            <TabsList className="h-10 sm:h-9">
              {statusOptions.map(({ value, label, count }) => (
                <TabsTrigger key={value} value={value} className="gap-1 px-2.5 text-xs">
                  {label}
                  <span className="text-[10px] text-muted-foreground">{count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={activeTags.length > 0 ? 'secondary' : 'outline'}
              size="sm"
              className="h-10 shrink-0 sm:h-9"
              aria-label="Filter by tag"
            >
              <Filter className="h-4 w-4" />
              {activeTags.length > 0 && <span className="text-xs">{activeTags.length}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-2">
            <div className="flex flex-col gap-1">
              {ALL_TAGS.map((tag) => {
                const active = activeTags.includes(tag);
                const tone = PROJECT_TAG_TONES[tag];
                return (
                  <button
                    key={tag}
                    onClick={() => onToggleTag(tag)}
                    className={cn(
                      'flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                      active ? cn(tone.bg, tone.text) : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {PROJECT_TAG_LABELS[tag]}
                    {active && <Check className="h-3.5 w-3.5" />}
                  </button>
                );
              })}
              {activeTags.length > 0 && (
                <button
                  onClick={onClearTags}
                  className="mt-1 px-2 text-left text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Clear tags
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Button onClick={onNewProject} className="h-11 w-full shrink-0 sm:h-9 sm:w-auto">
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">New Project</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {activeTags.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {activeTags.map((tag) => {
            const tone = PROJECT_TAG_TONES[tag];
            return (
              <Badge
                key={tag}
                variant="outline"
                className={cn('gap-1 pr-1', tone.bg, tone.text, tone.border)}
              >
                {PROJECT_TAG_LABELS[tag]}
                <button
                  onClick={() => onToggleTag(tag)}
                  aria-label={`Remove ${PROJECT_TAG_LABELS[tag]} filter`}
                  className="rounded-full hover:opacity-70"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
