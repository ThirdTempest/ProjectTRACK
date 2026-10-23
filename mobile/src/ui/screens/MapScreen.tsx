import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapHeader from '../components/MapHeader';
import UnifiedCebuMap, { UnifiedCebuMapRef } from '../components/UnifiedCebuMap';
import LocationIntelSheet, { SheetDisplayState } from '../components/LocationIntelSheet';
import ProjectDetailModal from '../components/ProjectDetailModal';
import ReportAnomalyModal from '../components/ReportAnomalyModal';
import AboutMapModal from '../components/AboutMapModal';
import ChatBotModal from '../components/ChatBotModal';
import MapFilterBar, { MapFilterOption } from '../components/MapFilterBar';
import FieldAuditorModal from '../components/FieldAuditorModal';
import CebuRegionQuickJump from '../components/CebuRegionQuickJump';
import { api } from '../../services/api';
import {
  Pin,
  ProjectDetail,
  AnomalyReport,
  ProjectStatus,
  HierarchyFilterTier,
} from '../../core/types';
import {
  normalizeLguName,
  normalizeCoordinates,
  computeBoundingBox,
  formatCurrencyPHP,
  RegionPreset,
} from '../../core/geoUtils';
import cebuDataRaw from '../../assets/cebuMunicipalities.json';

interface MapScreenProps {
  currentUser?: { email: string } | null;
  onNavigateToSignIn: () => void;
  onNavigateToContractors: () => void;
  onSignOut?: () => void;
  initialLgu?: string | null;
  initialProjectId?: string | null;
  initialSheetState?: SheetDisplayState;
}

export default function MapScreen({
  currentUser,
  onNavigateToSignIn,
  onNavigateToContractors,
  onSignOut,
  initialLgu = null,
  initialProjectId = null,
  initialSheetState = 'hidden',
}: MapScreenProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<UnifiedCebuMapRef>(null);

  const [selectedLgu, setSelectedLgu] = useState<string | null>(initialLgu);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isChatBotOpen, setIsChatBotOpen] = useState(false);
  const [isAuditorModalOpen, setIsAuditorModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<MapFilterOption>('ALL');
  const [hierarchyTier, setHierarchyTier] = useState<HierarchyFilterTier>('ALL');
  const [activeRegionPresetId, setActiveRegionPresetId] = useState<string>('ALL_CEBU');
  const [searchQuery, setSearchQuery] = useState('');
  const [sheetState, setSheetState] = useState<SheetDisplayState>(initialSheetState);
  const [isRefreshingMap, setIsRefreshingMap] = useState(false);
  const [mapPins, setMapPins] = useState<Pin[]>([]);
  const [activeProjects, setActiveProjects] = useState<ProjectDetail[]>([]);
  const [isLoadingPins, setIsLoadingPins] = useState(true);
  const [clusterModalData, setClusterModalData] = useState<{
    count: number;
    pins: Pin[];
    x: number;
    y: number;
    totalBudget?: number;
  } | null>(null);

  useEffect(() => {
    if (initialLgu) {
      setSelectedLgu(normalizeLguName(initialLgu));
      if (initialSheetState === 'expanded') {
        setSheetState('expanded');
      }
    }
  }, [initialLgu]);

  useEffect(() => {
    if (initialProjectId) {
      handleSelectProjectById(initialProjectId);
    }
  }, [initialProjectId]);

  const handleRefreshMap = async () => {
    setIsRefreshingMap(true);
    try {
      const loc = selectedLgu || searchQuery.trim();
      const [livePins, projects] = await Promise.all([
        api.fetchMapPins(loc || undefined),
        loc ? api.fetchProjectsByLocation(loc, 100) : Promise.resolve([]),
      ]);
      if (livePins && livePins.length > 0) {
        setMapPins(livePins);
      }
      if (projects && projects.length > 0) {
        setActiveProjects(projects);
      }
    } catch {
      // retain current pins and projects
    } finally {
      setIsRefreshingMap(false);
    }
  };

  // Fetch live map pins on mount
  useEffect(() => {
    let isMounted = true;
    setIsLoadingPins(true);
    api
      .fetchMapPins()
      .then((livePins) => {
        if (isMounted && livePins && livePins.length > 0) {
          setMapPins(livePins);
        }
      })
      .catch(() => {
        // Live-only: leave pins empty on failure
      })
      .finally(() => {
        if (isMounted) setIsLoadingPins(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch live projects by location whenever selectedLgu or searchQuery changes
  useEffect(() => {
    const loc = selectedLgu || searchQuery.trim() || 'Cebu';
    let isMounted = true;

    api
      .fetchProjectsByLocation(loc, 100)
      .then((projects) => {
        if (isMounted && projects && projects.length > 0) {
          setActiveProjects(projects);

          setMapPins((prevPins) => {
            const pinMap = new Map<string, Pin>();
            prevPins.forEach((p) => pinMap.set(p.id, p));

            projects.forEach((proj) => {
              const existing = pinMap.get(proj.id);
              const rawLat = typeof proj.latitude === 'number' ? proj.latitude : (existing?.lat ?? 10.3115);
              const rawLng = typeof proj.longitude === 'number' ? proj.longitude : (existing?.lng ?? 123.9534);
              const normalized = normalizeCoordinates(rawLat, rawLng);
              const lat = normalized.status !== 'rejected' ? normalized.lat : (existing?.lat ?? 10.3115);
              const lng = normalized.status !== 'rejected' ? normalized.lng : (existing?.lng ?? 123.9534);

              pinMap.set(proj.id, {
                id: proj.id,
                name: proj.title,
                lat,
                lng,
                tone: proj.status === 'Delayed' ? 'warning' : 'default',
                lgu: proj.lgu,
                description: proj.scope || proj.title,
                budget: proj.budget,
                status: proj.status,
                contractor: proj.contractor,
                report_count: proj.report_count || 0,
                is_hotspot: proj.is_hotspot || false,
              });
            });

            return Array.from(pinMap.values());
          });
        }
      })
      .catch(() => {});

    api
      .fetchMapPins(loc)
      .then((muniPins) => {
        if (isMounted && muniPins && muniPins.length > 0) {
          setMapPins((prevPins) => {
            const pinMap = new Map<string, Pin>();
            prevPins.forEach((p) => pinMap.set(p.id, p));
            muniPins.forEach((p) => pinMap.set(p.id, p));
            return Array.from(pinMap.values());
          });
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [selectedLgu, searchQuery]);

  // Dynamic LGU-specific projects for LocationIntelSheet
  const currentLguProjects = useMemo(() => {
    if (!selectedLgu) {
      if (activeProjects.length > 0) return activeProjects;
      if (mapPins.length > 0) {
        return mapPins.map((p) => ({
          id: p.id,
          title: p.name,
          contractor: p.contractor || 'Contractor on Record',
          budget: typeof p.budget === 'number' ? p.budget : 28500000,
          status: (p.status === 'Completed'
            ? 'Completed'
            : p.tone === 'warning' || p.status === 'Delayed'
            ? 'Delayed'
            : 'Ongoing') as ProjectStatus,
          lgu: p.lgu,
          scope: p.description,
          report_count: p.report_count || 0,
          is_hotspot: p.is_hotspot || false,
          latitude: typeof p.lat === 'number' ? p.lat : undefined,
          longitude: typeof p.lng === 'number' ? p.lng : undefined,
        }));
      }
      return [];
    }
    const targetNorm = normalizeLguName(selectedLgu).toLowerCase();

    const filteredActive = activeProjects.filter(
      (p) => normalizeLguName(p.lgu).toLowerCase() === targetNorm,
    );
    if (filteredActive.length > 0) return filteredActive;

    const matchingPins = mapPins.filter(
      (p) => normalizeLguName(p.lgu).toLowerCase() === targetNorm,
    );
    if (matchingPins.length > 0) {
      return matchingPins.map((p) => ({
        id: p.id,
        title: p.name,
        contractor: p.contractor || 'Contractor on Record',
        budget: typeof p.budget === 'number' ? p.budget : 28500000,
        status: (p.status === 'Completed'
          ? 'Completed'
          : p.tone === 'warning' || p.status === 'Delayed'
          ? 'Delayed'
          : 'Ongoing') as ProjectStatus,
        lgu: p.lgu,
        scope: p.description,
        report_count: p.report_count || 0,
        is_hotspot: p.is_hotspot || false,
        latitude: typeof p.lat === 'number' ? p.lat : undefined,
        longitude: typeof p.lng === 'number' ? p.lng : undefined,
      }));
    }

    return [];
  }, [selectedLgu, activeProjects, mapPins]);

  const filteredPins = useMemo(() => {
    // Matching website: zero dots when no area is selected
    if (!selectedLgu) {
      return [];
    }
    const norm = normalizeLguName(selectedLgu).toLowerCase();
    let result = mapPins.filter(
      (p) => normalizeLguName(p.lgu).toLowerCase() === norm,
    );

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.lgu.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)),
      );
    }
    if (activeFilter === 'DELAYED') {
      result = result.filter((p) => p.tone === 'warning' || p.status === 'Delayed');
    } else if (activeFilter === 'ONGOING') {
      result = result.filter(
        (p) => p.tone !== 'warning' && p.status !== 'Delayed' && p.status !== 'Completed',
      );
    } else if (activeFilter === 'COMPLETED') {
      result = result.filter((p) => p.status === 'Completed');
    } else if (activeFilter === 'HIGH_BUDGET') {
      result = result.filter((p) => typeof p.budget === 'number' && p.budget >= 50000000);
    }
    return result;
  }, [mapPins, selectedLgu, hierarchyTier, searchQuery, activeFilter]);

  const handleSearchQueryChange = (query: string) => {
    setSearchQuery(query);
    const clean = query.trim().toLowerCase();
    if (clean.length >= 3) {
      const matchedFeature = cebuDataRaw?.features?.find((f: any) => {
        const rawName = (f.properties?.name || '').toLowerCase();
        const normName = normalizeLguName(f.properties?.name || '').toLowerCase();
        return (
          rawName === clean ||
          normName === clean ||
          rawName.startsWith(clean) ||
          normName.startsWith(clean)
        );
      });

      if (matchedFeature) {
        const matchedName = normalizeLguName(matchedFeature.properties.name);
        setSelectedLgu(matchedName);
        setSelectedPinId(null);
        if (sheetState === 'hidden') {
          setSheetState('minimized');
        }
        const label = (matchedFeature as any)?.properties?.label;
        if (Array.isArray(label) && label.length === 2) {
          mapRef.current?.animateToCoordinates(label[1], label[0], 4.2);
        }
      }
    } else if (clean.length === 0 && selectedLgu) {
      setSelectedLgu(null);
      setSelectedPinId(null);
    }
  };

  const handleSelectMunicipality = (name: string) => {
    const normalized = normalizeLguName(name);
    setSelectedLgu(normalized);
    setSelectedPinId(null);
    if (sheetState === 'hidden') {
      setSheetState('expanded');
    }
    const targetFeature = (cebuDataRaw?.features || []).find(
      (f: any) =>
        normalizeLguName(f.properties?.name || '').toLowerCase() ===
        normalized.toLowerCase(),
    );
    if (targetFeature) {
      const box = computeBoundingBox([targetFeature as any]);
      if (box.minLng !== Infinity && box.maxLng !== -Infinity) {
        const centerLng = (box.minLng + box.maxLng) / 2;
        const centerLat = (box.minLat + box.maxLat) / 2;
        mapRef.current?.animateToCoordinates(centerLat, centerLng, 3.5);
      }
    }
  };

  const handleSelectPin = (pin: Pin) => {
    setSelectedPinId(pin.id);
    setSelectedLgu(pin.lgu);

    const baseProject: ProjectDetail = {
      id: pin.id,
      title: pin.name,
      contractor: pin.contractor || 'Contractor on Record',
      budget: typeof pin.budget === 'number' ? pin.budget : 0,
      status: (pin.status === 'Completed'
        ? 'Completed'
        : pin.tone === 'warning' || pin.status === 'Delayed'
        ? 'Delayed'
        : 'Ongoing') as ProjectStatus,
      lgu: pin.lgu,
      scope: pin.description,
    };
    // Always carry the pin's coordinates so field-audit geofencing targets the real site
    const optimisticProject: ProjectDetail = {
      ...baseProject,
      latitude: baseProject.latitude ?? pin.lat,
      longitude: baseProject.longitude ?? pin.lng,
    };
    setSelectedProject(optimisticProject);
    setIsDetailModalOpen(true);
    mapRef.current?.animateToCoordinates(pin.lat, pin.lng, 4.5);

    api.fetchProjectById(pin.id).then((live) => {
      if (live) {
        setSelectedProject(live);
      }
    });
  };

  const handleSelectProjectCard = (project: ProjectDetail) => {
    setSelectedProject(project);
    setIsDetailModalOpen(true);
    const matchingPin = mapPins.find((p) => p.id === project.id);
    if (matchingPin) {
      setSelectedPinId(matchingPin.id);
      mapRef.current?.animateToCoordinates(matchingPin.lat, matchingPin.lng, 4.5);
    } else if (typeof project.latitude === 'number' && typeof project.longitude === 'number') {
      mapRef.current?.animateToCoordinates(project.latitude, project.longitude, 4.5);
    }
  };

  const handleSelectProjectById = (projectId: string) => {
    const matchingPin = mapPins.find((p) => p.id === projectId);
    const optimistic: ProjectDetail | undefined = matchingPin
      ? {
          id: matchingPin.id,
          title: matchingPin.name,
          contractor: matchingPin.contractor || 'Contractor on Record',
          budget: typeof matchingPin.budget === 'number' ? matchingPin.budget : 0,
          status: (matchingPin.status === 'Completed'
            ? 'Completed'
            : matchingPin.tone === 'warning' || matchingPin.status === 'Delayed'
            ? 'Delayed'
            : 'Ongoing') as ProjectStatus,
          lgu: matchingPin.lgu,
          scope: matchingPin.description,
          latitude: matchingPin.lat,
          longitude: matchingPin.lng,
        }
      : undefined;
    if (optimistic) {
      setSelectedProject(optimistic);
      setIsDetailModalOpen(true);
    }
    if (matchingPin) {
      setSelectedPinId(matchingPin.id);
      mapRef.current?.animateToCoordinates(matchingPin.lat, matchingPin.lng, 4.5);
    }
    api.fetchProjectById(projectId).then((p) => {
      if (p) {
        setSelectedProject(p);
        setIsDetailModalOpen(true);
      }
    });
  };

  const handleReportAnomaly = (_targetLgu?: string) => {
    setSelectedProject(null);
    setIsReportModalOpen(true);
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

  const handleResetSelection = () => {
    setSelectedLgu(null);
    setSelectedPinId(null);
    setSearchQuery('');
    setActiveRegionPresetId('ALL_CEBU');
    mapRef.current?.recenter();
  };

  const handleSelectRegionPreset = (preset: RegionPreset) => {
    setActiveRegionPresetId(preset.id);
    if (preset.id === 'ALL_CEBU') {
      handleResetSelection();
      mapRef.current?.recenter();
    } else {
      mapRef.current?.animateToCoordinates(preset.lat, preset.lng, preset.zoom);
    }
  };

  const mapHeight = useMemo(() => {
    const screenH = windowHeight || 640;
    if (sheetState === 'hidden') {
      return Math.max(500, screenH - 120);
    }
    if (sheetState === 'minimized') {
      return Math.max(420, screenH - 180);
    }
    return Math.max(340, screenH * 0.52);
  }, [windowHeight, sheetState]);

  const mapWidth = Math.max(320, windowWidth || 360);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="map-screen">
      {/* 1. Top App Header with Navigation */}
      <MapHeader
        totalLgus={53}
        totalPins={mapPins.length}
        currentUser={currentUser}
        onSearch={handleSearchQueryChange}
        onSignInPress={onNavigateToSignIn}
        onNavigateToContractors={onNavigateToContractors}
        onNavigateToHome={handleResetSelection}
        onSignOut={onSignOut}
        onResetSelection={handleResetSelection}
      />

      {/* 2. Floating Status & Budget Map Filter Pills */}
      <MapFilterBar
        activeFilter={activeFilter}
        onSelectFilter={setActiveFilter}
      />

      {/* Full Viewport Interactive Map (Hardware Vector on Mobile, SVG Vector on Web) */}
      <View style={styles.mapContainer}>
        {/* Floating Region Focus Presets (Metro Cebu, North, South, Islands) */}
        <CebuRegionQuickJump
          onSelectPreset={handleSelectRegionPreset}
          activePresetId={activeRegionPresetId}
        />

        {/* Floating Refresh Button inside map viewport */}
        <TouchableOpacity
          style={styles.floatingRefreshBtn}
          onPress={handleRefreshMap}
          activeOpacity={0.8}
          testID="map-refresh-btn"
          accessibilityLabel="Refresh map data"
        >
          <Text style={styles.floatingRefreshText}>
            {isRefreshingMap ? '⏳ Syncing…' : '↻ Refresh'}
          </Text>
        </TouchableOpacity>

        <UnifiedCebuMap
          ref={mapRef}
          testID="unified-cebu-map"
          selectedMunicipality={selectedLgu}
          selectedPinId={selectedPinId}
          hierarchyTier={hierarchyTier}
          pins={filteredPins}
          onSelectMunicipality={handleSelectMunicipality}
          onSelectPin={handleSelectPin}
          onSelectCluster={(cluster) => setClusterModalData(cluster)}
          width={mapWidth}
          height={mapHeight}
        />

        {/* Live-data overlay: loading on first fetch, empty when backend returns nothing */}
        {isLoadingPins && mapPins.length === 0 && (
          <View style={styles.mapOverlay} pointerEvents="none" testID="map-pins-loading">
            <ActivityIndicator size="large" color="#1f3d3c" />
            <Text style={styles.mapOverlayText}>Loading live project pins…</Text>
          </View>
        )}
        {!isLoadingPins && mapPins.length === 0 && (
          <View style={styles.mapOverlay} pointerEvents="box-none" testID="map-pins-empty">
            <Text style={styles.mapOverlayIcon}>📭</Text>
            <Text style={styles.mapOverlayText}>No live project pins available.</Text>
            <TouchableOpacity
              style={styles.mapOverlayRetryBtn}
              onPress={handleRefreshMap}
              activeOpacity={0.8}
              testID="map-pins-retry-btn"
            >
              <Text style={styles.mapOverlayRetryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Floating Bottom Controls (Only visible when location sheet is hidden) */}
      {sheetState === 'hidden' && (
        <>
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

          {/* Floating "About Map" quick badge */}
          <TouchableOpacity
            style={styles.floatingAboutBtn}
            onPress={() => setIsAboutModalOpen(true)}
            activeOpacity={0.8}
            testID="open-about-map-btn"
            accessibilityLabel="About the Map"
          >
            <Text style={styles.floatingAboutText}>ℹ️ Info</Text>
          </TouchableOpacity>

          {/* Floating "Show Details" Pill when sheet is hidden */}
          <TouchableOpacity
            style={styles.floatingShowSheetPill}
            onPress={() => {
              setSheetState('expanded');
              if (activeProjects.length === 0) {
                const loc = selectedLgu || 'Cebu';
                api.fetchProjectsByLocation(loc, 100).then((projs) => {
                  if (projs && projs.length > 0) setActiveProjects(projs);
                });
              }
            }}
            activeOpacity={0.85}
            testID="sheet-show-pill-btn"
            accessibilityLabel="Show location details sheet"
          >
            <Text style={styles.floatingShowSheetIcon}>📊</Text>
            <Text style={styles.floatingShowSheetText}>
              {selectedLgu ? `Details: ${selectedLgu}` : 'Show Details'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* Bottom Location Intel Sheet (Expanded, Minimized, or Hidden) */}
      <LocationIntelSheet
        lguName={selectedLgu || 'Cebu Province'}
        projects={currentLguProjects}
        sheetState={sheetState}
        onStateChange={setSheetState}
        onSelectProject={handleSelectProjectCard}
        onReportAnomaly={handleReportAnomaly}
        onFieldAuditPress={(proj) => {
          setSelectedProject(proj);
          setIsAuditorModalOpen(true);
        }}
        onClose={() => {
          setSheetState('hidden');
          handleResetSelection();
        }}
      />

      {/* Modals */}
      <AboutMapModal
        visible={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
      />

      <ChatBotModal
        visible={isChatBotOpen}
        onClose={() => setIsChatBotOpen(false)}
        onSelectProject={(projectId) => {
          handleSelectProjectById(projectId);
          const proj = activeProjects.find((p) => p.id === projectId);
          if (proj && typeof proj.latitude === 'number' && typeof proj.longitude === 'number') {
            mapRef.current?.animateToCoordinates(proj.latitude, proj.longitude, 5);
            setIsChatBotOpen(false); // auto-minimize AI chat on spatial query
          }
        }}
        onFocusLgu={(lgu) => {
          handleSelectMunicipality(lgu);
          setIsChatBotOpen(false);
          const norm = normalizeLguName(lgu).toLowerCase();
          const feat = cebuDataRaw?.features?.find(
            (f: any) => normalizeLguName(f.properties?.name || '').toLowerCase() === norm,
          );
          if (feat) {
            const label = (feat as any).properties?.label;
            if (Array.isArray(label) && label.length === 2) {
              mapRef.current?.animateToCoordinates(label[1], label[0], 4.2);
            }
          }
        }}
        currentLgu={selectedLgu}
        activeProjects={activeProjects}
      />

      <ProjectDetailModal
        visible={isDetailModalOpen}
        project={selectedProject}
        onClose={() => setIsDetailModalOpen(false)}
        onReportAnomaly={handleReportFromDetail}
      />

      <ReportAnomalyModal
        visible={isReportModalOpen}
        project={selectedProject}
        availableProjects={currentLguProjects}
        onClose={() => {
          setIsReportModalOpen(false);
          setIsAuditorModalOpen(false);
        }}
        onSubmit={handleSubmitReport}
      />

      <FieldAuditorModal
        visible={isAuditorModalOpen}
        project={selectedProject}
        availableProjects={currentLguProjects}
        onClose={() => setIsAuditorModalOpen(false)}
        onAuditSubmitted={(receipt) => {
          if (typeof alert !== 'undefined') {
            alert(`Field audit queued. Receipt code: ${receipt.receiptCode}`);
          }
        }}
      />

      {/* Multi-Project Cluster Modal (Reveals all projects in that specific area) */}
      <Modal
        visible={clusterModalData !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setClusterModalData(null)}
      >
        <View style={styles.clusterModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setClusterModalData(null)}
          />
          <View style={styles.clusterModalContainer}>
            <View style={styles.clusterModalHeader}>
              <View style={styles.clusterModalHeaderLeft}>
                <Text style={styles.clusterModalTitle}>
                  📍 {clusterModalData?.count ?? 0} Projects at this Site
                </Text>
                <Text style={styles.clusterModalSubtitle}>
                  {selectedLgu ? `${selectedLgu} · ` : ''}Projects located close to each other
                </Text>
              </View>
              <TouchableOpacity
                style={styles.clusterModalCloseBtn}
                onPress={() => setClusterModalData(null)}
                accessibilityLabel="Close"
              >
                <Text style={styles.clusterModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Action to Zoom In and Separate */}
            <TouchableOpacity
              style={styles.clusterZoomInBtn}
              onPress={() => {
                if (clusterModalData && clusterModalData.pins.length > 0) {
                  const first = clusterModalData.pins[0];
                  mapRef.current?.animateToCoordinates(first.lat, first.lng, 6.5);
                }
                setClusterModalData(null);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.clusterZoomInText}>🔍 Zoom In to Reveal Individual Dots</Text>
            </TouchableOpacity>

            {/* Scrollable list of projects */}
            <ScrollView
              style={styles.clusterModalScroll}
              showsVerticalScrollIndicator={true}
            >
              {clusterModalData?.pins.map((pin) => (
                <TouchableOpacity
                  key={pin.id}
                  style={styles.clusterProjectCard}
                  onPress={() => {
                    setClusterModalData(null);
                    handleSelectPin(pin);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.clusterCardHeader}>
                    <Text style={styles.clusterCardId}>{pin.id}</Text>
                    <View
                      style={[
                        styles.clusterStatusBadge,
                        pin.status === 'Completed'
                          ? styles.clusterStatusCompleted
                          : pin.tone === 'warning' || pin.status === 'Delayed'
                          ? styles.clusterStatusDelayed
                          : styles.clusterStatusOngoing,
                      ]}
                    >
                      <Text style={styles.clusterStatusText}>
                        {pin.status || (pin.tone === 'warning' ? 'Delayed' : 'Ongoing')}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.clusterCardTitle} numberOfLines={2}>
                    {pin.name}
                  </Text>
                  <View style={styles.clusterCardFooter}>
                    <Text style={styles.clusterCardContractor} numberOfLines={1}>
                      🏗️ {pin.contractor || 'Contractor on Record'}
                    </Text>
                    <Text style={styles.clusterCardBudget}>
                      {typeof pin.budget === 'number'
                        ? formatCurrencyPHP(pin.budget)
                        : 'Budget on Record'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2f4f4e',
    position: 'relative',
    height: '100%',
    width: '100%',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2f4f4e',
  },
  mapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  mapOverlayIcon: {
    fontSize: 34,
  },
  mapOverlayText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f3d3c',
    textAlign: 'center',
  },
  mapOverlayRetryBtn: {
    backgroundColor: '#1f3d3c',
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  mapOverlayRetryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  floatingRefreshBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(31, 61, 60, 0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    minHeight: 38,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 25,
  },
  floatingRefreshText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#34d399',
  },
  floatingChatBtn: {
    position: 'absolute',
    bottom: 76,
    right: 16,
    backgroundColor: '#1f3d3c',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 90,
  },
  floatingChatIcon: {
    fontSize: 15,
  },
  floatingChatText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  floatingAboutBtn: {
    position: 'absolute',
    bottom: 76,
    left: 16,
    backgroundColor: 'rgba(31, 61, 60, 0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 90,
  },
  floatingAboutText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  floatingShowSheetPill: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: '#162e2d',
    borderWidth: 1.5,
    borderColor: '#34d399',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24,
    maxWidth: '90%',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
        elevation: 10,
      },
    }),
    zIndex: 90,
  },
  floatingShowSheetIcon: {
    fontSize: 16,
  },
  floatingShowSheetText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  clusterModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  clusterModalContainer: {
    backgroundColor: '#1f3d3c',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
    maxHeight: '75%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  clusterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  clusterModalHeaderLeft: {
    flex: 1,
    marginRight: 10,
  },
  clusterModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  clusterModalSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  clusterModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterModalCloseText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  clusterZoomInBtn: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderWidth: 1,
    borderColor: '#34d399',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  clusterZoomInText: {
    color: '#34d399',
    fontSize: 13,
    fontWeight: '700',
  },
  clusterModalScroll: {
    maxHeight: 380,
  },
  clusterProjectCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  clusterCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  clusterCardId: {
    fontSize: 12,
    fontWeight: '800',
    color: '#34d399',
  },
  clusterStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  clusterStatusOngoing: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
  },
  clusterStatusCompleted: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  clusterStatusDelayed: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  clusterStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  clusterCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
    lineHeight: 18,
  },
  clusterCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clusterCardContractor: {
    fontSize: 11,
    color: '#94a3b8',
    flex: 1,
    marginRight: 8,
  },
  clusterCardBudget: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fbbf24',
  },
});
