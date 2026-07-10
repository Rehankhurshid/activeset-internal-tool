'use client';

import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabStat = { label: string; tone: 'set' | 'unset' };
export type TabOption = { value: string; label: string; compactLabel?: string; icon: ReactNode; stat?: TabStat };

export function TabStatBadge({ stat, className }: { stat: TabStat; className?: string }) {
    if (stat.tone === 'unset') return null;

    return (
        <Badge
            variant="secondary"
            className={cn('h-5 px-1.5 text-[10px] font-mono leading-none tabular-nums', className)}
        >
            {stat.label}
        </Badge>
    );
}

// Mirrors TabsTrigger's className (components/ui/tabs.tsx) for the hand-rolled "More" button below —
// keep in sync if that changes.
const tabTriggerLikeClasses = 'inline-flex h-[calc(100%-1px)] items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1';

interface DesktopTabSelectorProps {
    primaryOptions: TabOption[];
    overflowOptions: TabOption[];
    value: string;
    onChange: (value: string) => void;
}

export function DesktopTabSelector({ primaryOptions, overflowOptions, value, onChange }: DesktopTabSelectorProps) {
    const activeOverflowOption = overflowOptions.find(opt => opt.value === value);
    const overflowLabel = activeOverflowOption?.compactLabel ?? activeOverflowOption?.label ?? 'More';

    return (
        <div className="hidden sm:block max-w-full overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="w-auto inline-flex">
                {primaryOptions.map(opt => (
                    <TabsTrigger key={opt.value} value={opt.value} className="gap-2 px-3">
                        {opt.icon}
                        <span>{opt.compactLabel ?? opt.label}</span>
                        {opt.stat && <TabStatBadge stat={opt.stat} />}
                    </TabsTrigger>
                ))}
                {overflowOptions.length > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className={cn(
                                    tabTriggerLikeClasses,
                                    activeOverflowOption
                                        ? 'bg-background text-foreground shadow-sm dark:bg-input/30'
                                        : 'text-foreground hover:bg-background/60 dark:text-muted-foreground dark:hover:text-foreground',
                                )}
                                aria-label="Open more project sections"
                            >
                                {activeOverflowOption ? activeOverflowOption.icon : <MoreHorizontal className="h-4 w-4" />}
                                <span>{overflowLabel}</span>
                                {activeOverflowOption?.stat && <TabStatBadge stat={activeOverflowOption.stat} />}
                                <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                            {overflowOptions.map(opt => {
                                const isActive = opt.value === value;
                                return (
                                    <DropdownMenuItem
                                        key={opt.value}
                                        onSelect={() => onChange(opt.value)}
                                        className={cn('gap-3 py-2', isActive && 'bg-accent text-accent-foreground')}
                                    >
                                        <span className={cn('shrink-0', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                                            {opt.icon}
                                        </span>
                                        <span className="flex-1">{opt.label}</span>
                                        {opt.stat && <TabStatBadge stat={opt.stat} />}
                                        {isActive && <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />}
                                    </DropdownMenuItem>
                                );
                            })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </TabsList>
        </div>
    );
}

interface MobileTabSelectorProps {
    options: TabOption[];
    value: string;
    activeOption: TabOption;
    onChange: (value: string) => void;
}

export function MobileTabSelector({ options, value, activeOption, onChange }: MobileTabSelectorProps) {
    const [open, setOpen] = useState(false);
    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button
                    variant="outline"
                    className="w-full justify-between h-11 px-3 text-base"
                    aria-haspopup="menu"
                >
                    <span className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 text-muted-foreground">{activeOption.icon}</span>
                        <span className="font-medium truncate">{activeOption.label}</span>
                        {activeOption.stat && <TabStatBadge stat={activeOption.stat} />}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-xl p-0 max-h-[80vh]">
                <SheetHeader className="border-b">
                    <SheetTitle className="text-base">Select section</SheetTitle>
                </SheetHeader>
                <div className="p-2">
                    {options.map(opt => {
                        const isActive = opt.value === value;
                        return (
                            <button
                                key={opt.value}
                                onClick={() => {
                                    onChange(opt.value);
                                    setOpen(false);
                                }}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors",
                                    isActive
                                        ? "bg-accent text-accent-foreground"
                                        : "hover:bg-accent/60 active:bg-accent"
                                )}
                            >
                                <span className={cn("shrink-0", isActive ? "text-foreground" : "text-muted-foreground")}>{opt.icon}</span>
                                <span className="text-sm font-medium flex-1">{opt.label}</span>
                                {opt.stat && <TabStatBadge stat={opt.stat} />}
                                {isActive && <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />}
                            </button>
                        );
                    })}
                </div>
            </SheetContent>
        </Sheet>
    );
}
