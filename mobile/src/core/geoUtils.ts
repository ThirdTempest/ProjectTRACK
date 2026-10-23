import { BoundingBox, MunicipalityFeature } from './types';
import type {
  LguType,
  CebuRegionZone,
  LguMeta,
  HierarchyFilterTier,
} from './types';

/**
 * Calculates great-circle distance between two coordinates in kilometers using Haversine formula.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Computes bounding box enclosing all coordinates in GeoJSON features.
 */
export function computeBoundingBox(features: MunicipalityFeature[]): BoundingBox {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  function traverseCoords(coords: any) {
    if (
      Array.isArray(coords) &&
      coords.length >= 2 &&
      typeof coords[0] === 'number' &&
      typeof coords[1] === 'number'
    ) {
      const lng = coords[0];
      const lat = coords[1];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    if (Array.isArray(coords)) {
      for (let i = 0; i < coords.length; i++) {
        traverseCoords(coords[i]);
      }
    }
  }

  for (let i = 0; i < features.length; i++) {
    traverseCoords(features[i].geometry.coordinates);
  }

  return { minLng, maxLng, minLat, maxLat };
}

/**
 * Transforms WGS84 geographic coordinate into 2D SVG canvas coordinates with inverted Y-axis.
 */
export function geoToSvgCoordinates(
  lng: number,
  lat: number,
  bounds: BoundingBox,
  width: number,
  height: number,
  padding: number = 0,
): { x: number; y: number } {
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  const lngSpan = bounds.maxLng - bounds.minLng || 1;
  const latSpan = bounds.maxLat - bounds.minLat || 1;

  const normX = (lng - bounds.minLng) / lngSpan;
  const normY = (bounds.maxLat - lat) / latSpan; // Invert Y since SVG origin is top-left

  const x = padding + normX * usableWidth;
  const y = padding + normY * usableHeight;

  return { x, y };
}

/**
 * Formats a numerical amount into Philippine Peso currency representation.
 */
export function formatCurrencyPHP(amount: number): string {
  if (isNaN(amount)) return '₱ 0';
  const rounded = Math.round(amount);
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `₱ ${formatted}`;
}

/**
 * Normalizes LGU names to standard title form for deterministic matching.
 * e.g., 'City of Bogo' -> 'Bogo City', 'Carcar City' -> 'Carcar City'
 */
export function normalizeLguName(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (/^city of\s+/i.test(trimmed)) {
    const raw = trimmed.replace(/^city of\s+/i, '').trim();
    return `${raw} City`;
  }
  return trimmed;
}

export interface GeofenceResult {
  isInside: boolean;
  distanceMeters: number;
}

/**
 * Checks if a user's location is within a defined geofence radius (default 150m) of a target coordinate.
 */
export function checkGeofenceProximity(
  targetLat: number,
  targetLng: number,
  userLat: number,
  userLng: number,
  maxRadiusMeters: number = 150,
): GeofenceResult {
  const distanceKm = haversineDistance(userLat, userLng, targetLat, targetLng);
  const distanceMeters = Math.round(distanceKm * 1000);
  return {
    isInside: distanceMeters <= maxRadiusMeters,
    distanceMeters,
  };
}

export interface ClusteredPinItem {
  id: string;
  isCluster: boolean;
  count: number;
  pinIds: string[];
  x: number;
  y: number;
  pins: any[];
  totalBudget?: number;
  primaryStatus?: string;
  isHotspot?: boolean;
}

/**
 * Zoom-aware proximity clustering for SVG map markers.
 *
 * Merges pins whose on-screen separation (distance * scale) is within pixelThreshold.
 * As the user zooms in, scale increases, causing the SVG merge distance to shrink
 * so overlapping pins naturally separate into individual project markers.
 */
export function clusterPins(
  renderedPins: any[],
  scale: number,
  screenPixelThreshold: number = 24,
): ClusteredPinItem[] {
  if (!Array.isArray(renderedPins) || renderedPins.length === 0) {
    return [];
  }

  // Convert screen pixel threshold to SVG coordinate threshold based on current zoom scale
  const safeScale = Math.max(0.5, scale);
  const thresholdSvg = screenPixelThreshold / safeScale;
  const thresholdSq = thresholdSvg * thresholdSvg;

  const clusters: ClusteredPinItem[] = [];
  const visited = new Set<string>();

  for (let i = 0; i < renderedPins.length; i++) {
    const current = renderedPins[i];
    if (visited.has(current.id)) continue;

    const group = [current];
    visited.add(current.id);

    for (let j = i + 1; j < renderedPins.length; j++) {
      const other = renderedPins[j];
      if (visited.has(other.id)) continue;

      const dx = current.x - other.x;
      const dy = current.y - other.y;
      const distSq = dx * dx + dy * dy;

      if (distSq <= thresholdSq) {
        group.push(other);
        visited.add(other.id);
      }
    }

    const isCluster = group.length > 1;
    const avgX = group.reduce((sum, p) => sum + p.x, 0) / group.length;
    const avgY = group.reduce((sum, p) => sum + p.y, 0) / group.length;

    let totalBudget = 0;
    let hasDelayed = false;
    let hasCompleted = false;
    let hasHotspot = false;

    for (const p of group) {
      if (typeof p.budget === 'number') totalBudget += p.budget;
      if (p.tone === 'warning' || p.status === 'Delayed') hasDelayed = true;
      if (p.status === 'Completed') hasCompleted = true;
      if (p.is_hotspot || (typeof p.report_count === 'number' && p.report_count > 0)) {
        hasHotspot = true;
      }
    }

    const primaryStatus = hasHotspot
      ? 'Hotspot'
      : hasDelayed
      ? 'Delayed'
      : hasCompleted
      ? 'Completed'
      : 'Ongoing';

    clusters.push({
      id: isCluster ? `cluster-${group.map((p) => p.id).join('-')}` : current.id,
      isCluster,
      count: group.length,
      pinIds: group.map((p) => p.id),
      x: isCluster ? avgX : current.x,
      y: isCluster ? avgY : current.y,
      pins: group,
      totalBudget,
      primaryStatus,
      isHotspot: hasHotspot,
    });
  }

  return clusters;
}

/**
 * Preserves authentic coordinates for pins.
 * Deprecated artificial circular dispersion to ensure natural geographic accuracy.
 */
export function disperseCoLocatedPins<T extends { id: string; x: number; y: number }>(
  pins: T[],
  _scale: number = 1.0,
  _proximityThreshold: number = 14,
): T[] {
  return pins;
}

/**
 * Hard geographic bounds for the whole Cebu province view, covering the mainland
 * plus the Bantayan and Camotes island groups (GeoJSON extends to ~124.57°E and
 * ~11.52°N — bounds must include these or MapLibre maxBounds clips the islands).
 */
export const CEBU_GEO_BOUNDS = {
  n: 11.6,
  s: 9.3,
  e: 124.7,
  w: 123.2,
};

/**
 * Converts the SVG vector-map scale (1.0 = whole province … 12 = street level)
 * into an equivalent MapLibre zoom level so both map engines share one focus API.
 * Scale 1.0 maps to province zoom 9; each doubling of scale adds 2 zoom levels.
 */
export function svgScaleToMapZoom(scale: number): number {
  const clampedScale = Math.min(12, Math.max(0.7, scale));
  return Math.min(18, Math.max(7.5, 9 + 2 * Math.log2(clampedScale)));
}

export interface NormalizedCoordinatesResult {
  lat: number;
  lng: number;
  status: 'ok' | 'clamped' | 'rejected';
}

export function normalizeCoordinates(
  lat: number,
  lng: number,
): NormalizedCoordinatesResult {
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    isNaN(lat) ||
    isNaN(lng) ||
    !isFinite(lat) ||
    !isFinite(lng)
  ) {
    return { lat: 10.3157, lng: 123.8854, status: 'rejected' };
  }

  // Hard geographic bounds for Cebu Province (Mainland + Bantayan + Camotes)
  const minLat = 9.35;
  const maxLat = 11.55;
  const minLng = 123.20;
  const maxLng = 124.65;

  if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) {
    return { lat, lng, status: 'rejected' };
  }

  // Geographic boundary sanity checks for neighboring islands:
  // 1. Bohol rejection: In southern latitudes (lat < 10.15), points east of lng 123.68
  //    are across the Bohol Strait on Bohol Island (e.g. lat 9.74, lng 123.93).
  if (lat < 10.15 && lng > 123.68) {
    return { lat, lng, status: 'rejected' };
  }

  // 2. Negros rejection: In southern/central latitudes (lat < 10.5), points west of
  //    lng 123.25 are across the Tañon Strait on Negros Island.
  if (lat < 10.5 && lng < 123.25) {
    return { lat, lng, status: 'rejected' };
  }

  return { lat, lng, status: 'ok' };
}

export const CEBU_HUCS = new Set<string>([
  'Cebu City',
  'Mandaue City',
  'Lapu-Lapu City',
]);

export const CEBU_COMPONENT_CITIES = new Set<string>([
  'Bogo City',
  'Carcar City',
  'Danao City',
  'Naga City',
  'Talisay City',
  'Toledo City',
]);

export const CEBU_ALL_CITIES = new Set<string>([
  ...CEBU_HUCS,
  ...CEBU_COMPONENT_CITIES,
]);

export const METRO_CEBU_LGUS = new Set<string>([
  'Cebu City',
  'Mandaue City',
  'Lapu-Lapu City',
  'Talisay City',
  'Naga City',
  'City of Naga',
  'Carcar City',
  'Danao City',
  'Consolacion',
  'Liloan',
  'Compostela',
  'Cordova',
  'San Fernando',
  'Minglanilla',
]);

export const CEBU_METRO_LGUS = METRO_CEBU_LGUS;

export const BANTAYAN_GROUP_LGUS = new Set<string>([
  'Bantayan',
  'Madridejos',
  'Santa Fe',
]);

export const CAMOTES_GROUP_LGUS = new Set<string>([
  'San Francisco',
  'Poro',
  'Tudela',
  'Pilar',
]);

export const NORTH_CEBU_LGUS = new Set<string>([
  'Bogo City',
  'Daanbantayan',
  'Medellin',
  'San Remigio',
  'Tabogon',
  'Borbon',
  'Sogod',
  'Catmon',
  'Carmen',
  'Tabuelan',
  'Tuburan',
]);

export const MIDWEST_CEBU_LGUS = new Set<string>([
  'Toledo City',
  'Balamban',
  'Asturias',
  'Pinamungajan',
  'Aloguinsan',
]);

export function getLguClassification(name: string): LguMeta {
  const normalized = normalizeLguName(name);

  let type: LguType = 'MUNICIPALITY';
  if (CEBU_HUCS.has(normalized)) {
    type = 'HUC';
  } else if (CEBU_COMPONENT_CITIES.has(normalized)) {
    type = 'COMPONENT_CITY';
  }

  let zone: CebuRegionZone = 'SOUTH_CEBU';
  let islandGroup: 'Mainland' | 'Bantayan' | 'Camotes' | 'Mactan' | 'Olango' = 'Mainland';

  if (BANTAYAN_GROUP_LGUS.has(normalized)) {
    zone = 'ISLAND_GROUPS';
    islandGroup = 'Bantayan';
  } else if (CAMOTES_GROUP_LGUS.has(normalized)) {
    zone = 'ISLAND_GROUPS';
    islandGroup = 'Camotes';
  } else if (normalized === 'Lapu-Lapu City' || normalized === 'Cordova') {
    zone = 'METRO_CEBU';
    islandGroup = 'Mactan';
  } else if (METRO_CEBU_LGUS.has(normalized)) {
    zone = 'METRO_CEBU';
  } else if (NORTH_CEBU_LGUS.has(normalized)) {
    zone = 'NORTH_CEBU';
  } else if (MIDWEST_CEBU_LGUS.has(normalized)) {
    zone = 'MIDWEST_CEBU';
  } else {
    zone = 'SOUTH_CEBU';
  }

  return {
    name,
    normalizedName: normalized,
    type,
    zone,
    islandGroup,
  };
}

export interface RegionPreset {
  id: string;
  label: string;
  subtitle: string;
  icon: string;
  lat: number;
  lng: number;
  zoom: number;
  name?: string; // backwards compatibility alias for label
  description?: string;
}

export const CEBU_REGION_PRESETS: RegionPreset[] = [
  {
    id: 'ALL_CEBU',
    label: 'All Cebu',
    name: 'All Cebu',
    subtitle: 'Province View',
    icon: '🏝️',
    lat: 10.3157,
    lng: 123.8854,
    zoom: 1.0,
    description: 'Full provincial geography & island groups',
  },
  {
    id: 'METRO_CEBU',
    label: 'Metro Cebu',
    name: 'Metro Cebu',
    subtitle: 'Tri-Cities & Hubs',
    icon: '🏙️',
    lat: 10.3157,
    lng: 123.9000,
    zoom: 3.8,
    description: 'Urban agglomeration & tri-cities',
  },
  {
    id: 'NORTH_CEBU',
    label: 'North Cebu',
    name: 'North Cebu',
    subtitle: 'Bogo & Daanbantayan',
    icon: '🌾',
    lat: 11.0200,
    lng: 123.9800,
    zoom: 3.5,
    description: 'Bogo City & northern agricultural municipalities',
  },
  {
    id: 'SOUTH_CEBU',
    label: 'South Cebu',
    name: 'South Cebu',
    subtitle: 'Argao, Oslob & Heritage',
    icon: '🌊',
    lat: 9.7800,
    lng: 123.4800,
    zoom: 3.4,
    description: 'Heritage coastal towns & southern corridor',
  },
  {
    id: 'MIDWEST_CEBU',
    label: 'Mid-West Coast',
    name: 'Mid-West Coast',
    subtitle: 'Toledo & Balamban',
    icon: '⛰️',
    lat: 10.4200,
    lng: 123.6800,
    zoom: 3.6,
    description: 'Toledo City, Balamban & western industrial zone',
  },
  {
    id: 'BANTAYAN',
    label: 'Bantayan Island',
    name: 'Bantayan Island',
    subtitle: 'North Island Group',
    icon: '🏖️',
    lat: 11.2000,
    lng: 123.7400,
    zoom: 4.8,
    description: 'Bantayan, Madridejos, and Santa Fe',
  },
  {
    id: 'CAMOTES',
    label: 'Camotes Islands',
    name: 'Camotes Islands',
    subtitle: 'East Island Group',
    icon: '⛵',
    lat: 10.6600,
    lng: 124.3600,
    zoom: 4.5,
    description: 'San Francisco, Poro, Tudela, and Pilar',
  },
];

export function isLguInHierarchyTier(
  lguName: string,
  tier: HierarchyFilterTier,
): boolean {
  if (tier === 'ALL') return true;
  const meta = getLguClassification(lguName);
  if (tier === 'CITIES') {
    return meta.type === 'HUC' || meta.type === 'COMPONENT_CITY';
  }
  if (tier === 'MUNICIPALITIES') {
    return meta.type === 'MUNICIPALITY';
  }
  if (tier === 'METRO_CEBU') {
    return (
      METRO_CEBU_LGUS.has(meta.normalizedName) ||
      METRO_CEBU_LGUS.has(meta.name) ||
      METRO_CEBU_LGUS.has(lguName)
    );
  }
  return true;
}

/**
 * Compute the SVG viewBox string that renders a zoomed/panned view of a
 * `width × height` map canvas WITHOUT raster scaling, so react-native-svg
 * re-rasterizes vector paths crisply at any zoom level.
 *
 * It inverts the on-screen mapping used elsewhere in the map component:
 *   screenX = width/2 + (svgX - width/2) * scale + offsetX
 * giving a visible span of `canvas / scale` positioned so identical geometry
 * lands on the same screen pixels as the previous transform-scale approach.
 */
export function computeMapViewBox(
  scale: number,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
): string {
  const safeScale = scale > 0 ? scale : 1;
  const vbWidth = width / safeScale;
  const vbHeight = height / safeScale;
  const vbMinX = width / 2 - (width / 2 + offsetX) / safeScale;
  const vbMinY = height / 2 - (height / 2 + offsetY) / safeScale;
  return `${vbMinX.toFixed(2)} ${vbMinY.toFixed(2)} ${vbWidth.toFixed(2)} ${vbHeight.toFixed(2)}`;
}
