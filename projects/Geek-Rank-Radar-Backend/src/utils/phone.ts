/**
 * Normalize a phone number to digits only, prefixed with country code.
 * Returns null if the input doesn't look like a valid US phone number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const digits = raw.replaceAll(/\D/g, '');

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Format a normalized phone number for display: (555) 123-4567
 */
export function formatPhone(normalized: string | null): string | null {
  if (!normalized) return null;

  const digits = normalized.replaceAll(/\D/g, '');
  const local = digits.length === 11 ? digits.slice(1) : digits;

  if (local.length !== 10) return normalized;

  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}
