'use client';

import { Card } from "@/components/ui/card";
import { FileText, CheckCircle2, Send, Edit3 } from "lucide-react";
import { Proposal } from "../types/Proposal";

interface StatisticsCardsProps {
    proposals: Proposal[];
}

export default function StatisticsCards({ proposals }: StatisticsCardsProps) {
    const stats = [
        {
            title: 'Total',
            value: proposals.length,
            icon: FileText,
            gradient: 'from-blue-500/20 to-blue-600/10',
            iconColor: 'text-blue-500'
        },
        {
            title: 'Approved',
            value: proposals.filter(p => p.status === 'approved').length,
            icon: CheckCircle2,
            gradient: 'from-green-500/20 to-green-600/10',
            iconColor: 'text-green-500'
        },
        {
            title: 'Sent',
            value: proposals.filter(p => p.status === 'sent').length,
            icon: Send,
            gradient: 'from-amber-500/20 to-amber-600/10',
            iconColor: 'text-amber-500'
        },
        {
            title: 'Drafts',
            value: proposals.filter(p => p.status === 'draft').length,
            icon: Edit3,
            gradient: 'from-gray-500/20 to-gray-600/10',
            iconColor: 'text-gray-500'
        },
        {
            title: 'Lost',
            value: proposals.filter(p => p.status === 'lost').length,
            icon: FileText, // Or XCircle if I import it
            gradient: 'from-red-500/20 to-red-600/10',
            iconColor: 'text-red-500'
        }
    ];

    return (
        <div className="flex flex-wrap gap-2 mb-6">
            {stats.map((stat, index) => (
                <Card
                    key={index}
                    className={`flex items-center gap-2.5 px-4 py-2.5 bg-gradient-to-r ${stat.gradient} border-0 backdrop-blur-sm`}
                >
                    <stat.icon className={`w-4 h-4 ${stat.iconColor}`} />
                    <span className="text-lg font-semibold">{stat.value}</span>
                    <span className="text-sm text-muted-foreground">{stat.title}</span>
                </Card>
            ))}
        </div>
    );
}
