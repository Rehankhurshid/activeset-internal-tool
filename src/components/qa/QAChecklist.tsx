'use client';

import React from 'react';
import { QAChecklistItem } from '@/types/qa';
import { Check, Loader2, AlertCircle, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

interface QAChecklistProps {
    items: QAChecklistItem[];
    onToggle: (id: string, checked: boolean) => void;
    onRunCheck: (id: string) => void;
}

export function QAChecklist({ items, onToggle, onRunCheck }: QAChecklistProps) {
    // Group items by category
    const groupedItems = items.reduce((acc, item) => {
        if (!acc[item.category]) {
            acc[item.category] = [];
        }
        acc[item.category].push(item);
        return acc;
    }, {} as Record<string, QAChecklistItem[]>);

    const categories = Object.keys(groupedItems);

    return (
        <div className="w-full space-y-4">
            <Accordion type="multiple" defaultValue={categories} className="w-full">
                {categories.map((category) => (
                    <AccordionItem value={category} key={category} className="border-b-0 mb-4 rounded-lg border bg-card text-card-foreground shadow-sm">
                        <AccordionTrigger className="px-4 hover:no-underline">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-lg">{category}</span>
                                <span className="text-xs text-muted-foreground font-normal">
                                    ({groupedItems[category].filter(i => i.status === 'passed' || i.status === 'manual-verified').length}/{groupedItems[category].length})
                                </span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4 pt-1">
                            <div className="space-y-3">
                                {groupedItems[category].map((item) => (
                                    <ChecklistItem
                                        key={item.id}
                                        item={item}
                                        onToggle={onToggle}
                                        onRunCheck={onRunCheck}
                                    />
                                ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    );
}

function ChecklistItem({
    item,
    onToggle,
    onRunCheck
}: {
    item: QAChecklistItem;
    onToggle: (id: string, checked: boolean) => void;
    onRunCheck: (id: string) => void;
}) {
    const isCompleted = item.status === 'passed' || item.status === 'manual-verified';
    const isLoading = item.status === 'loading';
    const isFailed = item.status === 'failed';

    return (
        <div className={cn(
            "flex flex-col gap-2 p-3 rounded-md border transition-colors",
            isCompleted ? "bg-green-50/50 border-green-100 dark:bg-green-900/10 dark:border-green-900/30" : "bg-background border-border",
            isFailed && "bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30"
        )}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="pt-0.5">
                        <Checkbox
                            id={item.id}
                            checked={isCompleted}
                            onCheckedChange={(checked) => onToggle(item.id, checked as boolean)}
                            disabled={isLoading}
                        />
                    </div>
                    <div className="space-y-1">
                        <label
                            htmlFor={item.id}
                            className={cn(
                                "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer",
                                isCompleted && "line-through text-muted-foreground"
                            )}
                        >
                            {item.label}
                        </label>
                        {item.description && (
                            <p className="text-xs text-muted-foreground">
                                {item.description}
                            </p>
                        )}
                        {item.error && (
                            <div className="flex flex-col gap-1 mt-1">
                                <div className="flex items-center gap-1 text-xs text-destructive">
                                    <AlertCircle size={12} />
                                    <span>{item.error}</span>
                                </div>
                                {item.issues && item.issues.length > 0 && (
                                    <ul className="list-disc list-inside text-xs text-destructive/80 pl-4 space-y-0.5">
                                        {item.issues.map((issue, idx) => (
                                            <li key={idx}>{issue}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        {item.data?.fontsFound && (
                            <div className="mt-2 text-xs border rounded-md p-2 bg-muted/40">
                                <p className="font-semibold mb-2">Detected Fonts ({item.data.fontsFound.length}):</p>
                                {item.data.fontsFound.length === 0 ? (
                                    <div className="text-muted-foreground italic py-1">No fonts detected on page.</div>
                                ) : (
                                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                        {item.data.fontsFound.map((font: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between py-1 border-b last:border-0 border-border/50 gap-2">
                                                <div className="flex flex-col min-w-0 flex-1">
                                                    <span className="truncate font-medium" title={font.family}>{font.family || 'Unknown Family'}</span>
                                                    <span className="text-[10px] text-muted-foreground truncate" title={font.source}>
                                                        {font.source.split('/').pop()?.split('?')[0] || font.source}
                                                    </span>
                                                </div>
                                                <span className={cn(
                                                    "px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0",
                                                    font.isWoff2
                                                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                                )}>
                                                    {font.isWoff2 ? 'WOFF2' : 'OTHER'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {item.verificationType === 'automated' && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRunCheck(item.id)}
                        disabled={isLoading || isCompleted}
                        className={cn(
                            "h-7 text-xs px-2 min-w-[70px]",
                            isCompleted && "opacity-0 pointer-events-none" // Hide check button if manually checked or passed
                        )}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                Checking
                            </>
                        ) : (
                            <>
                                <Play className="mr-1 h-3 w-3" />
                                Verify
                            </>
                        )}
                    </Button>
                )}
            </div>

            {/* Render nested items recursively if needed, keeping simple for now */}
            {item.subItems && (
                <div className="pl-8 pt-2 space-y-2 border-l ml-3">
                    {item.subItems.map(subItem => (
                        <ChecklistItem
                            key={subItem.id}
                            item={subItem}
                            onToggle={onToggle}
                            onRunCheck={onRunCheck}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
