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

interface ScanSitemapDialogProps {
    projectId: string;
    onScanComplete?: () => void;
    /** When true, an empty sitemap field runs `/api/scan-sitemap` with Webflow API fallback. */
    hasWebflowSync?: boolean;
    savedSitemapUrl?: string;
}

interface ScanResult {
    count: number;
    added: Array<{ url: string }>;
    removed: number;
    totalFound: number;
    localesDetected?: string[];
    source?: 'sitemap' | 'webflow';
    usedWebflowFallback?: boolean;
    error?: string;
}

export function ScanSitemapDialog({
    projectId,
    onScanComplete,
    hasWebflowSync = false,
    savedSitemapUrl,
}: ScanSitemapDialogProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [sitemapUrl, setSitemapUrl] = useState(savedSitemapUrl ?? "")

    const handleScan = async () => {
        const trimmed = sitemapUrl.trim()
        if (!trimmed && !hasWebflowSync) {
            toast.error("Enter a sitemap URL or connect Webflow on the Webflow Pages tab")
            return
        }

        setLoading(true)
        try {
            const response = await fetch('/api/scan-sitemap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    sitemapUrl: trimmed || undefined,
                    useWebflowFallback: hasWebflowSync,
                }),
            })

            const data: ScanResult = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to scan sitemap')
            }

            if (data.count > 0 || data.totalFound > 0) {
                const localeInfo = data.localesDetected?.length 
                    ? ` (${data.localesDetected.length} languages detected)`
                    : ''
                const sourceLabel =
                    data.source === 'webflow'
                        ? data.usedWebflowFallback
                            ? 'Webflow fallback'
                            : 'Webflow'
                        : 'Sitemap'
                toast.success(`${sourceLabel}: ${data.totalFound} pages (${data.count} new)${localeInfo}`)
            } else {
                toast.info("No new pages found")
            }

            setOpen(false)
            setSitemapUrl("")
            onScanComplete?.()
            
            // Reload to show updated pages
            window.location.reload()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to scan sitemap')
        } finally {
            setLoading(false)
        }
    }

    return (
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
                        Import pages from a live sitemap.xml, or leave the URL empty to sync from Webflow
                        (staging sitemap or page list) when the project is connected with an API token.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="sitemap-url">Sitemap URL {hasWebflowSync ? '(optional)' : ''}</Label>
                        <Input
                            id="sitemap-url"
                            placeholder={
                                hasWebflowSync
                                    ? 'Leave empty to sync from Webflow'
                                    : 'https://example.com/sitemap.xml'
                            }
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
                        {hasWebflowSync && !sitemapUrl.trim() ? 'Sync from Webflow' : 'Start Scan'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
