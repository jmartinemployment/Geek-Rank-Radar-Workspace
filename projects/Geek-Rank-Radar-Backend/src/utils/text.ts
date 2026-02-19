/**
 * Normalize a business name for matching/deduplication.
 * Lowercase, strip legal suffixes, remove punctuation, collapse whitespace.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/\b(llc|inc|corp|ltd|co|company|corporation|incorporated|limited)\b/g, '')
    .replaceAll(/[^\w\s]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a URL domain for matching.
 * Strip protocol, www prefix, trailing slash.
 */
export function normalizeDomain(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Simple Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[m][n];
}
