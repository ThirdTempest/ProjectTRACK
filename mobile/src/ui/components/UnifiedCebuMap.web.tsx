import React, { forwardRef } from 'react';
import CebuVectorMap from './CebuVectorMap';
import { Pin, HierarchyFilterTier } from '../../core/types';

export interface UnifiedCebuMapProps {
  selectedMunicipality?: string | null;
  selectedPinId?: string | null;
  hierarchyTier?: HierarchyFilterTier;
  pins?: Pin[];
  onSelectMunicipality?: (name: string) => void;
  showAllPins?: boolean;
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

const UnifiedCebuMap = forwardRef<UnifiedCebuMapRef, UnifiedCebuMapProps>((props, ref) => {
  return <CebuVectorMap ref={ref as any} {...props} />;
});

export default UnifiedCebuMap;
