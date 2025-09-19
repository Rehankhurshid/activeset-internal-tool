'use client';

import { useState, useCallback } from 'react';

interface UseEditableFieldOptions {
  initialValue: string;
  onSave: (value: string) => Promise<void> | void;
  validator?: (value: string) => boolean;
}

export function useEditableField({
  initialValue,
  onSave,
  validator = (value) => value.trim().length > 0
}: UseEditableFieldOptions) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEditing = useCallback(() => {
    setValue(initialValue);
    setIsEditing(true);
    setError(null);
  }, [initialValue]);

  const cancelEditing = useCallback(() => {
    setValue(initialValue);
    setIsEditing(false);
    setError(null);
  }, [initialValue]);

  const saveField = useCallback(async () => {
    if (!validator(value)) {
      setError('Invalid value');
      return;
    }

    if (value.trim() === initialValue.trim()) {
      setIsEditing(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onSave(value.trim());
      setIsEditing(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [value, initialValue, onSave, validator]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveField();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  }, [saveField, cancelEditing]);

  return {
    isEditing,
    value,
    setValue,
    isLoading,
    error,
    startEditing,
    cancelEditing,
    saveField,
    handleKeyDown,
    isValid: validator(value),
    hasChanges: value.trim() !== initialValue.trim(),
  };
}