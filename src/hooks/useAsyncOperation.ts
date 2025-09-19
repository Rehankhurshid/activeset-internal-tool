'use client';

import { useState, useCallback } from 'react';

interface UseAsyncOperationOptions<T> {
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
}

export function useAsyncOperation<T = void>(options: UseAsyncOperationOptions<T> = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (operation: () => Promise<T>): Promise<T | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await operation();
      options.onSuccess?.(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('An unexpected error occurred');
      const errorMessage = error.message;

      setError(errorMessage);
      options.onError?.(error);
      console.error('Async operation failed:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    execute,
    clearError,
  };
}