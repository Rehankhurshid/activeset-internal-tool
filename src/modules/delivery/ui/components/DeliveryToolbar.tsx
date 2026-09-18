'use client';

import type { RefObject } from 'react';
import { Download, Plus, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  PAGE_WORK_STATUSES,
  PAGE_WORK_STATUS_LABELS,
  type PageWorkStatus,
  type StackDiscipline,
} from '../../domain/delivery.types';
import { PAGE_STATUS_TONES } from './delivery-tones';

export const ANY = '__any__';
export const UNASSIGNED_FILTER = '__unassigned__';

export interface DeliveryFilters {
  query: string;
  /** A discipline id, or `ANY` for "in any discipline". */
  discipline: string;
  status: PageWorkStatus | typeof ANY;
  /** An email, `UNASSIGNED_FILTER`, or `ANY`. */
  assignee: string;
}

export interface DeliveryToolbarProps {
  filters: DeliveryFilters;
  onFiltersChange: (next: DeliveryFilters) => void;
  disciplines: StackDiscipline[];
  assignees: string[];
  shown: number;
  total: number;
  onAddPage: () => void;
  onImport: () => void;
  searchRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Search, filters, and the two ways pages get onto the tracker.
 *
 * The status filter is two controls rather than one per discipline: "show me
 * everything blocked" and "show me what design has not started" are the two
 * questions actually asked in a standup, and both fall out of discipline ×
 * status.
 */
export function DeliveryToolbar({
  filters,
  onFiltersChange,
  disciplines,
  assignees,
  shown,
  total,
  onAddPage,
  onImport,
  searchRef,
}: DeliveryToolbarProps) {
  const set = (patch: Partial<DeliveryFilters>) => onFiltersChange({ ...filters, ...patch });
  const filtering = shown !== total;
  const anyFilterSet =
    filters.query.trim() !== '' ||
    filters.status !== ANY ||
    filters.discipline !== ANY ||
    filters.assignee !== ANY;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={filters.query}
          onChange={(event) => set({ query: event.target.value })}
          placeholder="Search pages…"
          aria-label="Search pages by title or path"
          className="h-8 pl-7 text-xs"
        />
      </div>

      <Select value={filters.status} onValueChange={(value) => set({ status: value as DeliveryFilters['status'] })}>
        <SelectTrigger size="sm" className="h-8 w-[136px] text-xs" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY} className="text-xs">
            Any status
          </SelectItem>
          {PAGE_WORK_STATUSES.map((status) => (
            <SelectItem key={status} value={status} className="text-xs">
              <span className={cn('size-2 rounded-full', PAGE_STATUS_TONES[status].dot)} />
              {PAGE_WORK_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.discipline} onValueChange={(value) => set({ discipline: value })}>
        <SelectTrigger size="sm" className="h-8 w-[132px] text-xs" aria-label="Filter by discipline">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY} className="text-xs">
            Any discipline
          </SelectItem>
          {disciplines.map((discipline) => (
            <SelectItem key={discipline.id} value={discipline.id} className="text-xs">
              {discipline.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.assignee} onValueChange={(value) => set({ assignee: value })}>
        <SelectTrigger size="sm" className="h-8 w-[140px] text-xs" aria-label="Filter by assignee">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY} className="text-xs">
            Anyone
          </SelectItem>
          <SelectItem value={UNASSIGNED_FILTER} className="text-xs">
            Unassigned
          </SelectItem>
          {assignees.map((email) => (
            <SelectItem key={email} value={email} className="text-xs">
              {email.split('@')[0]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {anyFilterSet && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() =>
            onFiltersChange({ query: '', discipline: ANY, status: ANY, assignee: ANY })
          }
        >
          <X className="size-3.5" />
          Clear
        </Button>
      )}

      <div className="ml-auto flex items-center gap-2">
        {filtering && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {shown} of {total}
          </span>
        )}
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onImport}>
          <Download className="size-3.5" />
          Import from sitemap
        </Button>
        <Button type="button" size="sm" className="h-8 text-xs" onClick={onAddPage}>
          <Plus className="size-3.5" />
          Add page
        </Button>
      </div>
    </div>
  );
}
