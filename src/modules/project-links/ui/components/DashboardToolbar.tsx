'use client';

import { Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Search, Filter, Check, X, ChevronDown } from 'lucide-react';
import { type ProjectTag } from '@/modules/project-links';
import { PROJECT_TAG_LABELS } from '@/types';
import { PROJECT_TAG_TONES } from '@/lib/ui-tones';
import { cn } from '@/lib/utils';
import { Kbd } from '@/shared/keyboard';

export type StatusFilter = 'all' | 'maintenance' | 'active' | 'paused' | 'closed' | 'paid' | 'needs_client';

export const ALL_TAGS: ProjectTag[] = ['retainer', 'one_time', 'subscription', 'maintenance', 'consulting'];

/** Shown as tabs. The rest (paused, closed, paid, waiting on client) sit under
 *  "More", still on their number keys. */
const PRIMARY_STATUS_FILTERS: StatusFilter[] = ['all', 'maintenance', 'active'];

// Mirrors TabsTrigger (components/ui/tabs.tsx) plus the toolbar's own sizing,
// for the hand-rolled "More" button. Keep in sync if that changes.
const moreTriggerClasses =
  'inline-flex h-[calc(100%-1px)] items-center justify-center gap-1 rounded-md border border-transparent px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1';

interface StatusFilterOption {
  value: StatusFilter;
  label: string;
  count: number;
}

interface DashboardToolbarProps {
  searchInputRef?: React.Ref<HTMLInputElement>;
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
  searchInputRef,
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
  const searching = searchQuery.trim().length > 0;
  const primaryOptions = statusOptions.filter((o) => PRIMARY_STATUS_FILTERS.includes(o.value));
  const overflowOptions = statusOptions.filter((o) => !PRIMARY_STATUS_FILTERS.includes(o.value));
  const activeOverflow = searching ? undefined : overflowOptions.find((o) => o.value === statusFilter);
  const selectStatus = (value: StatusFilter) => {
    if (searching) onSearchChange('');
    onStatusFilterChange(value);
  };
  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            placeholder="Search projects…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-11 w-full pl-9 pr-9 sm:h-9"
            aria-label="Search projects"
          />
          <Kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 sm:inline-flex">/</Kbd>
        </div>

        <div className="-mx-3 overflow-x-auto px-3 scrollbar-hidden sm:mx-0 sm:px-0">
          {/* While searching, every tab is searched, so none shows as selected;
              picking one clears the search and goes back to that tab. */}
          <Tabs
            value={searching ? '' : statusFilter}
            onValueChange={(value) => selectStatus(value as StatusFilter)}
          >
            <TabsList className={cn('h-10 sm:h-9', searching && 'opacity-60')} title={searching ? 'Searching every tab' : undefined}>
              {primaryOptions.map(({ value, label, count }) => (
                <TabsTrigger key={value} value={value} className="gap-1 px-2.5 text-xs">
                  {label}
                  <span className="text-[10px] text-muted-foreground">{count}</span>
                </TabsTrigger>
              ))}
              {overflowOptions.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        moreTriggerClasses,
                        activeOverflow
                          ? 'bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30'
                          : 'text-foreground hover:bg-background/60 dark:text-muted-foreground dark:hover:text-foreground',
                      )}
                      aria-label="More status filters"
                    >
                      {activeOverflow ? (
                        <>
                          {activeOverflow.label}
                          <span className="text-[10px] text-muted-foreground">{activeOverflow.count}</span>
                        </>
                      ) : (
                        'More'
                      )}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {overflowOptions.map(({ value, label, count }) => (
                      <Fragment key={value}>
                        {/* Waiting on client is the client's status, not ours: set it apart. */}
                        {value === 'needs_client' && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                          onSelect={() => selectStatus(value)}
                          className={cn('gap-2 text-xs', activeOverflow?.value === value && 'bg-accent text-accent-foreground')}
                        >
                          <span className="flex-1">
                            {label} <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
                          </span>
                          <Kbd className="hidden sm:inline-flex">
                            {statusOptions.findIndex((o) => o.value === value) + 1}
                          </Kbd>
                        </DropdownMenuItem>
                      </Fragment>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
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
          <Plus className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">New Project</span>
          <span className="sm:hidden">New</span>
          <Kbd onPrimary className="ml-1 hidden sm:inline-flex">N</Kbd>
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
