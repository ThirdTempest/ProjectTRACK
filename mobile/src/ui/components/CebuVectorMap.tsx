import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
  memo,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  PanResponder,
  Animated,
} from 'react-native';
import Svg, { Path, G, Circle, Rect, Text as SvgText } from 'react-native-svg';
import {
  Pin,
  MunicipalityCollection,
  HierarchyFilterTier,
  LguMeta,
  BoundingBox,
} from '../../core/types';
import {
  computeBoundingBox,
  geoToSvgCoordinates,
  normalizeLguName,
  clusterPins,
  formatCurrencyPHP,
  getLguClassification,
  isLguInHierarchyTier,
  RegionPreset,
  computeMapViewBox,
} from '../../core/geoUtils';
import { haptics } from '../../services/haptics';
import cebuDataRaw from '../../assets/cebuMunicipalities.json';
import cebuBarangaysRaw from '../../assets/cebuBarangays.json';

const cebuData = cebuDataRaw as unknown as MunicipalityCollection;

const MIN_SCALE = 0.7;
const MAX_SCALE = 12.0;

export interface CebuVectorMapProps {
  selectedMunicipality?: string | null;
  selectedPinId?: string | null;
  hierarchyTier?: HierarchyFilterTier;
  pins?: Pin[];
  showAllPins?: boolean;
  onSelectMunicipality?: (name: string) => void;
  onSelectPin?: (pin: Pin) => void;
  onSelectCluster?: (cluster: {
    count: number;
    pins: Pin[];
    x: number;
    y: number;
    totalBudget?: number;
  }) => void;
  width?: number;
  height?: number;
  testID?: string;
}

export interface CebuVectorMapRef {
  animateToCoordinates: (lat: number, lng: number, zoom?: number) => void;
  recenter: () => void;
  focusPreset?: (preset: RegionPreset) => void;
  zoomToLgu?: (lguName: string) => void;
}

interface PathDataItem {
  rawName: string;
  normalizedName: string;
  meta: LguMeta;
  d: string;
  centroid: { x: number; y: number };
  rings: { x: number; y: number }[][];
}

/**
 * Standard ray-casting point-in-polygon algorithm for SVG map geometry.
 */
function isPointInRing(x: number, y: number, ring: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}


interface BarangayDataItem {
  name: string;
  d: string;
  centroid: { x: number; y: number };
}

function computeBarangaysForLgu(
  lguName: string | null | undefined,
  bounds: BoundingBox,
  width: number,
  height: number,
): BarangayDataItem[] {
  if (!lguName) return [];
  const norm = normalizeLguName(lguName).toLowerCase();
  let lguData: any = null;
  for (const key of Object.keys(cebuBarangaysRaw)) {
    if (normalizeLguName(key).toLowerCase() === norm || key.toLowerCase() === norm) {
      lguData = (cebuBarangaysRaw as any)[key];
      break;
    }
  }
  if (!lguData?.features) return [];

  return lguData.features.map((feature: any) => {
    let d = '';
    const name = feature.properties?.name || '';
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    function ringToPath(ring: number[][]) {
      let subPath = '';
      for (let i = 0; i < ring.length; i++) {
        const pt = geoToSvgCoordinates(ring[i][0], ring[i][1], bounds, width, height, 16);
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
        subPath += (i === 0 ? 'M ' : ' L ') + `${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      }
      return subPath + ' Z ';
    }

    if (feature.geometry?.type === 'Polygon') {
      for (const ring of feature.geometry.coordinates) {
        d += ringToPath(ring);
      }
    } else if (feature.geometry?.type === 'MultiPolygon') {
      for (const poly of feature.geometry.coordinates) {
        for (const ring of poly) {
          d += ringToPath(ring);
        }
      }
    }

    const centroid = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    };

    return { name, d, centroid };
  });
}

const BarangaysLayer = memo(function BarangaysLayer({
  barangays,
  scale,
}: {
  barangays: BarangayDataItem[];
  scale: number;
}) {
  if (!barangays || barangays.length === 0) return null;

  const fontSize = Math.max(6.5, 9.5 / Math.pow(scale, 0.28)) / scale;

  return (
    <G pointerEvents="none">
      {barangays.map((bgy, idx) => (
        <Path
          key={`bgy-poly-${idx}`}
          d={bgy.d}
          fill="rgba(255, 255, 255, 0.08)"
          stroke="#4b6355"
          strokeWidth={1.2 / scale}
          strokeDasharray={`${3 / scale},${3 / scale}`}
        />
      ))}
      {barangays.map((bgy, idx) => {
        if (!bgy.name || isNaN(bgy.centroid.x) || isNaN(bgy.centroid.y)) return null;
        return (
          <SvgText
            key={`bgy-lbl-${idx}`}
            x={bgy.centroid.x}
            y={bgy.centroid.y}
            fill="#ffffff"
            fontSize={fontSize}
            fontWeight="700"
            textAnchor="middle"
            opacity={0.92}
          >
            {bgy.name}
          </SvgText>
        );
      })}
    </G>
  );
});

// ============================================================================
// MEMOIZED LAYER 1: 53 Cebu LGUs (Consistent Harmonious Colors)
// ============================================================================
interface MunicipalitiesLayerProps {
  pathsData: PathDataItem[];
  selectedMunicipality?: string | null;
  hierarchyTier?: HierarchyFilterTier;
  strokeWidthBase: number;
  onSelectMunicipality?: (name: string) => void;
}

const MunicipalitiesLayer = memo(function MunicipalitiesLayer({
  pathsData,
  selectedMunicipality,
  hierarchyTier = 'ALL',
  strokeWidthBase,
  onSelectMunicipality,
}: MunicipalitiesLayerProps) {
  const normSelected = useMemo(
    () => (selectedMunicipality ? normalizeLguName(selectedMunicipality).toLowerCase() : null),
    [selectedMunicipality],
  );

  return (
    <G>
      {pathsData.map((item) => {
        const isSelected =
          Boolean(normSelected) &&
          (normSelected === item.normalizedName.toLowerCase() ||
            normSelected === item.rawName.toLowerCase());

        const matchesTier = isLguInHierarchyTier(item.rawName, hierarchyTier);

        // Consistent base styling across all 53 Cebu LGUs (matching Website's sage & dark-teal)
        const baseFill = '#8cae90';
        const baseStroke = '#2c3d36';
        const strokeMultiplier = 1.0;

        // Selected state takes absolute visual priority (keeps exact '#1f3d3c' for tests)
        const fillColor = isSelected ? '#1f3d3c' : baseFill;
        const strokeColor = isSelected ? '#0f2423' : baseStroke;
        const strokeWidth = isSelected
          ? strokeWidthBase * 2.8
          : strokeWidthBase * strokeMultiplier;

        const opacity = matchesTier || isSelected ? (normSelected ? (isSelected ? 1.0 : 0.45) : 1.0) : 0.42;

        return (
          <Path
            key={item.rawName}
            testID={`muni-path-${item.rawName}`}
            d={item.d}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            opacity={opacity}
            onPress={() => {
              haptics.triggerSelection();
              onSelectMunicipality?.(item.normalizedName);
            }}
          />
        );
      })}
    </G>
  );
});

// ============================================================================
// MEMOIZED LAYER 2: Place & Administrative Navigation Labels
// ============================================================================
interface PlaceLabelsLayerProps {
  pathsData: PathDataItem[];
  scale: number;
  hierarchyTier?: HierarchyFilterTier;
}

const PlaceLabelsLayer = memo(function PlaceLabelsLayer({
  pathsData,
  scale,
  hierarchyTier = 'ALL',
}: PlaceLabelsLayerProps) {
  // Cities show earlier at scale >= 1.25, Municipalities at scale >= 1.6
  if (scale < 1.25) return null;

  const fontSize = Math.max(7.0, 9.5 / Math.pow(scale, 0.25)) / scale;

  return (
    <>
      <G pointerEvents="none">
        {pathsData.map((item) => {
          const isCity =
            item.meta.type === 'HUC' || item.meta.type === 'COMPONENT_CITY';

          if (!isCity && scale < 1.6 && hierarchyTier !== 'MUNICIPALITIES') {
            return null;
          }

          const labelColor = '#132c2a';

          return (
            <SvgText
              key={`label-${item.rawName}`}
              x={item.centroid.x}
              y={item.centroid.y}
              fill={labelColor}
              opacity={0.8}
              fontSize={fontSize}
              fontWeight={isCity ? '900' : '700'}
              textAnchor="middle"
            >
              {item.normalizedName}
            </SvgText>
          );
        })}
      </G>
      <View
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          opacity: 0,
          pointerEvents: 'none',
        }}
      >
        {pathsData.map((item) => (
          <Text key={`lbl-text-${item.rawName}`}>{item.normalizedName}</Text>
        ))}
      </View>
    </>
  );
});

// ============================================================================
// MEMOIZED LAYER 3: Project Pins & Density Clusters
// ============================================================================
interface PinsLayerProps {
  clusters: ReturnType<typeof clusterPins>;
  pins: Pin[];
  scale: number;
  selectedPinId?: string | null;
  onSelectPin?: (pin: Pin) => void;
  onSelectCluster?: (cluster: {
    count: number;
    pins: Pin[];
    x: number;
    y: number;
    totalBudget?: number;
  }) => void;
  onClusterPress?: () => void;
}

const PinsLayer = memo(function PinsLayer({
  clusters,
  pins,
  scale,
  selectedPinId,
  onSelectPin,
  onSelectCluster,
  onClusterPress,
}: PinsLayerProps) {
  if (!clusters || clusters.length === 0) return null;

  return (
    <G>
      {clusters.map((item) => {
        const isCluster = item.isCluster;
        const firstPin = item.pins[0];
        const isSelected = selectedPinId === firstPin?.id;

        // Core colors matching website (.pin--emerald, .pin--amber, .pin--rose, .pin--cyan)
        let coreColor = '#f59e0b'; // Amber for ongoing
        let glowColor = 'rgba(245, 158, 11, 0.45)';

        if (item.isHotspot || item.primaryStatus === 'Hotspot') {
          coreColor = '#ef4444';
          glowColor = 'rgba(239, 68, 68, 0.45)';
        } else if (item.primaryStatus === 'Delayed') {
          coreColor = '#ef4444';
          glowColor = 'rgba(239, 68, 68, 0.45)';
        } else if (item.primaryStatus === 'Completed') {
          coreColor = '#10b981';
          glowColor = 'rgba(16, 185, 129, 0.45)';
        }

        // Diamond size: screen size scaled to SVG units
        const screenSize = isCluster
          ? item.count >= 100
            ? 19.0
            : item.count >= 10
            ? 16.5
            : 14.0
          : isSelected
          ? 13.0
          : 11.0;
        const size = screenSize / scale;
        const halfSize = size / 2;
        const rx = 2.2 / scale;
        const strokeW = (isSelected ? 1.8 : 1.2) / scale;
        const hitR = Math.max(22 / scale, halfSize * 2.8);

        // Cluster count font size and vertical alignment inside diamond
        const countFontSize = (item.count >= 100 ? 7.0 : item.count >= 10 ? 8.0 : 8.8) / scale;
        const countYOffset = (item.count >= 100 ? 2.4 : item.count >= 10 ? 2.8 : 3.0) / scale;

        return (
          <G
            key={item.id}
            testID={isCluster ? `map-cluster-${item.count}` : `map-pin-${firstPin.id}`}
            onPress={() => {
              haptics.triggerSelection();
              if (isCluster) {
                if (onSelectCluster) {
                  onSelectCluster({
                    count: item.count,
                    pins: item.pins,
                    x: item.x,
                    y: item.y,
                    totalBudget: item.totalBudget,
                  });
                } else {
                  onClusterPress?.();
                }
              } else {
                onSelectPin?.(pins.find((p) => p.id === firstPin.id) || firstPin);
              }
            }}
          >
            {/* Generous touch target */}
            <Circle cx={item.x} cy={item.y} r={hitR} fill="transparent" />

            {/* Radar ring for hotspots */}
            {item.isHotspot && (
              <Circle
                cx={item.x}
                cy={item.y}
                r={halfSize * 1.414 + 6 / scale}
                fill="none"
                stroke="#ef4444"
                strokeWidth={strokeW}
                strokeDasharray={`${2.5 / scale},${2.5 / scale}`}
                opacity={0.85}
              />
            )}

            {/* Selection golden highlight ring */}
            {isSelected && (
              <Circle
                cx={item.x}
                cy={item.y}
                r={halfSize * 1.414 + 4 / scale}
                fill="none"
                stroke="#facc15"
                strokeWidth={2 / scale}
                opacity={0.95}
              />
            )}

            {/* Soft glow underneath diamond */}
            <Rect
              x={item.x - (halfSize + 2.5 / scale)}
              y={item.y - (halfSize + 2.5 / scale)}
              width={size + 5 / scale}
              height={size + 5 / scale}
              rx={rx + 1.2 / scale}
              ry={rx + 1.2 / scale}
              fill={glowColor}
              opacity={0.45}
              transform={`rotate(45, ${item.x}, ${item.y})`}
            />

            {/* Diamond (Rotated Square with rounded corners and crisp white border) */}
            <Rect
              x={item.x - halfSize}
              y={item.y - halfSize}
              width={size}
              height={size}
              rx={rx}
              ry={rx}
              fill={coreColor}
              stroke="#ffffff"
              strokeWidth={strokeW}
              transform={`rotate(45, ${item.x}, ${item.y})`}
            />

            {/* Cluster count label inside diamond */}
            {isCluster && (
              <SvgText
                x={item.x}
                y={item.y + countYOffset}
                fill="#ffffff"
                fontSize={countFontSize}
                fontWeight="900"
                textAnchor="middle"
              >
                {item.count}
              </SvgText>
            )}
          </G>
        );
      })}
    </G>
  );
});

// ============================================================================
// MAIN CEBU VECTOR MAP COMPONENT (HARDWARE ACCELERATED 60-120 FPS)
// ============================================================================
function CebuVectorMapImpl(
  {
    selectedMunicipality,
    selectedPinId,
    hierarchyTier = 'ALL',
    pins = [],
    showAllPins = false,
    onSelectMunicipality,
    onSelectPin,
    onSelectCluster,
    width: propWidth,
    height: propHeight,
    testID = 'cebu-vector-map',
  }: CebuVectorMapProps,
  ref: any,
) {
  const windowDims = useWindowDimensions();

  const width = Math.max(280, propWidth ?? windowDims?.width ?? 360);
  const height = Math.max(
    280,
    propHeight ?? (windowDims?.height ? windowDims.height * 0.65 : 480),
  );

  const [scale, setScale] = useState(1.0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scaleAnim = useRef(new Animated.Value(1.0)).current;

  const scaleRef = useRef(1.0);
  const offsetRef = useRef({ x: 0, y: 0 });
  const startOffset = useRef({ x: 0, y: 0 });
  const initialDistance = useRef<number | null>(null);
  const initialScale = useRef(1.0);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const touchStartRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const wasDoubleTapRef = useRef<boolean>(false);
  const containerRef = useRef<View>(null);
  const containerPagePos = useRef({ x: 0, y: 0 });

  const bounds = useMemo(() => computeBoundingBox(cebuData?.features || []), []);

  useImperativeHandle(
    ref,
    () => ({
      animateToCoordinates: (lat: number, lng: number, zoom = 3.5) => {
        const pt = geoToSvgCoordinates(lng, lat, bounds, width, height, 16);
        const targetScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, zoom));
        const targetX = (width / 2 - pt.x) * targetScale;
        const targetY = (height / 2 - pt.y) * targetScale;

        scaleRef.current = targetScale;
        offsetRef.current = { x: targetX, y: targetY };
        setScale(targetScale);
        setOffset({ x: targetX, y: targetY });

        Animated.parallel([
          Animated.spring(pan, {
            toValue: { x: targetX, y: targetY },
            useNativeDriver: true,
            bounciness: 0,
          }),
          Animated.spring(scaleAnim, {
            toValue: targetScale,
            useNativeDriver: true,
            bounciness: 0,
          }),
        ]).start();
      },
      recenter: () => {
        handleReset();
      },
      focusPreset: (preset: RegionPreset) => {
        const pt = geoToSvgCoordinates(preset.lng, preset.lat, bounds, width, height, 16);
        const targetScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, preset.zoom));
        const targetX = (width / 2 - pt.x) * targetScale;
        const targetY = (height / 2 - pt.y) * targetScale;

        scaleRef.current = targetScale;
        offsetRef.current = { x: targetX, y: targetY };
        setScale(targetScale);
        setOffset({ x: targetX, y: targetY });

        Animated.parallel([
          Animated.timing(pan, {
            toValue: { x: targetX, y: targetY },
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: targetScale,
            duration: 250,
            useNativeDriver: true,
          }),
        ]).start();
      },
      zoomToLgu: (lguName: string) => {
        const normTarget = normalizeLguName(lguName).toLowerCase();
        const targetFeature = (cebuData?.features || []).find(
          (f: any) => normalizeLguName(f.properties?.name || '').toLowerCase() === normTarget,
        );

        if (targetFeature) {
          const box = computeBoundingBox([targetFeature]);
          if (box.minLng !== Infinity && box.maxLng !== -Infinity) {
            const centerLng = (box.minLng + box.maxLng) / 2;
            const centerLat = (box.minLat + box.maxLat) / 2;
            const centerPt = geoToSvgCoordinates(centerLng, centerLat, bounds, width, height, 16);

            const zoomScale = 3.5;
            const targetX = (width / 2 - centerPt.x) * zoomScale;
            const targetY = (height / 2 - centerPt.y) * zoomScale;

            scaleRef.current = zoomScale;
            offsetRef.current = { x: targetX, y: targetY };
            setScale(zoomScale);
            setOffset({ x: targetX, y: targetY });

            Animated.parallel([
              Animated.spring(pan, {
                toValue: { x: targetX, y: targetY },
                useNativeDriver: true,
                bounciness: 0,
              }),
              Animated.spring(scaleAnim, {
                toValue: zoomScale,
                useNativeDriver: true,
                bounciness: 0,
              }),
            ]).start();
          }
        }
      },
    }),
    [bounds, width, height],
  );

  // Auto-zoom to selected municipality
  useEffect(() => {
    if (!selectedMunicipality) {
      scaleRef.current = 1.0;
      offsetRef.current = { x: 0, y: 0 };
      pan.setValue({ x: 0, y: 0 });
      scaleAnim.setValue(1.0);
      setScale(1.0);
      setOffset({ x: 0, y: 0 });
      return;
    }

    const normTarget = normalizeLguName(selectedMunicipality).toLowerCase();
    const targetFeature = (cebuData?.features || []).find(
      (f: any) => normalizeLguName(f.properties?.name || '').toLowerCase() === normTarget,
    );

    if (targetFeature) {
      const box = computeBoundingBox([targetFeature]);
      if (box.minLng !== Infinity && box.maxLng !== -Infinity) {
        const centerLng = (box.minLng + box.maxLng) / 2;
        const centerLat = (box.minLat + box.maxLat) / 2;
        const centerPt = geoToSvgCoordinates(centerLng, centerLat, bounds, width, height, 16);

        const zoomScale = 3.2;
        const targetX = (width / 2 - centerPt.x) * zoomScale;
        const targetY = (height / 2 - centerPt.y) * zoomScale;

        scaleRef.current = zoomScale;
        offsetRef.current = { x: targetX, y: targetY };
        setScale(zoomScale);
        setOffset({ x: targetX, y: targetY });

        Animated.parallel([
          Animated.timing(pan, {
            toValue: { x: targetX, y: targetY },
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: zoomScale,
            duration: 250,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }
  }, [selectedMunicipality, bounds, width, height]);

  // Build SVG path commands, centroids, rings, and classification metadata for all 53 LGUs
  const pathsData: PathDataItem[] = useMemo(() => {
    return (cebuData?.features || []).map((feature) => {
      const name = feature.properties.name;
      const normalized = normalizeLguName(name);
      const meta = getLguClassification(name);
      let d = '';
      const rings: { x: number; y: number }[][] = [];

      function ringToPath(ring: number[][]) {
        let subPath = '';
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < ring.length; i++) {
          const pt = geoToSvgCoordinates(
            ring[i][0],
            ring[i][1],
            bounds,
            width,
            height,
            16,
          );
          pts.push(pt);
          subPath += (i === 0 ? 'M ' : ' L ') + `${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
        }
        rings.push(pts);
        return subPath + ' Z ';
      }

      if (feature.geometry.type === 'Polygon') {
        const polyRings = feature.geometry.coordinates as number[][][];
        for (const ring of polyRings) {
          d += ringToPath(ring);
        }
      } else if (feature.geometry.type === 'MultiPolygon') {
        const polys = feature.geometry.coordinates as number[][][][];
        for (const poly of polys) {
          for (const ring of poly) {
            d += ringToPath(ring);
          }
        }
      }

      const box = computeBoundingBox([feature]);
      const centerLng = (box.minLng + box.maxLng) / 2;
      const centerLat = (box.minLat + box.maxLat) / 2;
      const centroid = geoToSvgCoordinates(centerLng, centerLat, bounds, width, height, 16);

      return {
        rawName: name,
        normalizedName: normalized,
        meta,
        d,
        centroid,
        rings,
      };
    });
  }, [bounds, width, height]);

  const normSelected = useMemo(
    () => (selectedMunicipality ? normalizeLguName(selectedMunicipality).toLowerCase() : null),
    [selectedMunicipality],
  );

  const selectedLguItem = useMemo(() => {
    if (!normSelected) return null;
    return pathsData.find(
      (item) =>
        item.normalizedName.toLowerCase() === normSelected ||
        item.rawName.toLowerCase() === normSelected,
    ) || null;
  }, [pathsData, normSelected]);

  // Compute barangays when an LGU is selected
  const selectedBarangays = useMemo(() => {
    if (!selectedMunicipality) return [];
    return computeBarangaysForLgu(selectedMunicipality, bounds, width, height);
  }, [selectedMunicipality, bounds, width, height]);

  // When an area is selected, ONLY show projects in that specified area.
  // If no area is selected, zero dots are rendered (matching the website).
  const scopedPins = useMemo(() => {
    if (!normSelected && !showAllPins) return [];
    if (!normSelected && showAllPins) return pins;
    return pins.filter(
      (p) => normalizeLguName(p.lgu).toLowerCase() === normSelected,
    );
  }, [pins, normSelected, showAllPins]);

  // Map pins to SVG space and guarantee dots are contained ONLY in that area
  const basePins = useMemo(() => {
    if (scopedPins.length === 0) return [];
    return scopedPins.map((pin) => {
      let coords = geoToSvgCoordinates(
        pin.lng,
        pin.lat,
        bounds,
        width,
        height,
        16,
      );

      // If an area is selected, verify and clamp dot inside the LGU polygon rings
      if (selectedLguItem && selectedLguItem.rings && selectedLguItem.rings.length > 0) {
        let inside = false;
        for (const ring of selectedLguItem.rings) {
          if (isPointInRing(coords.x, coords.y, ring)) {
            inside = true;
            break;
          }
        }
        // If coordinate fell slightly outside, snap it towards the LGU centroid
        if (!inside) {
          coords = {
            x: coords.x * 0.35 + selectedLguItem.centroid.x * 0.65,
            y: coords.y * 0.35 + selectedLguItem.centroid.y * 0.65,
          };
        }
      }

      return {
        ...pin,
        x: coords.x,
        y: coords.y,
      };
    });
  }, [scopedPins, bounds, width, height, selectedLguItem]);

  const steppedClusterScale = Math.round(scale * 4) / 4;
  const displayPinClusters = useMemo(() => {
    if (basePins.length === 0) return [];
    // Dynamic proximity clustering: nearby projects merge into 1 diamond dot
    // with count at lower zoom. As user zooms in, dots naturally split!
    return clusterPins(basePins, steppedClusterScale, 26);
  }, [basePins, steppedClusterScale]);

  const activeSelectedPin = useMemo(() => {
    if (!selectedPinId) return null;
    return basePins.find((p) => p.id === selectedPinId) || null;
  }, [selectedPinId, basePins]);

  const pinLguMeta = useMemo(() => {
    return activeSelectedPin ? getLguClassification(activeSelectedPin.lgu) : null;
  }, [activeSelectedPin]);

  const calloutPosition = useMemo(() => {
    if (!activeSelectedPin) return null;
    const screenX = width / 2 + (activeSelectedPin.x - width / 2) * scale + offset.x;
    const screenY = height / 2 + (activeSelectedPin.y - height / 2) * scale + offset.y;

    const cardW = Math.min(270, width - 36);
    const left = Math.min(Math.max(16, screenX - cardW / 2), width - cardW - 16);
    const top = screenY > 160 ? screenY - 130 : screenY + 24;

    const visible =
      screenX > -60 && screenX < width + 60 && screenY > -60 && screenY < height + 60;

    return { left, top, width: cardW, visible };
  }, [activeSelectedPin, scale, offset, width, height]);

  // Zoom/pan driven by the SVG viewBox so react-native-svg re-rasterizes vectors
  // crisply at every zoom level (no raster magnification = no blur). Derived to
  // match the existing screen<->SVG mapping:
  //   screenX = width/2 + (svgX - width/2) * scale + offset.x
  // Inverting for the viewBox: visible size = canvas / scale, origin offset so
  // the same geometry lands on the same screen pixels as before.
  const viewBox = useMemo(() => {
    return computeMapViewBox(scale, offset.x, offset.y, width, height);
  }, [scale, offset, width, height]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            Math.abs(gestureState.dx) > 10 ||
            Math.abs(gestureState.dy) > 10 ||
            gestureState.numberActiveTouches === 2
          );
        },
        onMoveShouldSetPanResponderCapture: () => false,
        onPanResponderGrant: (evt) => {
          startOffset.current = { ...offsetRef.current };
          const pageX = evt.nativeEvent.pageX;
          const pageY = evt.nativeEvent.pageY;
          const touchX =
            typeof pageX === 'number' && containerPagePos.current.x > 0
              ? pageX - containerPagePos.current.x
              : evt.nativeEvent.locationX;
          const touchY =
            typeof pageY === 'number' && containerPagePos.current.y > 0
              ? pageY - containerPagePos.current.y
              : evt.nativeEvent.locationY;

          touchStartRef.current = {
            time: Date.now(),
            x: touchX,
            y: touchY,
          };
          const now = Date.now();
          if (evt.nativeEvent.touches && evt.nativeEvent.touches.length === 2) {
            const [t1, t2] = evt.nativeEvent.touches;
            initialDistance.current = Math.hypot(
              t1.pageX - t2.pageX,
              t1.pageY - t2.pageY,
            );
            initialScale.current = scaleRef.current;
          } else {
            initialDistance.current = null;
            if (
              lastTapRef.current &&
              now - lastTapRef.current.time < 320 &&
              Math.hypot(
                touchX - lastTapRef.current.x,
                touchY - lastTapRef.current.y,
              ) < 40
            ) {
              haptics.triggerLightImpact();
              const targetScale = Math.min(
                MAX_SCALE,
                Number((scaleRef.current * 1.8).toFixed(2)),
              );
              const targetX = (width / 2 - touchX) * (targetScale / scaleRef.current);
              const targetY = (height / 2 - touchY) * (targetScale / scaleRef.current);

              scaleRef.current = targetScale;
              offsetRef.current = { x: targetX, y: targetY };

              Animated.parallel([
                Animated.timing(pan, {
                  toValue: { x: targetX, y: targetY },
                  duration: 200,
                  useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                  toValue: targetScale,
                  duration: 200,
                  useNativeDriver: true,
                }),
              ]).start(() => {
                setScale(targetScale);
                setOffset({ x: targetX, y: targetY });
              });

              lastTapRef.current = null;
              wasDoubleTapRef.current = true;
              return;
            }
            wasDoubleTapRef.current = false;
            lastTapRef.current = {
              time: now,
              x: touchX,
              y: touchY,
            };
          }
        },
        onPanResponderMove: (evt, gestureState) => {
          if (
            evt.nativeEvent.touches &&
            evt.nativeEvent.touches.length === 2 &&
            initialDistance.current
          ) {
            const [t1, t2] = evt.nativeEvent.touches;
            const currentDistance = Math.hypot(
              t1.pageX - t2.pageX,
              t1.pageY - t2.pageY,
            );
            const pinchRatio = currentDistance / initialDistance.current;
            const nextScale = Math.min(
              MAX_SCALE,
              Math.max(MIN_SCALE, Number((initialScale.current * pinchRatio).toFixed(2))),
            );
            scaleRef.current = nextScale;
            scaleAnim.setValue(nextScale);
            // Commit live so the SVG viewBox re-rasterizes crisply at the new zoom.
            setScale(nextScale);
          } else if (!evt.nativeEvent.touches || evt.nativeEvent.touches.length <= 1) {
            const maxPanX = width * scaleRef.current * 1.2;
            const maxPanY = height * scaleRef.current * 1.6;
            const nextX = Math.min(
              maxPanX,
              Math.max(-maxPanX, startOffset.current.x + gestureState.dx),
            );
            const nextY = Math.min(
              maxPanY,
              Math.max(-maxPanY, startOffset.current.y + gestureState.dy),
            );
            offsetRef.current = { x: nextX, y: nextY };
            pan.setValue({ x: nextX, y: nextY });
            // Commit live so the viewBox pans with the gesture.
            setOffset({ x: nextX, y: nextY });
          }
        },
        onPanResponderRelease: (evt, gestureState) => {
          initialDistance.current = null;
          setOffset({ ...offsetRef.current });
          setScale(scaleRef.current);

          if (wasDoubleTapRef.current) {
            wasDoubleTapRef.current = false;
            return;
          }

          const touchDuration = touchStartRef.current ? Date.now() - touchStartRef.current.time : 999;
          const isTap =
            Math.abs(gestureState.dx) < 12 &&
            Math.abs(gestureState.dy) < 12 &&
            touchDuration < 380;

          if (!isTap) return;

          // Compute robust touch coordinates across Android/iOS/Web
          const pageX = evt.nativeEvent.pageX;
          const pageY = evt.nativeEvent.pageY;
          const touchX =
            typeof pageX === 'number' && containerPagePos.current.x > 0
              ? pageX - containerPagePos.current.x
              : evt.nativeEvent.locationX;
          const touchY =
            typeof pageY === 'number' && containerPagePos.current.y > 0
              ? pageY - containerPagePos.current.y
              : evt.nativeEvent.locationY;

          // Convert screen touch coordinates to map SVG space
          const svgX = (touchX - offsetRef.current.x - width / 2) / scaleRef.current + width / 2;
          const svgY = (touchY - offsetRef.current.y - height / 2) / scaleRef.current + height / 2;

          // 1. Hit-test Project Pins
          let closestPin: (typeof basePins)[0] | null = null;
          let minPinDist = Infinity;
          for (const pin of basePins) {
            const screenDist = Math.hypot(pin.x - svgX, pin.y - svgY) * scaleRef.current;
            if (screenDist < minPinDist) {
              minPinDist = screenDist;
              closestPin = pin;
            }
          }

          // If tapped within 36px of a pin on mobile screen (finger-friendly touch target)
          if (closestPin && minPinDist <= 36) {
            haptics.triggerSelection();
            const fullPin = pins.find((p) => p.id === closestPin!.id) || closestPin;
            onSelectPin?.(fullPin);
            return;
          }

          // 2. Hit-test Municipality Boundaries & Centroids
          let tappedMuni: PathDataItem | null = null;

          // Exact polygon ring hit test
          for (const item of pathsData) {
            if (item.rings) {
              for (const ring of item.rings) {
                if (isPointInRing(svgX, svgY, ring)) {
                  tappedMuni = item;
                  break;
                }
              }
              if (tappedMuni) break;
            }
          }

          // Fallback: closest centroid if tapped near coast/border
          if (!tappedMuni) {
            let minCentroidDist = Infinity;
            for (const item of pathsData) {
              const screenDist = Math.hypot(item.centroid.x - svgX, item.centroid.y - svgY) * scaleRef.current;
              if (screenDist < minCentroidDist) {
                minCentroidDist = screenDist;
                tappedMuni = item;
              }
            }
            if (minCentroidDist > 55) {
              tappedMuni = null;
            }
          }

          if (tappedMuni) {
            haptics.triggerSelection();
            onSelectMunicipality?.(tappedMuni.normalizedName);
          }
        },
      }),
    [width, height, pan, scaleAnim, basePins, pathsData, pins, onSelectPin, onSelectMunicipality],
  );

  const handleZoomIn = () => {
    haptics.triggerLightImpact();
    const next = Math.min(MAX_SCALE, Number((scaleRef.current + 0.75).toFixed(2)));
    scaleRef.current = next;
    setScale(next);

    Animated.timing(scaleAnim, {
      toValue: next,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  const handleZoomOut = () => {
    haptics.triggerLightImpact();
    const next = Math.max(MIN_SCALE, Number((scaleRef.current - 0.75).toFixed(2)));
    scaleRef.current = next;
    setScale(next);

    Animated.timing(scaleAnim, {
      toValue: next,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  const handleReset = () => {
    haptics.triggerLightImpact();
    scaleRef.current = 1.0;
    offsetRef.current = { x: 0, y: 0 };
    setScale(1.0);
    setOffset({ x: 0, y: 0 });

    Animated.parallel([
      Animated.timing(pan, {
        toValue: { x: 0, y: 0 },
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1.0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const strokeScale = Math.round(Math.sqrt(Math.max(1, scale)) * 2) / 2;
  const strokeWidthBase = 0.75 / strokeScale;

  return (
    <View
      ref={containerRef}
      onLayout={() => {
        containerRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
          if (typeof pageX === 'number' && typeof pageY === 'number') {
            containerPagePos.current = { x: pageX, y: pageY };
          }
        });
      }}
      style={[styles.container, { width, height }]}
      testID={testID}
    >
      {/* Map touch surface for gestures & direct hit-testing */}
      <View
        style={StyleSheet.absoluteFill}
        testID="map-gesture-surface"
        {...panResponder.panHandlers}
      >
        {/* Vector layer: zoom & pan are driven by the SVG viewBox below, so
            react-native-svg re-rasterizes paths crisply at every zoom level. */}
        <View style={[styles.mapLayer, { width, height }]}>
          <Svg width={width} height={height} viewBox={viewBox} testID="map-svg-canvas">
            <G>
              {/* 53 Cebu LGUs with Administrative Distinction */}
              <MunicipalitiesLayer
                pathsData={pathsData}
                selectedMunicipality={selectedMunicipality}
                hierarchyTier={hierarchyTier}
                strokeWidthBase={strokeWidthBase}
                onSelectMunicipality={onSelectMunicipality}
              />

              {/* Internal Barangay Subdivisions when an LGU is selected */}
              {selectedBarangays.length > 0 && (
                <BarangaysLayer barangays={selectedBarangays} scale={scale} />
              )}

              {/* Place Navigation Labels (Clean & Uniform) */}
              <PlaceLabelsLayer
                pathsData={pathsData}
                scale={scale}
                hierarchyTier={hierarchyTier}
              />

              {/* Project Pins & Density Clusters */}
              <PinsLayer
                clusters={displayPinClusters}
                pins={pins}
                scale={scale}
                selectedPinId={selectedPinId}
                onSelectPin={onSelectPin}
                onSelectCluster={onSelectCluster}
                onClusterPress={() => {
                  const nextScale = Math.min(
                    MAX_SCALE,
                    Number((scaleRef.current + 1.2).toFixed(2)),
                  );
                  scaleRef.current = nextScale;
                  Animated.timing(scaleAnim, {
                    toValue: nextScale,
                    duration: 200,
                    useNativeDriver: true,
                  }).start(() => {
                    setScale(nextScale);
                  });
                }}
              />
            </G>
          </Svg>
        </View>
      </View>

      {/* Floating Interactive Callout Card on Selected Project Pin */}
      {activeSelectedPin && calloutPosition?.visible && (
        <View
          style={[
            styles.interactiveCallout,
            {
              left: calloutPosition.left,
              top: calloutPosition.top,
              width: calloutPosition.width,
            },
          ]}
          testID="map-pin-callout-card"
        >
          <View style={styles.calloutHeader}>
            <View
              style={[
                styles.calloutStatusPill,
                activeSelectedPin.status === 'Completed'
                  ? styles.statusCompleted
                  : activeSelectedPin.status === 'Delayed'
                  ? styles.statusDelayed
                  : styles.statusOngoing,
              ]}
            >
              <Text style={styles.calloutStatusText}>
                {activeSelectedPin.status || 'Ongoing'}
              </Text>
            </View>
            <Text style={styles.calloutLguText} numberOfLines={1}>
              {pinLguMeta?.type === 'HUC'
                ? '👑 '
                : pinLguMeta?.type === 'COMPONENT_CITY'
                ? '🏢 '
                : '📍 '}
              {activeSelectedPin.lgu}
            </Text>
          </View>

          <Text style={styles.calloutTitle} numberOfLines={2}>
            {activeSelectedPin.name}
          </Text>

          {activeSelectedPin.contractor && (
            <Text style={styles.calloutContractor} numberOfLines={1}>
              🏗️ {activeSelectedPin.contractor}
            </Text>
          )}

          <View style={styles.calloutFooter}>
            {typeof activeSelectedPin.budget === 'number' && (
              <Text style={styles.calloutBudget}>
                {formatCurrencyPHP(activeSelectedPin.budget).split('.')[0]}
              </Text>
            )}
            <TouchableOpacity
              style={styles.calloutActionBtn}
              onPress={() => {
                haptics.triggerSelection();
                onSelectPin?.(activeSelectedPin);
              }}
              activeOpacity={0.8}
              testID="callout-view-details-btn"
            >
              <Text style={styles.calloutActionText}>View Details →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Floating Zoom & Pan Controls */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity
          testID="zoom-in-btn"
          style={styles.controlBtn}
          onPress={handleZoomIn}
          activeOpacity={0.7}
          accessibilityLabel="Zoom In"
        >
          <Text style={styles.controlBtnText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="zoom-out-btn"
          style={styles.controlBtn}
          onPress={handleZoomOut}
          activeOpacity={0.7}
          accessibilityLabel="Zoom Out"
        >
          <Text style={styles.controlBtnText}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="zoom-reset-btn"
          style={[styles.controlBtn, styles.resetBtn]}
          onPress={handleReset}
          activeOpacity={0.7}
          accessibilityLabel="Reset View"
        >
          <Text style={styles.resetBtnText}>↺</Text>
        </TouchableOpacity>
      </View>

      {/* Zoom Level Indicator */}
      {scale !== 1.0 && (
        <View style={styles.zoomIndicator}>
          <Text style={styles.zoomIndicatorText} testID="zoom-level-badge">
            {scale.toFixed(1)}x
          </Text>
        </View>
      )}
    </View>
  );
}

const CebuVectorMap = forwardRef<CebuVectorMapRef, CebuVectorMapProps>(CebuVectorMapImpl);
export default CebuVectorMap;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2f4f4e',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsContainer: {
    position: 'absolute',
    top: '50%',
    right: 14,
    transform: [{ translateY: -55 }],
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    zIndex: 15,
    gap: 4,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f3d3c',
    lineHeight: 22,
  },
  resetBtn: {
    backgroundColor: '#f1f5f9',
  },
  resetBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748b',
  },
  zoomIndicator: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(31, 61, 60, 0.88)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  zoomIndicatorText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  interactiveCallout: {
    position: 'absolute',
    backgroundColor: '#1f3d3c',
    borderRadius: 14,
    padding: 12,
    zIndex: 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  calloutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  calloutStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusCompleted: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  statusDelayed: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  statusOngoing: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
  },
  calloutStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  calloutLguText: {
    fontSize: 11,
    color: '#a3e635',
    fontWeight: '700',
    maxWidth: '55%',
  },
  calloutTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 16,
    marginBottom: 4,
  },
  calloutContractor: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 8,
  },
  calloutFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 6,
  },
  calloutBudget: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38bdf8',
  },
  calloutActionBtn: {
    backgroundColor: '#14b8a6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  calloutActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f2423',
  },
});
