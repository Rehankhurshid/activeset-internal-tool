'use client';

import * as React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { useMobile } from '@/hooks/useMobile';
import { cn } from '@/lib/utils';

/**
 * ResponsiveDialog: Dialog on desktop, bottom Sheet on mobile.
 * Mirrors the Dialog API so existing dialogs can swap in with minimal changes.
 */

interface ResponsiveDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
}

export function ResponsiveDialog({ open, onOpenChange, children }: ResponsiveDialogProps) {
    const isMobile = useMobile();
    if (isMobile) {
        return (
            <Sheet open={open} onOpenChange={onOpenChange}>
                {children}
            </Sheet>
        );
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {children}
        </Dialog>
    );
}

interface ResponsiveDialogContentProps extends React.ComponentProps<'div'> {
    /** Tailwind classes applied to the desktop dialog. */
    desktopClassName?: string;
    /** Tailwind classes applied to the mobile sheet. */
    mobileClassName?: string;
}

export function ResponsiveDialogContent({
    className,
    desktopClassName,
    mobileClassName,
    children,
    ...props
}: ResponsiveDialogContentProps) {
    const isMobile = useMobile();
    if (isMobile) {
        return (
            <SheetContent
                side="bottom"
                className={cn(
                    'rounded-t-xl max-h-[92vh] flex flex-col p-0 gap-0',
                    className,
                    mobileClassName,
                )}
                {...(props as React.ComponentProps<typeof SheetContent>)}
            >
                {children}
            </SheetContent>
        );
    }
    return (
        <DialogContent
            className={cn(className, desktopClassName)}
            {...(props as React.ComponentProps<typeof DialogContent>)}
        >
            {children}
        </DialogContent>
    );
}

export function ResponsiveDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
    const isMobile = useMobile();
    if (isMobile) {
        return <SheetHeader className={cn('px-4 pt-5 pb-4 border-b', className)} {...props} />;
    }
    return <DialogHeader className={className} {...props} />;
}

export function ResponsiveDialogTitle({ className, ...props }: React.ComponentProps<'h2'>) {
    const isMobile = useMobile();
    if (isMobile) {
        return <SheetTitle className={cn('text-base', className)} {...props} />;
    }
    return <DialogTitle className={className} {...props} />;
}

export function ResponsiveDialogDescription({
    className,
    ...props
}: React.ComponentProps<'p'>) {
    const isMobile = useMobile();
    if (isMobile) {
        return <SheetDescription className={className} {...props} />;
    }
    return <DialogDescription className={className} {...props} />;
}

export function ResponsiveDialogBody({ className, ...props }: React.ComponentProps<'div'>) {
    const isMobile = useMobile();
    return (
        <div
            className={cn(
                isMobile ? 'flex-1 overflow-y-auto px-4 py-4' : '',
                className,
            )}
            {...props}
        />
    );
}

export function ResponsiveDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
    const isMobile = useMobile();
    if (isMobile) {
        return (
            <SheetFooter
                className={cn(
                    'flex-row gap-2 px-4 py-3 border-t bg-background sticky bottom-0',
                    className,
                )}
                {...props}
            />
        );
    }
    return <DialogFooter className={className} {...props} />;
}
