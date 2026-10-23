import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { api } from '../../services/api';
import { haptics } from '../../services/haptics';

interface AboutMapModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function AboutMapModal({ visible, onClose }: AboutMapModalProps) {
  const [currentUrl, setCurrentUrl] = useState(api.getBaseUrl());
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (visible) {
      setCurrentUrl(api.getBaseUrl());
      setTestStatus(null);
    }
  }, [visible]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestStatus(null);
    haptics.triggerLightImpact();
    const start = Date.now();
    try {
      api.setBaseUrl(currentUrl.trim());
      const sum = await api.fetchSummary();
      const elapsed = Date.now() - start;
      if (sum && sum.total_projects) {
        setTestStatus(`✅ Connected (${elapsed}ms) · ${sum.total_projects} projects active`);
      } else {
        setTestStatus(`⚠️ Server reachable, but returned degraded dataset`);
      }
    } catch (err: any) {
      setTestStatus(`❌ Connection failed: ${err.message || 'Cannot reach host'}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveUrl = () => {
    api.setBaseUrl(currentUrl.trim());
    haptics.triggerSuccess();
    setTestStatus('💾 API endpoint saved!');
  };
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop} testID="about-map-modal">
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.header}>
              <Text style={styles.title}>About the map</Text>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityLabel="Close about map"
                testID="close-about-map-btn"
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.bodyContent}>
              <Text style={styles.leadText}>
                The interactive map shows every DPWH project site in Cebu Province
                loaded from the database. Tap any municipality polygon to zoom in and see
                its projects, budgets, and statuses in the Location Intel panel. Tap a
                diamond pin to open the full project details.
              </Text>

              {/* Legend List */}
              <View style={styles.legendContainer}>
                <View style={styles.legendItem}>
                  <View style={[styles.diamondPin, styles.diamondTeal]} />
                  <Text style={styles.legendText}>
                    <Text style={styles.bold}>Amber diamond</Text> — Ongoing project
                    (shows completion %)
                  </Text>
                </View>

                <View style={styles.legendItem}>
                  <View style={[styles.diamondPin, styles.diamondBlue]} />
                  <Text style={styles.legendText}>
                    <Text style={styles.bold}>Green diamond</Text> — Completed project
                    (100%)
                  </Text>
                </View>

                <View style={styles.legendItem}>
                  <View style={[styles.diamondPin, styles.diamondRed]} />
                  <Text style={styles.legendText}>
                    <Text style={[styles.bold, { color: '#ef4444' }]}>Red diamond</Text> — Delayed project / anomaly hotspot

                  </Text>
                </View>

                <View style={styles.legendItem}>
                  <View style={styles.circleOutline} />
                  <Text style={styles.legendText}>
                    <Text style={styles.bold}>Grey outline</Text> — Municipality
                    boundary (tap to select)
                  </Text>
                </View>
              </View>

              {/* Physical Device Connection Switcher */}
              <View style={styles.connectionBox}>
                <Text style={styles.connectionTitle}>🌐 Backend Connection (Physical Device)</Text>
                <Text style={styles.connectionDesc}>
                  On physical Android devices, enter your computer's Wi-Fi IP (e.g. http://192.168.1.50:8000/api)
                  or production domain.
                </Text>
                <TextInput
                  style={styles.connectionInput}
                  value={currentUrl}
                  onChangeText={setCurrentUrl}
                  placeholder="http://192.168.1.xxx:8000/api"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.connectionBtnRow}>
                  <TouchableOpacity
                    style={styles.testBtn}
                    onPress={handleTestConnection}
                    disabled={isTesting}
                    activeOpacity={0.8}
                  >
                    {isTesting ? (
                      <ActivityIndicator size="small" color="#0d9488" />
                    ) : (
                      <Text style={styles.testBtnText}>⚡ Test Connection</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleSaveUrl}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.saveBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
                {testStatus && (
                  <Text style={styles.testStatusText}>{testStatus}</Text>
                )}
              </View>

              <Text style={styles.footerText}>
                When several projects share the same coordinate, a single pin is
                drawn — tapping it opens the list so you can inspect individual civil
                works.
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={styles.doneButton}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.doneButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  safeArea: {
    width: '100%',
    maxWidth: 440,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
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
    color: '#64748b',
    fontWeight: '700',
  },
  bodyContent: {
    paddingVertical: 4,
  },
  leadText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
    marginBottom: 16,
  },
  legendContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  diamondPin: {
    width: 12,
    height: 12,
    transform: [{ rotate: '45deg' }],
  },
  diamondTeal: {
    backgroundColor: '#f59e0b',
  },
  diamondBlue: {
    backgroundColor: '#10b981',
  },
  diamondRed: {
    backgroundColor: '#ef4444',
  },
  circleOutline: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94a3b8',
  },
  legendText: {
    fontSize: 13,
    color: '#475569',
    flex: 1,
    lineHeight: 18,
  },
  bold: {
    fontWeight: '700',
    color: '#0f172a',
  },
  footerText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
  connectionBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 14,
    marginBottom: 14,
  },
  connectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f2423',
    marginBottom: 4,
  },
  connectionDesc: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
    marginBottom: 10,
  },
  connectionInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#0f172a',
    marginBottom: 10,
  },
  connectionBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  testBtn: {
    flex: 1,
    backgroundColor: '#e6fffa',
    borderWidth: 1,
    borderColor: '#99f6e4',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testBtnText: {
    color: '#0d9488',
    fontSize: 12,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: '#1f3d3c',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  testStatusText: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
    color: '#0f172a',
  },
  doneButton: {
    backgroundColor: '#1f3d3c',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  doneButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
