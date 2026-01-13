import { useMemo, useState } from "react"
import { PageTypeRule } from "@/types"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Database, File, FolderOpen } from "lucide-react"

export type DetectedPattern = {
  id: string
  pattern: string
  examples: string[]
  count: number
}

function newId(prefix: string): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      const uuid = (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.()
      if (uuid) return `${prefix}_${uuid}`
    }
  } catch {
    // ignore
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function toPathname(url: string): string {
  try {
    return new URL(url).pathname || "/"
  } catch {
    // Might already be a pathname
    if (url.startsWith("/")) return url
    return `/${url}`
  }
}

/**
 * Detect folder patterns from URLs.
 * Simplified logic: Extract the first non-locale path segment as a folder pattern.
 * Ignores root-level pages.
 */
export function detectPatterns(urls: string[]): DetectedPattern[] {
  const paths = urls.map(toPathname).filter(Boolean)
  if (paths.length === 0) return []

  // Group by first non-locale segment
  const folderMap = new Map<string, string[]>()
  
  for (const path of paths) {
    const segments = path.split("/").filter(Boolean)
    
    // Filter out locale segments (e.g., es-mx, pt-br, de, fr-ca)
    const nonLocaleSegments = segments.filter(seg =>
      !/^[a-z]{2}(-[a-z]{2,3})?$/i.test(seg)
    )
    
    // Skip root-level pages (0 or 1 non-locale segment)
    if (nonLocaleSegments.length <= 1) continue
    
    // Get the first folder segment
    const folder = nonLocaleSegments[0]
    if (!folder) continue
    
    const pattern = `/${folder}/*`
    if (!folderMap.has(pattern)) {
      folderMap.set(pattern, [])
    }
    folderMap.get(pattern)!.push(path)
  }

  // Convert to DetectedPattern array
  const patterns: DetectedPattern[] = []
  
  for (const [pattern, matchedPaths] of folderMap.entries()) {
    // Only show folders with 2+ pages
    if (matchedPaths.length < 2) continue
    
    patterns.push({
      id: newId(`folder_${pattern.replace(/[^a-z0-9]/gi, '_')}`),
      pattern,
      examples: matchedPaths.slice(0, 3),
      count: matchedPaths.length,
    })
  }

  // Sort: most pages first
  return patterns.sort((a, b) => b.count - a.count)
}

interface PageTypeReviewDialogProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  detectedPatterns: DetectedPattern[]
  existingRules: PageTypeRule[]
  onSaveRules: (rules: PageTypeRule[]) => void
}

export function PageTypeReviewDialog({
  isOpen,
  onClose,
  projectId,
  detectedPatterns,
  existingRules,
  onSaveRules,
}: PageTypeReviewDialogProps) {
  // Filter out patterns that already have rules
  const existingPatternSet = useMemo(() => new Set(existingRules.map((r) => r.pattern)), [existingRules])

  const usablePatterns = useMemo(() => {
    return detectedPatterns.filter((p) => !existingPatternSet.has(p.pattern))
  }, [detectedPatterns, existingPatternSet])

  // Track which patterns are marked as CMS (checked = CMS, unchecked = Static)
  const [markedAsCMS, setMarkedAsCMS] = useState<Set<string>>(new Set())

  const toggleCMS = (patternId: string) => {
    setMarkedAsCMS((prev) => {
      const next = new Set(prev)
      if (next.has(patternId)) {
        next.delete(patternId)
      } else {
        next.add(patternId)
      }
      return next
    })
  }

  const save = () => {
    const now = new Date().toISOString()
    
    // Create rules for all patterns - CMS if checked, Static if unchecked
    const newRules: PageTypeRule[] = usablePatterns.map((p) => ({
      pattern: p.pattern,
      pageType: markedAsCMS.has(p.id) ? 'collection' : 'static',
      createdAt: now,
    }))

    const allRules = [...existingRules, ...newRules]

    // Persist to localStorage
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`pageTypeRules:${projectId}`, JSON.stringify(allRules))
      }
    } catch {
      // ignore
    }

    onSaveRules(allRules)
  }

  const cmsCount = markedAsCMS.size
  const staticCount = usablePatterns.length - cmsCount

  return (
    <Dialog open={isOpen} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review Folder Patterns</DialogTitle>
          <DialogDescription>
            We detected folder patterns in your pages. Check the boxes to mark folders as <strong>CMS</strong> (collection pages). 
            Unchecked folders will be treated as <strong>Static</strong> pages.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-cyan-600" />
            <span>CMS: {cmsCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <File className="h-4 w-4 text-slate-600" />
            <span>Static: {staticCount}</span>
          </div>
        </div>

        <ScrollArea className="max-h-[50vh] pr-4">
          <div className="space-y-3">
            {usablePatterns.length === 0 ? (
              <div className="rounded-md border p-6 text-center text-muted-foreground">
                No new folder patterns to review. All folders have been categorized.
              </div>
            ) : (
              usablePatterns.map((p) => {
                const isCMS = markedAsCMS.has(p.id)
                return (
                  <div 
                    key={p.id} 
                    className={`rounded-md border p-4 cursor-pointer transition-colors ${
                      isCMS 
                        ? 'bg-cyan-500/10 border-cyan-500/30' 
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => toggleCMS(p.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox 
                        checked={isCMS} 
                        onCheckedChange={() => toggleCMS(p.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">{p.pattern}</span>
                          <Badge variant="secondary" className="text-xs">
                            {p.count} pages
                          </Badge>
                          {isCMS ? (
                            <Badge className="text-xs bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/30">
                              CMS
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Static
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground truncate">
                          {p.examples.join(', ')}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={usablePatterns.length === 0}>
            Save Rules ({usablePatterns.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
