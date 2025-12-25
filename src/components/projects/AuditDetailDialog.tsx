import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';

interface AuditDetailDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    auditResult: any; // Type strictly later
    linkTitle: string;
    linkUrl: string;
}

export function AuditDetailDialog({ isOpen, onOpenChange, auditResult, linkTitle, linkUrl }: AuditDetailDialogProps) {
    const score = auditResult?.score || 0;
    const categories = auditResult?.categories || { spelling: {}, seo: {}, technical: {} };
    const lastRun = auditResult?.lastRun;

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
            case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
            default: return <Info className="h-4 w-4 text-blue-500" />;
        }
    };

    if (!auditResult) {
        return (
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{linkTitle}</DialogTitle>
                        <DialogDescription>{linkUrl}</DialogDescription>
                    </DialogHeader>
                    <div className="py-8 text-center space-y-3">
                        <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                            <Info className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold text-lg">No Audit Data Yet</h3>
                        <p className="text-sm text-muted-foreground">
                            The widget hasn't run on this page yet. Visit the page to capture audit data suitable for sync.
                        </p>
                        <p className="text-xs text-muted-foreground/70 pt-2">
                            (Ensure widget.js is deployed and you reload the target page)
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <div className="flex items-center justify-between mr-8">
                        <DialogTitle>{linkTitle}</DialogTitle>
                        <Badge variant={score >= 90 ? 'default' : score >= 70 ? 'secondary' : 'destructive'} className="text-sm">
                            Score: {score}
                        </Badge>
                    </div>
                    <DialogDescription className="truncate">{linkUrl}</DialogDescription>
                    <div className="text-xs text-muted-foreground">
                        Scanned: {new Date(lastRun).toLocaleString()}
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1 pr-4">
                    <Tabs defaultValue="spelling" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="spelling">Spelling & Copy</TabsTrigger>
                            <TabsTrigger value="seo">SEO & Meta</TabsTrigger>
                            <TabsTrigger value="technical">Technical</TabsTrigger>
                        </TabsList>

                        {/* Spelling Content */}
                        <TabsContent value="spelling" className="space-y-4 pt-4">
                            <div className="flex items-center gap-2 mb-2">
                                {getStatusIcon(categories.spelling.status)}
                                <h3 className="font-semibold">Spelling Check</h3>
                            </div>

                            {categories.spelling.issues && categories.spelling.issues.length > 0 ? (
                                <div className="grid gap-2">
                                    {categories.spelling.issues.map((issue: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between p-2 border rounded text-sm">
                                            <span className="font-medium text-red-500">"{issue.word}"</span>
                                            <span className="text-muted-foreground text-xs">{issue.message || 'Possible typo'}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 border border-dashed rounded text-center text-muted-foreground">
                                    No spelling issues found.
                                </div>
                            )}
                        </TabsContent>

                        {/* SEO Content */}
                        <TabsContent value="seo" className="space-y-4 pt-4">
                            <div className="flex items-center gap-2 mb-2">
                                {getStatusIcon(categories.seo.status)}
                                <h3 className="font-semibold">SEO Essentials</h3>
                            </div>
                            <div className="space-y-3">
                                {categories.seo.issues && categories.seo.issues.map((item: any, i: number) => (
                                    <div key={i} className="p-3 border rounded bg-muted/20">
                                        <div className="font-medium text-sm mb-1">{item.check}</div>
                                        <div className="text-xs text-muted-foreground break-all">{item.value || 'Missing'}</div>
                                    </div>
                                ))}
                            </div>
                        </TabsContent>

                        {/* Technical Content */}
                        <TabsContent value="technical" className="space-y-4 pt-4">
                            <div className="flex items-center gap-2 mb-2">
                                {getStatusIcon(categories.technical.status)}
                                <h3 className="font-semibold">Technical Health</h3>
                            </div>
                            <div className="space-y-3">
                                {categories.technical.issues && categories.technical.issues.map((item: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between p-3 border rounded">
                                        <span className="text-sm">{item.metric}</span>
                                        <Badge variant="outline">{item.value}</Badge>
                                    </div>
                                ))}
                            </div>
                        </TabsContent>
                    </Tabs>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
