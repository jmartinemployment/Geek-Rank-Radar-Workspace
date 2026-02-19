/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a human-like delay between minMs and maxMs with random jitter.
 */
export function humanDelay(minMs: number, maxMs: number, jitterMs = 500): number {
  const base = minMs + Math.random() * (maxMs - minMs);
  const jitter = (Math.random() - 0.5) * 2 * jitterMs;
  return Math.max(minMs, Math.round(base + jitter));
}

/**
 * Sleep for a human-like delay.
 */
export async function sleepHuman(minMs: number, maxMs: number, jitterMs = 500): Promise<void> {
  const delay = humanDelay(minMs, maxMs, jitterMs);
  await sleep(delay);
}
