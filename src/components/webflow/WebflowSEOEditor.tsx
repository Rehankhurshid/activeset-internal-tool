'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { WebflowSEOInput } from './editor/WebflowSEOInput';
import { Loader2, AlertTriangle, Sparkles, Globe, Info, Plus, ChevronDown } from 'lucide-react';
import {
  WebflowPageWithQC,
  UpdateWebflowPageSEO,
  AISEOGeneratedData,
  WebflowLocale,
  WebflowPage,
  CollectionField,
} from '@/types/webflow';
import { cn } from '@/lib/utils';
import { formatForDisplay } from '@/lib/webflow-utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';



interface WebflowSEOEditorProps {
  page: WebflowPageWithQC | null;
  locales: WebflowLocale[];
  apiToken?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (pageId: string, updates: UpdateWebflowPageSEO) => Promise<boolean>;
  onGenerateSEO: (pageId: string) => Promise<AISEOGeneratedData | null>;
}

// Character count helper with color coding
function CharCount({
  current,
  min,
  max,
}: {
  current: number;
  min: number;
  max: number;
}) {
  const status =
    current === 0 ? 'empty' : current < min ? 'short' : current > max ? 'long' : 'good';

  return (
    <span
      className={cn(
        'text-xs',
        status === 'empty' && 'text-muted-foreground',
        status === 'short' && 'text-yellow-600',
        status === 'long' && 'text-yellow-600',
        status === 'good' && 'text-green-600'
      )}
    >
      {current} / {min}-{max} chars
    </span>
  );
}

export function WebflowSEOEditor({
  page,
  locales,
  apiToken,
  open,
  onOpenChange,
  onSave,
  onGenerateSEO,
}: WebflowSEOEditorProps) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [ogTitle, setOgTitle] = useState('');
  const [ogTitleCopied, setOgTitleCopied] = useState(true);
  const [ogDescription, setOgDescription] = useState('');
  const [ogDescriptionCopied, setOgDescriptionCopied] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CMS Fields state
  const [collectionFields, setCollectionFields] = useState<CollectionField[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);

  // Locale state
  const [selectedLocaleId, setSelectedLocaleId] = useState<string | null>(null);
  const [fetchingLocale, setFetchingLocale] = useState(false);

  // Initialize selectedLocaleId when page changes
  useEffect(() => {
    if (page) {
      setSelectedLocaleId(page.localeId || null);
    }
  }, [page]);



  // Helper to format text for saving (convert {{slug}} back to {{wf...}})
  const formatForSave = useCallback((text: string, fields: CollectionField[]) => {
    if (!text) return '';
    let formatted = text;

    // Find all potential variables {{slug}}
    const matches = text.match(/\{\{([^}]+)\}\}/g);
    if (!matches) return text;

    matches.forEach(match => {
      const slug = match.replace(/\{\{|\}\}/g, '');
      const field = fields.find(f => f.slug === slug);

      // If we find a matching field, convert to Webflow format
      if (field) {
        // We need to match Webflow's internal format exactly
        // {{wf {"path":"slug","type":"Type"} }}
        const wfFormat = `{{wf {"path":"${slug}","type":"${field.type}"} }}`;
        // Escape for regex replacement
        const escapedMatch = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        formatted = formatted.replace(new RegExp(escapedMatch, 'g'), wfFormat);
      }
    });

    return formatted;
  }, []);

  // Update form fields from data object
  const updateFormFields = useCallback((data: WebflowPage | WebflowPageWithQC) => {
    setTitle(data.title || '');

    // For CMS pages, strip "detail_" from slug for display if present
    const rawSlug = data.slug || '';
    setSlug(data.collectionId && rawSlug.startsWith('detail_') ? rawSlug.replace('detail_', '') : rawSlug);

    setSeoTitle(formatForDisplay(data.seo?.title));
    setSeoDescription(formatForDisplay(data.seo?.description));
    setOgTitle(formatForDisplay(data.openGraph?.title));
    setOgTitleCopied(data.openGraph?.titleCopied ?? true);
    setOgDescription(formatForDisplay(data.openGraph?.description));
    setOgDescriptionCopied(data.openGraph?.descriptionCopied ?? true);
    setError(null);
  }, []);

  // Fetch data when locale changes
  useEffect(() => {
    if (!page || !open) return;

    // Use a reference to know if we should update state (avoid race conditions)
    let active = true;

    const fetchData = async () => {
      // If selected locale matches initial page locale, reset to initial data
      if (
        (selectedLocaleId === null && !page.localeId) ||
        selectedLocaleId === page.localeId
      ) {
        updateFormFields(page);
        if (fetchingLocale) setFetchingLocale(false);
        return;
      }

      if (!apiToken) {
        setError("Missing API Token available to fetch localized data.");
        return;
      }

      setFetchingLocale(true);
      try {
        const url = new URL(
          `/api/webflow/pages/${page.id}`,
          window.location.origin
        );
        if (selectedLocaleId) {
          url.searchParams.set('localeId', selectedLocaleId);
        }

        const response = await fetch(url.toString(), {
          headers: {
            'x-webflow-token': apiToken,
          },
        });

        const result = await response.json();

        if (active) {
          if (response.ok && result.success) {
            updateFormFields(result.data);
          } else {
            setError(result.error || "Failed to fetch localized page data");
          }
        }
      } catch (err) {
        if (active) {
          console.error(err);
          setError("Error fetching localized data");
        }
      } finally {
        if (active) setFetchingLocale(false);
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [selectedLocaleId, page, open, apiToken, updateFormFields]);

  // Check if this is an index/home page (slug is empty or home)
  const isIndexPage = !slug || slug === '' || slug === 'home';
  const isCMS = !!page?.collectionId;

  const handleGenerate = async () => {
    if (!page) return;
    setGenerating(true);
    setError(null);
    try {
      const data = await onGenerateSEO(page.id);
      if (data) {
        setSeoTitle(data.title);
        setSeoDescription(data.description);
        setOgTitle(data.ogTitle);
        setOgDescription(data.ogDescription);
        setOgTitleCopied(false);
        setOgDescriptionCopied(false);
      } else {
        setError('No SEO suggestions were generated.');
      }
    } catch {
      setError('Failed to generate SEO suggestions. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  // Fetch CMS Fields if it's a CMS page
  useEffect(() => {
    if (!page?.collectionId || !open || !apiToken) return;

    const fetchFields = async () => {
      setLoadingFields(true);
      try {
        const res = await fetch(`/api/webflow/collections/${page.collectionId}`, {
          headers: { 'x-webflow-token': apiToken }
        });
        const json = await res.json();
        if (json.success && json.data.fields) {
          // Filter for text-compatible fields
          // valid types: PlainText, RichText, Number, Email, Phone, Link, Color, Option, Date
          const compatibleTypes = ['PlainText', 'RichText', 'Number', 'Email', 'Phone', 'Color', 'Option', 'DateTime'];
          const fields = json.data.fields.filter((f: CollectionField) => compatibleTypes.includes(f.type));
          setCollectionFields(fields);
        }
      } catch (e) {
        console.error("Failed to fetch fields", e);
      } finally {
        setLoadingFields(false);
      }
    };
    fetchFields();
  }, [page?.collectionId, open, apiToken]);


  const insertVariable = (fieldSlug: string, target: 'seoTitle' | 'seoDescription') => {
    const variable = `{{${fieldSlug}}}`;
    if (target === 'seoTitle') {
      setSeoTitle(prev => prev + variable);
    } else {
      setSeoDescription(prev => prev + variable);
    }
  };

  const handleSave = async () => {
    if (!page) return;

    setSaving(true);
    setError(null);

    // Format fields back to Webflow format if CMS page
    const finalSeoTitle = isCMS ? formatForSave(seoTitle, collectionFields) : seoTitle;
    const finalSeoDescription = isCMS ? formatForSave(seoDescription, collectionFields) : seoDescription;
    const finalOgTitle = isCMS ? formatForSave(ogTitle, collectionFields) : ogTitle;
    const finalOgDescription = isCMS ? formatForSave(ogDescription, collectionFields) : ogDescription;

    const updates: UpdateWebflowPageSEO = {
      localeId: selectedLocaleId || undefined,
      title,
      // Don't include slug for index pages OR CMS pages (since they are templates)
      ...(!isIndexPage && !isCMS ? { slug } : {}),
      seo: {
        title: finalSeoTitle,
        description: finalSeoDescription,
      },
      openGraph: {
        title: ogTitleCopied ? undefined : finalOgTitle,
        titleCopied: ogTitleCopied,
        description: ogDescriptionCopied ? undefined : finalOgDescription,
        descriptionCopied: ogDescriptionCopied,
      },
    };

    try {
      const success = await onSave(page.id, updates);
      if (success) {
        onOpenChange(false);
      } else {
        setError('Failed to save changes. Please try again.');
      }
    } catch {
      setError('An error occurred while saving. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!page) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0 gap-0 bg-background border-l">
        <SheetHeader className="px-6 py-5 border-b sticky top-0 bg-background/95 backdrop-blur z-10">
          <SheetTitle className="text-xl">Edit SEO Settings</SheetTitle>
          <SheetDescription className="text-muted-foreground">
            Update SEO for <span className="font-medium text-foreground">{page.publishedPath || `/${page.slug}`}</span>
          </SheetDescription>
          {/* Locale Selector */}
          {locales.length > 0 && (
            <div className="mt-4">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Locale
              </Label>
              <Select
                value={selectedLocaleId || 'primary'}
                onValueChange={(val) => setSelectedLocaleId(val === 'primary' ? null : val)}
                disabled={saving || generating || fetchingLocale}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Locale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 opacity-50" />
                      <span>Primary</span>
                    </div>
                  </SelectItem>
                  {locales.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      <div className="flex items-center gap-2">
                        <span>{l.displayName}</span>
                        <span className="text-xs text-muted-foreground">({l.tag})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </SheetHeader>

        <div className="space-y-8 p-6">
          {fetchingLocale ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading locale data...</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {/* Alerts removed from here to avoid duplication with 'Page Settings' section below */}
              </div>

              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground/90">Page Settings</h3>

                {/* Page Issues Alert */}
                {page.issues.length > 0 && (
                  <Alert variant="destructive" className="border-red-900/50 bg-red-950/10 text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong className="block mb-1 font-medium">{page.issues.length} issue(s) found:</strong>
                      <ul className="list-disc list-inside text-sm opacity-90 space-y-0.5">
                        {page.issues.slice(0, 3).map((issue, i) => (
                          <li key={i}>{issue.message}</li>
                        ))}
                        {page.issues.length > 3 && (
                          <li>...and {page.issues.length - 3} more</li>
                        )}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {isCMS && (
                  <Alert className="bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <AlertDescription>
                      <strong className="block mb-1 font-medium">CMS Template Page</strong>
                      <p className="text-xs opacity-90 mb-2">
                        Changes here affect <strong>all</strong> items in this collection.
                      </p>
                      <div className="text-xs bg-blue-100/50 dark:bg-blue-900/40 p-2 rounded border border-blue-200/50 dark:border-blue-800/50">
                        <span className="font-semibold">Tip:</span> You can use dynamic variables like{' '}
                        <code className="bg-background/50 px-1 py-0.5 rounded border">{'{{title}}'}</code>{' '}
                        to insert the item's name automatically.
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <Tabs defaultValue="seo" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="seo">SEO Settings</TabsTrigger>
                    <TabsTrigger value="opengraph">Open Graph</TabsTrigger>
                  </TabsList>

                  <TabsContent value="seo" className="space-y-4 pt-4">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="title" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Page Name</Label>
                        </div>
                        <Input
                          id="title"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Page Name"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="slug" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">URL Slug</Label>
                        <Input
                          id="slug"
                          value={slug}
                          onChange={(e) => setSlug(e.target.value)}
                          placeholder="page-url-slug"
                          disabled={isIndexPage || isCMS}
                          className={cn(
                            "bg-muted/50 focus:bg-background transition-colors",
                            (isIndexPage || isCMS) && "opacity-60 cursor-not-allowed"
                          )}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          {isIndexPage
                            ? 'The slug of the homepage cannot be changed'
                            : isCMS
                              ? 'CMS template slugs are structural and cannot be edited here'
                              : 'The URL path for this page (e.g., /about-us)'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4 pt-2 border-t">
                      {/* SEO Title */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="seoTitle" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Title Tag</Label>
                          <div className="text-xs text-muted-foreground">
                            {seoTitle.length} / 60 characters
                          </div>
                        </div>

                        {isCMS ? (
                          <WebflowSEOInput
                            value={seoTitle}
                            onChange={setSeoTitle}
                            fields={collectionFields}
                            placeholder="Enter SEO title..."
                          />
                        ) : (
                          <Input
                            id="seoTitle"
                            value={seoTitle}
                            onChange={(e) => setSeoTitle(e.target.value)}
                            placeholder="Enter SEO title..."
                          />
                        )}
                      </div>

                      {/* SEO Description */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="seoDescription" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Meta Description</Label>
                          <div className="text-xs text-muted-foreground">
                            {seoDescription.length} / 160 characters
                          </div>
                        </div>

                        {isCMS ? (
                          <WebflowSEOInput
                            value={seoDescription}
                            onChange={setSeoDescription}
                            fields={collectionFields}
                            placeholder="Enter meta description..."
                            multiline
                          />
                        ) : (
                          <Textarea
                            id="seoDescription"
                            value={seoDescription}
                            onChange={(e) => setSeoDescription(e.target.value)}
                            placeholder="Enter meta description..."
                            className="min-h-[100px]"
                          />
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="opengraph" className="space-y-4 pt-4">
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2 pb-2">
                        <Label htmlFor="og-same-as-seo" className="text-sm font-medium">Use SEO Title & Description</Label>
                        {/* Logic for copying is handled in state, UI buttons could be here if needed */}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Open Graph Title</Label>
                          <div className="flex items-center space-x-2">
                            <Label htmlFor="ogTitleCopied" className="text-[10px] text-muted-foreground cursor-pointer">Same as SEO</Label>
                            <Switch id="ogTitleCopied" checked={ogTitleCopied} onCheckedChange={setOgTitleCopied} />
                          </div>
                        </div>

                        {!ogTitleCopied && (
                          isCMS ? (
                            <WebflowSEOInput
                              value={ogTitle}
                              onChange={setOgTitle}
                              fields={collectionFields}
                              placeholder="Open Graph Title"
                            />
                          ) : (
                            <Input
                              value={ogTitle}
                              onChange={(e) => setOgTitle(e.target.value)}
                              placeholder="Open Graph Title"
                            />
                          )
                        )}
                        {ogTitleCopied && (
                          <div className="px-3 py-2 text-sm text-muted-foreground bg-muted/50 rounded-md border border-dashed">
                            {seoTitle || '(Empty)'}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Open Graph Description</Label>
                          <div className="flex items-center space-x-2">
                            <Label htmlFor="ogDescCopied" className="text-[10px] text-muted-foreground cursor-pointer">Same as SEO</Label>
                            <Switch id="ogDescCopied" checked={ogDescriptionCopied} onCheckedChange={setOgDescriptionCopied} />
                          </div>
                        </div>

                        {!ogDescriptionCopied && (
                          <div className="space-y-2 pl-6 animate-in slide-in-from-top-2 duration-200">
                            <Label htmlFor="ogDescription" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Open Graph Description</Label>
                            {isCMS ? (
                              <WebflowSEOInput
                                value={ogDescription}
                                onChange={setOgDescription}
                                fields={collectionFields}
                                placeholder="Description for social media"
                                multiline
                              />
                            ) : (
                              <Textarea
                                id="ogDescription"
                                value={ogDescription}
                                onChange={(e) => setOgDescription(e.target.value)}
                                placeholder="Description for social media"
                                rows={2}
                                className="bg-muted/50 focus:bg-background transition-colors resize-none"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {error && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </div>

        <SheetFooter className="p-6 border-t bg-background sticky bottom-0 z-10 sm:justify-between">
          <Button
            variant="secondary"
            onClick={handleGenerate}
            disabled={saving || generating}
            className="mr-auto bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:hover:bg-violet-900/50 border border-violet-200 dark:border-violet-800"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate with AI
              </>
            )}
          </Button>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || generating}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || generating}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet >
  );
}
