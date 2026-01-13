import { useEffect, useMemo, useState } from "react"
import { PageTypeRule } from "@/types"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface PageTypeRulesDialogProps {
  projectId: string
  rules: PageTypeRule[]
  onRulesChange: (rules: PageTypeRule[]) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DEFAULT_MATCH_TYPE: PageTypeRule["matchType"] = "glob"

function newRuleId(): string {
  try {
    // modern browsers
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      const uuid = (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.()
      if (uuid) return uuid
    }
  } catch {
    // ignore
  }
  return `rule_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function normalizeRule(rule: PageTypeRule): PageTypeRule {
  return {
    ...rule,
    name: rule.name?.trim() || "Untitled rule",
    pattern: rule.pattern?.trim() || "",
    enabled: rule.enabled ?? true,
    matchType: rule.matchType ?? DEFAULT_MATCH_TYPE,
    pageType: rule.pageType ?? "unknown",
  }
}

export function PageTypeRulesDialog({ projectId, rules, onRulesChange, open, onOpenChange }: PageTypeRulesDialogProps) {
  const [draftRules, setDraftRules] = useState<PageTypeRule[]>(rules)

  useEffect(() => {
    setDraftRules(rules)
  }, [rules, open])

  const canSave = useMemo(() => {
    const cleaned = draftRules.map(normalizeRule)
    if (cleaned.some((r) => r.pattern.length === 0)) return false
    return true
  }, [draftRules])

  const addRule = () => {
    const now = new Date().toISOString()
    setDraftRules((prev) => [
      ...prev,
      {
        id: newRuleId(),
        name: "New rule",
        pattern: "",
        matchType: DEFAULT_MATCH_TYPE,
        pageType: "unknown",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ])
  }

  const updateRule = (id: string, patch: Partial<PageTypeRule>) => {
    const now = new Date().toISOString()
    setDraftRules((prev) =>
      prev.map((r) => (r.id === id ? normalizeRule({ ...r, ...patch, updatedAt: now }) : r)),
    )
  }

  const deleteRule = (id: string) => {
    setDraftRules((prev) => prev.filter((r) => r.id !== id))
  }

  const handleSave = () => {
    const cleaned = draftRules.map(normalizeRule)
    onRulesChange(cleaned)

    // Persist to localStorage (no backend API yet)
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`pageTypeRules:${projectId}`, JSON.stringify(cleaned))
      }
    } catch {
      // ignore
    }

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Page Type Rules</DialogTitle>
          <DialogDescription>
            Define URL patterns to classify pages (for example, treat CMS item pages differently from static pages).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            Rules are currently stored locally in this browser for project <span className="font-mono">{projectId}</span>.
          </div>
          <Button onClick={addRule}>Add rule</Button>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">On</TableHead>
                <TableHead className="min-w-[180px]">Name</TableHead>
                <TableHead className="min-w-[280px]">Pattern</TableHead>
                <TableHead className="w-[140px]">Match</TableHead>
                <TableHead className="w-[160px]">Page type</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {draftRules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No rules yet. Add one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                draftRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={rule.enabled} onCheckedChange={(v) => updateRule(rule.id, { enabled: v })} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input value={rule.name} onChange={(e) => updateRule(rule.id, { name: e.target.value })} />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Label className="sr-only">Pattern</Label>
                        <Input
                          placeholder="e.g. /blog/* or ^https://example.com/case-studies/"
                          value={rule.pattern}
                          onChange={(e) => updateRule(rule.id, { pattern: e.target.value })}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select value={rule.matchType} onValueChange={(v) => updateRule(rule.id, { matchType: v as any })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="glob">Glob</SelectItem>
                          <SelectItem value="contains">Contains</SelectItem>
                          <SelectItem value="regex">Regex</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={rule.pageType} onValueChange={(v) => updateRule(rule.id, { pageType: v as any })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unknown">Unknown</SelectItem>
                          <SelectItem value="static">Static</SelectItem>
                          <SelectItem value="collection">CMS (collection)</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" onClick={() => deleteRule(rule.id)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            Save rules
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

