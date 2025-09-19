"use client";

import * as React from "react";
import { Check, X, Edit2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InlineEditProps {
  value: string;
  onSave: (value: string) => void | Promise<void>;
  onCancel?: () => void;
  className?: string;
  inputClassName?: string;
  displayClassName?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function InlineEdit({
  value,
  onSave,
  onCancel,
  className,
  inputClassName,
  displayClassName,
  placeholder = "Click to edit",
  disabled = false,
}: InlineEditProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(value);
  const [isLoading, setIsLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setEditValue(value);
  }, [value]);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (editValue.trim() === value.trim()) {
      setIsEditing(false);
      return;
    }

    setIsLoading(true);
    try {
      await onSave(editValue.trim());
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save:", error);
      setEditValue(value);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
    onCancel?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (!isLoading) {
              handleCancel();
            }
          }}
          disabled={isLoading}
          className={cn("h-8", inputClassName)}
          placeholder={placeholder}
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={handleSave}
          disabled={isLoading}
          className="h-8 w-8"
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleCancel}
          disabled={isLoading}
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-2 cursor-pointer hover:bg-accent/50 rounded px-2 py-1 transition-colors",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      onClick={() => !disabled && setIsEditing(true)}
    >
      <span className={cn("flex-1", displayClassName)}>
        {value || <span className="text-muted-foreground italic">{placeholder}</span>}
      </span>
      {!disabled && (
        <Edit2 className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </div>
  );
}