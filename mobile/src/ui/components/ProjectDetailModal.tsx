import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { ProjectDetail, ProjectStatus } from '../../core/types';
import { formatCurrencyPHP } from '../../core/geoUtils';

interface ProjectDetailModalProps {
  visible: boolean;
  project: ProjectDetail | null;
  onClose: () => void;
  onReportAnomaly: (project: ProjectDetail) => void;
}

export default function ProjectDetailModal({
  visible,
  project,
  onClose,
  onReportAnomaly,
}: ProjectDetailModalProps) {
  if (!project) return null;

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

  const statusStyle = getStatusColor(project.status);
  const budgetMillions = `₱${(project.budget / 1_000_000).toFixed(2)}M`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.modalCard} testID="project-detail-modal">
            {/* Header with Close */}
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <Text style={styles.projectIdBadge}>{project.id}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: statusStyle.bg,
                      borderColor: statusStyle.border,
                    },
                  ]}
                >
                  <Text style={[styles.statusText, { color: statusStyle.text }]}>
                    {project.status}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityLabel="Close details"
                accessibilityRole="button"
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.content}
              showsVerticalScrollIndicator={false}
            >
              {/* Citizen Hotspot Alert Banner */}
              {Boolean(project.is_hotspot || (project.report_count && project.report_count >= 2)) && (
                <View style={styles.hotspotBanner}>
                  <Text style={styles.hotspotIcon}>🚨</Text>
                  <View style={styles.hotspotTextCol}>
                    <Text style={styles.hotspotTitle}>Citizen Anomaly Hotspot</Text>
                    <Text style={styles.hotspotDesc}>
                      {project.report_count || 'Multiple'} citizen reports filed for this project site.
                    </Text>
                  </View>
                </View>
              )}

              {/* Main Title */}
              <Text style={styles.title}>{project.title}</Text>

              {/* Location Badge */}
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>📍</Text>
                <Text style={styles.locationText}>
                  {project.lgu}
                  {project.barangay ? `, ${project.barangay}` : ''}
                </Text>
              </View>

              {/* Metrics Grid */}
              <View style={styles.grid}>
                <View style={styles.gridCard}>
                  <Text style={styles.gridLabel}>Contract Amount</Text>
                  <Text style={styles.gridValue}>{budgetMillions}</Text>
                  <Text style={styles.gridSubvalue}>{formatCurrencyPHP(project.budget)}</Text>
                </View>

                <View style={styles.gridCard}>
                  <Text style={styles.gridLabel}>Contractor</Text>
                  <Text style={styles.gridValueSmall}>{project.contractor}</Text>
                </View>
              </View>

              {/* Enriched Disbursement & Funding */}
              {typeof project.amount_paid === 'number' && (
                <View style={styles.disbursementCard}>
                  <Text style={styles.gridLabel}>Amount Disbursed (DPWH)</Text>
                  <Text style={styles.disbursementValue}>
                    ₱{(project.amount_paid / 1_000_000).toFixed(2)}M
                  </Text>
                  <Text style={styles.gridSubvalue}>{formatCurrencyPHP(project.amount_paid)}</Text>
                </View>
              )}

              {/* Timeline Section */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>Project Schedule</Text>
                <View style={styles.timelineRow}>
                  <View style={styles.timelineCol}>
                    <Text style={styles.timelineLabel}>Start Date</Text>
                    <Text style={styles.timelineValue}>
                      {project.startDate || 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.timelineCol}>
                    <Text style={styles.timelineLabel}>Target Completion</Text>
                    <Text style={styles.timelineValue}>
                      {project.targetCompletion || 'N/A'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Funding & Program Details */}
              {(project.funding_source || project.source_of_funds || project.program_name) && (
                <View style={styles.section}>
                  <Text style={styles.sectionHeader}>Funding & Program</Text>
                  {project.funding_source && (
                    <Text style={styles.detailLine}>
                      <Text style={styles.detailBold}>Funding Source: </Text>
                      {project.funding_source}
                    </Text>
                  )}
                  {project.source_of_funds && project.source_of_funds !== project.funding_source && (
                    <Text style={styles.detailLine}>
                      <Text style={styles.detailBold}>Source of Funds: </Text>
                      {project.source_of_funds}
                    </Text>
                  )}
                  {project.program_name && (
                    <Text style={styles.detailLine}>
                      <Text style={styles.detailBold}>Program: </Text>
                      {project.program_name}
                    </Text>
                  )}
                </View>
              )}

              {/* PhilGEPS Procurement Awards */}
              {project.procurements && project.procurements.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionHeader}>
                    PhilGEPS Procurement Awards ({project.procurements.length})
                  </Text>
                  {project.procurements.map((award) => (
                    <View key={award.id} style={styles.procurementItem}>
                      <Text style={styles.procurementTitle}>{award.title}</Text>
                      {award.contract_amount && (
                        <Text style={styles.procurementMeta}>
                          Award: {formatCurrencyPHP(award.contract_amount)}
                        </Text>
                      )}
                      {award.award_date && (
                        <Text style={styles.procurementDate}>Date: {award.award_date}</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Scope Section */}
              {project.scope && (
                <View style={styles.section}>
                  <Text style={styles.sectionHeader}>Scope of Work</Text>
                  <Text style={styles.scopeBody}>{project.scope}</Text>
                </View>
              )}
            </ScrollView>

            {/* Action Bar */}
            <View style={styles.actionBar}>
              <TouchableOpacity
                style={styles.reportAnomalyBtn}
                onPress={() => onReportAnomaly(project)}
                activeOpacity={0.8}
              >
                <Text style={styles.reportAnomalyBtnText}>
                  Report Anomaly on this Project
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  safeArea: {
    maxHeight: '85%',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    elevation: 20,
  },
  hotspotBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    gap: 10,
  },
  hotspotIcon: {
    fontSize: 20,
  },
  hotspotTextCol: {
    flex: 1,
  },
  hotspotTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#b91c1c',
  },
  hotspotDesc: {
    fontSize: 11,
    color: '#991b1b',
    marginTop: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  projectIdBadge: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1f3d3c',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  content: {
    maxHeight: 460,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    lineHeight: 24,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 6,
  },
  infoIcon: {
    fontSize: 14,
  },
  locationText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  gridCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  disbursementCard: {
    backgroundColor: '#f0fdfa',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ccfbf1',
    marginBottom: 16,
  },
  disbursementValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0d9488',
    marginTop: 2,
  },
  gridLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gridValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
  },
  gridSubvalue: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  gridValueSmall: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 2,
  },
  section: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timelineCol: {
    flex: 1,
  },
  timelineLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 2,
  },
  timelineValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  detailLine: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 4,
  },
  detailBold: {
    fontWeight: '600',
    color: '#0f172a',
  },
  procurementItem: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  procurementTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  procurementMeta: {
    fontSize: 11,
    color: '#0d9488',
    marginTop: 2,
    fontWeight: '500',
  },
  procurementDate: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 1,
  },
  scopeBody: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  actionBar: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  reportAnomalyBtn: {
    backgroundColor: '#1f3d3c',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#1f3d3c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  reportAnomalyBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
