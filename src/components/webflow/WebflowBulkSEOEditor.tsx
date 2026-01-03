'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Save,
  TriangleAlert,
  Lock,
  Unlock,
  Sparkles,
  Folder
} from 'lucide-react';
import { WebflowPageWithQC, UpdateWebflowPageSEO, AISEOGeneratedData } from '@/types/webflow';
import { cn } from '@/lib/utils';
import { formatForDisplay } from '@/lib/webflow-utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PageEdit {
  pageId: string;
  title: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  ogTitle: string;
  ogTitleCopied: boolean;
  ogDescription: string;
  ogDescriptionCopied: boolean;
  hasChanges: boolean;
  isGenerating?: boolean;
}

interface WebflowBulkSEOEditorProps {
  localeId?: string | null;
  pages: WebflowPageWithQC[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updates: { pageId: string; updates: UpdateWebflowPageSEO }[]) => Promise<{ success: number; failed: number }>;
  onGenerateSEO: (pageId: string) => Promise<AISEOGeneratedData | null>;
}

export function WebflowBulkSEOEditor({
  localeId,
  pages,
  open,
  onOpenChange,
  onSave,
  onGenerateSEO,
}: WebflowBulkSEOEditorProps) {
  const [pageEdits, setPageEdits] = useState<Map<string, PageEdit>>(new Map());
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);

  // Locking state
  const [lockedPageIds, setLockedPageIds] = useState<Set<string>>(new Set());
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);

  // Initialize page edits when pages change
  useMemo(() => {
    const edits = new Map<string, PageEdit>();
    pages.forEach((page) => {
      // Preserve existing edits if we're just re-opening or if pages prop updates slightly
      // But a fresh mount usually resets state. 
      // For now, simpler to just reset to current page state, as `pages` updates after save.
      edits.set(page.id, {
        pageId: page.id,
        title: page.title || '',
        slug: page.slug || '',
        seoTitle: formatForDisplay(page.seo?.title),
        seoDescription: formatForDisplay(page.seo?.description),
        ogTitle: formatForDisplay(page.openGraph?.title),
        ogTitleCopied: page.openGraph?.titleCopied ?? true,
        ogDescription: formatForDisplay(page.openGraph?.description),
        ogDescriptionCopied: page.openGraph?.descriptionCopied ?? true,
        hasChanges: false,
      });
    });
    setPageEdits(edits);
  }, [pages]);

  const updatePageEdit = (pageId: string, field: keyof PageEdit, value: string | boolean) => {
    setPageEdits((prev) => {
      const newEdits = new Map(prev);
      const current = newEdits.get(pageId);
      if (current) {
        newEdits.set(pageId, { ...current, [field]: value, hasChanges: true });
      }
      return newEdits;
    });
  };

  const changedPages = useMemo(() => {
    return Array.from(pageEdits.values()).filter((edit) => edit.hasChanges);
  }, [pageEdits]);

  const toggleLock = (pageId: string) => {
    setLockedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  const handleBulkGenerate = async () => {
    if (isBulkGenerating || saving) return;

    const pagesToProcess = pages.filter(p => !lockedPageIds.has(p.id));
    if (pagesToProcess.length === 0) return;

    setIsBulkGenerating(true);
    setGenerationProgress({ current: 0, total: pagesToProcess.length });
    setResult(null); // Clear previous save result

    let processedCount = 0;

    for (const page of pagesToProcess) {
      // Mark this page as generating locally if we wanted refined UI feedback per row
      // For now, global progress bar is good.

      try {
        const data = await onGenerateSEO(page.id);
        if (data) {
          setPageEdits(prev => {
            const newEdits = new Map(prev);
            const current = newEdits.get(page.id);
            if (current) {
              newEdits.set(page.id, {
                ...current,
                seoTitle: data.title,
                seoDescription: data.description,
                ogTitle: data.ogTitle,
                ogDescription: data.ogDescription,
                ogTitleCopied: false,
                ogDescriptionCopied: false,
                hasChanges: true
              });
            }
            return newEdits;
          });
        }
      } catch (error) {
        console.error(`Failed to generate SEO for page ${page.id}`, error);
      }

      processedCount++;
      setGenerationProgress({ current: processedCount, total: pagesToProcess.length });
    }

    setIsBulkGenerating(false);
    setGenerationProgress(null);
  };

  const handleSave = async () => {
    if (changedPages.length === 0) return;

    setSaving(true);
    setProgress(0);
    setResult(null);

    const updates = changedPages.map((edit) => {
      const page = pages.find((p) => p.id === edit.pageId);
      const isIndexPage = !page?.slug || page?.slug === '' || page?.slug === 'home';
      const slugChanged = page && page.slug !== edit.slug;

      return {
        pageId: edit.pageId,
        updates: {
          localeId: localeId || undefined,
          title: edit.title,
          ...(slugChanged && !isIndexPage ? { slug: edit.slug } : {}),
          seo: {
            title: edit.seoTitle,
            description: edit.seoDescription,
          },
          openGraph: {
            title: edit.ogTitleCopied ? undefined : edit.ogTitle,
            titleCopied: edit.ogTitleCopied,
            description: edit.ogDescriptionCopied ? undefined : edit.ogDescription,
            descriptionCopied: edit.ogDescriptionCopied,
          },
        } as UpdateWebflowPageSEO,
      };
    });

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 100 / updates.length, 95));
    }, 500);

    const result = await onSave(updates);

    clearInterval(progressInterval);
    setProgress(100);
    setResult(result);
    setSaving(false);

    // Clear changes for successful updates
    if (result.success > 0) {
      setPageEdits((prev) => {
        const newEdits = new Map(prev);
        newEdits.forEach((edit, key) => {
          if (edit.hasChanges) {
            newEdits.set(key, { ...edit, hasChanges: false });
          }
        });
        return newEdits;
      });
    }
  };

  const copyTitleToSEO = (pageId: string) => {
    if (lockedPageIds.has(pageId)) return;
    const edit = pageEdits.get(pageId);
    if (edit) {
      updatePageEdit(pageId, 'seoTitle', edit.title);
    }
  };

  // Split pages into static and CMS
  const { staticPages, cmsPages } = useMemo(() => {
    return {
      staticPages: pages.filter(p => !p.collectionId),
      cmsPages: pages.filter(p => p.collectionId)
    };
  }, [pages]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-screen sm:max-w-[95vw] p-0 gap-0 bg-background border-l flex flex-col">
        <SheetHeader className="px-6 py-4 border-b bg-background z-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <SheetTitle>Bulk SEO Editor</SheetTitle>
                {localeId && (
                  <Badge variant="outline" className="font-normal border-violet-200 text-violet-700 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Locale Active
                  </Badge>
                )}
              </div>
              <SheetDescription>
                Edit SEO settings for multiple pages in a compact table view.
              </SheetDescription>
            </div>
            <div className="flex items-center gap-3">
              {isBulkGenerating && generationProgress && (
                <div className="flex items-center gap-2 mr-4">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                  <span className="text-sm text-muted-foreground">
                    Generating {generationProgress.current}/{generationProgress.total}
                  </span>
                  <Progress value={(generationProgress.current / generationProgress.total) * 100} className="w-24 h-2" />
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800"
                onClick={handleBulkGenerate}
                disabled={isBulkGenerating || saving}
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI Generate All
              </Button>
              <div className="h-6 w-px bg-border mx-2" />
              <Badge variant="secondary" className="font-normal">
                {pages.length} Pages
              </Badge>
              {changedPages.length > 0 && (
                <Badge className="bg-blue-600 hover:bg-blue-700">
                  {changedPages.length} Modified
                </Badge>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-auto bg-muted/20">
          <Table className="min-w-[1600px]">
            <TableHeader className="bg-background sticky top-0 z-10 shadow-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[50px] text-center" title="Lock to prevent changes"><Lock className="h-3 w-3 mx-auto" /></TableHead>
                <TableHead className="w-[200px] min-w-[200px]">Page Name</TableHead>
                <TableHead className="w-[300px] min-w-[300px]">Meta Title</TableHead>
                <TableHead className="w-[400px] min-w-[400px]">Meta Description</TableHead>
                <TableHead className="w-[80px] text-center">OG Copy</TableHead>
                <TableHead className="w-[300px] min-w-[300px]">Open Graph Title</TableHead>
                <TableHead className="w-[80px] text-center">Desc Copy</TableHead>
                <TableHead className="w-[350px] min-w-[350px]">Open Graph Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staticPages.length > 0 && (
                <>
                  <TableRow className="hover:bg-transparent bg-muted/30">
                    <TableCell colSpan={8} className="py-2 font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                      Static Pages ({staticPages.length})
                    </TableCell>
                  </TableRow>
                  {staticPages.map((page) => (
                    <PageRow
                      key={page.id}
                      page={page}
                      edit={pageEdits.get(page.id)}
                      isLocked={lockedPageIds.has(page.id)}
                      toggleLock={toggleLock}
                      updatePageEdit={updatePageEdit}
                      copyTitleToSEO={copyTitleToSEO}
                    />
                  ))}
                </>
              )}

              {cmsPages.length > 0 && (
                <>
                  <TableRow className="hover:bg-transparent bg-muted/30">
                    <TableCell colSpan={8} className="py-2 font-semibold text-xs text-muted-foreground uppercase tracking-wider border-t">
                      CMS Templates ({cmsPages.length})
                    </TableCell>
                  </TableRow>
                  {cmsPages.map((page) => (
                    <PageRow
                      key={page.id}
                      page={page}
                      edit={pageEdits.get(page.id)}
                      isLocked={lockedPageIds.has(page.id)}
                      toggleLock={toggleLock}
                      updatePageEdit={updatePageEdit}
                      copyTitleToSEO={copyTitleToSEO}
                    />
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </div>

        <SheetFooter className="p-4 border-t bg-background">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {saving && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Saving... {Math.round(progress)}%</span>
                </div>
              )}
              {result && (
                <div className={cn("flex items-center gap-1.5", result.failed > 0 ? "text-red-600" : "text-green-600")}>
                  {result.failed > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  <span>{result.success} saved, {result.failed} failed</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || isBulkGenerating}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || changedPages.length === 0 || isBulkGenerating} className="w-[150px]">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

interface PageEdit {
  pageId: string;
  title: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  ogTitle: string;
  ogTitleCopied: boolean;
  ogDescription: string;
  ogDescriptionCopied: boolean;
  hasChanges: boolean;
}

const PageRow = ({
  page,
  edit,
  isLocked,
  toggleLock,
  updatePageEdit,
  copyTitleToSEO
}: {
  page: WebflowPageWithQC;
  edit: PageEdit | undefined;
  isLocked: boolean;
  toggleLock: (id: string) => void;
  updatePageEdit: (id: string, field: keyof PageEdit, value: string | boolean) => void;
  copyTitleToSEO: (id: string) => void;
}) => {
  if (!edit) return null;
  const hasIssues = page.issues.length > 0;

  return (
    <TableRow
      className={cn(
        "hover:bg-muted/50 transition-colors",
        edit.hasChanges && "bg-blue-50/50 dark:bg-blue-950/20",
        isLocked && "opacity-75 bg-muted/10"
      )}
    >
      {/* Lock Column */}
      <TableCell className="text-center align-top py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={() => toggleLock(page.id)}
        >
          {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5 opacity-30" />}
        </Button>
      </TableCell>

      {/* Page Name & Info */}
      <TableCell className="align-top py-3 font-medium">
        <div className="flex flex-col gap-1">
          {page.publishedPath && page.publishedPath.split('/').length > 2 && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              <Folder className="h-2.5 w-2.5" />
              <span>{page.publishedPath.split('/')[1]}</span>
            </div>
          )}
          <span className="truncate" title={page.title}>{page.title || 'Untitled'}</span>
          <span className="text-xs text-muted-foreground truncate" title={page.publishedPath || `/${page.slug}`}>
            {page.publishedPath || `/${page.slug}`}
          </span>
          {hasIssues && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-600 dark:text-amber-500">
              <TriangleAlert className="h-3 w-3" />
              <span>{page.issues.length} issue{page.issues.length !== 1 && 's'}</span>
            </div>
          )}
        </div>
      </TableCell>

      {/* Meta Title */}
      <TableCell className="align-top py-2">
        <div className="space-y-1.5">
          <Input
            value={edit.seoTitle}
            onChange={(e) => updatePageEdit(page.id, 'seoTitle', e.target.value)}
            placeholder="Meta Title"
            disabled={isLocked}
            className={cn("h-8 text-sm", isLocked && "cursor-not-allowed")}
          />
          <div className="flex justify-between items-center text-[10px] text-muted-foreground px-1">
            <span
              className={cn(
                edit.seoTitle.length < 30 || edit.seoTitle.length > 60
                  ? "text-amber-600 font-medium"
                  : "text-green-600"
              )}
            >
              {edit.seoTitle.length}/60
            </span>
            <button
              onClick={() => copyTitleToSEO(page.id)}
              disabled={isLocked}
              className={cn("hover:text-foreground flex items-center gap-1 transition-colors", isLocked && "opacity-50 cursor-not-allowed")}
            >
              <Copy className="h-2.5 w-2.5" /> Copy Page Title
            </button>
          </div>
        </div>
      </TableCell>

      {/* Meta Description */}
      <TableCell className="align-top py-2">
        <div className="space-y-1.5">
          <Textarea
            value={edit.seoDescription}
            onChange={(e) => updatePageEdit(page.id, 'seoDescription', e.target.value)}
            placeholder="Meta Description"
            disabled={isLocked}
            className={cn("min-h-[32px] h-[32px] focus:h-[80px] transition-all text-sm resize-none py-1.5 leading-tight", isLocked && "cursor-not-allowed")}
          />
          <div className="flex justify-end items-center text-[10px] text-muted-foreground px-1">
            <span
              className={cn(
                edit.seoDescription.length < 120 || edit.seoDescription.length > 160
                  ? "text-amber-600 font-medium"
                  : "text-green-600"
              )}
            >
              {edit.seoDescription.length}/160
            </span>
          </div>
        </div>
      </TableCell>

      {/* OG Copy Checkbox */}
      <TableCell className="align-top py-3 text-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Checkbox
                checked={edit.ogTitleCopied}
                onCheckedChange={(checked) => updatePageEdit(page.id, 'ogTitleCopied', checked === true)}
                disabled={isLocked}
                className="translate-y-1"
              />
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Copy Meta Title to OG Title</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>

      {/* OG Title */}
      <TableCell className="align-top py-2">
        <Input
          value={edit.ogTitleCopied ? edit.seoTitle : edit.ogTitle}
          onChange={(e) => !edit.ogTitleCopied && updatePageEdit(page.id, 'ogTitle', e.target.value)}
          disabled={edit.ogTitleCopied || isLocked}
          placeholder={edit.ogTitleCopied ? "(Same as Meta Title)" : "OG Title"}
          className={cn(
            "h-8 text-sm",
            (edit.ogTitleCopied || isLocked) && "opacity-50 bg-muted cursor-not-allowed"
          )}
        />
      </TableCell>

      {/* OG Desc Copy */}
      <TableCell className="align-top py-3 text-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Checkbox
                checked={edit.ogDescriptionCopied}
                onCheckedChange={(checked) => updatePageEdit(page.id, 'ogDescriptionCopied', checked === true)}
                disabled={isLocked}
                className="translate-y-1"
              />
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Copy Meta Description to OG Description</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>

      {/* OG Description */}
      <TableCell className="align-top py-2">
        <Textarea
          value={edit.ogDescriptionCopied ? edit.seoDescription : edit.ogDescription}
          onChange={(e) => !edit.ogDescriptionCopied && updatePageEdit(page.id, 'ogDescription', e.target.value)}
          disabled={edit.ogDescriptionCopied || isLocked}
          placeholder={edit.ogDescriptionCopied ? "(Same as Meta Description)" : "OG Description"}
          className={cn(
            "min-h-[32px] h-[32px] focus:h-[80px] transition-all text-sm resize-none py-1.5 leading-tight",
            (edit.ogDescriptionCopied || isLocked) && "opacity-50 bg-muted cursor-not-allowed"
          )}
        />
      </TableCell>
    </TableRow>
  );
};
