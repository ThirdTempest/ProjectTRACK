import React, { forwardRef } from 'react';
import CebuVectorMap from './CebuVectorMap';
import { Pin, HierarchyFilterTier } from '../../core/types';

export interface UnifiedCebuMapProps {
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

export interface UnifiedCebuMapRef {
  animateToCoordinates: (lat: number, lng: number, zoomOrDelta?: number) => void;
  recenter: () => void;
}

/**
 * ProjectTRACK Unified Map (Native APK & Development)
 *
 * Uses the offline, hardware-accelerated SVG vector engine for 100% offline
 * reliability, zero tile server latency, and exact visual parity with the website.
 */
const UnifiedCebuMap = forwardRef<UnifiedCebuMapRef, UnifiedCebuMapProps>((props, ref) => {
  return <CebuVectorMap ref={ref as any} {...props} />;
});

export default UnifiedCebuMap;
