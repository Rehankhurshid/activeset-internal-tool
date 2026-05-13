'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  ChevronDown,
  GanttChartSquare,
  ImageIcon,
  LayoutDashboard,
  ListChecks,
  ListTodo,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  WebsiteAuditDashboardScreen,
  type FolderPageTypes,
  type ProjectLink,
} from '@/modules/site-monitoring';
import { ChecklistOverview } from '@/modules/checklists';
import { ProjectTimelineOverview } from '@/modules/timeline';
import { TasksTab } from '@/components/tasks/TasksTab';
import { ImageLibrary } from '@/modules/project-links/ui/components/ImageLibrary';

interface SharedProjectTabsProps {
  projectId: string;
  projectName: string;
  links: ProjectLink[];
  folderPageTypes?: FolderPageTypes;
  detectedLocales?: string[];
  pathToLocaleMap?: Record<string, string>;
  sitemapUrl?: string;
}

type TabOption = {
  value: string;
  label: string;
  icon: React.ReactNode;
};

const TAB_OPTIONS: TabOption[] = [
  { value: 'audit', label: 'Audit Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { value: 'tasks', label: 'Tasks', icon: <ListTodo className="h-4 w-4" /> },
  { value: 'checklist', label: 'Checklist', icon: <ListChecks className="h-4 w-4" /> },
  { value: 'images', label: 'Image Library', icon: <ImageIcon className="h-4 w-4" /> },
  { value: 'timeline', label: 'Timeline', icon: <GanttChartSquare className="h-4 w-4" /> },
];

export function SharedProjectTabs({
  projectId,
  projectName,
  links,
  folderPageTypes,
  detectedLocales,
  pathToLocaleMap,
  sitemapUrl,
}: SharedProjectTabsProps) {
  const [activeTab, setActiveTab] = useState('audit');
  const activeOption = TAB_OPTIONS.find((t) => t.value === activeTab) ?? TAB_OPTIONS[0];

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="mb-4 sm:mb-6">
        {/* Mobile: bottom sheet picker */}
        <div className="sm:hidden">
          <MobileTabSelector
            options={TAB_OPTIONS}
            value={activeTab}
            activeOption={activeOption}
            onChange={setActiveTab}
          />
        </div>

        {/* Desktop: scrollable horizontal tabs */}
        <div className="hidden sm:block max-w-full overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="w-auto inline-flex">
            {TAB_OPTIONS.map((opt) => (
              <TabsTrigger key={opt.value} value={opt.value} className="gap-2">
                {opt.icon}
                <span>{opt.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </div>

      <TabsContent value="audit" className="mt-4 sm:mt-6">
        <WebsiteAuditDashboardScreen
          links={links}
          projectId={projectId}
          folderPageTypes={folderPageTypes}
          detectedLocales={detectedLocales}
          pathToLocaleMap={pathToLocaleMap}
          isReadOnly
        />
      </TabsContent>

      <TabsContent value="tasks" className="mt-4 sm:mt-6">
        <TasksTab projectId={projectId} userEmail="" readOnly />
      </TabsContent>

      <TabsContent value="checklist" className="mt-4 sm:mt-6">
        <ChecklistOverview projectId={projectId} readOnly />
      </TabsContent>

      <TabsContent value="images" className="mt-4 sm:mt-6">
        <ImageLibrary
          links={links}
          projectName={projectName}
          projectId={projectId}
          sitemapUrl={sitemapUrl}
          readOnly
        />
      </TabsContent>

      <TabsContent value="timeline" className="mt-4 sm:mt-6">
        <ProjectTimelineOverview projectId={projectId} readOnly />
      </TabsContent>
    </Tabs>
  );
}

interface MobileTabSelectorProps {
  options: TabOption[];
  value: string;
  activeOption: TabOption;
  onChange: (value: string) => void;
}

function MobileTabSelector({
  options,
  value,
  activeOption,
  onChange,
}: MobileTabSelectorProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between h-11 px-3 text-base"
          aria-haspopup="menu"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 text-muted-foreground">{activeOption.icon}</span>
            <span className="font-medium truncate">{activeOption.label}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-xl p-0 max-h-[80vh]">
        <SheetHeader className="border-b">
          <SheetTitle className="text-base">Select section</SheetTitle>
        </SheetHeader>
        <div className="p-2">
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/60 active:bg-accent',
                )}
              >
                <span
                  className={cn(
                    'shrink-0',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {opt.icon}
                </span>
                <span className="text-sm font-medium flex-1">{opt.label}</span>
                {isActive && <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
