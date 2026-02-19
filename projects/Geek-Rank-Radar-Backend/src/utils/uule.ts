/**
 * Google UULE parameter encoding.
 * Simulates searching from specific GPS coordinates.
 * Format: w+CAIQICI{length_char}{base64(canonical_name)}
 *
 * This is used for Google Search and Google Local Finder to
 * simulate a search from a specific geographic location.
 */

const UULE_LENGTH_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Encode a canonical location name into a UULE parameter.
 * Example canonical name: "Delray Beach,Florida,United States"
 */
export function encodeUULE(canonicalName: string): string {
  const encoded = Buffer.from(canonicalName).toString('base64');
  const lengthChar = UULE_LENGTH_CHARS[canonicalName.length] ?? 'A';
  return `w+CAIQICI${lengthChar}${encoded}`;
}

/**
 * Build a canonical location name from city/state.
 */
export function buildCanonicalName(city: string, state: string, country = 'United States'): string {
  return `${city},${state},${country}`;
}

/**
 * Build a UULE parameter for a city/state.
 */
export function buildUULE(city: string, state: string): string {
  return encodeUULE(buildCanonicalName(city, state));
}
