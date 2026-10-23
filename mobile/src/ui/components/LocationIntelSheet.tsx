import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { ProjectDetail, ProjectStatus } from '../../core/types';
import { formatCurrencyPHP } from '../../core/geoUtils';
import { haptics } from '../../services/haptics';

export type SheetDisplayState = 'expanded' | 'minimized' | 'hidden';

export interface LocationIntelSheetProps {
  lguName: string;
  projects: ProjectDetail[];
  sheetState?: SheetDisplayState;
  onStateChange?: (state: SheetDisplayState) => void;
  onSelectProject: (project: ProjectDetail) => void;
  onReportAnomaly: (lguName: string) => void;
  onFieldAuditPress?: (project: ProjectDetail) => void;
  onClose?: () => void;
}

type FilterOption = 'All' | ProjectStatus;

export default function LocationIntelSheet({
  lguName,
  projects = [],
  sheetState,
  onStateChange,
  onSelectProject,
  onReportAnomaly,
  onFieldAuditPress,
  onClose,
}: LocationIntelSheetProps) {
  const [internalState, setInternalState] = useState<SheetDisplayState>('expanded');
  const currentState = sheetState ?? internalState;

  const [selectedFilter, setSelectedFilter] = useState<FilterOption>('All');
  const [votesState, setVotesState] = useState<
    Record<string, { confirm: number; dispute: number; userVoted?: 'confirm' | 'dispute' }>
  >({});

  const handleStateChange = (nextState: SheetDisplayState) => {
    haptics.triggerLightImpact();
    setInternalState(nextState);
    onStateChange?.(nextState);
    if (nextState === 'hidden') {
      onClose?.();
    }
  };

  // Compute summary stats
  const totalBudget = useMemo(() => {
    return projects.reduce((sum, p) => sum + p.budget, 0);
  }, [projects]);

  const ongoingCount = useMemo(() => {
    return projects.filter((p) => p.status === 'Ongoing').length;
  }, [projects]);

  const completedCount = useMemo(() => {
    return projects.filter((p) => p.status === 'Completed').length;
  }, [projects]);

  const delayedCount = useMemo(() => {
    return projects.filter((p) => p.status === 'Delayed').length;
  }, [projects]);

  // Filter projects list and eliminate duplicates
  const filteredProjects = useMemo(() => {
    const list = selectedFilter === 'All' ? projects : projects.filter((p) => p.status === selectedFilter);
    const seen = new Set<string>();
    return list.filter((p) => {
      if (!p.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [projects, selectedFilter]);

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'Completed':
        return { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0' };
      case 'Delayed':
        return { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' };
      default:
        return { bg: '#fffbeb', text: '#b45309', border: '#fde68a' };
    }
  };

  const handleVote = (
    projectId: string,
    voteType: 'confirm' | 'dispute',
  ) => {
    haptics.triggerSelection();
    setVotesState((prev) => {
      const current = prev[projectId] || { confirm: 14, dispute: 1 };
      if (current.userVoted === voteType) {
        return {
          ...prev,
          [projectId]: {
            ...current,
            [voteType]: current[voteType] - 1,
            userVoted: undefined,
          },
        };
      }

      const prevVote = current.userVoted;
      let newConfirm = current.confirm;
      let newDispute = current.dispute;

      if (prevVote === 'confirm') newConfirm -= 1;
      if (prevVote === 'dispute') newDispute -= 1;

      if (voteType === 'confirm') newConfirm += 1;
      if (voteType === 'dispute') newDispute += 1;

      return {
        ...prev,
        [projectId]: {
          confirm: newConfirm,
          dispute: newDispute,
          userVoted: voteType,
        },
      };
    });
  };

  const { height: windowHeight } = useWindowDimensions();
  const sheetMaxHeight = Math.max(260, (windowHeight || 600) * 0.48);

  // 1. If Hidden, do not render sheet
  if (currentState === 'hidden') {
    return null;
  }

  // 2. If Minimized, render compact bottom peek bar
  if (currentState === 'minimized') {
    return (
      <View
        style={styles.minimizedContainer}
        testID="location-intel-sheet-minimized"
      >
        <TouchableOpacity
          style={styles.handleBarContainer}
          onPress={() => handleStateChange('expanded')}
          activeOpacity={0.7}
          accessibilityLabel="Expand details sheet"
        >
          <View style={styles.handleBar} />
        </TouchableOpacity>

        <View style={styles.minimizedRow}>
          <TouchableOpacity
            style={styles.minimizedTextGroup}
            onPress={() => handleStateChange('expanded')}
            activeOpacity={0.8}
          >
            <Text style={styles.minimizedLguTitle} numberOfLines={1}>
              📍 {lguName}
            </Text>
            <Text style={styles.minimizedStatsSubtitle} numberOfLines={1}>
              {projects.length} Projects · {formatCurrencyPHP(totalBudget).split('.')[0]} · {delayedCount} Delayed
            </Text>
          </TouchableOpacity>

          <View style={styles.minimizedActions}>
            <TouchableOpacity
              style={styles.expandPillBtn}
              onPress={() => handleStateChange('expanded')}
              activeOpacity={0.8}
              testID="sheet-expand-btn"
              accessibilityLabel="Expand details sheet"
            >
              <Text style={styles.expandPillText}>▲ Expand</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetCloseBtn}
              onPress={() => handleStateChange('hidden')}
              activeOpacity={0.8}
              testID="sheet-hide-btn"
              accessibilityLabel="Hide details"
            >
              <Text style={styles.sheetCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // 3. Expanded Sheet
  return (
    <View
      style={[styles.container, { maxHeight: sheetMaxHeight }]}
      testID="location-intel-sheet"
    >
      {/* Draggable Handle Bar (toggles minimize) */}
      <TouchableOpacity
        style={styles.handleBarContainer}
        onPress={() => handleStateChange('minimized')}
        activeOpacity={0.7}
        accessibilityLabel="Minimize details sheet"
      >
        <View style={styles.handleBar} />
      </TouchableOpacity>

      {/* Header with Title and Actions */}
      <View style={styles.headerRow}>
        <View style={styles.titleArea}>
          <Text style={styles.subTitle}>LOCATION INTEL</Text>
          <Text style={styles.lguTitle} numberOfLines={1}>
            {lguName}
          </Text>
        </View>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.anomalyButton}
            onPress={() => onReportAnomaly(lguName)}
            activeOpacity={0.8}
          >
            <Text style={styles.anomalyButtonText}>⚠️ Report Anomaly</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.minimizeBtn}
            onPress={() => handleStateChange('minimized')}
            activeOpacity={0.8}
            testID="sheet-minimize-btn"
            accessibilityLabel="Minimize sheet"
          >
            <Text style={styles.minimizeBtnText}>▼</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sheetCloseBtn}
            onPress={() => handleStateChange('hidden')}
            activeOpacity={0.8}
            testID="sheet-close-btn"
            accessibilityLabel="Close sheet"
          >
            <Text style={styles.sheetCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Key Metric Stats Grid */}
      <View style={styles.metricsContainer}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total Projects</Text>
          <Text style={styles.metricValue}>{projects.length} Projects</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total Allocation</Text>
          <Text style={[styles.metricValue, { color: '#0d9488' }]}>
            ₱{(totalBudget / 1_000_000).toFixed(2)}M
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Ongoing / Active</Text>
          <Text style={styles.metricValue}>{ongoingCount}</Text>
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.filtersRow}>
        <TouchableOpacity
          style={[
            styles.filterChip,
            selectedFilter === 'All' && styles.filterChipActive,
          ]}
          onPress={() => setSelectedFilter('All')}
        >
          <Text
            style={[
              styles.filterChipText,
              selectedFilter === 'All' && styles.filterChipTextActive,
            ]}
          >
            All ({projects.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterChip,
            selectedFilter === 'Ongoing' && styles.filterChipActive,
          ]}
          onPress={() => setSelectedFilter('Ongoing')}
        >
          <Text
            style={[
              styles.filterChipText,
              selectedFilter === 'Ongoing' && styles.filterChipTextActive,
            ]}
          >
            Ongoing ({ongoingCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterChip,
            selectedFilter === 'Completed' && styles.filterChipActive,
          ]}
          onPress={() => setSelectedFilter('Completed')}
        >
          <Text
            style={[
              styles.filterChipText,
              selectedFilter === 'Completed' && styles.filterChipTextActive,
            ]}
          >
            Completed ({completedCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterChip,
            selectedFilter === 'Delayed' && styles.filterChipActive,
          ]}
          onPress={() => setSelectedFilter('Delayed')}
        >
          <Text
            style={[
              styles.filterChipText,
              selectedFilter === 'Delayed' && styles.filterChipTextActive,
            ]}
          >
            Delayed ({delayedCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Projects List */}
      <ScrollView
        style={styles.projectsList}
        contentContainerStyle={styles.projectsListContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredProjects.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              No infrastructure projects found for this filter in {lguName}.
            </Text>
          </View>
        ) : (
          filteredProjects.map((project, idx) => {
            const statusStyle = getStatusColor(project.status);
            const votes = votesState[project.id] || { confirm: 14, dispute: 1 };

            return (
              <TouchableOpacity
                key={`${project.id}-${idx}`}
                style={styles.projectCard}
                onPress={() => onSelectProject(project)}
                activeOpacity={0.7}
              >
                <View style={styles.cardTopRow}>
                  <Text style={styles.projectId}>{project.id}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: statusStyle.bg,
                        borderColor: statusStyle.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: statusStyle.text },
                      ]}
                    >
                      {project.status}
                    </Text>
                  </View>
                </View>

                <Text style={styles.projectTitle} numberOfLines={2}>
                  {project.title}
                </Text>

                {/* Milestone Progress Indicator */}
                <View style={styles.milestoneRow}>
                  <View
                    style={[
                      styles.milestoneDot,
                      project.status === 'Completed'
                        ? styles.milestoneDone
                        : styles.milestoneActive,
                    ]}
                  />
                  <View style={styles.milestoneLine} />
                  <View
                    style={[
                      styles.milestoneDot,
                      project.status === 'Completed'
                        ? styles.milestoneDone
                        : project.status === 'Ongoing'
                        ? styles.milestoneActive
                        : styles.milestonePending,
                    ]}
                  />
                  <View style={styles.milestoneLine} />
                  <View
                    style={[
                      styles.milestoneDot,
                      project.status === 'Completed'
                        ? styles.milestoneDone
                        : styles.milestonePending,
                    ]}
                  />
                  <Text style={styles.milestoneText}>
                    {project.status === 'Completed'
                      ? '100% Completed'
                      : project.status === 'Delayed'
                      ? 'Delay Alert'
                      : 'In Progress'}
                  </Text>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.contractorName} numberOfLines={1}>
                    🏢 {project.contractor}
                  </Text>
                  <Text style={styles.projectBudget}>
                    {formatCurrencyPHP(project.budget)}
                  </Text>
                </View>

                {/* Crowdsourced Verification & Audit Action */}
                <View style={styles.cardActionsRow}>
                  <View style={styles.voteGroup}>
                    <TouchableOpacity
                      style={[
                        styles.voteBtn,
                        votes.userVoted === 'confirm' && styles.voteBtnActive,
                      ]}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        handleVote(project.id, 'confirm');
                      }}
                      testID={`confirm-vote-btn-${project.id}`}
                    >
                      <Text style={styles.voteBtnText}>
                        👍 {votes.confirm}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.voteBtn,
                        votes.userVoted === 'dispute' && styles.voteBtnActive,
                      ]}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        handleVote(project.id, 'dispute');
                      }}
                      testID={`dispute-vote-btn-${project.id}`}
                    >
                      <Text style={styles.voteBtnText}>
                        👎 {votes.dispute}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {onFieldAuditPress && (
                    <TouchableOpacity
                      style={styles.fieldAuditBtn}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        onFieldAuditPress(project);
                      }}
                      testID={`field-audit-btn-${project.id}`}
                    >
                      <Text style={styles.fieldAuditBtnText}>
                        📸 Audit Site
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 10,
  },
  minimizedContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 8,
  },
  minimizedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  minimizedTextGroup: {
    flex: 1,
    marginRight: 10,
  },
  minimizedLguTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1f3d3c',
  },
  minimizedStatsSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
    fontWeight: '600',
  },
  minimizedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expandPillBtn: {
    backgroundColor: '#e6fffa',
    borderWidth: 1,
    borderColor: '#99f6e4',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  expandPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0d9488',
  },
  handleBarContainer: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  handleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#cbd5e1',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 10,
  },
  titleArea: {
    flex: 1,
    marginRight: 8,
  },
  subTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0d9488',
    letterSpacing: 0.8,
  },
  lguTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1f3d3c',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  anomalyButton: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  anomalyButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
  },
  minimizeBtn: {
    backgroundColor: '#f1f5f9',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  minimizeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  sheetCloseBtn: {
    backgroundColor: '#f1f5f9',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sheetCloseText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  metricsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 10,
    marginBottom: 12,
    justifyContent: 'space-between',
  },
  metricCard: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e293b',
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  filterChipActive: {
    backgroundColor: '#1f3d3c',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  projectsList: {
    flexGrow: 1,
  },
  projectsListContent: {
    paddingBottom: 16,
    gap: 8,
  },
  projectCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  projectId: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  projectTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    lineHeight: 18,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contractorName: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748b',
    flex: 1,
    marginRight: 8,
  },
  projectBudget: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1f3d3c',
  },
  emptyContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 8,
  },
  milestoneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  milestoneDone: {
    backgroundColor: '#10b981',
  },
  milestoneActive: {
    backgroundColor: '#0ea5e9',
  },
  milestonePending: {
    backgroundColor: '#cbd5e1',
  },
  milestoneLine: {
    width: 14,
    height: 2,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 3,
  },
  milestoneText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    marginLeft: 8,
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  voteGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  voteBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  voteBtnActive: {
    backgroundColor: '#e6fffa',
    borderColor: '#99f6e4',
  },
  voteBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  fieldAuditBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#1f3d3c',
  },
  fieldAuditBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
});
