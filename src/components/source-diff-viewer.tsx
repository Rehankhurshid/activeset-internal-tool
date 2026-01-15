"use client"

import { useMemo } from 'react'
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileDiff } from "lucide-react"

interface SourceDiffViewerProps {
    diffPatch?: string | null
}

interface DiffLine {
    type: 'context' | 'added' | 'removed' | 'header' | 'meta'
    content: string
    originalLine: string
}

/**
 * Compute the common prefix and suffix between two strings to isolate the changes
 */
function computeInlineDiff(before: string, after: string) {
    if (!before || !after) return null

    let prefixLen = 0
    const minLen = Math.min(before.length, after.length)

    // Find common prefix
    while (prefixLen < minLen && before[prefixLen] === after[prefixLen]) {
        prefixLen++
    }

    // Find common suffix
    let suffixLen = 0
    while (
        suffixLen < minLen - prefixLen &&
        before[before.length - 1 - suffixLen] === after[after.length - 1 - suffixLen]
    ) {
        suffixLen++
    }

    const MAX_CONTEXT = 40

    // Compute prefix to show (truncated end)
    let prefix = before.substring(0, prefixLen)
    if (prefix.length > MAX_CONTEXT) {
        prefix = "..." + prefix.substring(prefix.length - MAX_CONTEXT)
    }

    // Compute suffix to show (truncated start)
    let suffix = before.substring(before.length - suffixLen)
    if (suffix.length > MAX_CONTEXT) {
        suffix = suffix.substring(0, MAX_CONTEXT) + "..."
    }

    const removed = before.substring(prefixLen, before.length - suffixLen)
    const added = after.substring(prefixLen, after.length - suffixLen)

    return { prefix, suffix, removed, added }
}

export function SourceDiffViewer({ diffPatch }: SourceDiffViewerProps) {
    const diffLines = useMemo(() => {
        if (!diffPatch) return []
        return diffPatch.split('\n')
    }, [diffPatch])

    // Process lines to identify modified pairs
    const processedLines = useMemo(() => {
        const result: Array<{
            line: string,
            type: 'context' | 'added' | 'removed' | 'header' | 'meta',
            highlight?: { prefix: string, body: string, suffix: string }
        }> = []

        for (let i = 0; i < diffLines.length; i++) {
            const line = diffLines[i]

            // Check for modification pair (Removed followed by Added)
            // Only if not a meta/header line
            if (
                line.startsWith('-') &&
                !line.startsWith('---') &&
                i + 1 < diffLines.length &&
                diffLines[i + 1].startsWith('+') &&
                !diffLines[i + 1].startsWith('+++')
            ) {
                // Found a pair!
                const removedLine = line
                const addedLine = diffLines[i + 1]

                // Strip the marker
                const beforeContent = removedLine.substring(1)
                const afterContent = addedLine.substring(1)

                const diff = computeInlineDiff(beforeContent, afterContent)

                if (diff) {
                    // Push removed line with highlights
                    result.push({
                        line: removedLine,
                        type: 'removed',
                        highlight: { prefix: diff.prefix, body: diff.removed, suffix: diff.suffix }
                    })

                    // Push added line with highlights
                    result.push({
                        line: addedLine,
                        type: 'added',
                        highlight: { prefix: diff.prefix, body: diff.added, suffix: diff.suffix }
                    })

                    i++ // Skip next line since we handled it
                    continue
                }
            }

            // Standard processing
            let type: 'context' | 'added' | 'removed' | 'header' | 'meta' = 'context'
            if (line.startsWith('+++') || line.startsWith('---')) type = 'header'
            else if (line.startsWith('@@')) type = 'meta'
            else if (line.startsWith('+')) type = 'added'
            else if (line.startsWith('-')) type = 'removed'

            result.push({ line, type })
        }

        return result
    }, [diffLines])

    // Count added/removed lines for summary
    const stats = useMemo(() => {
        let added = 0
        let removed = 0
        diffLines.forEach(line => {
            if (line.startsWith('+') && !line.startsWith('+++')) added++
            if (line.startsWith('-') && !line.startsWith('---')) removed++
        })
        return { added, removed }
    }, [diffLines])

    if (!diffPatch) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-500">
                <FileDiff className="h-12 w-12 mb-3 text-neutral-300 dark:text-neutral-700" />
                <p className="text-sm">No source difference available</p>
                <p className="text-xs text-neutral-400 mt-1">
                    Source changes will appear here after the next scan.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-neutral-900 dark:text-white">Source Comparison</h3>
                <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                        +{stats.added} lines
                    </Badge>
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                        -{stats.removed} lines
                    </Badge>
                </div>
            </div>

            <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden font-mono text-xs">
                <ScrollArea className="h-[600px] w-full">
                    <div className="p-4 w-full"> {/* Wrapped container */}
                        {processedLines.map((item, idx) => {
                            let className = "px-2 py-0.5 text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap break-all"
                            let prefix = " "

                            if (item.type === 'header') {
                                className = "px-2 py-1 text-neutral-500 dark:text-neutral-500 font-bold bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800"
                                prefix = ""
                            } else if (item.type === 'meta') {
                                className = "px-2 py-1 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/10 mt-2 mb-1 border-y border-purple-100 dark:border-purple-900/20 sticky top-0"
                                prefix = ""
                            } else if (item.type === 'added') {
                                className = "px-2 py-0.5 bg-green-50/50 text-green-800 dark:bg-green-900/10 dark:text-green-300 w-full block whitespace-pre-wrap break-all"
                                prefix = "+"
                            } else if (item.type === 'removed') {
                                className = "px-2 py-0.5 bg-red-50/50 text-red-800 dark:bg-red-900/10 dark:text-red-300 w-full block whitespace-pre-wrap break-all"
                                prefix = "-"
                            }

                            return (
                                <div key={idx} className={className}>
                                    {item.highlight ? (
                                        <>
                                            <span className="select-none opacity-50 mr-1 inline-block w-3">{prefix}</span>
                                            <span className="opacity-70">{item.highlight.prefix}</span>
                                            <span className={`font-bold ${item.type === 'added'
                                                ? 'bg-green-200 dark:bg-green-800 text-green-900 dark:text-green-100 px-0.5 rounded'
                                                : 'bg-red-200 dark:bg-red-800 text-red-900 dark:text-red-100 px-0.5 rounded'
                                                }`}>
                                                {item.highlight.body}
                                            </span>
                                            <span className="opacity-70">{item.highlight.suffix}</span>
                                        </>
                                    ) : (
                                        <>
                                            {prefix !== "" && <span className="select-none opacity-50 mr-1 inline-block w-3">{prefix}</span>}
                                            {item.type === 'header' || item.type === 'meta' ? item.line : item.line.substring(1)}
                                        </>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </ScrollArea>
            </div>
        </div>
    )
}
