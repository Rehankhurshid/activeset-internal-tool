"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  GitCommit,
  ChevronRight,
  Plus,
  Minus,
  RefreshCw,
  Calendar,
  Image,
  Link2,
  Type,
  FileText,
  Hash,
  List,
  Clock
} from "lucide-react"
import { ChangeLogEntry, FieldChange, ImageInfo, LinkInfo } from "@/types"
import { changeLogService } from "@/services/ChangeLogService"

interface ChangeLogTimelineProps {
  linkId: string;
  projectId: string;
}

// Helper to decode HTML entities
function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  const textarea = typeof document !== 'undefined' ? document.createElement('textarea') : null;
  if (textarea) {
    textarea.innerHTML = text;
    return textarea.value;
  }
  // Fallback for SSR - decode common entities
  return text
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

// Helper to generate a compact change summary
function getCompactChangeSummary(changes: FieldChange[]): string {
  if (!changes || changes.length === 0) return '';
  
  const summaries: string[] = [];
  
  for (const change of changes) {
    if (change.field === 'wordCount' && typeof change.oldValue === 'number' && typeof change.newValue === 'number') {
      const diff = change.newValue - change.oldValue;
      const sign = diff >= 0 ? '+' : '';
      summaries.push(`${sign}${diff} words`);
    } else if (change.field === 'bodyText') {
      // Don't show full body text, just indicate it changed
      summaries.push('Body text updated');
    } else if (change.field === 'title') {
      summaries.push('Title changed');
    } else if (change.field === 'h1') {
      summaries.push('H1 changed');
    } else if (change.field === 'metaDescription') {
      summaries.push('Meta description changed');
    } else if (change.field === 'images' && Array.isArray(change.newValue) && Array.isArray(change.oldValue)) {
      const diff = change.newValue.length - change.oldValue.length;
      if (diff > 0) summaries.push(`+${diff} images`);
      else if (diff < 0) summaries.push(`${diff} images`);
      else summaries.push('Images updated');
    } else if (change.field === 'links' && Array.isArray(change.newValue) && Array.isArray(change.oldValue)) {
      const diff = change.newValue.length - change.oldValue.length;
      if (diff > 0) summaries.push(`+${diff} links`);
      else if (diff < 0) summaries.push(`${diff} links`);
      else summaries.push('Links updated');
    }
  }
  
  return summaries.slice(0, 3).join(', ') + (summaries.length > 3 ? ` +${summaries.length - 3} more` : '');
}

// Helper to get relative time string
function getRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

// Helper to get date group
function getDateGroup(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  // Check if same day
  if (now.toDateString() === date.toDateString()) return 'Today';

  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toDateString() === date.toDateString()) return 'Yesterday';

  if (diffDays < 7) return 'This Week';
  if (diffDays < 30) return 'This Month';
  return 'Older';
}

export function ChangeLogTimeline({ linkId, projectId }: ChangeLogTimelineProps) {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    loadHistory();
  }, [linkId]);

  async function loadHistory() {
    setLoading(true);
    const history = await changeLogService.getHistory(linkId, { limit: 50 });
    setEntries(history);
    setLoading(false);
  }

  // Group entries by date
  const groupedEntries = useMemo(() => {
    const groups: Record<string, ChangeLogEntry[]> = {};
    const order = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];

    entries.forEach(entry => {
      const group = getDateGroup(entry.timestamp);
      if (!groups[group]) groups[group] = [];
      groups[group].push(entry);
    });

    // Return ordered groups
    return order.filter(g => groups[g]?.length).map(group => ({
      label: group,
      entries: groups[group]
    }));
  }, [entries]);

  // Limit display unless "show more" is clicked
  const displayGroups = useMemo(() => {
    if (showMore) return groupedEntries;

    let count = 0;
    const limited: typeof groupedEntries = [];
    for (const group of groupedEntries) {
      const remaining = 10 - count;
      if (remaining <= 0) break;

      if (group.entries.length <= remaining) {
        limited.push(group);
        count += group.entries.length;
      } else {
        limited.push({ label: group.label, entries: group.entries.slice(0, remaining) });
        count += remaining;
        break;
      }
    }
    return limited;
  }, [groupedEntries, showMore]);

  const totalCount = entries.length;
  const displayedCount = displayGroups.reduce((sum, g) => sum + g.entries.length, 0);

  function getChangeTypeIcon(changeType: string) {
    switch (changeType) {
      case 'CONTENT_CHANGED':
        return <RefreshCw className="h-4 w-4 text-orange-500" />;
      case 'TECH_CHANGE_ONLY':
        return <GitCommit className="h-4 w-4 text-blue-500" />;
      case 'FIRST_SCAN':
        return <Plus className="h-4 w-4 text-green-500" />;
      default:
        return <GitCommit className="h-4 w-4 text-gray-500" />;
    }
  }

  function getChangeTypeBadge(changeType: string) {
    const styles: Record<string, string> = {
      'CONTENT_CHANGED': 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
      'TECH_CHANGE_ONLY': 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
      'FIRST_SCAN': 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    };
    const labels: Record<string, string> = {
      'CONTENT_CHANGED': 'Content Updated',
      'TECH_CHANGE_ONLY': 'Tech Only',
      'FIRST_SCAN': 'First Scan',
    };
    return (
      <Badge variant="outline" className={styles[changeType] || 'bg-gray-500/10 text-gray-700'}>
        {labels[changeType] || changeType}
      </Badge>
    );
  }

  function getFieldIcon(field: string) {
    switch (field) {
      case 'title':
        return <Type className="h-3 w-3" />;
      case 'h1':
        return <Hash className="h-3 w-3" />;
      case 'metaDescription':
        return <FileText className="h-3 w-3" />;
      case 'images':
        return <Image className="h-3 w-3" />;
      case 'links':
        return <Link2 className="h-3 w-3" />;
      case 'headings':
        return <List className="h-3 w-3" />;
      default:
        return <FileText className="h-3 w-3" />;
    }
  }

  function formatFieldName(field: string): string {
    const names: Record<string, string> = {
      'title': 'Page Title',
      'h1': 'H1 Heading',
      'metaDescription': 'Meta Description',
      'wordCount': 'Word Count',
      'headings': 'Heading Structure',
      'images': 'Images',
      'links': 'Links',
      'bodyText': 'Body Text'
    };
    return names[field] || field;
  }

  function formatValue(value: string | number | string[] | ImageInfo[] | LinkInfo[] | null, field: string): string {
    if (value === null || value === undefined) return '(empty)';

    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') {
      // Decode HTML entities and truncate
      const decoded = decodeHtmlEntities(value);
      return decoded.substring(0, 150) + (decoded.length > 150 ? '...' : '');
    }

    if (Array.isArray(value)) {
      if (field === 'images') {
        const images = value as ImageInfo[];
        const text = images.map(i => decodeHtmlEntities(i.alt) || i.src.split('/').pop() || 'image').join(', ');
        return text.substring(0, 100) + (text.length > 100 ? '...' : '');
      }
      if (field === 'links') {
        const links = value as LinkInfo[];
        const text = links.map(l => decodeHtmlEntities(l.text) || new URL(l.href).pathname).join(', ');
        return text.substring(0, 100) + (text.length > 100 ? '...' : '');
      }
      if (field === 'headings') {
        const text = (value as string[]).map(h => decodeHtmlEntities(h)).join(' → ');
        return text.substring(0, 100) + (text.length > 100 ? '...' : '');
      }
      const text = value.map(v => typeof v === 'string' ? decodeHtmlEntities(v) : String(v)).join(', ');
      return text.substring(0, 100) + (text.length > 100 ? '...' : '');
    }

    return String(value);
  }

  function renderFieldChange(change: FieldChange) {
    // Helper to compute array diffs
    const renderArrayDiff = (field: string, oldArr: any[], newArr: any[]) => {
      const added: any[] = [];
      const removed: any[] = [];

      if (field === 'images') {
        const oldSrcs = new Set(oldArr.map((i: any) => i.src));
        const newSrcs = new Set(newArr.map((i: any) => i.src));

        newArr.forEach((i: any) => { if (!oldSrcs.has(i.src)) added.push(i); });
        oldArr.forEach((i: any) => { if (!newSrcs.has(i.src)) removed.push(i); });

        return {
          added: added.map(i => i.src.split('/').pop() || i.src),
          removed: removed.map(i => i.src.split('/').pop() || i.src)
        };
      }

      if (field === 'links') {
        const oldHrefs = new Set(oldArr.map((l: any) => l.href));
        const newHrefs = new Set(newArr.map((l: any) => l.href));

        newArr.forEach((l: any) => { if (!oldHrefs.has(l.href)) added.push(l); });
        oldArr.forEach((l: any) => { if (!newHrefs.has(l.href)) removed.push(l); });

        return {
          added: added.map(l => `${l.text || 'Link'} (${l.href})`),
          removed: removed.map(l => `${l.text || 'Link'} (${l.href})`)
        };
      }

      return { added: [], removed: [] }; // Fallback
    };

    // Check if it's an array field (images/links)
    const isArrayField = (change.field === 'images' || change.field === 'links') &&
      Array.isArray(change.oldValue) && Array.isArray(change.newValue);

    let arrayDiff = { added: [] as string[], removed: [] as string[] };
    if (isArrayField) {
      arrayDiff = renderArrayDiff(change.field, change.oldValue as any[], change.newValue as any[]);
    }

    return (
      <div className="py-2 px-3 bg-muted/50 rounded-lg text-sm border border-border/50">
        <div className="flex items-center gap-2 mb-2">
          {change.changeType === 'added' && <Plus className="h-3 w-3 text-green-500" />}
          {change.changeType === 'removed' && <Minus className="h-3 w-3 text-red-500" />}
          {change.changeType === 'modified' && <RefreshCw className="h-3 w-3 text-orange-500" />}
          {getFieldIcon(change.field)}
          <span className="font-medium">{formatFieldName(change.field)}</span>
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            {change.changeType}
          </Badge>
        </div>

        {/* Detailed Array Diff View */}
        {isArrayField && (
          <div className="space-y-2 mt-2">
            {arrayDiff.removed.length > 0 && (
              <div className="p-2 bg-red-500/5 dark:bg-red-950/20 rounded border border-red-500/20">
                <span className="text-xs text-red-600 dark:text-red-400 font-medium block mb-1">Removed ({arrayDiff.removed.length}):</span>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                  {arrayDiff.removed.slice(0, 10).map((item, i) => (
                    <li key={i} className="truncate">{item}</li>
                  ))}
                  {arrayDiff.removed.length > 10 && <li>...and {arrayDiff.removed.length - 10} more</li>}
                </ul>
              </div>
            )}
            {arrayDiff.added.length > 0 && (
              <div className="p-2 bg-green-500/5 dark:bg-green-950/20 rounded border border-green-500/20">
                <span className="text-xs text-green-600 dark:text-green-400 font-medium block mb-1">Added ({arrayDiff.added.length}):</span>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                  {arrayDiff.added.slice(0, 10).map((item, i) => (
                    <li key={i} className="truncate">{item}</li>
                  ))}
                  {arrayDiff.added.length > 10 && <li>...and {arrayDiff.added.length - 10} more</li>}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Standard View for non-array or legacy changes */}
        {!isArrayField && change.changeType === 'modified' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            <div className="p-2 bg-red-500/5 dark:bg-red-950/20 rounded border border-red-500/20">
              <span className="text-xs text-red-600 dark:text-red-400 font-medium block mb-1">Before:</span>
              <span className="text-xs text-muted-foreground break-all whitespace-pre-line">
                {formatValue(change.oldValue, change.field)}
              </span>
            </div>
            <div className="p-2 bg-green-500/5 dark:bg-green-950/20 rounded border border-green-500/20">
              <span className="text-xs text-green-600 dark:text-green-400 font-medium block mb-1">After:</span>
              <span className="text-xs text-muted-foreground break-all whitespace-pre-line">
                {formatValue(change.newValue, change.field)}
              </span>
            </div>
          </div>
        )}

        {!isArrayField && change.changeType === 'added' && (
          <div className="p-2 bg-green-500/5 dark:bg-green-950/20 rounded border border-green-500/20 mt-2">
            <span className="text-xs text-green-600 dark:text-green-400">
              {formatValue(change.newValue, change.field)}
            </span>
          </div>
        )}

        {!isArrayField && change.changeType === 'removed' && (
          <div className="p-2 bg-red-500/5 dark:bg-red-950/20 rounded border border-red-500/20 mt-2">
            <span className="text-xs text-red-600 dark:text-red-400">
              {formatValue(change.oldValue, change.field)}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Loading change history...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <GitCommit className="h-5 w-5" />
            Content Change History
            {totalCount > 0 && (
              <Badge variant="secondary" className="ml-2">{totalCount} changes</Badge>
            )}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={loadHistory}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-6">
            {displayGroups.map((group) => (
              <div key={group.label}>
                {/* Date Group Header */}
                <div className="flex items-center gap-2 mb-3 sticky top-0 bg-background py-2 z-10">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-muted-foreground">{group.label}</span>
                  <div className="flex-1 h-px bg-border" />
                  <Badge variant="outline" className="text-xs">{group.entries.length}</Badge>
                </div>

                {/* Entries in this group */}
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[18px] top-0 bottom-0 w-px bg-border" />

                  {group.entries.map((entry) => (
                    <div key={entry.id} className="relative pl-12 pb-4">
                      {/* Timeline dot */}
                      <div className="absolute left-2 top-1 w-6 h-6 rounded-full bg-background border-2 border-border flex items-center justify-center z-10">
                        {getChangeTypeIcon(entry.changeType)}
                      </div>

                      {/* Entry content */}
                      <div
                        className={`border rounded-lg p-4 cursor-pointer transition-colors ${expandedEntry === entry.id
                          ? 'bg-muted/50 border-primary/30'
                          : 'hover:bg-muted/30'
                          }`}
                        onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                      >
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getChangeTypeBadge(entry.changeType)}
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {getRelativeTime(entry.timestamp)}
                            </span>
                          </div>
                          {entry.fieldChanges && entry.fieldChanges.length > 0 && (
                            <ChevronRight
                              className={`h-4 w-4 text-muted-foreground transition-transform ${expandedEntry === entry.id ? 'rotate-90' : ''
                                }`}
                            />
                          )}
                        </div>

                        {/* Summary line */}
                        <p className="text-sm font-medium">
                          {entry.changeType === 'FIRST_SCAN' 
                            ? 'Initial page scan' 
                            : (entry.fieldChanges && entry.fieldChanges.length > 0
                                ? getCompactChangeSummary(entry.fieldChanges)
                                : entry.summary || 'Changes detected'
                              )
                          }
                        </p>

                        {/* Compact details when collapsed */}
                        {expandedEntry !== entry.id && entry.fieldChanges && entry.fieldChanges.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {entry.fieldChanges.slice(0, 4).map((change, idx) => (
                              <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0.5">
                                {formatFieldName(change.field)}
                              </Badge>
                            ))}
                            {entry.fieldChanges.length > 4 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                                +{entry.fieldChanges.length - 4} more
                              </Badge>
                            )}
                          </div>
                        )}

                        {entry.auditScore !== undefined && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            Audit Score: <span className="font-medium">{entry.auditScore}/100</span>
                          </div>
                        )}

                        {/* Expanded details with before/after values */}
                        {expandedEntry === entry.id && entry.fieldChanges && entry.fieldChanges.length > 0 && (
                          <div className="mt-4 space-y-3 border-t pt-4">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Detailed Changes ({entry.fieldChanges.length})
                            </h4>
                            {entry.fieldChanges.map((change, cIdx) => (
                              <div key={cIdx}>
                                {renderFieldChange(change)}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* First scan - show initial content snapshot summary */}
                        {expandedEntry === entry.id && entry.changeType === 'FIRST_SCAN' && entry.contentSnapshot && (
                          <div className="mt-4 space-y-2 border-t pt-4">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Initial Content Snapshot
                            </h4>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="p-2 bg-muted/50 rounded">
                                <span className="text-muted-foreground">Title:</span>
                                <span className="ml-1 font-medium">{entry.contentSnapshot.title || '(none)'}</span>
                              </div>
                              <div className="p-2 bg-muted/50 rounded">
                                <span className="text-muted-foreground">H1:</span>
                                <span className="ml-1 font-medium">{entry.contentSnapshot.h1 || '(none)'}</span>
                              </div>
                              <div className="p-2 bg-muted/50 rounded">
                                <span className="text-muted-foreground">Word Count:</span>
                                <span className="ml-1 font-medium">{entry.contentSnapshot.wordCount}</span>
                              </div>
                              <div className="p-2 bg-muted/50 rounded">
                                <span className="text-muted-foreground">Headings:</span>
                                <span className="ml-1 font-medium">{entry.contentSnapshot.headings?.length || 0}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Show More / Load More */}
            {totalCount > displayedCount && !showMore && (
              <div className="text-center py-4">
                <Button variant="outline" onClick={() => setShowMore(true)}>
                  Show {totalCount - displayedCount} more changes
                </Button>
              </div>
            )}

            {entries.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <GitCommit className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p className="font-medium">No change history yet</p>
                <p className="text-sm mt-1">Run a scan to start tracking content changes.</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
