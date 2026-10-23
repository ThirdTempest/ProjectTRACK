import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { haptics } from '../../services/haptics';

export type MapFilterOption =
  | 'ALL'
  | 'ONGOING'
  | 'COMPLETED'
  | 'DELAYED'
  | 'HIGH_BUDGET';

interface MapFilterBarProps {
  activeFilter: MapFilterOption;
  onSelectFilter: (filter: MapFilterOption) => void;
}

interface FilterItem {
  id: MapFilterOption;
  label: string;
  dotColor?: string;
  icon?: string;
}

const FILTERS: FilterItem[] = [
  { id: 'ALL', label: 'All Projects' },
  { id: 'ONGOING', label: 'Ongoing', dotColor: '#f59e0b' },
  { id: 'COMPLETED', label: 'Completed', dotColor: '#10b981' },
  { id: 'DELAYED', label: 'Delayed', dotColor: '#ef4444' },
  { id: 'HIGH_BUDGET', label: '>₱50M Budget', icon: '💰' },
];

export default function MapFilterBar({
  activeFilter,
  onSelectFilter,
}: MapFilterBarProps) {
  const handlePress = (filterId: MapFilterOption) => {
    haptics.triggerLightImpact();
    onSelectFilter(filterId);
  };

  return (
    <View style={styles.container} testID="map-filter-bar">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {FILTERS.map((item) => {
          const isActive = activeFilter === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.pill,
                isActive && styles.pillActive,
                isActive && item.dotColor ? { borderColor: item.dotColor } : null,
              ]}
              onPress={() => handlePress(item.id)}
              activeOpacity={0.7}
              testID={`filter-btn-${item.id.toLowerCase()}`}
            >
              {item.dotColor && (
                <View
                  style={[styles.dot, { backgroundColor: item.dotColor }]}
                />
              )}
              {item.icon && <Text style={styles.icon}>{item.icon}</Text>}
              <Text
                style={[styles.pillText, isActive && styles.pillTextActive]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    zIndex: 5,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pillActive: {
    backgroundColor: '#1f3d3c',
    borderColor: '#1f3d3c',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 1.5,
    transform: [{ rotate: '45deg' }],
  },
  icon: {
    fontSize: 12,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  pillTextActive: {
    color: '#ffffff',
  },
});
