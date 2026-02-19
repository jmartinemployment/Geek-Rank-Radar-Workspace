const EARTH_RADIUS_MILES = 3958.8;

/**
 * Calculate the Haversine distance between two GPS coordinates in miles.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

/**
 * Convert miles to degrees latitude. 1 mile ≈ 1/69.0 degrees latitude.
 */
export function milesToLatDegrees(miles: number): number {
  return miles / 69;
}

/**
 * Convert miles to degrees longitude at a given latitude.
 * Accounts for longitude convergence toward poles.
 */
export function milesToLngDegrees(miles: number, atLatitude: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  return miles / (69 * Math.cos(toRad(atLatitude)));
}
