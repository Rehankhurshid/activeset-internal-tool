'use client';

import React from 'react';
import { Project, ProjectLink } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, CheckCircle, Clock, ExternalLink, FileText, Layout, Search, Zap } from 'lucide-react';
import { AuditDetailDialog } from './AuditDetailDialog';

interface AuditDashboardProps {
    links: ProjectLink[];
}

export function AuditDashboard({ links }: AuditDashboardProps) {
    const [selectedLink, setSelectedLink] = React.useState<ProjectLink | null>(null);
    const [isDetailOpen, setIsDetailOpen] = React.useState(false);

    // Filter links that have actual audit data relative to the widget
    // (Assuming any link with auditResult has data)
    const auditedLinks = links.filter(link => link.auditResult);

    // Calculate Aggregate Metrics
    const totalPages = links.length;
    const scannedPages = auditedLinks.length;

    let totalScore = 0;
    let totalIssues = 0;
    let deploymentReadyCount = 0;

    auditedLinks.forEach(link => {
        totalScore += link.auditResult?.score || 0;

        // Count issues if we can parse them, or just rely on score for now
        // The current type doesn't have a flat issue count, but we can infer from categories if needed
        // For now, let's use the score to determine "issues" roughly or if we had the count in the type
        // The type has `summary` and `strengths/improvements`.
        // Let's rely on the score for the "Health" metric.

        if ((link.auditResult?.score || 0) >= 90) {
            deploymentReadyCount++;
        }
    });

    const avgScore = scannedPages > 0 ? Math.round(totalScore / scannedPages) : 0;
    const healthPercentage = scannedPages > 0 ? (deploymentReadyCount / scannedPages) * 100 : 0;

    const getScoreColor = (score: number) => {
        if (score >= 90) return 'text-green-500';
        if (score >= 70) return 'text-yellow-500';
        return 'text-red-500';
    };

    const getScoreBadgeVariant = (score: number) => {
        if (score >= 90) return 'default'; // commonly dark/primary, usually green in custom theme
        if (score >= 70) return 'secondary'; // yellow-ish usually
        return 'destructive'; // red
    };

    return (
        <div className="space-y-6">
            {/* Top Level Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Average Score</CardTitle>
                        <Zap className={`h-4 w-4 ${getScoreColor(avgScore)}`} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{avgScore}</div>
                        <p className="text-xs text-muted-foreground">
                            Across {scannedPages} scanned pages
                        </p>
                        <Progress value={avgScore} className="h-2 mt-2" />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pages Scanned</CardTitle>
                        <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{scannedPages} / {totalPages}</div>
                        <p className="text-xs text-muted-foreground">
                            {Math.round((scannedPages / totalPages) * 100) || 0}% coverage
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Deployment Ready</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{deploymentReadyCount}</div>
                        <p className="text-xs text-muted-foreground">
                            Pages with score 90+
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
                        <AlertCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        {/* This is a placeholder as we don't track raw issue count in the top level type yet */}
                        <div className="text-2xl font-bold">{scannedPages - deploymentReadyCount}</div>
                        <p className="text-xs text-muted-foreground">
                            Pages needing attention
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Detailed Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Page Audit Details</CardTitle>
                    <CardDescription>
                        Detailed breakdown of all scanned pages. Click on a row to view full report.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <div className="grid grid-cols-12 gap-4 p-4 font-medium text-sm text-muted-foreground border-b bg-muted/40">
                            <div className="col-span-5">Page</div>
                            <div className="col-span-2 text-center">Score</div>
                            <div className="col-span-3">Status</div>
                            <div className="col-span-2 text-right">Last Scan</div>
                        </div>
                        <div className="max-h-[500px] overflow-y-auto">
                            {auditedLinks.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground">
                                    No audit data available yet. Visit your pages with the widget enabled to start collecting data.
                                </div>
                            ) : (
                                auditedLinks.map((link) => (
                                    <div
                                        key={link.id}
                                        className="grid grid-cols-12 gap-4 p-4 border-b last:border-0 items-center hover:bg-muted/50 cursor-pointer transition-colors"
                                        onClick={() => {
                                            setSelectedLink(link);
                                            setIsDetailOpen(true);
                                        }}
                                    >
                                        <div className="col-span-5 min-w-0">
                                            <div className="font-medium truncate" title={link.title}>{link.title}</div>
                                            <div className="text-xs text-muted-foreground truncate" title={link.url}>{link.url}</div>
                                        </div>
                                        <div className="col-span-2 flex justify-center">
                                            <Badge
                                                variant={getScoreBadgeVariant(link.auditResult?.score || 0)}
                                                className="w-12 justify-center"
                                            >
                                                {link.auditResult?.score}
                                            </Badge>
                                        </div>
                                        <div className="col-span-3 flex gap-2">
                                            {/* We can infer categories from score for now or just show a general status */}
                                            {/* In a real scenario, we'd drill down into categories if passed in props */}
                                            {link.auditResult?.score >= 90 ? (
                                                <div className="flex items-center text-xs text-green-600">
                                                    <CheckCircle className="h-3 w-3 mr-1" /> Ready
                                                </div>
                                            ) : (
                                                <div className="flex items-center text-xs text-amber-600">
                                                    <Layout className="h-3 w-3 mr-1" />
                                                    {link.auditResult?.summary || 'Issues found'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="col-span-2 text-right text-xs text-muted-foreground">
                                            <div className="flex items-center justify-end gap-1">
                                                <Clock className="h-3 w-3" />
                                                {link.auditResult?.lastRun ? new Date(link.auditResult.lastRun).toLocaleDateString() : '-'}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Detail Dialog */}
            {selectedLink && (
                <AuditDetailDialog
                    isOpen={isDetailOpen}
                    onOpenChange={setIsDetailOpen}
                    auditResult={selectedLink.auditResult}
                    linkTitle={selectedLink.title}
                    linkUrl={selectedLink.url}
                />
            )}
        </div>
    );
}
