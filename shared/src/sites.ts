export type Zone = 'Central' | 'North' | 'East' | 'West';

export interface Site {
  id: string;
  name: string;
  zone: Zone;
  lat: number;
  lng: number;
  /** Height of the ultrasonic sensor above the road surface. */
  mountHeightCm: number;
}

export const ZONES: Zone[] = ['Central', 'North', 'East', 'West'];

// Fictional sites placed around "Demo City" (drawn on a label-free basemap).
export const SITES: Site[] = [
  { id: 'C01', name: 'Station Road Subway', zone: 'Central', lat: 18.5285, lng: 73.8740, mountHeightCm: 320 },
  { id: 'C02', name: 'Riverside Junction', zone: 'Central', lat: 18.5205, lng: 73.8560, mountHeightCm: 280 },
  { id: 'C03', name: 'Old Bridge Chowk', zone: 'Central', lat: 18.5150, lng: 73.8650, mountHeightCm: 300 },
  { id: 'C04', name: 'Central Bus Stand', zone: 'Central', lat: 18.5330, lng: 73.8620, mountHeightCm: 260 },
  { id: 'C05', name: 'Temple Street Dip', zone: 'Central', lat: 18.5100, lng: 73.8520, mountHeightCm: 240 },
  { id: 'C06', name: 'Clock Tower Circle', zone: 'Central', lat: 18.5240, lng: 73.8450, mountHeightCm: 300 },
  { id: 'C07', name: 'Mill Lane Subway', zone: 'Central', lat: 18.5050, lng: 73.8700, mountHeightCm: 350 },
  { id: 'N01', name: 'Railway Colony Subway', zone: 'North', lat: 18.5850, lng: 73.8400, mountHeightCm: 340 },
  { id: 'N02', name: 'Canal Road Dip', zone: 'North', lat: 18.5920, lng: 73.8650, mountHeightCm: 250 },
  { id: 'N03', name: 'Hill View Crossing', zone: 'North', lat: 18.6050, lng: 73.8200, mountHeightCm: 280 },
  { id: 'N04', name: 'Industrial Estate Gate', zone: 'North', lat: 18.6120, lng: 73.8500, mountHeightCm: 300 },
  { id: 'N05', name: 'College Road Junction', zone: 'North', lat: 18.5700, lng: 73.8550, mountHeightCm: 260 },
  { id: 'N06', name: 'Sunrise Colony Lane', zone: 'North', lat: 18.5980, lng: 73.8880, mountHeightCm: 240 },
  { id: 'E01', name: 'Airport Road Underpass', zone: 'East', lat: 18.5600, lng: 73.9150, mountHeightCm: 360 },
  { id: 'E02', name: 'Lakeside Circle', zone: 'East', lat: 18.5400, lng: 73.9300, mountHeightCm: 280 },
  { id: 'E03', name: 'Tech Park Gate', zone: 'East', lat: 18.5500, lng: 73.9400, mountHeightCm: 300 },
  { id: 'E04', name: 'Ferry Ghat Road', zone: 'East', lat: 18.5250, lng: 73.9050, mountHeightCm: 260 },
  { id: 'E05', name: 'Stadium Road', zone: 'East', lat: 18.5050, lng: 73.9200, mountHeightCm: 280 },
  { id: 'E06', name: 'Wholesale Market Underpass', zone: 'East', lat: 18.4900, lng: 73.8950, mountHeightCm: 330 },
  { id: 'W01', name: 'Ring Road Ramp', zone: 'West', lat: 18.5150, lng: 73.7800, mountHeightCm: 300 },
  { id: 'W02', name: 'Green Park Junction', zone: 'West', lat: 18.5350, lng: 73.7950, mountHeightCm: 260 },
  { id: 'W03', name: 'Nalla Bridge', zone: 'West', lat: 18.4950, lng: 73.8100, mountHeightCm: 240 },
  { id: 'W04', name: 'Science Park Road', zone: 'West', lat: 18.5550, lng: 73.7700, mountHeightCm: 280 },
  { id: 'W05', name: 'Garden Square', zone: 'West', lat: 18.4750, lng: 73.7900, mountHeightCm: 260 },
  { id: 'W06', name: 'Valley Road Subway', zone: 'West', lat: 18.4650, lng: 73.8250, mountHeightCm: 340 },
];

const SITE_MAP = new Map(SITES.map((s) => [s.id, s]));

export const findSite = (id: string): Site | undefined => SITE_MAP.get(id);
