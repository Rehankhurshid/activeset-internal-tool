'use client';

import { Card, CardContent } from "@/components/ui/card";
import { FileText, Calendar, Share2, Edit3 } from "lucide-react";
import { Proposal } from "../types/Proposal";

interface StatisticsCardsProps {
    proposals: Proposal[];
}

export default function StatisticsCards({ proposals }: StatisticsCardsProps) {
    const stats = [
        {
            title: 'Total Proposals',
            value: proposals.length,
            icon: FileText,
            color: 'bg-primary/10 text-primary'
        },
        {
            title: 'Approved',
            value: proposals.filter(p => p.status === 'approved').length,
            icon: Calendar,
            color: 'bg-green-500/10 text-green-600 dark:text-green-400'
        },
        {
            title: 'Sent',
            value: proposals.filter(p => p.status === 'sent').length,
            icon: Share2,
            color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
        },
        {
            title: 'Drafts',
            value: proposals.filter(p => p.status === 'draft').length,
            icon: Edit3,
            color: 'bg-muted text-muted-foreground'
        }
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat, index) => (
                <Card key={index} className="bg-card border-border text-card-foreground">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${stat.color}`}>
                                <stat.icon className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-2xl font-semibold">{stat.value}</p>
                                <p className="text-sm text-muted-foreground">{stat.title}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
