"use client";

import { TextChange } from "@/types";
import { Plus, Minus, RefreshCw, Type } from "lucide-react";

interface TextChangeDiffProps {
  changes: TextChange[];
}

/**
 * Compute inline diff between two strings
 * Returns an array of segments with type: 'same' | 'added' | 'removed'
 */
function computeInlineDiff(before: string, after: string): Array<{ text: string; type: 'same' | 'added' | 'removed' }> {
  const segments: Array<{ text: string; type: 'same' | 'added' | 'removed' }> = [];
  
  if (!before && after) {
    return [{ text: after, type: 'added' }];
  }
  if (before && !after) {
    return [{ text: before, type: 'removed' }];
  }
  if (!before && !after) {
    return [];
  }
  
  // Simple character-based diff
  // Find common prefix
  let prefixLen = 0;
  const minLen = Math.min(before.length, after.length);
  while (prefixLen < minLen && before[prefixLen] === after[prefixLen]) {
    prefixLen++;
  }
  
  // Find common suffix (after prefix)
  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    before[before.length - 1 - suffixLen] === after[after.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }
  
  // Build segments
  const prefix = before.substring(0, prefixLen);
  const suffix = before.substring(before.length - suffixLen);
  const removedMiddle = before.substring(prefixLen, before.length - suffixLen);
  const addedMiddle = after.substring(prefixLen, after.length - suffixLen);
  
  if (prefix) {
    segments.push({ text: prefix, type: 'same' });
  }
  if (removedMiddle) {
    segments.push({ text: removedMiddle, type: 'removed' });
  }
  if (addedMiddle) {
    segments.push({ text: addedMiddle, type: 'added' });
  }
  if (suffix) {
    segments.push({ text: suffix, type: 'same' });
  }
  
  return segments;
}

/**
 * Render inline diff with highlighting
 */
function InlineDiffText({ before, after }: { before?: string; after?: string }) {
  const segments = computeInlineDiff(before || '', after || '');
  
  return (
    <span className="font-mono text-sm">
      {segments.map((seg, idx) => {
        if (seg.type === 'same') {
          return <span key={idx} className="text-neutral-700 dark:text-neutral-300">{seg.text}</span>;
        }
        if (seg.type === 'removed') {
          return (
            <span
              key={idx}
              className="bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-200 line-through px-0.5 rounded"
            >
              {seg.text}
            </span>
          );
        }
        if (seg.type === 'added') {
          return (
            <span
              key={idx}
              className="bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-200 px-0.5 rounded"
            >
              {seg.text}
            </span>
          );
        }
        return null;
      })}
    </span>
  );
}

/**
 * Single text change card
 */
function TextChangeCard({ change }: { change: TextChange }) {
  const { type, beforeText, afterText, selector } = change;
  
  const borderColor = {
    modified: 'border-amber-300 dark:border-amber-700',
    added: 'border-green-300 dark:border-green-700',
    removed: 'border-red-300 dark:border-red-700',
  }[type];
  
  const bgColor = {
    modified: 'bg-amber-50 dark:bg-amber-950/30',
    added: 'bg-green-50 dark:bg-green-950/30',
    removed: 'bg-red-50 dark:bg-red-950/30',
  }[type];
  
  const headerBg = {
    modified: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
    added: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
    removed: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
  }[type];
  
  const Icon = {
    modified: RefreshCw,
    added: Plus,
    removed: Minus,
  }[type];
  
  const typeLabel = {
    modified: 'Text Changed',
    added: 'Text Added',
    removed: 'Text Removed',
  }[type];
  
  // Clean up selector for display
  const cleanSelector = selector.replace(/^\[class\*="/, '.').replace(/"\]$/, '').replace(/^\./, '');
  
  return (
    <div className={`rounded-lg border-2 ${borderColor} ${bgColor} overflow-hidden`}>
      {/* Header */}
      <div className={`px-3 py-2 ${headerBg} flex items-center gap-2`}>
        <Icon className="h-4 w-4" />
        <span className="text-sm font-medium">{typeLabel}</span>
        <span className="text-xs opacity-70 ml-auto font-mono">{cleanSelector}</span>
      </div>
      
      {/* Content */}
      <div className="p-4">
        {type === 'modified' && (
          <div className="space-y-3">
            {/* Inline diff view */}
            <div className="p-3 bg-white dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700">
              <InlineDiffText before={beforeText} after={afterText} />
            </div>
            
            {/* Before/After breakdown */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-red-600 dark:text-red-400 font-medium mb-1 flex items-center gap-1">
                  <Minus className="h-3 w-3" /> Before
                </div>
                <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-red-800 dark:text-red-200 font-mono break-all">
                  {beforeText}
                </div>
              </div>
              <div>
                <div className="text-green-600 dark:text-green-400 font-medium mb-1 flex items-center gap-1">
                  <Plus className="h-3 w-3" /> After
                </div>
                <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded text-green-800 dark:text-green-200 font-mono break-all">
                  {afterText}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {type === 'added' && (
          <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-md">
            <span className="font-mono text-sm text-green-800 dark:text-green-200">
              {afterText}
            </span>
          </div>
        )}
        
        {type === 'removed' && (
          <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-md">
            <span className="font-mono text-sm text-red-800 dark:text-red-200 line-through">
              {beforeText}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * List of text element changes
 */
export function TextChangeDiff({ changes }: TextChangeDiffProps) {
  if (!changes || changes.length === 0) {
    return null;
  }
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
        <Type className="h-4 w-4" />
        <span className="font-medium">Element-Level Changes</span>
        <span className="text-xs bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded">
          {changes.length} change{changes.length !== 1 ? 's' : ''}
        </span>
      </div>
      
      {changes.map((change, idx) => (
        <TextChangeCard key={idx} change={change} />
      ))}
    </div>
  );
}
