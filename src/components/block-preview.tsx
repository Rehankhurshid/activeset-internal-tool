"use client";

import { ContentBlock, BlockChange } from "@/types";
import { ArrowRight, Plus, Minus, RefreshCw } from "lucide-react";

interface BlockPreviewProps {
  block: ContentBlock;
  type: 'before' | 'after' | 'added' | 'removed';
}

/**
 * Renders a mini preview of a content block (card)
 */
export function BlockPreview({ block, type }: BlockPreviewProps) {
  const borderColor = {
    before: 'border-red-300 dark:border-red-700',
    after: 'border-green-300 dark:border-green-700',
    added: 'border-green-300 dark:border-green-700',
    removed: 'border-red-300 dark:border-red-700',
  }[type];

  const bgColor = {
    before: 'bg-red-50 dark:bg-red-950/30',
    after: 'bg-green-50 dark:bg-green-950/30',
    added: 'bg-green-50 dark:bg-green-950/30',
    removed: 'bg-red-50 dark:bg-red-950/30',
  }[type];

  const labelBg = {
    before: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
    after: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
    added: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
    removed: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
  }[type];

  const labelText = {
    before: 'Before',
    after: 'After',
    added: 'Added',
    removed: 'Removed',
  }[type];

  const Icon = {
    before: Minus,
    after: Plus,
    added: Plus,
    removed: Minus,
  }[type];

  return (
    <div className={`rounded-lg border-2 ${borderColor} ${bgColor} overflow-hidden`}>
      {/* Label */}
      <div className={`px-3 py-1.5 text-xs font-medium ${labelBg} flex items-center gap-1.5`}>
        <Icon className="h-3 w-3" />
        {labelText}
      </div>
      
      {/* Card content */}
      <div className="p-4">
        {/* Heading */}
        <h3 className={`text-lg font-semibold mb-2 ${
          type === 'before' || type === 'removed' 
            ? 'text-red-800 dark:text-red-200 line-through' 
            : 'text-green-800 dark:text-green-200'
        }`}>
          {block.heading}
        </h3>
        
        {/* Tag */}
        {block.tag && (
          <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
            type === 'before' || type === 'removed'
              ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
              : 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400'
          }`}>
            {block.tag}
          </span>
        )}
      </div>
    </div>
  );
}

interface BlockChangeDiffProps {
  change: BlockChange;
}

/**
 * Renders a block change with before/after side-by-side previews
 */
export function BlockChangeDiff({ change }: BlockChangeDiffProps) {
  const { type, before, after, changeLabel } = change;

  // Type-specific header styling
  const headerBg = {
    modified: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    added: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
    removed: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
  }[type];

  const headerText = {
    modified: 'text-amber-700 dark:text-amber-300',
    added: 'text-green-700 dark:text-green-300',
    removed: 'text-red-700 dark:text-red-300',
  }[type];

  const HeaderIcon = {
    modified: RefreshCw,
    added: Plus,
    removed: Minus,
  }[type];

  const typeLabel = {
    modified: 'Changed',
    added: 'Added',
    removed: 'Removed',
  }[type];

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-2 border-b ${headerBg} flex items-center gap-2`}>
        <HeaderIcon className={`h-4 w-4 ${headerText}`} />
        <span className={`text-sm font-medium ${headerText}`}>
          {typeLabel}: {changeLabel || (after?.heading || before?.heading)}
        </span>
      </div>

      {/* Content */}
      <div className="p-4">
        {type === 'modified' && before && after && (
          <div className="flex items-stretch gap-4">
            <div className="flex-1">
              <BlockPreview block={before} type="before" />
            </div>
            <div className="flex items-center">
              <ArrowRight className="h-6 w-6 text-neutral-400" />
            </div>
            <div className="flex-1">
              <BlockPreview block={after} type="after" />
            </div>
          </div>
        )}

        {type === 'added' && after && (
          <div className="max-w-md">
            <BlockPreview block={after} type="added" />
          </div>
        )}

        {type === 'removed' && before && (
          <div className="max-w-md">
            <BlockPreview block={before} type="removed" />
          </div>
        )}
      </div>
    </div>
  );
}

interface BlockChangeListProps {
  changes: BlockChange[];
}

/**
 * Renders a list of block changes
 */
export function BlockChangeList({ changes }: BlockChangeListProps) {
  if (!changes || changes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {changes.map((change, idx) => (
        <BlockChangeDiff key={idx} change={change} />
      ))}
    </div>
  );
}
