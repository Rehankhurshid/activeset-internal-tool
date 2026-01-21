"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, RefreshCw, FileText, Settings2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { FieldChange, BlockChange, TextChange } from "@/types"
import { BlockChangeList } from "./block-preview"
import { TextChangeDiff } from "./text-change-diff"

interface ChangeDiffViewerProps {
  fieldChanges: FieldChange[]
  blockChanges?: BlockChange[]  // Block-level changes with side-by-side previews
  textChanges?: TextChange[]    // Element-level text changes with inline diffs
  summary?: string
}

/**
 * Get a human-readable summary of what changed
 */
function generateSummary(fieldChanges: FieldChange[], blockChanges?: BlockChange[]): string {
  const parts: string[] = []
  
  // Summarize block changes first (most meaningful)
  if (blockChanges && blockChanges.length > 0) {
    const modified = blockChanges.filter(c => c.type === 'modified')
    const added = blockChanges.filter(c => c.type === 'added')
    const removed = blockChanges.filter(c => c.type === 'removed')
    
    if (modified.length === 1 && modified[0].changeLabel) {
      parts.push(`Changed: ${modified[0].changeLabel}`)
    } else if (modified.length > 1) {
      parts.push(`${modified.length} cards modified`)
    }
    
    if (added.length === 1 && added[0].changeLabel) {
      parts.push(`Added "${added[0].changeLabel}"`)
    } else if (added.length > 1) {
      parts.push(`${added.length} cards added`)
    }
    
    if (removed.length === 1 && removed[0].changeLabel) {
      parts.push(`Removed "${removed[0].changeLabel}"`)
    } else if (removed.length > 1) {
      parts.push(`${removed.length} cards removed`)
    }
    
    if (parts.length > 0) {
      return parts.join(', ')
    }
  }
  
  // Filter to meaningful changes only
  const meaningfulChanges = fieldChanges.filter(isMeaningfulChange)
  
  // Check for text changes (most important)
  const bodyTextChange = meaningfulChanges.find(c => c.field === 'bodyText')
  if (bodyTextChange && bodyTextChange.changeType === 'modified') {
    // Try to extract a snippet of what changed
    const oldText = String(bodyTextChange.oldValue || '')
    const newText = String(bodyTextChange.newValue || '')
    if (oldText.length < 50 && newText.length < 50) {
      return `Text changed: "${oldText}" → "${newText}"`
    }
    parts.push('Text content changed')
  }
  
  const titleChange = meaningfulChanges.find(c => c.field === 'title')
  if (titleChange && titleChange.changeType === 'modified') {
    parts.push('Title updated')
  }
  
  const h1Change = meaningfulChanges.find(c => c.field === 'h1')
  if (h1Change && h1Change.changeType === 'modified') {
    parts.push('H1 updated')
  }
  
  const metaChange = meaningfulChanges.find(c => c.field === 'metaDescription')
  if (metaChange && metaChange.changeType === 'modified') {
    parts.push('Meta description updated')
  }
  
  return parts.length > 0 ? parts.join(', ') : 'Content modified'
}

/**
 * Check if a change is meaningful (not just first-time data capture or noise)
 */
function isMeaningfulChange(change: FieldChange): boolean {
  // Skip "added" changes where old value is null/empty (first-time data capture)
  if (change.changeType === 'added') {
    if (change.oldValue === null || change.oldValue === undefined) {
      // Bulk items being added for the first time = noise
      if (['images', 'links', 'sections'].includes(change.field)) {
        return false
      }
    }
  }
  
  // Skip headings changes that are just tag format changes (H? → H2)
  if (change.field === 'headings') {
    const oldStr = String(change.oldValue || '')
    const newStr = String(change.newValue || '')
    // If the only difference is H? becoming H2/H3, it's noise
    const normalizedOld = oldStr.replace(/\[H\?\]/g, '[H2]').replace(/\[H\d\]/g, '[Hx]')
    const normalizedNew = newStr.replace(/\[H\d\]/g, '[Hx]')
    if (normalizedOld === normalizedNew) {
      return false
    }
  }
  
  // Skip word count changes of just 1-2 words (noise from whitespace)
  if (change.field === 'wordCount') {
    const oldVal = typeof change.oldValue === 'number' ? change.oldValue : 0
    const newVal = typeof change.newValue === 'number' ? change.newValue : 0
    if (Math.abs(newVal - oldVal) <= 2) {
      return false
    }
  }
  
  return true
}

/**
 * Field Changes List - Shows field changes prominently when no block/text data available
 */
function FieldChangesList({ changes }: { changes: FieldChange[] }) {
  // Filter to only meaningful changes
  const meaningfulChanges = changes.filter(isMeaningfulChange)
  
  // Prioritize text content changes (bodyText, title, h1, metaDescription)
  const textFields = ['bodyText', 'title', 'h1', 'metaDescription']
  const sortedChanges = [...meaningfulChanges].sort((a, b) => {
    const aIsText = textFields.includes(a.field)
    const bIsText = textFields.includes(b.field)
    if (aIsText && !bIsText) return -1
    if (!aIsText && bIsText) return 1
    return 0
  })
  
  if (sortedChanges.length === 0) {
    return (
      <div className="text-center py-6 text-neutral-500 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
        <p className="text-sm">No significant content changes detected.</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-3">
      {sortedChanges.map((change, idx) => (
        <FieldChangeCard key={`${change.field}-${idx}`} change={change} />
      ))}
    </div>
  )
}

/**
 * Compute inline diff between two strings for highlighting
 */
function computeInlineDiff(before: string, after: string): Array<{ text: string; type: 'same' | 'added' | 'removed' }> {
  const segments: Array<{ text: string; type: 'same' | 'added' | 'removed' }> = []
  
  if (!before && after) return [{ text: after, type: 'added' }]
  if (before && !after) return [{ text: before, type: 'removed' }]
  if (!before && !after) return []
  
  // Find common prefix
  let prefixLen = 0
  const minLen = Math.min(before.length, after.length)
  while (prefixLen < minLen && before[prefixLen] === after[prefixLen]) {
    prefixLen++
  }
  
  // Find common suffix
  let suffixLen = 0
  while (
    suffixLen < minLen - prefixLen &&
    before[before.length - 1 - suffixLen] === after[after.length - 1 - suffixLen]
  ) {
    suffixLen++
  }
  
  const prefix = before.substring(0, prefixLen)
  const suffix = before.substring(before.length - suffixLen)
  const removedMiddle = before.substring(prefixLen, before.length - suffixLen)
  const addedMiddle = after.substring(prefixLen, after.length - suffixLen)
  
  if (prefix) segments.push({ text: prefix, type: 'same' })
  if (removedMiddle) segments.push({ text: removedMiddle, type: 'removed' })
  if (addedMiddle) segments.push({ text: addedMiddle, type: 'added' })
  if (suffix) segments.push({ text: suffix, type: 'same' })
  
  return segments
}

/**
 * Single field change card - prominent display
 */
function FieldChangeCard({ change }: { change: FieldChange }) {
  const getFieldInfo = (field: string) => {
    const info: Record<string, { label: string; icon: string }> = {
      'title': { label: 'Page Title', icon: '📝' },
      'h1': { label: 'H1 Heading', icon: '🔤' },
      'metaDescription': { label: 'Meta Description', icon: '📋' },
      'wordCount': { label: 'Word Count', icon: '📊' },
      'images': { label: 'Images', icon: '🖼️' },
      'links': { label: 'Links', icon: '🔗' },
      'headings': { label: 'Headings', icon: '📑' },
      'sections': { label: 'Content Sections', icon: '📦' },
      'bodyText': { label: 'Text Changed', icon: '✏️' },
    }
    return info[field] || { label: field, icon: '📝' }
  }
  
  const { label, icon } = getFieldInfo(change.field)
  
  const borderColor = {
    modified: 'border-amber-300 dark:border-amber-700',
    added: 'border-green-300 dark:border-green-700',
    removed: 'border-red-300 dark:border-red-700',
  }[change.changeType]
  
  const bgColor = {
    modified: 'bg-amber-50 dark:bg-amber-950/30',
    added: 'bg-green-50 dark:bg-green-950/30',
    removed: 'bg-red-50 dark:bg-red-950/30',
  }[change.changeType]
  
  const headerBg = {
    modified: 'bg-amber-100 dark:bg-amber-900/50',
    added: 'bg-green-100 dark:bg-green-900/50',
    removed: 'bg-red-100 dark:bg-red-900/50',
  }[change.changeType]
  
  const textColor = {
    modified: 'text-amber-700 dark:text-amber-300',
    added: 'text-green-700 dark:text-green-300',
    removed: 'text-red-700 dark:text-red-300',
  }[change.changeType]
  
  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return '(empty)'
    if (typeof val === 'number') return val.toLocaleString()
    if (typeof val === 'string') {
      if (val.length > 200) return val.substring(0, 200) + '...'
      return val || '(empty)'
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return '(none)'
      if (typeof val[0] === 'object') return `${val.length} items`
      if (val.length <= 5) return val.join('\n')
      return `${val.length} items`
    }
    return String(val)
  }
  
  const isNumeric = typeof change.oldValue === 'number' && typeof change.newValue === 'number'
  const isTextChange = change.field === 'bodyText' || change.field === 'title' || change.field === 'h1' || change.field === 'metaDescription'
  
  // For text changes, compute inline diff
  const inlineDiff = isTextChange && change.changeType === 'modified' 
    ? computeInlineDiff(String(change.oldValue || ''), String(change.newValue || ''))
    : null
  
  return (
    <div className={`rounded-lg border-2 ${borderColor} ${bgColor} overflow-hidden`}>
      {/* Header */}
      <div className={`px-4 py-2 ${headerBg} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className={`text-sm font-medium ${textColor}`}>{label}</span>
        </div>
        <Badge 
          className={`text-xs ${
            change.changeType === 'added' 
              ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200' 
              : change.changeType === 'removed'
                ? 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200'
                : 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200'
          }`}
        >
          {change.changeType}
        </Badge>
      </div>
      
      {/* Content */}
      <div className="p-4">
        {isNumeric && (
          <div className="flex items-center gap-4 text-lg font-mono">
            <span className="text-red-600 dark:text-red-400">{formatValue(change.oldValue)}</span>
            <span className="text-neutral-400">→</span>
            <span className="text-green-600 dark:text-green-400">{formatValue(change.newValue)}</span>
            {typeof change.oldValue === 'number' && typeof change.newValue === 'number' && (
              <span className={`text-sm ${change.newValue > change.oldValue ? 'text-green-600' : 'text-red-600'}`}>
                ({change.newValue > change.oldValue ? '+' : ''}{change.newValue - change.oldValue})
              </span>
            )}
          </div>
        )}
        
        {/* Inline diff for text changes */}
        {inlineDiff && (
          <div className="space-y-3">
            {/* Inline highlighted diff */}
            <div className="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
              <span className="font-mono text-sm">
                {inlineDiff.map((seg, idx) => {
                  if (seg.type === 'same') {
                    return <span key={idx} className="text-neutral-700 dark:text-neutral-300">{seg.text}</span>
                  }
                  if (seg.type === 'removed') {
                    return (
                      <span key={idx} className="bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 line-through px-1 rounded mx-0.5">
                        {seg.text}
                      </span>
                    )
                  }
                  if (seg.type === 'added') {
                    return (
                      <span key={idx} className="bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 px-1 rounded mx-0.5">
                        {seg.text}
                      </span>
                    )
                  }
                  return null
                })}
              </span>
            </div>
          </div>
        )}
        
        {/* Regular modified display for non-text fields */}
        {!isNumeric && !inlineDiff && change.changeType === 'modified' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Before</div>
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded text-sm text-red-800 dark:text-red-200 font-mono whitespace-pre-wrap break-all">
                {formatValue(change.oldValue)}
              </div>
            </div>
            <div>
              <div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">After</div>
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded text-sm text-green-800 dark:text-green-200 font-mono whitespace-pre-wrap break-all">
                {formatValue(change.newValue)}
              </div>
            </div>
          </div>
        )}
        
        {!isNumeric && change.changeType === 'added' && (
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded text-sm text-green-800 dark:text-green-200 font-mono whitespace-pre-wrap break-all">
            {formatValue(change.newValue)}
          </div>
        )}
        
        {!isNumeric && change.changeType === 'removed' && (
          <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded text-sm text-red-800 dark:text-red-200 font-mono line-through whitespace-pre-wrap break-all">
            {formatValue(change.oldValue)}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Technical Details - collapsible section for raw field changes
 */
function TechnicalDetails({ changes }: { changes: FieldChange[] }) {
  const [expanded, setExpanded] = useState(false)
  
  // Filter out noisy/redundant changes
  const technicalChanges = changes.filter(c => 
    c.field !== 'sections' && 
    c.field !== 'bodyText' &&
    c.field !== 'headings'
  )
  
  if (technicalChanges.length === 0) return null
  
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-neutral-400" />
          <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            Technical Details
          </span>
          <Badge variant="secondary" className="text-xs">
            {technicalChanges.length} field{technicalChanges.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        <div className="text-neutral-400">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>
      
      {expanded && (
        <div className="p-4 space-y-3 bg-neutral-50/50 dark:bg-neutral-900/50">
          {technicalChanges.map((change, idx) => (
            <TechnicalChangeRow key={`${change.field}-${idx}`} change={change} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Single row for technical change
 */
function TechnicalChangeRow({ change }: { change: FieldChange }) {
  const getLabel = (field: string) => {
    const labels: Record<string, string> = {
      'title': 'Title',
      'h1': 'H1 Heading',
      'metaDescription': 'Meta Description',
      'wordCount': 'Word Count',
      'images': 'Images',
      'links': 'Links',
    }
    return labels[field] || field
  }
  
  const formatVal = (val: unknown): string => {
    if (val === null || val === undefined) return '(empty)'
    if (typeof val === 'number') return val.toLocaleString()
    if (typeof val === 'string') return val || '(empty)'
    if (Array.isArray(val)) {
      if (val.length === 0) return '(none)'
      if (typeof val[0] === 'object') return `${val.length} items`
      return `${val.length} items`
    }
    return String(val)
  }
  
  const isNumeric = typeof change.oldValue === 'number' && typeof change.newValue === 'number'
  
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700">
      <div className="flex items-center gap-2">
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          {getLabel(change.field)}
        </span>
        <Badge 
          className={`text-xs ${
            change.changeType === 'added' 
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
              : change.changeType === 'removed'
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
          }`}
        >
          {change.changeType}
        </Badge>
      </div>
      <div className="text-sm text-neutral-500 dark:text-neutral-400 text-right max-w-[200px] truncate">
        {isNumeric ? (
          <>
            <span className="text-red-500">{formatVal(change.oldValue)}</span>
            <span className="mx-2">→</span>
            <span className="text-green-500">{formatVal(change.newValue)}</span>
          </>
        ) : (
          <>
            {change.changeType === 'removed' && formatVal(change.oldValue)}
            {change.changeType === 'added' && formatVal(change.newValue)}
            {change.changeType === 'modified' && (
              <>
                <span className="text-red-500">{formatVal(change.oldValue)}</span>
                <span className="mx-2">→</span>
                <span className="text-green-500">{formatVal(change.newValue)}</span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function ChangeDiffViewer({ fieldChanges, blockChanges, textChanges, summary }: ChangeDiffViewerProps) {
  const hasBlockChanges = blockChanges && blockChanges.length > 0
  const hasTextChanges = textChanges && textChanges.length > 0
  const hasFieldChanges = fieldChanges && fieldChanges.length > 0
  const hasAnyChanges = hasFieldChanges || hasBlockChanges || hasTextChanges
  
  if (!hasAnyChanges) {
    return (
      <div className="text-center py-8 text-neutral-500">
        <RefreshCw className="h-8 w-8 mx-auto mb-2 text-neutral-300 dark:text-neutral-600" />
        <p className="text-sm">No changes detected</p>
      </div>
    )
  }
  
  // Generate smart summary
  const smartSummary = summary || generateSummary(fieldChanges, blockChanges)
  
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-2 pb-3 border-b border-neutral-200 dark:border-neutral-700">
        <FileText className="h-4 w-4 text-neutral-400" />
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {smartSummary}
        </span>
      </div>
      
      {/* Text Changes - Element-level inline diffs (most granular) */}
      {hasTextChanges && (
        <TextChangeDiff changes={textChanges} />
      )}
      
      {/* Block Changes - Side-by-side card previews */}
      {hasBlockChanges && (
        <BlockChangeList changes={blockChanges} />
      )}
      
      {/* Field Changes - Show prominently when no block/text data available */}
      {!hasBlockChanges && !hasTextChanges && hasFieldChanges && (
        <FieldChangesList changes={fieldChanges} />
      )}
      
      {/* Technical Details - Only show as collapsed section when we have block/text changes */}
      {(hasBlockChanges || hasTextChanges) && hasFieldChanges && (
        <TechnicalDetails changes={fieldChanges} />
      )}
    </div>
  )
}

// Compact summary component for the header
interface ChangeSummaryBadgeProps {
  fieldChanges: FieldChange[]
  blockChanges?: BlockChange[]
  textChanges?: TextChange[]
  changeStatus?: string
}

export function ChangeSummaryBadge({ fieldChanges, blockChanges, textChanges, changeStatus }: ChangeSummaryBadgeProps) {
  const hasBlockChanges = blockChanges && blockChanges.length > 0
  const hasTextChanges = textChanges && textChanges.length > 0
  const hasFieldChanges = fieldChanges && fieldChanges.length > 0
  
  if (!hasFieldChanges && !hasBlockChanges && !hasTextChanges) {
    if (changeStatus === 'NO_CHANGE') {
      return <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">No changes</Badge>
    }
    return null
  }
  
  const parts: string[] = []
  
  // Count text changes (most granular)
  if (hasTextChanges) {
    const textModified = textChanges.filter(c => c.type === 'modified').length
    const textAdded = textChanges.filter(c => c.type === 'added').length
    const textRemoved = textChanges.filter(c => c.type === 'removed').length
    
    if (textModified > 0) parts.push(`${textModified} text changed`)
    if (textAdded > 0) parts.push(`+${textAdded} text`)
    if (textRemoved > 0) parts.push(`-${textRemoved} text`)
  }
  
  // Count block changes
  if (hasBlockChanges && parts.length === 0) {
    const modified = blockChanges.filter(c => c.type === 'modified').length
    const added = blockChanges.filter(c => c.type === 'added').length
    const removed = blockChanges.filter(c => c.type === 'removed').length
    
    if (modified > 0) parts.push(`${modified} changed`)
    if (added > 0) parts.push(`+${added}`)
    if (removed > 0) parts.push(`-${removed}`)
  }
  
  if (parts.length === 0 && hasFieldChanges) {
    // Fall back to field count
    const modified = fieldChanges.filter(c => c.changeType === 'modified').length
    const addedFields = fieldChanges.filter(c => c.changeType === 'added').length
    const removedFields = fieldChanges.filter(c => c.changeType === 'removed').length
    
    if (modified > 0) parts.push(`${modified} modified`)
    if (addedFields > 0) parts.push(`${addedFields} added`)
    if (removedFields > 0) parts.push(`${removedFields} removed`)
  }
  
  return (
    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
      {parts.join(', ')}
    </Badge>
  )
}
