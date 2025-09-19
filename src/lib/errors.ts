export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public userMessage?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, userMessage?: string) {
    super(message, 'VALIDATION_ERROR', userMessage || 'Please check your input and try again.');
  }
}

export class NetworkError extends AppError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR', 'Network error. Please check your connection and try again.');
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super(message, 'DATABASE_ERROR', 'Database error. Please try again later.');
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.userMessage || error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred';
}

export function logError(error: unknown, context?: string) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const fullMessage = context ? `[${context}] ${errorMessage}` : errorMessage;

  console.error(fullMessage, error instanceof Error ? error.stack : '');

  // Show toast notification for user-facing errors in the browser
  if (typeof window !== 'undefined') {
    import('sonner').then(({ toast }) => {
      const userMessage = getErrorMessage(error);
      toast.error(userMessage);
    });
  }
}