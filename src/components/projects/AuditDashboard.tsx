'use client';

import React from 'react';
import { ProjectLink, AuditResult } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, CheckCircle, Clock, ExternalLink, FileText, Layout, Search, Zap, TrendingUp, Activity, XCircle } from 'lucide-react';
import { AuditDetailDialog } from './AuditDetailDialog';

interface AuditDashboardProps {
    links: ProjectLink[];
}

export function AuditDashboard({ links }: AuditDashboardProps) {
    const [selectedLink, setSelectedLink] = React.useState<ProjectLink | null>(null);
    const [isDetailOpen, setIsDetailOpen] = React.useState(false);

    // Filter links that have actual audit data
    const auditedLinks = links.filter(link => link.auditResult);

    // Calculate Aggregate Metrics
    const totalPages = links.length;
    const scannedPages = auditedLinks.length;

    let totalScore = 0;
    let deploymentReadyCount = 0;
    let blockedCount = 0;
    let changedPagesCount = 0;
    let techOnlyCount = 0;

    auditedLinks.forEach(link => {
        const audit = link.auditResult as AuditResult | undefined;
        totalScore += audit?.score || 0;

        // Count deployment ready (score >= 90 AND canDeploy is true)
        if ((audit?.score || 0) >= 90 && audit?.canDeploy !== false) {
            deploymentReadyCount++;
        }

        // Count blocked (canDeploy false)
        if (audit?.canDeploy === false) {
            blockedCount++;
        }

        // Count by changeStatus
        if (audit?.changeStatus === 'CONTENT_CHANGED') {
            changedPagesCount++;
        } else if (audit?.changeStatus === 'TECH_CHANGE_ONLY') {
            techOnlyCount++;
        }
    });

    const avgScore = scannedPages > 0 ? Math.round(totalScore / scannedPages) : 0;

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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
                        <CardTitle className="text-sm font-medium">Content Changed</CardTitle>
                        <TrendingUp className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{changedPagesCount}</div>
                        <p className="text-xs text-muted-foreground">
                            Since last scan
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tech-Only</CardTitle>
                        <Activity className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{techOnlyCount}</div>
                        <p className="text-xs text-muted-foreground">
                            HTML changed, content same
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
                            Score 90+ & no blockers
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Blocked</CardTitle>
                        <XCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{blockedCount}</div>
                        <p className="text-xs text-muted-foreground">
                            Placeholders detected
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
                                        <div className="col-span-3 flex gap-2 flex-wrap">
                                            {/* Change Status Badge */}
                                            {(() => {
                                                const audit = link.auditResult as AuditResult | undefined;
                                                if (audit?.canDeploy === false) {
                                                    return (
                                                        <Badge variant="destructive" className="text-xs">
                                                            <XCircle className="h-3 w-3 mr-1" />Blocked
                                                        </Badge>
                                                    );
                                                }
                                                switch (audit?.changeStatus) {
                                                    case 'CONTENT_CHANGED':
                                                        return (
                                                            <Badge className="bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20 text-xs">
                                                                <TrendingUp className="h-3 w-3 mr-1" />Changed
                                                            </Badge>
                                                        );
                                                    case 'TECH_CHANGE_ONLY':
                                                        return (
                                                            <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 text-xs">
                                                                <Activity className="h-3 w-3 mr-1" />Tech-only
                                                            </Badge>
                                                        );
                                                    case 'NO_CHANGE':
                                                        return (
                                                            <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 text-xs">
                                                                <CheckCircle className="h-3 w-3 mr-1" />No change
                                                            </Badge>
                                                        );
                                                    default:
                                                        // First scan or unknown status
                                                        return (audit?.score || 0) >= 90 ? (
                                                            <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 text-xs">
                                                                <CheckCircle className="h-3 w-3 mr-1" />Ready
                                                            </Badge>
                                                        ) : (
                                                            <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs">
                                                                <AlertCircle className="h-3 w-3 mr-1" />Review
                                                            </Badge>
                                                        );
                                                }
                                            })()}
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
