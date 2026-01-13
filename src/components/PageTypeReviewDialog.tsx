import { useMemo, useState } from "react"
import { PageTypeRule } from "@/types"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"

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

function buildGlobFromPaths(paths: string[]): string | null {
  if (paths.length < 2) return null

  const segments = paths.map((p) => p.split("/").filter(Boolean))
  const maxLen = Math.max(...segments.map((s) => s.length))

  // normalize lengths
  const padded = segments.map((s) => {
    const clone = [...s]
    while (clone.length < maxLen) clone.push("")
    return clone
  })

  const out: string[] = []
  for (let i = 0; i < maxLen; i++) {
    const values = padded.map((s) => s[i]).filter((v) => v.length > 0)
    if (values.length === 0) continue
    const unique = new Set(values)

    // Heuristic: if many unique values at a position, it's likely an ID/slug.
    const shouldWildcard = unique.size > 3 || values.some((v) => /^[0-9a-f]{8,}$/i.test(v)) || values.some((v) => /^\d+$/.test(v))

    if (shouldWildcard) out.push("*")
    else out.push(values[0]!)
  }

  if (out.length === 0) return null
  // Require at least one wildcard, otherwise this is too specific to be useful
  if (!out.includes("*")) return null
  return `/${out.join("/")}`
}

export function detectPatterns(urls: string[]): DetectedPattern[] {
  const paths = urls.map(toPathname).filter(Boolean)
  if (paths.length === 0) return []

  // Group by first segment to avoid generating a single overly-broad wildcard for entire site.
  const byRoot = new Map<string, string[]>()
  for (const p of paths) {
    const segs = p.split("/").filter(Boolean)
    const root = segs[0] || ""
    byRoot.set(root, [...(byRoot.get(root) || []), p])
  }

  const patterns: DetectedPattern[] = []

  for (const [root, group] of byRoot.entries()) {
    const glob = buildGlobFromPaths(group)
    if (!glob) continue

    // Count matches within this group
    const regex = new RegExp("^" + glob.split("*").map(escapeRegex).join("[^/]+") + "$")
    const matches = group.filter((p) => regex.test(p))
    if (matches.length < 3) continue

    patterns.push({
      id: newId(`pat_${root || "root"}`),
      pattern: glob,
      examples: matches.slice(0, 5),
      count: matches.length,
    })
  }

  // Sort: most common first
  return patterns.sort((a, b) => b.count - a.count)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function defaultRuleForPattern(pattern: string): PageTypeRule {
  const now = new Date().toISOString()
  return {
    id: newId("rule"),
    name: pattern,
    pattern,
    matchType: "glob",
    pageType: "unknown",
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }
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
  const existingPatterns = useMemo(() => new Set(existingRules.map((r) => `${r.matchType}:${r.pattern}`)), [existingRules])

  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [draft, setDraft] = useState<Record<string, PageTypeRule>>({})

  const usablePatterns = useMemo(() => {
    return detectedPatterns.filter((p) => !existingPatterns.has(`glob:${p.pattern}`))
  }, [detectedPatterns, existingPatterns])

  const selectedCount = Object.values(selected).filter(Boolean).length

  const toggle = (id: string, v: boolean) => {
    setSelected((prev) => ({ ...prev, [id]: v }))
    setDraft((prev) => {
      if (!prev[id]) {
        const pat = usablePatterns.find((p) => p.id === id)
        if (!pat) return prev
        return { ...prev, [id]: defaultRuleForPattern(pat.pattern) }
      }
      return prev
    })
  }

  const updateDraft = (id: string, patch: Partial<PageTypeRule>) => {
    setDraft((prev) => {
      const current = prev[id]
      if (!current) return prev
      return { ...prev, [id]: { ...current, ...patch, updatedAt: new Date().toISOString() } }
    })
  }

  const save = () => {
    const additions = usablePatterns
      .filter((p) => selected[p.id])
      .map((p) => draft[p.id] || defaultRuleForPattern(p.pattern))
      .filter((r) => r.pattern.trim().length > 0)

    const next = [...existingRules, ...additions]

    // Persist to localStorage (no backend API yet)
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`pageTypeRules:${projectId}`, JSON.stringify(next))
      }
    } catch {
      // ignore
    }

    onSaveRules(next)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review detected URL patterns</DialogTitle>
          <DialogDescription>
            These patterns are inferred from your current page URLs. Select any patterns you want to turn into page-type rules.
          </DialogDescription>
        </DialogHeader>

        <div className="text-sm text-muted-foreground">
          Saving will store rules locally in this browser for project <span className="font-mono">{projectId}</span>.
        </div>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4">
            {usablePatterns.length === 0 ? (
              <div className="rounded-md border p-6 text-center text-muted-foreground">No new patterns detected.</div>
            ) : (
              usablePatterns.map((p) => {
                const isChecked = Boolean(selected[p.id])
                const rule = draft[p.id] || defaultRuleForPattern(p.pattern)
                return (
                  <div key={p.id} className="rounded-md border p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <Checkbox checked={isChecked} onCheckedChange={(v) => toggle(p.id, Boolean(v))} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-mono text-sm break-all">{p.pattern}</div>
                          <Badge variant="secondary">{p.count} pages</Badge>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground space-y-1">
                          {p.examples.map((ex) => (
                            <div key={ex} className="font-mono truncate" title={ex}>
                              {ex}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {isChecked && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label>Rule name</Label>
                          <Input value={rule.name} onChange={(e) => updateDraft(p.id, { name: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>Page type</Label>
                          <Select value={rule.pageType} onValueChange={(v) => updateDraft(p.id, { pageType: v as any })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unknown">Unknown</SelectItem>
                              <SelectItem value="static">Static</SelectItem>
                              <SelectItem value="collection">CMS (collection)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={save} disabled={selectedCount === 0}>
            Save {selectedCount > 0 ? `(${selectedCount})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

