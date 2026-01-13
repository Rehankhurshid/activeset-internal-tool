"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Globe } from "lucide-react"
import { toast } from "sonner"
import { PageTypeRule } from "@/types"
import { PageTypeReviewDialog, detectPatterns } from "@/components/PageTypeReviewDialog"

interface ScanSitemapDialogProps {
    projectId: string;
    existingRules?: PageTypeRule[];
    onScanComplete?: (rules?: PageTypeRule[]) => void;
}

interface ScanResult {
    count: number;
    added: Array<{ url: string }>;
    removed: number;
    totalFound: number;
}

export function ScanSitemapDialog({ projectId, existingRules = [], onScanComplete }: ScanSitemapDialogProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [sitemapUrl, setSitemapUrl] = useState("")

    // Review dialog state
    const [showReviewDialog, setShowReviewDialog] = useState(false)
    const [detectedPatterns, setDetectedPatterns] = useState<ReturnType<typeof detectPatterns>>([])
    const [localRules, setLocalRules] = useState<PageTypeRule[]>(existingRules)

    const handleScan = async () => {
        if (!sitemapUrl) {
            toast.error("Please enter a sitemap URL")
            return
        }

        setLoading(true)
        try {
            const response = await fetch('/api/scan-sitemap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, sitemapUrl })
            })

            const data: ScanResult = await response.json()

            if (!response.ok) {
                throw new Error((data as any).error || 'Failed to scan sitemap')
            }

            if (data.count > 0 || data.totalFound > 0) {
                toast.success(`Found ${data.totalFound} pages (${data.count} new)`)

                // Detect patterns from all found URLs
                const allUrls = data.added.map(l => l.url)
                if (allUrls.length > 0) {
                    const patterns = detectPatterns(allUrls)
                    if (patterns.length > 0) {
                        setDetectedPatterns(patterns)
                        setOpen(false)
                        setShowReviewDialog(true)
                        return // Don't close yet, show review dialog
                    }
                }
            } else {
                toast.info("No new pages found in sitemap")
            }

            setOpen(false)
            setSitemapUrl("")
            onScanComplete?.()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleReviewComplete = (rules: PageTypeRule[]) => {
        setLocalRules(rules)
        setShowReviewDialog(false)
        setSitemapUrl("")

        // Trigger a refresh to apply the new rules
        toast.success("Page type rules saved! Re-scanning to apply...")

        // Re-run the scan with new rules
        setTimeout(() => {
            fetch('/api/scan-sitemap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, sitemapUrl: sitemapUrl || 'refresh' })
            }).then(() => {
                window.location.reload()
            }).catch(() => {
                onScanComplete?.(rules)
            })
        }, 500)
    }

    const handleReviewClose = () => {
        setShowReviewDialog(false)
        setSitemapUrl("")
        onScanComplete?.(localRules)
    }

    return (
        <>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2">
                        <Globe className="h-4 w-4" />
                        Scan Sitemap
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Scan Sitemap</DialogTitle>
                        <DialogDescription>
                            Enter the URL of your sitemap.xml to automatically import pages.
                            After scanning, you&apos;ll review which patterns are CMS vs Static.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="sitemap-url">Sitemap URL</Label>
                            <Input
                                id="sitemap-url"
                                placeholder="https://example.com/sitemap.xml"
                                value={sitemapUrl}
                                onChange={(e) => setSitemapUrl(e.target.value)}
                                disabled={loading}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button onClick={handleScan} disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Start Scan
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <PageTypeReviewDialog
                isOpen={showReviewDialog}
                onClose={handleReviewClose}
                projectId={projectId}
                detectedPatterns={detectedPatterns}
                existingRules={localRules}
                onSaveRules={handleReviewComplete}
            />
        </>
    )
}
