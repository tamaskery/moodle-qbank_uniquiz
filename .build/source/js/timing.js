export const MINIMUM_PROCESSING_MS = 3000;

export function remainingMinimumDuration(startedAt, finishedAt, minimum = MINIMUM_PROCESSING_MS) {
  if (![startedAt, finishedAt, minimum].every(Number.isFinite) || minimum < 0) {
    throw new TypeError("Processing timing values must be finite positive numbers.");
  }
  return Math.max(0, minimum - Math.max(0, finishedAt - startedAt));
}
