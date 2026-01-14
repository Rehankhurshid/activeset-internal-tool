"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Plus, Minus, RefreshCw, FileText, Hash, Type, AlignLeft, Image, Link2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { FieldChange } from "@/types"

interface ChangeDiffViewerProps {
  fieldChanges: FieldChange[]
  summary?: string
}

function getFieldIcon(field: string) {
  switch (field.toLowerCase()) {
    case 'title':
      return <Type className="h-3.5 w-3.5" />
    case 'h1':
      return <Hash className="h-3.5 w-3.5" />
    case 'metadescription':
      return <AlignLeft className="h-3.5 w-3.5" />
    case 'wordcount':
      return <FileText className="h-3.5 w-3.5" />
    case 'bodytext':
      return <FileText className="h-3.5 w-3.5" />
    case 'images':
      return <Image className="h-3.5 w-3.5" />
    case 'links':
      return <Link2 className="h-3.5 w-3.5" />
    default:
      return <FileText className="h-3.5 w-3.5" />
  }
}

function getFieldLabel(field: string) {
  const labels: Record<string, string> = {
    'title': 'Title',
    'h1': 'H1 Heading',
    'metaDescription': 'Meta Description',
    'wordCount': 'Word Count',
    'bodyText': 'Body Text',
    'images': 'Images',
    'links': 'Links',
    'headings': 'Headings'
  }
  return labels[field] || field
}

function getChangeTypeBadge(changeType: 'added' | 'removed' | 'modified') {
  switch (changeType) {
    case 'added':
      return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">added</Badge>
    case 'removed':
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs">removed</Badge>
    case 'modified':
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">modified</Badge>
  }
}

function formatValue(value: string | number | string[] | object[] | null): string {
  if (value === null || value === undefined) return '(empty)'
  if (typeof value === 'number') return value.toLocaleString()
  if (typeof value === 'string') return value || '(empty)'
  if (Array.isArray(value)) {
    if (value.length === 0) return '(none)'
    // Check if it's an array of objects (like images or links)
    if (typeof value[0] === 'object') {
      return `${value.length} items`
    }
    return value.join(', ')
  }
  return JSON.stringify(value)
}

function computePercentChange(oldVal: number, newVal: number): string {
  if (oldVal === 0) return newVal > 0 ? '+∞%' : '0%'
  const percent = ((newVal - oldVal) / oldVal) * 100
  const sign = percent >= 0 ? '+' : ''
  return `${sign}${percent.toFixed(1)}%`
}

interface FieldChangeCardProps {
  change: FieldChange
  defaultExpanded?: boolean
}

function FieldChangeCard({ change, defaultExpanded = false }: FieldChangeCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const isNumeric = typeof change.oldValue === 'number' && typeof change.newValue === 'number'
  const isLongText = typeof change.oldValue === 'string' && (change.oldValue?.length || 0) > 100
  
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-neutral-500">
            {getFieldIcon(change.field)}
          </div>
          <span className="font-medium text-neutral-900 dark:text-white">
            {getFieldLabel(change.field)}
          </span>
          {getChangeTypeBadge(change.changeType)}
          
          {/* Quick preview for numeric changes */}
          {isNumeric && (
            <span className="text-sm text-neutral-500 ml-2">
              {formatValue(change.oldValue)} → {formatValue(change.newValue)}
              <span className={`ml-1 ${(change.newValue as number) > (change.oldValue as number) ? 'text-green-600' : 'text-red-600'}`}>
                ({computePercentChange(change.oldValue as number, change.newValue as number)})
              </span>
            </span>
          )}
        </div>
        
        <div className="text-neutral-400">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>
      
      {/* Expanded content */}
      {expanded && (
        <div className="p-4 space-y-3">
          {/* Before/After display */}
          <div className="grid grid-cols-2 gap-3">
            {/* Before */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                <Minus className="h-3 w-3" />
                Before
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md p-3">
                <pre className={`text-sm text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words ${isLongText ? 'max-h-40 overflow-y-auto' : ''}`}>
                  {formatValue(change.oldValue)}
                </pre>
              </div>
            </div>
            
            {/* After */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
                <Plus className="h-3 w-3" />
                After
              </div>
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-md p-3">
                <pre className={`text-sm text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words ${isLongText ? 'max-h-40 overflow-y-auto' : ''}`}>
                  {formatValue(change.newValue)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ChangeDiffViewer({ fieldChanges, summary }: ChangeDiffViewerProps) {
  const [expandAll, setExpandAll] = useState(false)
  
  if (!fieldChanges || fieldChanges.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500">
        <RefreshCw className="h-8 w-8 mx-auto mb-2 text-neutral-300 dark:text-neutral-600" />
        <p className="text-sm">No changes detected</p>
      </div>
    )
  }
  
  // Sort changes: modified first, then added, then removed
  const sortedChanges = [...fieldChanges].sort((a, b) => {
    const order = { modified: 0, added: 1, removed: 2 }
    return order[a.changeType] - order[b.changeType]
  })
  
  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-900 dark:text-white">
            {fieldChanges.length} field{fieldChanges.length !== 1 ? 's' : ''} changed
          </span>
          {summary && (
            <span className="text-sm text-neutral-500">
              — {summary}
            </span>
          )}
        </div>
        <button
          onClick={() => setExpandAll(!expandAll)}
          className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
        >
          {expandAll ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      
      {/* Change cards */}
      <div className="space-y-2">
        {sortedChanges.map((change, idx) => (
          <FieldChangeCard 
            key={`${change.field}-${idx}`} 
            change={change} 
            defaultExpanded={expandAll || idx === 0}
          />
        ))}
      </div>
    </div>
  )
}

// Compact summary component for the metrics row
interface ChangeSummaryBadgeProps {
  fieldChanges: FieldChange[]
  changeStatus?: string
}

export function ChangeSummaryBadge({ fieldChanges, changeStatus }: ChangeSummaryBadgeProps) {
  if (!fieldChanges || fieldChanges.length === 0) {
    if (changeStatus === 'NO_CHANGE') {
      return <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">No changes</Badge>
    }
    return null
  }
  
  const added = fieldChanges.filter(c => c.changeType === 'added').length
  const removed = fieldChanges.filter(c => c.changeType === 'removed').length
  const modified = fieldChanges.filter(c => c.changeType === 'modified').length
  
  const parts: string[] = []
  if (modified > 0) parts.push(`${modified} modified`)
  if (added > 0) parts.push(`${added} added`)
  if (removed > 0) parts.push(`${removed} removed`)
  
  return (
    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
      {parts.join(', ')}
    </Badge>
  )
}
