import {
  normalizeLguName,
  formatCurrencyPHP,
  haversineDistance,
  checkGeofenceProximity,
  clusterPins,
  geoToSvgCoordinates,
  getLguClassification,
  CEBU_HUCS,
  CEBU_COMPONENT_CITIES,
  CEBU_ALL_CITIES,
  CEBU_REGION_PRESETS,
  isLguInHierarchyTier,
  CEBU_GEO_BOUNDS,
  svgScaleToMapZoom,
  normalizeCoordinates,
} from '../src/core/geoUtils';

describe('geoUtils suite', () => {
  describe('normalizeLguName', () => {
    test('normalizes "City of Bogo" to "Bogo City"', () => {
      expect(normalizeLguName('City of Bogo')).toBe('Bogo City');
    });

    test('preserves already normalized names', () => {
      expect(normalizeLguName('Carcar City')).toBe('Carcar City');
      expect(normalizeLguName('San Fernando')).toBe('San Fernando');
    });

    test('handles empty or blank input', () => {
      expect(normalizeLguName('')).toBe('');
    });
  });

  describe('formatCurrencyPHP', () => {
    test('formats numbers into PHP currency strings', () => {
      expect(formatCurrencyPHP(49000000)).toBe('₱ 49,000,000');
      expect(formatCurrencyPHP(1250000)).toBe('₱ 1,250,000');
    });

    test('handles 0 and NaN gracefully', () => {
      expect(formatCurrencyPHP(0)).toBe('₱ 0');
      expect(formatCurrencyPHP(NaN)).toBe('₱ 0');
    });
  });

  describe('haversineDistance & checkGeofenceProximity', () => {
    test('computes distance between two coordinates accurately', () => {
      // Distance between Bogo and Danao is roughly ~58km
      const dist = haversineDistance(11.0505, 124.0055, 10.528, 123.938);
      expect(dist).toBeGreaterThan(50);
      expect(dist).toBeLessThan(70);
    });

    test('detects when user is inside 150m geofence', () => {
      const target = { lat: 11.0505, lng: 124.0055 };
      // ~45m offset (approx 0.0004 deg)
      const user = { lat: 11.0509, lng: 124.0055 };

      const res = checkGeofenceProximity(target.lat, target.lng, user.lat, user.lng, 150);
      expect(res.isInside).toBe(true);
      expect(res.distanceMeters).toBeLessThanOrEqual(150);
    });

    test('detects when user is outside 150m geofence', () => {
      const target = { lat: 11.0505, lng: 124.0055 };
      // ~300m offset (approx 0.003 deg)
      const user = { lat: 11.0535, lng: 124.0055 };

      const res = checkGeofenceProximity(target.lat, target.lng, user.lat, user.lng, 150);
      expect(res.isInside).toBe(false);
      expect(res.distanceMeters).toBeGreaterThan(150);
    });
  });

  describe('clusterPins', () => {
    test('separates pins when zoomed in (high scale)', () => {
      const pins = [
        { id: 'p1', x: 100, y: 100 },
        { id: 'p2', x: 105, y: 105 },
        { id: 'p3', x: 200, y: 200 },
        { id: 'p4', x: 300, y: 300 },
        { id: 'p5', x: 400, y: 400 },
      ];

      const clusters = clusterPins(pins, 5.0, 28);
      expect(clusters.length).toBe(5);
      expect(clusters.every((c) => !c.isCluster)).toBe(true);
    });

    test('groups nearby pins into cluster when scale <= 1.25 and count > 4', () => {
      const pins = [
        { id: 'p1', x: 100, y: 100 },
        { id: 'p2', x: 105, y: 105 }, // close to p1
        { id: 'p3', x: 110, y: 108 }, // close to p1
        { id: 'p4', x: 250, y: 250 },
        { id: 'p5', x: 350, y: 350 },
      ];

      const clusters = clusterPins(pins, 1.0, 28);
      // p1, p2, p3 should be grouped together into 1 cluster
      const grouped = clusters.find((c) => c.isCluster);
      expect(grouped).toBeDefined();
      expect(grouped?.count).toBe(3);
      expect(grouped?.pinIds).toEqual(['p1', 'p2', 'p3']);
    });
  });

  describe('geoToSvgCoordinates', () => {
    test('projects coordinates into bounding box bounds', () => {
      const bounds = { minLng: 123.0, maxLng: 124.0, minLat: 9.0, maxLat: 11.0 };
      const coord = geoToSvgCoordinates(123.5, 10.0, bounds, 400, 600, 0);

      // Midpoint in lng (123.5) should be width / 2 = 200
      expect(coord.x).toBe(200);
      // Midpoint in lat (10.0) should be height / 2 = 300
      expect(coord.y).toBe(300);
    });
  });

  describe('Cebu Administrative Hierarchy & Classification', () => {
    test('correctly identifies Highly Urbanized Cities (HUCs)', () => {
      const cebuCity = getLguClassification('Cebu City');
      expect(cebuCity.type).toBe('HUC');
      expect(cebuCity.zone).toBe('METRO_CEBU');

      const mandaue = getLguClassification('Mandaue City');
      expect(mandaue.type).toBe('HUC');
      expect(mandaue.zone).toBe('METRO_CEBU');

      const lapuLapu = getLguClassification('Lapu-Lapu City');
      expect(lapuLapu.type).toBe('HUC');
      expect(lapuLapu.islandGroup).toBe('Mactan');

      expect(CEBU_HUCS.size).toBe(3);
    });

    test('correctly identifies Component Cities', () => {
      const bogo = getLguClassification('City of Bogo');
      expect(bogo.type).toBe('COMPONENT_CITY');
      expect(bogo.normalizedName).toBe('Bogo City');
      expect(bogo.zone).toBe('NORTH_CEBU');

      const carcar = getLguClassification('City of Carcar');
      expect(carcar.type).toBe('COMPONENT_CITY');
      expect(carcar.normalizedName).toBe('Carcar City');

      const toledo = getLguClassification('Toledo City');
      expect(toledo.type).toBe('COMPONENT_CITY');
      expect(toledo.zone).toBe('MIDWEST_CEBU');

      expect(CEBU_COMPONENT_CITIES.size).toBe(6);
      expect(CEBU_ALL_CITIES.size).toBe(9);
    });

    test('correctly identifies Municipalities and Island Groups', () => {
      const bantayan = getLguClassification('Bantayan');
      expect(bantayan.type).toBe('MUNICIPALITY');
      expect(bantayan.zone).toBe('ISLAND_GROUPS');
      expect(bantayan.islandGroup).toBe('Bantayan');

      const sanFrancisco = getLguClassification('San Francisco');
      expect(sanFrancisco.type).toBe('MUNICIPALITY');
      expect(sanFrancisco.zone).toBe('ISLAND_GROUPS');
      expect(sanFrancisco.islandGroup).toBe('Camotes');

      const moalboal = getLguClassification('Moalboal');
      expect(moalboal.type).toBe('MUNICIPALITY');
      expect(moalboal.zone).toBe('SOUTH_CEBU');
    });

    test('isLguInHierarchyTier filters correctly across tiers', () => {
      expect(isLguInHierarchyTier('Cebu City', 'ALL')).toBe(true);
      expect(isLguInHierarchyTier('Cebu City', 'CITIES')).toBe(true);
      expect(isLguInHierarchyTier('Cebu City', 'MUNICIPALITIES')).toBe(false);
      expect(isLguInHierarchyTier('Cebu City', 'METRO_CEBU')).toBe(true);

      expect(isLguInHierarchyTier('Bogo City', 'CITIES')).toBe(true);
      expect(isLguInHierarchyTier('Bogo City', 'MUNICIPALITIES')).toBe(false);

      expect(isLguInHierarchyTier('Argao', 'CITIES')).toBe(false);
      expect(isLguInHierarchyTier('Argao', 'MUNICIPALITIES')).toBe(true);
      expect(isLguInHierarchyTier('Argao', 'METRO_CEBU')).toBe(false);
    });

    test('contains comprehensive region focus presets', () => {
      expect(CEBU_REGION_PRESETS.length).toBeGreaterThanOrEqual(7);
      const presetIds = CEBU_REGION_PRESETS.map((p) => p.id);
      expect(presetIds).toContain('ALL_CEBU');
      expect(presetIds).toContain('METRO_CEBU');
      expect(presetIds).toContain('NORTH_CEBU');
      expect(presetIds).toContain('SOUTH_CEBU');
      expect(presetIds).toContain('BANTAYAN');
      expect(presetIds).toContain('CAMOTES');
    });
  });

  describe('normalizeCoordinates', () => {
    test('accepts valid Cebu mainland and island coordinates', () => {
      // Cebu City
      const cebuCity = normalizeCoordinates(10.3157, 123.8854);
      expect(cebuCity.status).toBe('ok');
      expect(cebuCity.lat).toBeCloseTo(10.3157);
      expect(cebuCity.lng).toBeCloseTo(123.8854);

      // Santander (South Cebu)
      const santander = normalizeCoordinates(9.4387, 123.3273);
      expect(santander.status).toBe('ok');

      // Bantayan (North Island)
      const bantayan = normalizeCoordinates(11.16, 123.72);
      expect(bantayan.status).toBe('ok');

      // Camotes (East Island)
      const camotes = normalizeCoordinates(10.66, 124.37);
      expect(camotes.status).toBe('ok');
    });

    test('rejects Bohol coordinates (e.g. project 24H00014 at lat 9.74612, lng 123.930535)', () => {
      const boholPin = normalizeCoordinates(9.74612, 123.930535);
      expect(boholPin.status).toBe('rejected');
    });

    test('rejects Negros coordinates (west of Tañon Strait)', () => {
      const negrosPin = normalizeCoordinates(10.25, 123.15);
      expect(negrosPin.status).toBe('rejected');
    });

    test('rejects coordinates far outside Cebu bounds', () => {
      expect(normalizeCoordinates(14.5995, 120.9842).status).toBe('rejected'); // Manila
      expect(normalizeCoordinates(8.4542, 124.6319).status).toBe('rejected'); // Cagayan de Oro
      expect(normalizeCoordinates(NaN, 123.8854).status).toBe('rejected');
    });
  });

  describe('CEBU_GEO_BOUNDS & svgScaleToMapZoom', () => {
    test('geo bounds cover the full GeoJSON extent including Camotes and northern Cebu', () => {
      // Measured extent of cebuMunicipalities.json (Pilar, Camotes reaches 124.57°E)
      expect(CEBU_GEO_BOUNDS.e).toBeGreaterThanOrEqual(124.58);
      expect(CEBU_GEO_BOUNDS.w).toBeLessThanOrEqual(123.29);
      expect(CEBU_GEO_BOUNDS.n).toBeGreaterThanOrEqual(11.53);
      expect(CEBU_GEO_BOUNDS.s).toBeLessThanOrEqual(9.41);
    });

    test('region presets all fall inside the geo bounds', () => {
      for (const preset of CEBU_REGION_PRESETS) {
        expect(preset.lat).toBeGreaterThanOrEqual(CEBU_GEO_BOUNDS.s);
        expect(preset.lat).toBeLessThanOrEqual(CEBU_GEO_BOUNDS.n);
        expect(preset.lng).toBeGreaterThanOrEqual(CEBU_GEO_BOUNDS.w);
        expect(preset.lng).toBeLessThanOrEqual(CEBU_GEO_BOUNDS.e);
      }
    });

    test('svgScaleToMapZoom maps province scale 1.0 to MapLibre zoom 9', () => {
      expect(svgScaleToMapZoom(1.0)).toBeCloseTo(9.0, 5);
    });

    test('svgScaleToMapZoom produces municipality-level zoom for scale ~3.5', () => {
      const zoom = svgScaleToMapZoom(3.5);
      expect(zoom).toBeGreaterThan(11);
      expect(zoom).toBeLessThan(14);
    });

    test('svgScaleToMapZoom clamps out-of-range scales into MapLibre limits', () => {
      expect(svgScaleToMapZoom(0.1)).toBeGreaterThanOrEqual(7.5);
      expect(svgScaleToMapZoom(100)).toBeLessThanOrEqual(18);
    });
  });
});
