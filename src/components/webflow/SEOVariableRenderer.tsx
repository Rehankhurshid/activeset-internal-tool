
import React from 'react';
import { cn } from '@/lib/utils';
import { formatForDisplay } from '@/lib/webflow-utils';

interface SEOVariableRendererProps {
    text: string | null | undefined;
    className?: string; // Wrapper class
    fallback?: React.ReactNode;
}

export function SEOVariableRenderer({ text, className, fallback = null }: SEOVariableRendererProps) {
    if (!text) return <>{fallback}</>;

    // 1. First format the raw Webflow JSON into {{slug}} format using our util
    const formattedText = formatForDisplay(text);

    if (!formattedText) return <>{fallback}</>;

    // 2. Split by {{variable}} pattern to separate text from variables
    const parts = formattedText.split(/(\{\{[^}]+\}\})/g);

    return (
        <span className={cn("inline-block break-words", className)}>
            {parts.map((part, i) => {
                if (part.startsWith('{{') && part.endsWith('}}')) {
                    const variableName = part.slice(2, -2);
                    return (
                        <span key={i} className="inline-flex items-center rounded-md bg-purple-600 px-2 py-0.5 text-xs font-medium text-white ring-1 ring-inset ring-purple-600/10 cursor-alias select-none h-5 align-middle mx-0.5 whitespace-nowrap">
                            {variableName}
                        </span>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </span>
    );
}
