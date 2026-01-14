"use client"

import { useState, useEffect } from "react"
import { Eye, ExternalLink, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface HtmlPreviewProps {
  projectId: string
  linkId: string
  url: string
  currentHtml?: string // Optional: if we have it in memory
}

type ViewMode = 'current' | 'previous'

export function HtmlPreview({ projectId, linkId, url, currentHtml }: HtmlPreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('current')
  const [fetchedCurrentHtml, setFetchedCurrentHtml] = useState<string | null>(null)
  const [previousHtml, setPreviousHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasFetched, setHasFetched] = useState(false)

  // Fetch both current and previous HTML on mount
  useEffect(() => {
    if (!hasFetched && !loading) {
      fetchHtmlVersions()
    }
  }, [hasFetched])

  const fetchHtmlVersions = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/audit-logs/previous?projectId=${projectId}&linkId=${linkId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch page versions')
      }
      const data = await response.json()
      
      // Set current (most recent scan)
      if (data.current?.htmlSource) {
        setFetchedCurrentHtml(data.current.htmlSource)
      }
      
      // Set previous (second most recent scan)
      if (data.previous?.htmlSource) {
        setPreviousHtml(data.previous.htmlSource)
      }
      
      setHasFetched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load page versions')
    } finally {
      setLoading(false)
    }
  }

  // Use prop if provided, otherwise use fetched
  const effectiveCurrentHtml = currentHtml || fetchedCurrentHtml

  // Sanitize HTML for safe iframe rendering
  const sanitizeHtml = (html: string): string => {
    // Remove scripts and event handlers for security
    let sanitized = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/\son\w+="[^"]*"/gi, '')
      .replace(/\son\w+='[^']*'/gi, '')
      
    // Add base tag to fix relative URLs
    const baseTag = `<base href="${new URL(url).origin}" target="_blank">`
    if (sanitized.includes('<head>')) {
      sanitized = sanitized.replace('<head>', `<head>${baseTag}`)
    } else if (sanitized.includes('<html>')) {
      sanitized = sanitized.replace('<html>', `<html><head>${baseTag}</head>`)
    } else {
      sanitized = `<head>${baseTag}</head>${sanitized}`
    }
    
    return sanitized
  }

  const currentContent = effectiveCurrentHtml ? sanitizeHtml(effectiveCurrentHtml) : null
  const previousContent = previousHtml ? sanitizeHtml(previousHtml) : null

  return (
    <div className="space-y-3">
      {/* View mode tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
          <button
            onClick={() => setViewMode('current')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'current' 
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' 
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            Current
          </button>
          <button
            onClick={() => setViewMode('previous')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'previous' 
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' 
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            Previous
          </button>
        </div>
        
        <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3 mr-1" />
            Open live
          </a>
        </Button>
      </div>

      {/* Preview iframe */}
      <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden bg-white">
        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center h-[300px] text-neutral-500">
            <Loader2 className="h-8 w-8 mb-2 animate-spin text-neutral-400" />
            <p className="text-sm">Loading page versions...</p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center h-[300px] text-neutral-500">
            <AlertCircle className="h-8 w-8 mb-2 text-amber-400" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Current view */}
        {!loading && !error && viewMode === 'current' && currentContent && (
          <iframe
            srcDoc={currentContent}
            sandbox="allow-same-origin"
            className="w-full h-[500px] border-0"
            title="Current page preview"
          />
        )}
        
        {!loading && !error && viewMode === 'current' && !currentContent && (
          <div className="flex flex-col items-center justify-center h-[300px] text-neutral-500">
            <Eye className="h-8 w-8 mb-2 text-neutral-300 dark:text-neutral-600" />
            <p className="text-sm">HTML preview not available</p>
            <p className="text-xs text-neutral-400 mt-1">Run a scan to capture page content</p>
          </div>
        )}
        
        {/* Previous view */}
        {!loading && !error && viewMode === 'previous' && previousContent && (
          <iframe
            srcDoc={previousContent}
            sandbox="allow-same-origin"
            className="w-full h-[500px] border-0"
            title="Previous page preview"
          />
        )}
        
        {!loading && !error && viewMode === 'previous' && !previousContent && (
          <div className="flex flex-col items-center justify-center h-[300px] text-neutral-500">
            <Eye className="h-8 w-8 mb-2 text-neutral-300 dark:text-neutral-600" />
            <p className="text-sm">No previous version available</p>
            <p className="text-xs text-neutral-400 mt-1">A previous version will appear after the next scan</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Simpler static preview for when we have HTML in props
interface StaticHtmlPreviewProps {
  html: string
  label?: string
  url?: string
}

export function StaticHtmlPreview({ html, label, url }: StaticHtmlPreviewProps) {
  const sanitizeHtml = (rawHtml: string): string => {
    let sanitized = rawHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/\son\w+="[^"]*"/gi, '')
      .replace(/\son\w+='[^']*'/gi, '')
    
    if (url) {
      const baseTag = `<base href="${new URL(url).origin}" target="_blank">`
      if (sanitized.includes('<head>')) {
        sanitized = sanitized.replace('<head>', `<head>${baseTag}`)
      } else {
        sanitized = `<head>${baseTag}</head>${sanitized}`
      }
    }
    
    return sanitized
  }

  return (
    <div className="space-y-2">
      {label && (
        <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
          {label}
        </div>
      )}
      <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden bg-white">
        <iframe
          srcDoc={sanitizeHtml(html)}
          sandbox="allow-same-origin"
          className="w-full h-[400px] border-0"
          title={label || "HTML Preview"}
        />
      </div>
    </div>
  )
}

// Side-by-side comparison view
interface HtmlCompareViewProps {
  beforeHtml?: string
  afterHtml?: string
  url?: string
}

export function HtmlCompareView({ beforeHtml, afterHtml, url }: HtmlCompareViewProps) {
  if (!beforeHtml && !afterHtml) {
    return (
      <div className="flex items-center justify-center h-48 text-neutral-500">
        <p className="text-sm">No HTML content available for comparison</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {beforeHtml ? (
        <StaticHtmlPreview html={beforeHtml} label="Before" url={url} />
      ) : (
        <div className="flex items-center justify-center h-[400px] border border-dashed border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-400">
          <p className="text-sm">No previous version</p>
        </div>
      )}
      
      {afterHtml ? (
        <StaticHtmlPreview html={afterHtml} label="After" url={url} />
      ) : (
        <div className="flex items-center justify-center h-[400px] border border-dashed border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-400">
          <p className="text-sm">No current version</p>
        </div>
      )}
    </div>
  )
}
