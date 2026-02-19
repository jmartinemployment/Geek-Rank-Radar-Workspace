export interface ServiceAreaSeed {
  name: string;
  state: string;
  centerLat: number;
  centerLng: number;
  radiusMiles: number;
}

export const SERVICE_AREA_SEEDS: ServiceAreaSeed[] = [
  {
    name: 'Delray Beach',
    state: 'FL',
    centerLat: 26.4615,
    centerLng: -80.0728,
    radiusMiles: 3,
  },
  {
    name: 'Boca Raton',
    state: 'FL',
    centerLat: 26.3683,
    centerLng: -80.1289,
    radiusMiles: 3,
  },
  {
    name: 'Boynton Beach',
    state: 'FL',
    centerLat: 26.5254,
    centerLng: -80.0662,
    radiusMiles: 3,
  },
];
