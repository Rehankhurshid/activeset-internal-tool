"use client"

import * as React from "react"
import { format, parse, isValid } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
    value?: string // ISO date string (YYYY-MM-DD)
    onChange: (value: string) => void
    placeholder?: string
    className?: string
}

export function DatePicker({ value, onChange, placeholder = "Pick a date", className }: DatePickerProps) {
    const [open, setOpen] = React.useState(false)
    const [inputValue, setInputValue] = React.useState(value || '')

    // Sync input with value prop
    React.useEffect(() => {
        setInputValue(value || '')
    }, [value])

    // Convert ISO string to Date object for the calendar
    const selectedDate = value ? new Date(value + 'T00:00:00') : undefined

    // Format for display - show ISO format in input for easy editing
    const displayValue = value || ''

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value
        setInputValue(newValue)

        // Try to parse as date (YYYY-MM-DD format)
        if (newValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const parsed = parse(newValue, 'yyyy-MM-dd', new Date())
            if (isValid(parsed)) {
                onChange(newValue)
            }
        } else if (newValue === '') {
            onChange('')
        }
    }

    const handleInputBlur = () => {
        // If invalid, reset to last valid value
        if (inputValue && !inputValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
            setInputValue(value || '')
        }
    }

    return (
        <div className={cn("flex gap-1", className)}>
            <Input
                type="text"
                placeholder={placeholder}
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                className="flex-1"
            />
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                    >
                        <CalendarIcon className="h-4 w-4" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                            if (date) {
                                const isoDate = format(date, "yyyy-MM-dd")
                                onChange(isoDate)
                                setInputValue(isoDate)
                            }
                            setOpen(false)
                        }}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
        </div>
    )
}
