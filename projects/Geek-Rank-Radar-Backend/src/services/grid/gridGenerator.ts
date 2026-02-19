import type { GridPoint } from '../../types/engine.types.js';
import { milesToLatDegrees, milesToLngDegrees } from '../../utils/geo.js';

/**
 * Generate an NxN grid of GPS coordinates centered on a point.
 *
 * The grid covers a square area of (2 * radiusMiles) per side,
 * with points evenly spaced.
 *
 * @param centerLat - Center latitude
 * @param centerLng - Center longitude
 * @param radiusMiles - Radius from center to edge (default 3)
 * @param gridSize - Number of points per axis (default 7 for 7x7=49 points)
 */
export function generateGrid(
  centerLat: number,
  centerLng: number,
  radiusMiles: number,
  gridSize: number,
): GridPoint[] {
  const latSpan = milesToLatDegrees(radiusMiles * 2);
  const lngSpan = milesToLngDegrees(radiusMiles * 2, centerLat);

  const startLat = centerLat + latSpan / 2;
  const startLng = centerLng - lngSpan / 2;

  const latStep = latSpan / (gridSize - 1);
  const lngStep = lngSpan / (gridSize - 1);

  const points: GridPoint[] = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      points.push({
        row,
        col,
        lat: Number.parseFloat((startLat - row * latStep).toFixed(7)),
        lng: Number.parseFloat((startLng + col * lngStep).toFixed(7)),
      });
    }
  }

  return points;
}

/**
 * Supported grid sizes and their use cases.
 */
export const GRID_SIZES = [3, 5, 7, 9] as const;
export type GridSize = (typeof GRID_SIZES)[number];

export function isValidGridSize(size: number): size is GridSize {
  return (GRID_SIZES as readonly number[]).includes(size);
}
