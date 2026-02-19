import type { GridPoint } from './engine.types.js';

export type ScanStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ScanPointStatus = 'pending' | 'completed' | 'failed';

export interface CreateScanRequest {
  serviceAreaId: string;
  categoryId: string;
  keyword: string;
  searchEngine: string;
  gridSize?: number;
}

export interface FullScanRequest {
  serviceAreaIds?: string[];
  categoryIds?: string[];
  engineIds?: string[];
  gridSize?: number;
}

export interface ScanTask {
  scanId: string;
  scanPointId: string;
  engineId: string;
  query: string;
  point: GridPoint;
  priority: number;
}

export interface ScanProgress {
  scanId: string;
  status: ScanStatus;
  pointsTotal: number;
  pointsCompleted: number;
  percentComplete: number;
  startedAt: Date | null;
  estimatedCompletionAt: Date | null;
}

export interface ScanFilters {
  status?: ScanStatus;
  searchEngine?: string;
  serviceAreaId?: string;
  categoryId?: string;
}
