"use client"

import { Badge } from "@/components/ui/badge"
import { FieldChange, BlockChange, TextChange } from "@/types"

// Compact summary component for the header
interface ChangeSummaryBadgeProps {
  fieldChanges: FieldChange[]
  blockChanges?: BlockChange[]
  textChanges?: TextChange[]
  changeStatus?: string
}

export function ChangeSummaryBadge({ fieldChanges, blockChanges, textChanges, changeStatus }: ChangeSummaryBadgeProps) {
  const hasBlockChanges = blockChanges && blockChanges.length > 0
  const hasTextChanges = textChanges && textChanges.length > 0
  const hasFieldChanges = fieldChanges && fieldChanges.length > 0

  if (!hasFieldChanges && !hasBlockChanges && !hasTextChanges) {
    if (changeStatus === 'NO_CHANGE') {
      return <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">No changes</Badge>
    }
    return null
  }

  const parts: string[] = []

  // Count text changes (most granular)
  if (hasTextChanges) {
    const textModified = textChanges.filter(c => c.type === 'modified').length
    const textAdded = textChanges.filter(c => c.type === 'added').length
    const textRemoved = textChanges.filter(c => c.type === 'removed').length

    if (textModified > 0) parts.push(`${textModified} text changed`)
    if (textAdded > 0) parts.push(`+${textAdded} text`)
    if (textRemoved > 0) parts.push(`-${textRemoved} text`)
  }

  // Count block changes
  if (hasBlockChanges && parts.length === 0) {
    const modified = blockChanges.filter(c => c.type === 'modified').length
    const added = blockChanges.filter(c => c.type === 'added').length
    const removed = blockChanges.filter(c => c.type === 'removed').length

    if (modified > 0) parts.push(`${modified} changed`)
    if (added > 0) parts.push(`+${added}`)
    if (removed > 0) parts.push(`-${removed}`)
  }

  if (parts.length === 0 && hasFieldChanges) {
    // Fall back to field count
    const modified = fieldChanges.filter(c => c.changeType === 'modified').length
    const addedFields = fieldChanges.filter(c => c.changeType === 'added').length
    const removedFields = fieldChanges.filter(c => c.changeType === 'removed').length

    if (modified > 0) parts.push(`${modified} modified`)
    if (addedFields > 0) parts.push(`${addedFields} added`)
    if (removedFields > 0) parts.push(`${removedFields} removed`)
  }

  return (
    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
      {parts.join(', ')}
    </Badge>
  )
}
