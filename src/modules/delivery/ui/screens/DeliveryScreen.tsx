'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Plus, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useAssignees } from '@/hooks/useAssignees';
import { cn } from '@/lib/utils';
import { TONE_CLASSES } from '@/lib/ui-tones';
import { useShortcut } from '@/shared/keyboard';
import type { Project, ProjectLink } from '@/types';
import { buildPageProgress, type PageProgress } from '../../domain/delivery.progress';
import {
  normalizePageWorkStatus,
  type PageWorkStatus,
  type ProjectPage,
  type StackDefinition,
} from '../../domain/delivery.types';
import { deliveryRepository, normalizePagePath } from '../../infrastructure/delivery.repository';
import { AddPageDialog } from '../components/AddPageDialog';
import { PAGE_STATUS_TONES } from '../components/delivery-tones';
import {
  ANY,
  DeliveryToolbar,
  UNASSIGNED_FILTER,
  type DeliveryFilters,
} from '../components/DeliveryToolbar';
import { ImportPagesDialog } from '../components/ImportPagesDialog';
import { PageGrid } from '../components/PageGrid';

const NO_FILTERS: DeliveryFilters = {
  query: '',
  discipline: ANY,
  status: ANY,
  assignee: ANY,
};

export interface DeliveryScreenProps {
  project: Project;
  stack: StackDefinition;
  /** The signed-in user, so they are always pickable as an assignee. */
  userEmail?: string;
}

/**
 * The page tracker for one project.
 *
 * This is the screen that replaces the "Project Tracker" sheet: the same rows,
 * the same columns, the same words — but fed by the pages the app already
 * discovered, and with the progress at the top computed from the grid rather
 * than maintained by hand in a cell nobody trusts.
 */
export function DeliveryScreen({ project, stack, userEmail }: DeliveryScreenProps) {
  const [pages, setPages] = useState<ProjectPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<DeliveryFilters>(NO_FILTERS);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const { assignees: teamAssignees } = useAssignees();

  useEffect(() => {
    setLoading(true);
    const unsubscribe = deliveryRepository.subscribeToPages(project.id, (next) => {
      setPages(next);
      setLoading(false);
    });
    return unsubscribe;
  }, [project.id]);

  const disciplines = useMemo(
    () => [...stack.disciplines].sort((a, b) => a.order - b.order),
    [stack.disciplines],
  );

  const progress = useMemo(() => buildPageProgress(stack, pages), [stack, pages]);

  const assigneeOptions = useMemo(() => {
    const all = new Set<string>(teamAssignees);
    if (userEmail) all.add(userEmail);
    for (const page of pages) if (page.assignee) all.add(page.assignee);
    return Array.from(all).sort();
  }, [teamAssignees, userEmail, pages]);

  const positionById = useMemo(() => {
    const map = new Map<string, number>();
    pages.forEach((page, index) => map.set(page.id, index));
    return map;
  }, [pages]);

  const trackedPaths = useMemo(
    () => new Set(pages.map((page) => normalizePagePath(page.path))),
    [pages],
  );

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const disciplineIds =
      filters.discipline === ANY ? disciplines.map((d) => d.id) : [filters.discipline];

    return pages.filter((page) => {
      if (query) {
        const haystack = `${page.title} ${page.path}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filters.assignee === UNASSIGNED_FILTER) {
        if (page.assignee) return false;
      } else if (filters.assignee !== ANY && page.assignee !== filters.assignee) {
        return false;
      }
      if (filters.status !== ANY) {
        const matches = disciplineIds.some(
          (id) => normalizePageWorkStatus(page.work?.[id]) === filters.status,
        );
        if (!matches) return false;
      }
      return true;
    });
  }, [pages, filters, disciplines]);

  const handleSetWork = useCallback(
    (pageId: string, disciplineId: string, status: PageWorkStatus) =>
      deliveryRepository.setPageWork(project.id, pageId, disciplineId, status),
    [project.id],
  );

  const handleUpdatePage = useCallback(
    async (pageId: string, patch: Partial<Omit<ProjectPage, 'id' | 'createdAt'>>) => {
      try {
        await deliveryRepository.updatePage(project.id, pageId, patch);
      } catch (error) {
        console.error('[DeliveryScreen] update failed', error);
        toast.error(error instanceof Error ? error.message : 'Could not save the change');
      }
    },
    [project.id],
  );

  const handleMovePage = useCallback(
    async (pageId: string, toIndex: number) => {
      try {
        await deliveryRepository.movePage(project.id, pageId, toIndex);
      } catch (error) {
        console.error('[DeliveryScreen] move failed', error);
        toast.error(error instanceof Error ? error.message : 'Could not move the page');
      }
    },
    [project.id],
  );

  const handleDeletePage = useCallback(
    async (pageId: string) => {
      try {
        await deliveryRepository.deletePage(project.id, pageId);
        toast.success('Page removed from the tracker');
      } catch (error) {
        console.error('[DeliveryScreen] delete failed', error);
        toast.error(error instanceof Error ? error.message : 'Could not remove the page');
      }
    },
    [project.id],
  );

  const handleAddPage = useCallback(
    async (input: { path: string; title: string }) => {
      await deliveryRepository.addPage(project.id, input);
      toast.success(`${normalizePagePath(input.path)} added`);
    },
    [project.id],
  );

  const handleImport = useCallback(
    (links: ProjectLink[]) => deliveryRepository.importFromLinks(project.id, links),
    [project.id],
  );

  const dialogOpen = addOpen || importOpen;

  useShortcut({
    id: 'delivery-add-page',
    keys: 'n',
    label: 'Add a page',
    group: 'Project',
    enabled: !dialogOpen,
    handler: () => setAddOpen(true),
  });
  useShortcut({
    id: 'delivery-import-pages',
    keys: 'i',
    label: 'Import discovered pages',
    group: 'Project',
    enabled: !dialogOpen,
    handler: () => setImportOpen(true),
  });
  useShortcut({
    id: 'delivery-search-pages',
    keys: '/',
    label: 'Search pages',
    group: 'Project',
    enabled: !dialogOpen,
    handler: (event) => {
      event.preventDefault();
      searchRef.current?.focus();
    },
  });

  const dialogs = (
    <>
      <AddPageDialog open={addOpen} onOpenChange={setAddOpen} onAdd={handleAddPage} />
      <ImportPagesDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        links={project.links ?? []}
        trackedPaths={trackedPaths}
        onImport={handleImport}
      />
    </>
  );

  if (!loading && pages.length === 0) {
    return (
      <>
        <EmptyTracker
          stackName={stack.name}
          onAddPage={() => setAddOpen(true)}
          onImport={() => setImportOpen(true)}
        />
        {dialogs}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <ProgressStrip progress={progress} />

      <DeliveryToolbar
        filters={filters}
        onFiltersChange={setFilters}
        disciplines={disciplines}
        assignees={assigneeOptions}
        shown={filtered.length}
        total={pages.length}
        onAddPage={() => setAddOpen(true)}
        onImport={() => setImportOpen(true)}
        searchRef={searchRef}
      />

      <PageGrid
        pages={filtered}
        positionById={positionById}
        totalCount={pages.length}
        disciplines={disciplines}
        assignees={assigneeOptions}
        loading={loading}
        onSetWork={handleSetWork}
        onUpdatePage={handleUpdatePage}
        onMovePage={handleMovePage}
        onDeletePage={handleDeletePage}
      />

      <p className="text-[11px] text-muted-foreground">
        Arrow keys move between status cells; 1–6 sets one. <kbd className="font-mono">n</kbd> adds a
        page, <kbd className="font-mono">/</kbd> searches.
      </p>

      {dialogs}
    </div>
  );
}

/** "14 of 26 pages built", and the per-discipline detail behind that number. */
function ProgressStrip({ progress }: { progress: PageProgress }) {
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold tabular-nums">
          {progress.done} of {progress.total} {progress.total === 1 ? 'page' : 'pages'} built
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{percent}%</span>
        {progress.blocked > 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
              TONE_CLASSES.rose,
            )}
          >
            <TriangleAlert className="size-3" />
            {progress.blocked} blocked
          </span>
        )}
      </div>

      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Pages built"
      >
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {progress.disciplines.map((discipline) => {
          const width =
            discipline.applicable === 0
              ? 0
              : Math.round((discipline.done / discipline.applicable) * 100);
          return (
            <div key={discipline.disciplineId} className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">{discipline.label}</span>
              <span className="text-[11px] font-medium tabular-nums">
                {discipline.done}/{discipline.applicable}
              </span>
              <span className="h-1 w-10 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn('block h-full rounded-full', PAGE_STATUS_TONES.completed.bar)}
                  style={{ width: `${width}%` }}
                />
              </span>
              {discipline.blocked > 0 && (
                <span className="text-[11px] tabular-nums text-rose-600 dark:text-rose-400">
                  {discipline.blocked} blocked
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyTracker({
  stackName,
  onAddPage,
  onImport,
}: {
  stackName: string;
  onAddPage: () => void;
  onImport: () => void;
}) {
  return (
    <div className="rounded-md border border-dashed p-8 text-center">
      <h3 className="text-sm font-semibold">No pages on the tracker yet</h3>
      <p className="mx-auto mt-1.5 max-w-md text-xs text-muted-foreground">
        This is the {stackName} build tracker — a row per page and a status per discipline, in place
        of the project spreadsheet. Import the pages this project has already discovered, or add the
        first one by hand.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" size="sm" className="h-8 text-xs" onClick={onImport}>
          <Download className="size-3.5" />
          Import from sitemap
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onAddPage}>
          <Plus className="size-3.5" />
          Add a page
        </Button>
      </div>
    </div>
  );
}
