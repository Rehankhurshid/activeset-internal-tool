'use client';

import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Upload, X } from 'lucide-react';
import { projectsService } from '@/services/database';

interface ProjectLogoDialogProps {
    projectId: string;
    currentLogoUrl?: string;
    autoFetchUrl?: string;
    trigger: React.ReactNode;
}

export function ProjectLogoDialog({ projectId, currentLogoUrl, autoFetchUrl, trigger }: ProjectLogoDialogProps) {
    const [open, setOpen] = React.useState(false);
    const [url, setUrl] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const fileRef = React.useRef<HTMLInputElement>(null);

    const save = async (logoUrl: string | null) => {
        setBusy(true);
        setError(null);
        try {
            await projectsService.updateProjectLogo(projectId, logoUrl);
            setUrl('');
            setOpen(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save logo');
        } finally {
            setBusy(false);
        }
    };

    const handleAutoFetch = async () => {
        if (!autoFetchUrl) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/favicon?url=${encodeURIComponent(autoFetchUrl)}`);
            if (!res.ok) throw new Error();
            const data = (await res.json()) as { url?: string };
            if (!data.url) throw new Error();
            await projectsService.updateProjectLogo(projectId, data.url);
            setOpen(false);
        } catch {
            setError('Could not fetch icon');
        } finally {
            setBusy(false);
        }
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setError('Please choose an image file');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const dataUrl = await compressImage(file, 128);
            await save(dataUrl);
        } catch {
            setError('Could not read that image');
            setBusy(false);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="start" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-2">
                    <div className="text-xs font-medium text-foreground/90 mb-1">Project logo</div>

                    {autoFetchUrl && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-8 text-xs justify-start"
                            onClick={handleAutoFetch}
                            disabled={busy}
                        >
                            <Sparkles className="w-3.5 h-3.5 mr-2" />
                            Fetch from website
                        </Button>
                    )}

                    <div className="flex gap-1.5">
                        <Input
                            type="url"
                            placeholder="Paste image URL"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="h-8 text-xs"
                            disabled={busy}
                        />
                        <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 text-xs px-3 shrink-0"
                            onClick={() => save(url.trim())}
                            disabled={!url.trim() || busy}
                        >
                            Use
                        </Button>
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs justify-start"
                        onClick={() => fileRef.current?.click()}
                        disabled={busy}
                    >
                        <Upload className="w-3.5 h-3.5 mr-2" />
                        Upload from device
                    </Button>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFile}
                    />

                    {currentLogoUrl && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full h-7 text-[11px] text-destructive hover:text-destructive justify-start"
                            onClick={() => save(null)}
                            disabled={busy}
                        >
                            <X className="w-3 h-3 mr-1.5" />
                            Remove logo
                        </Button>
                    )}

                    {error && <p className="text-[11px] text-destructive pt-1">{error}</p>}
                </div>
            </PopoverContent>
        </Popover>
    );
}

async function compressImage(file: File, maxDim: number): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('Image load failed'));
        i.src = dataUrl;
    });
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * ratio));
    const h = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
}
