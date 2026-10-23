import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Modal,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CebuVectorMap from '../components/CebuVectorMap';
import ProjectDetailModal from '../components/ProjectDetailModal';
import ReportAnomalyModal from '../components/ReportAnomalyModal';
import AboutMapModal from '../components/AboutMapModal';
import ChatBotModal from '../components/ChatBotModal';
import FieldAuditorModal from '../components/FieldAuditorModal';
import Logo from '../components/Logo';
import { api } from '../../services/api';
import { FAQS } from '../../data/faqs';
import { Pin, ProjectDetail, AnomalyReport } from '../../core/types';
import { normalizeLguName, formatCurrencyPHP } from '../../core/geoUtils';
import { haptics } from '../../services/haptics';
import cebuDataRaw from '../../assets/cebuMunicipalities.json';

interface HomeScreenProps {
  currentUser?: { email: string } | null;
  onNavigateToSignIn: () => void;
  onNavigateToContractors?: () => void;
  onNavigateToMap?: (lgu?: string) => void;
  onSignOut?: () => void;
}

// Extract and alphabetize all 53 Cebu LGUs
const ALL_LGU_NAMES: string[] = (
  cebuDataRaw?.features?.map((f: any) => normalizeLguName(f.properties?.name || '')) || []
).sort((a: string, b: string) => a.localeCompare(b));

// Major high-traffic LGUs for quick horizontal carousel
const POPULAR_LGUS = [
  'Cebu City',
  'Mandaue City',
  'Lapu-Lapu City',
  'City of Bogo',
  'City of Carcar',
  'City of Talisay',
  'Danao City',
  'Balamban',
  'Toledo City',
];

export default function HomeScreen({
  currentUser,
  onNavigateToSignIn,
  onNavigateToContractors,
  onNavigateToMap,
  onSignOut,
}: HomeScreenProps) {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [selectedLgu, setSelectedLgu] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isChatBotOpen, setIsChatBotOpen] = useState(false);
  const [isAuditorModalOpen, setIsAuditorModalOpen] = useState(false);
  const [isAllLgusModalOpen, setIsAllLgusModalOpen] = useState(false);
  const [lguModalSearch, setLguModalSearch] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [liveTopProjects, setLiveTopProjects] = useState<ProjectDetail[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [livePins, setLivePins] = useState<Pin[]>([]);

  const [liveDelayedCount, setLiveDelayedCount] = useState<number | null>(null);

  const [backendStats, setBackendStats] = useState({
    total_projects: 0,
    total_budget: 0,
    total_lgus: 53,
    total_cities: 9,
    total_municipalities: 44,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    haptics.triggerLightImpact();
    try {
      const [topProjs, pins, sum] = await Promise.all([
        api.fetchTopProjects(8),
        api.fetchMapPins(),
        api.fetchSummary(),
      ]);

      if (topProjs && topProjs.length > 0) {
        setLiveTopProjects(topProjs);
      }
      if (pins && pins.length > 0) {
        setLivePins(pins);
        const delayed = pins.filter(
          (p) =>
            p.tone === 'warning' ||
            (p as any).status === 'Delayed' ||
            (p as any).is_hotspot,
        );
        setLiveDelayedCount(delayed.length);
      }
      if (sum) {
        setBackendStats({
          total_projects: sum.total_projects,
          total_lgus: sum.total_lgus,
          total_cities: 9,
          total_municipalities: 44,
          total_budget: sum.total_budget,
        });
      }
    } catch {
      // retain current state
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      setIsLoadingData(true);
      setLoadError(false);
      try {
        const [topProjs, pins, sum] = await Promise.all([
          api.fetchTopProjects(8),
          api.fetchMapPins(),
          api.fetchSummary(),
        ]);
        if (!isMounted) return;

        if (topProjs && topProjs.length > 0) {
          setLiveTopProjects(topProjs);
        }
        if (pins && pins.length > 0) {
          setLivePins(pins);
          const delayed = pins.filter(
            (p) =>
              p.tone === 'warning' ||
              (p as any).status === 'Delayed' ||
              (p as any).is_hotspot,
          );
          setLiveDelayedCount(delayed.length);
        }
        if (sum) {
          setBackendStats({
            total_projects: sum.total_projects,
            total_lgus: sum.total_lgus,
            total_cities: 9,
            total_municipalities: 44,
            total_budget: sum.total_budget,
          });
        }

        // Treat a fully empty response as an error/empty condition.
        const hasAnyData =
          (topProjs && topProjs.length > 0) ||
          (pins && pins.length > 0) ||
          (sum && sum.total_projects > 0);
        if (!hasAnyData) {
          setLoadError(true);
        }
      } catch {
        if (isMounted) setLoadError(true);
      } finally {
        if (isMounted) setIsLoadingData(false);
      }
    };

    loadInitialData();
    return () => {
      isMounted = false;
    };
  }, []);


  // High impact projects for carousel (live only)
  const highImpactProjects = useMemo(() => {
    return liveTopProjects || [];
  }, [liveTopProjects]);

  // Delayed projects count (live only)
  const delayedCount = liveDelayedCount !== null ? liveDelayedCount : 0;

  // Total monitored budget calculated dynamically (live only)
  const totalMonitoredBudget = backendStats.total_budget || 0;

  // Filtered LGUs in modal
  const modalLgus = useMemo(() => {
    if (!lguModalSearch.trim()) return ALL_LGU_NAMES;
    const q = lguModalSearch.trim().toLowerCase();
    return ALL_LGU_NAMES.filter((name) => name.toLowerCase().includes(q));
  }, [lguModalSearch]);

  const handleSelectMunicipality = (name: string) => {
    haptics.triggerSelection();
    const normalized = normalizeLguName(name);
    setSelectedLgu(normalized);
    setSelectedPinId(null);
    setIsAllLgusModalOpen(false);
    if (onNavigateToMap) {
      onNavigateToMap(normalized);
    }
  };

  const handleSelectPin = (pin: Pin) => {
    haptics.triggerSelection();
    setSelectedPinId(pin.id);
    setSelectedLgu(pin.lgu);

    const optimistic: ProjectDetail = {
      id: pin.id,
      title: pin.name,
      contractor: pin.contractor || 'Contractor on Record',
      budget: typeof pin.budget === 'number' ? pin.budget : 0,
      status: (pin.status === 'Completed'
        ? 'Completed'
        : pin.tone === 'warning' || pin.status === 'Delayed'
        ? 'Delayed'
        : 'Ongoing') as ProjectDetail['status'],
      lgu: pin.lgu,
      scope: pin.description,
      latitude: pin.lat,
      longitude: pin.lng,
    };
    setSelectedProject(optimistic);
    setIsDetailModalOpen(true);

    api.fetchProjectById(pin.id).then((live) => {
      if (live) setSelectedProject(live);
    });
  };

  const handleCardPress = (project: ProjectDetail) => {
    haptics.triggerLightImpact();
    setSelectedProject(project);
    setIsDetailModalOpen(true);
  };

  const handleReportFromDetail = (project: ProjectDetail) => {
    setSelectedProject(project);
    setIsDetailModalOpen(false);
    setIsReportModalOpen(true);
  };

  const handleSubmitReport = (report: AnomalyReport) => {
    setIsReportModalOpen(false);
    if (typeof alert !== 'undefined') {
      alert(`Report submitted successfully for Project ${report.projectId}!`);
    }
  };

  const userInitial = currentUser?.email
    ? currentUser.email.charAt(0).toUpperCase()
    : 'U';

  const previewWidth = Math.min(windowWidth - 32, 400);

  return (
    <View style={styles.container} testID="home-screen">
      {/* 1. Mobile App Bar Header */}
      <View
        style={[styles.headerBar, { paddingTop: Math.max(12, insets.top) }]}
        testID="mobile-app-header"
      >
        <View style={styles.headerTop}>
          <View style={styles.brandGroup}>
            <Logo size={34} variant="light" testID="home-header-logo" />
            <View>
              <Text style={styles.brandTitle}>ProjectTRACK</Text>
              <Text style={styles.brandSubtitle}>Cebu Civic Intelligence</Text>
            </View>
          </View>

          {/* Auth Button / Profile Avatar */}
          {currentUser ? (
            <TouchableOpacity
              style={styles.profileBadge}
              onPress={onSignOut}
              activeOpacity={0.8}
              testID="sign-out-btn"
              accessibilityLabel={`Sign out ${currentUser.email}`}
            >
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{userInitial}</Text>
              </View>
              <Text style={styles.profileText}>Sign Out</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.signInButton}
              onPress={onNavigateToSignIn}
              activeOpacity={0.8}
              testID="sign-in-nav-btn"
              accessibilityLabel="Sign in"
            >
              <Text style={styles.signInButtonText}>Sign In</Text>
            </TouchableOpacity>
          )}
        </View>


      </View>

      {/* Main Landing Page ScrollView with Pull-to-Refresh */}
      <ScrollView
        testID="home-scroll"
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#10b981"
            colors={['#10b981', '#1f3d3c']}
            testID="home-refresh-control"
          />
        }
      >
        {/* 2. Civic Vital Stats (KPI Cards) */}
        <View style={styles.kpiSection} testID="kpi-vital-stats">
          <View style={styles.kpiRow}>
            <View style={[styles.kpiCard, styles.kpiCardPrimary]}>
              <Text style={styles.kpiIcon}>📊</Text>
              <Text style={styles.kpiValue}>{backendStats.total_projects}+</Text>
              <Text style={styles.kpiLabel}>Tracked Projects</Text>
            </View>

            <View style={[styles.kpiCard, styles.kpiCardSuccess]}>
              <Text style={styles.kpiIcon}>💰</Text>
              <Text style={styles.kpiValue}>
                {formatCurrencyPHP(totalMonitoredBudget).split('.')[0]}
              </Text>
              <Text style={styles.kpiLabel}>Monitored Budget</Text>
            </View>
          </View>

          <View style={styles.kpiRow}>
            <View style={[styles.kpiCard, styles.kpiCardWarning]}>
              <Text style={styles.kpiIcon}>⚠️</Text>
              <Text style={styles.kpiValue}>{delayedCount} Sites</Text>
              <Text style={styles.kpiLabel}>Delayed / Flagged</Text>
            </View>

            <View style={[styles.kpiCard, styles.kpiCardInfo]}>
              <Text style={styles.kpiIcon}>🏛️</Text>
              <Text style={styles.kpiValue}>
                {backendStats.total_lgus ? `${backendStats.total_lgus} of 53` : '53 of 53'}
              </Text>
              <Text style={styles.kpiLabel}>LGUs Monitored</Text>
            </View>
          </View>
        </View>

        {/* 3. Quick Action Grid */}
        <View style={styles.quickActionsSection} testID="quick-actions-section">
          <Text style={styles.sectionHeaderTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => onNavigateToMap?.()}
              activeOpacity={0.8}
              testID="quick-action-map"
            >
              <View style={[styles.actionIconBadge, { backgroundColor: '#e6fffa' }]}>
                <Text style={styles.actionIcon}>🗺️</Text>
              </View>
              <Text style={styles.actionTitle}>Explore Map</Text>
              <Text style={styles.actionSub}>Full Cebu GIS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => {
                setSelectedProject(highImpactProjects[0] || null);
                setIsAuditorModalOpen(true);
              }}
              activeOpacity={0.8}
              testID="quick-action-audit"
            >
              <View style={[styles.actionIconBadge, { backgroundColor: '#fef3c7' }]}>
                <Text style={styles.actionIcon}>📸</Text>
              </View>
              <Text style={styles.actionTitle}>Field Audit</Text>
              <Text style={styles.actionSub}>GPS + Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => onNavigateToContractors?.()}
              activeOpacity={0.8}
              testID="quick-action-contractors"
            >
              <View style={[styles.actionIconBadge, { backgroundColor: '#ede9fe' }]}>
                <Text style={styles.actionIcon}>🏆</Text>
              </View>
              <Text style={styles.actionTitle}>Contractors</Text>
              <Text style={styles.actionSub}>Leaderboard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => setIsAboutModalOpen(true)}
              activeOpacity={0.8}
              testID="open-about-map-btn"
            >
              <View style={[styles.actionIconBadge, { backgroundColor: '#e0f2fe' }]}>
                <Text style={styles.actionIcon}>ℹ️</Text>
              </View>
              <Text style={styles.actionTitle}>About Data</Text>
              <Text style={styles.actionSub}>DPWH Specs</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. Interactive Map Teaser Card */}
        <View style={styles.mapTeaserSection} testID="map-teaser-card">
          <View style={styles.teaserHeaderRow}>
            <View>
              <Text style={styles.sectionHeaderTitle}>Interactive Cebu Map</Text>
              <Text style={styles.sectionHeaderSubtitle}>
                Tap any municipality or project marker to inspect details
              </Text>
            </View>
            <TouchableOpacity
              style={styles.openMapPill}
              onPress={() => onNavigateToMap?.()}
              activeOpacity={0.7}
              testID="open-full-map-btn"
            >
              <Text style={styles.openMapPillText}>Full Map →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.teaserMapFrame}>
            <CebuVectorMap
              selectedMunicipality={selectedLgu}
              selectedPinId={selectedPinId}
              pins={livePins}
              onSelectMunicipality={(m) => {
                handleSelectMunicipality(m);
              }}
              onSelectPin={handleSelectPin}
              width={previewWidth}
              height={260}
            />
          </View>
        </View>

        {/* 5. Popular LGUs Horizontal Carousel */}
        <View style={styles.lguSection} testID="popular-lgus-section">
          <View style={styles.lguHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>Explore by Municipality</Text>
            <TouchableOpacity
              onPress={() => setIsAllLgusModalOpen(true)}
              activeOpacity={0.7}
              testID="view-all-53-lgus-btn"
            >
              <Text style={styles.viewAllText}>All 53 LGUs ↗</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.lguScroll}
          >
            {POPULAR_LGUS.map((name) => (
              <TouchableOpacity
                key={name}
                style={[
                  styles.lguPill,
                  selectedLgu === normalizeLguName(name) && styles.lguPillActive,
                ]}
                onPress={() => handleSelectMunicipality(name)}
                activeOpacity={0.7}
                testID={`muni-grid-btn-${name}`}
              >
                <Text
                  style={[
                    styles.lguPillText,
                    selectedLgu === normalizeLguName(name) &&
                      styles.lguPillTextActive,
                  ]}
                >
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* 6. High-Impact Civil Works Projects Carousel */}
        <View style={styles.projectsSection} testID="high-impact-projects-section">
          <Text style={styles.sectionHeaderTitle}>High-Impact Civil Works</Text>
          <Text style={styles.sectionHeaderSubtitle}>
            Major infrastructure investments across Cebu Province
          </Text>

          {isLoadingData ? (
            <View style={styles.stateBox} testID="home-projects-loading">
              <ActivityIndicator size="small" color="#34d399" />
              <Text style={styles.stateText}>Loading live DPWH projects…</Text>
            </View>
          ) : loadError ? (
            <View style={styles.stateBox} testID="home-projects-error">
              <Text style={styles.stateIcon}>⚠️</Text>
              <Text style={styles.stateTitle}>Backend unavailable</Text>
              <Text style={styles.stateText}>
                Could not reach the ProjectTRACK backend. Pull to refresh to retry.
              </Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={handleRefresh}
                activeOpacity={0.8}
                testID="home-projects-retry-btn"
              >
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : highImpactProjects.length === 0 ? (
            <View style={styles.stateBox} testID="home-projects-empty">
              <Text style={styles.stateIcon}>📭</Text>
              <Text style={styles.stateTitle}>No projects yet</Text>
              <Text style={styles.stateText}>
                No civil works records were returned for Cebu Province.
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.projectsCarouselContent}
            >
              {highImpactProjects.map((project) => {
              const isDelayed = project.status === 'Delayed';
              const isCompleted = project.status === 'Completed';

              return (
                <TouchableOpacity
                  key={project.id}
                  style={styles.projectCard}
                  onPress={() => handleCardPress(project)}
                  activeOpacity={0.8}
                  testID={`project-card-${project.id}`}
                >
                  <View style={styles.projectCardHeader}>
                    <View
                      style={[
                        styles.statusPill,
                        isDelayed
                          ? styles.statusDelayed
                          : isCompleted
                          ? styles.statusCompleted
                          : styles.statusOngoing,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          isDelayed
                            ? styles.statusTextDelayed
                            : isCompleted
                            ? styles.statusTextCompleted
                            : styles.statusTextOngoing,
                        ]}
                      >
                        {project.status}
                      </Text>
                    </View>
                    <Text style={styles.projectLguBadge}>{project.lgu}</Text>
                  </View>

                  <Text style={styles.projectCardTitle} numberOfLines={2}>
                    {project.title}
                  </Text>

                  <Text style={styles.projectCardContractor} numberOfLines={1}>
                    🏗️ {project.contractor}
                  </Text>

                  <View style={styles.projectCardFooter}>
                    <Text style={styles.projectBudget}>
                      {formatCurrencyPHP(project.budget)}
                    </Text>
                    <Text style={styles.cardArrow}>→</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          )}
        </View>

        {/* 7. FAQs Accordion */}
        <View style={styles.faqSection} testID="faqs-section">
          <Text style={styles.sectionHeaderTitle}>Frequently Asked Questions</Text>
          <View style={styles.faqList}>
            {FAQS.map((faq, index) => {
              const isOpen = expandedFaq === index;
              return (
                <View key={faq.q} style={styles.faqItem}>
                  <TouchableOpacity
                    style={styles.faqQuestionBtn}
                    onPress={() => setExpandedFaq(isOpen ? null : index)}
                    activeOpacity={0.7}
                    testID={`faq-toggle-btn-${index}`}
                  >
                    <Text style={styles.faqQuestionText}>{faq.q}</Text>
                    <Text style={styles.faqToggleIcon}>{isOpen ? '▲' : '▼'}</Text>
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={styles.faqAnswerBox}>
                      <Text style={styles.faqAnswerText}>{faq.a}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Floating Civic Assistant Button */}
      <TouchableOpacity
        style={styles.floatingChatBtn}
        onPress={() => setIsChatBotOpen(true)}
        activeOpacity={0.8}
        testID="open-chat-bot-btn"
        accessibilityLabel="Open Civic AI Assistant"
      >
        <Text style={styles.floatingChatIcon}>💬</Text>
        <Text style={styles.floatingChatText}>Ask AI</Text>
      </TouchableOpacity>

      {/* All 53 LGUs Modal Sheet */}
      <Modal
        visible={isAllLgusModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAllLgusModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.allLgusSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>All 53 Cebu LGUs</Text>
              <TouchableOpacity
                onPress={() => setIsAllLgusModalOpen(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search municipality or city..."
              placeholderTextColor="#94a3b8"
              value={lguModalSearch}
              onChangeText={setLguModalSearch}
              autoCapitalize="none"
              testID="all-lgus-search-input"
            />

            <ScrollView style={styles.modalLguList}>
              {modalLgus.map((name) => (
                <TouchableOpacity
                  key={name}
                  style={styles.modalLguItem}
                  onPress={() => handleSelectMunicipality(name)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalLguName}>{name}</Text>
                  <Text style={styles.modalLguArrow}>→</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Detail, Unified Field Audit/Anomaly, and Info Modals */}
      <ProjectDetailModal
        visible={isDetailModalOpen}
        project={selectedProject}
        onClose={() => setIsDetailModalOpen(false)}
        onReportAnomaly={handleReportFromDetail}
      />

      <ReportAnomalyModal
        visible={isReportModalOpen || isAuditorModalOpen}
        project={selectedProject}
        availableProjects={highImpactProjects}
        onClose={() => {
          setIsReportModalOpen(false);
          setIsAuditorModalOpen(false);
        }}
        onSubmit={handleSubmitReport}
      />

      <AboutMapModal
        visible={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
      />

      <ChatBotModal
        visible={isChatBotOpen}
        onClose={() => setIsChatBotOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f2423',
    position: 'relative',
    height: '100%',
    width: '100%',
  },
  headerBar: {
    backgroundColor: '#162e2d',
    paddingTop: Platform.OS === 'ios' ? 44 : 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#244846',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
  },
  signInButton: {
    backgroundColor: '#10b981',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  signInButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    minHeight: 44,
  },
  avatarCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  profileText: {
    color: '#dceae8',
    fontSize: 11,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f3d3c',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#ffffff',
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  kpiSection: {
    marginBottom: 20,
    gap: 10,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#162e2d',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#244846',
  },
  kpiCardPrimary: {
    borderLeftWidth: 3,
    borderLeftColor: '#38bdf8',
  },
  kpiCardSuccess: {
    borderLeftWidth: 3,
    borderLeftColor: '#34d399',
  },
  kpiCardWarning: {
    borderLeftWidth: 3,
    borderLeftColor: '#fbbf24',
  },
  kpiCardInfo: {
    borderLeftWidth: 3,
    borderLeftColor: '#a78bfa',
  },
  kpiIcon: {
    fontSize: 16,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 2,
  },
  kpiLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  quickActionsSection: {
    marginBottom: 20,
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  sectionHeaderSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 12,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#162e2d',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#244846',
  },
  actionIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  actionIcon: {
    fontSize: 18,
  },
  actionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  actionSub: {
    fontSize: 9,
    color: '#94a3b8',
    marginTop: 2,
    textAlign: 'center',
  },
  mapTeaserSection: {
    backgroundColor: '#162e2d',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#244846',
  },
  teaserHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  openMapPill: {
    backgroundColor: '#10b981',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  openMapPillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  teaserMapFrame: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#2f4f4e',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  teaserTapBadge: {
    position: 'absolute',
    bottom: 12,
    backgroundColor: 'rgba(31, 61, 60, 0.92)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  teaserTapBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  lguSection: {
    marginBottom: 20,
  },
  lguHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  viewAllText: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '700',
  },
  lguScroll: {
    gap: 8,
  },
  lguPill: {
    backgroundColor: '#162e2d',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#244846',
    minHeight: 44,
    justifyContent: 'center',
  },
  lguPillActive: {
    backgroundColor: '#10b981',
    borderColor: '#34d399',
  },
  lguPillText: {
    color: '#dceae8',
    fontSize: 12,
    fontWeight: '600',
  },
  lguPillTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  projectsSection: {
    marginBottom: 20,
  },
  stateBox: {
    backgroundColor: '#162e2d',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#244846',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 6,
  },
  stateIcon: {
    fontSize: 28,
  },
  stateTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },
  stateText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 17,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: '#10b981',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  projectsCarouselContent: {
    gap: 12,
    paddingVertical: 4,
  },
  projectCard: {
    width: 240,
    backgroundColor: '#162e2d',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#244846',
    justifyContent: 'space-between',
  },
  projectCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusPill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  statusDelayed: {
    backgroundColor: '#fef3c7',
  },
  statusOngoing: {
    backgroundColor: '#e6fffa',
  },
  statusCompleted: {
    backgroundColor: '#ecfdf5',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTextDelayed: {
    color: '#b45309',
  },
  statusTextOngoing: {
    color: '#0d9488',
  },
  statusTextCompleted: {
    color: '#047857',
  },
  projectLguBadge: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
  },
  projectCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 18,
    marginBottom: 6,
  },
  projectCardContractor: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 8,
  },
  projectCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#244846',
    paddingTop: 8,
  },
  projectBudget: {
    fontSize: 12,
    fontWeight: '800',
    color: '#34d399',
  },
  cardArrow: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '700',
  },
  faqSection: {
    marginBottom: 20,
  },
  faqList: {
    backgroundColor: '#162e2d',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#244846',
    marginTop: 8,
  },
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#244846',
  },
  faqQuestionBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  faqQuestionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
    marginRight: 8,
  },
  faqToggleIcon: {
    fontSize: 11,
    color: '#94a3b8',
  },
  faqAnswerBox: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: '#1a3736',
  },
  faqAnswerText: {
    fontSize: 11,
    lineHeight: 16,
    color: '#cbd5e1',
  },
  bottomSpacer: {
    height: 80,
  },
  floatingChatBtn: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#10b981',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
        elevation: 8,
      },
    }),
    zIndex: 99,
  },
  floatingChatIcon: {
    fontSize: 16,
  },
  floatingChatText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  allLgusSheet: {
    backgroundColor: '#162e2d',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalCloseText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '700',
  },
  modalSearchInput: {
    backgroundColor: '#1f3d3c',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 13,
    marginBottom: 12,
  },
  modalLguList: {
    maxHeight: 380,
  },
  modalLguItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#244846',
  },
  modalLguName: {
    fontSize: 13,
    color: '#dceae8',
    fontWeight: '600',
  },
  modalLguArrow: {
    fontSize: 13,
    color: '#94a3b8',
  },
});
