import { Timestamp } from 'firebase/firestore';

/**
 * Coerce a value into a Date. Handles Firestore Timestamps, JS Dates, ISO
 * strings, numeric epochs, and `{ seconds, nanoseconds }` plain objects (which
 * appear after a Timestamp survives JSON serialization). Falls back to epoch 0
 * so a malformed field can't crash a snapshot listener.
 */
export function toSafeDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (
    value &&
    typeof value === 'object' &&
    'seconds' in value &&
    typeof (value as { seconds: unknown }).seconds === 'number'
  ) {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(0);
}

/** Same as toSafeDate but returns undefined when the value is missing. */
export function toSafeDateOrUndefined(value: unknown): Date | undefined {
  if (value === null || value === undefined) return undefined;
  return toSafeDate(value);
}
