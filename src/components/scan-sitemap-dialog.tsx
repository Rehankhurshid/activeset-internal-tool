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
}

interface ScanResult {
    count: number;
    added: Array<{ url: string }>;
    removed: number;
    totalFound: number;
    localesDetected?: string[];
}

export function ScanSitemapDialog({ projectId, onScanComplete }: ScanSitemapDialogProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [sitemapUrl, setSitemapUrl] = useState("")

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
                const localeInfo = data.localesDetected?.length 
                    ? ` (${data.localesDetected.length} languages detected)`
                    : ''
                toast.success(`Found ${data.totalFound} pages (${data.count} new)${localeInfo}`)
            } else {
                toast.info("No new pages found in sitemap")
            }

            setOpen(false)
            setSitemapUrl("")
            onScanComplete?.()
            
            // Reload to show updated pages
            window.location.reload()
        } catch (error: any) {
            toast.error(error.message)
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
                        Enter the URL of your sitemap.xml to automatically import pages.
                        You can mark folders as CMS or Static from the dashboard after scanning.
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
    )
}
