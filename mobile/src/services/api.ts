import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import {
  ProjectDetail,
  Contractor,
  Pin,
  ReportVerification,
  ReportRecord,
  ProcurementAward,
  AppropriationSummary,
  SpatialContext,
} from '../core/types';
import { outbox } from './outbox';
import { tokenStore } from './tokenStore';
import {
  sanitizeSearchQuery,
  sanitizeChatMessage,
  sanitizeReportDescription,
  sanitizeEmail,
  sanitizePayload,
} from '../core/sanitizer';

const getInitialBaseUrl = (): string => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000/api';
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    return `http://${host}:8000/api`;
  }
  return 'http://localhost:8000/api';
};

const DEFAULT_API_BASE = getInitialBaseUrl();

/**
 * Resolve the OAuth redirect target — always the MOBILE APP's own callback, so
 * Google sign-in returns to THIS app rather than bouncing to the deployed
 * website.
 *
 *   • Native (standalone/dev build) -> the app scheme, e.g.
 *       "projecttrack://auth/callback"
 *   • Native (Expo Go)              -> an "exp://<host>/--/auth/callback" URL
 *       that Expo Go can route back into the running app. A hardcoded custom
 *       scheme does NOT work in Expo Go, which is why login previously only
 *       completed on the website.
 *   • Web                            -> this app's own origin
 *       "<origin>/auth/callback" (NOT the deployed website origin).
 *
 * `expo-linking`'s createURL() produces the correct form for the current
 * runtime automatically. An explicit EXPO_PUBLIC_OAUTH_REDIRECT env var
 * overrides everything (pin an exact URL that is allow-listed in the backend +
 * Supabase redirect list).
 */
export const NATIVE_OAUTH_REDIRECT = 'projecttrack://auth/callback';

export function resolveOAuthRedirect(): string | undefined {
  if (process.env.EXPO_PUBLIC_OAUTH_REDIRECT) {
    return process.env.EXPO_PUBLIC_OAUTH_REDIRECT;
  }
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/auth/callback`;
    }
    return undefined;
  }
  // Native: build a runtime-correct deep link. In Expo Go this yields an
  // exp:// URL; in a standalone/dev build it yields projecttrack://auth/callback.
  try {
    const url = Linking.createURL('auth/callback');
    if (url) return url;
  } catch {
    // Fall through to the static scheme if the linking helper is unavailable.
  }
  return NATIVE_OAUTH_REDIRECT;
}


export interface BackendSummary {
  total_projects: number;
  total_contractors: number;
  total_budget: number;
  total_lgus: number;
}

export interface ChatResponse {
  answer: string;
  sources?: string[];
  mode?: string;
  spatial?: SpatialContext;
}

class ApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = DEFAULT_API_BASE;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async fetchSummary(): Promise<BackendSummary> {
    try {
      const res = await fetch(`${this.baseUrl}/analytics/summary`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        total_projects: typeof data.total_projects === 'number' ? data.total_projects : 0,
        total_contractors: typeof data.total_contractors === 'number' ? data.total_contractors : 0,
        total_budget: typeof data.total_budget === 'number' ? data.total_budget : 0,
        total_lgus: typeof data.total_lgus === 'number' ? data.total_lgus : 53,
      };
    } catch {
      // Live-only: no mock fallback. Return a neutral empty summary.
      return {
        total_projects: 0,
        total_contractors: 0,
        total_budget: 0,
        total_lgus: 53,
      };
    }
  }

  async fetchTopContractors(limit = 20): Promise<Contractor[]> {
    try {
      const res = await fetch(
        `${this.baseUrl}/analytics/top-contractors?limit=${limit}`,
        {
          headers: { Accept: 'application/json' },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((item: any) => ({
          contractor: item.contractor,
          code: item.code || undefined,
          total_budget: typeof item.total_budget === 'number' ? item.total_budget : 0,
          project_count: typeof item.project_count === 'number' ? item.project_count : 1,
        }));
      }
      return [];
    } catch {
      return [];
    }
  }

  async fetchTopProjects(limit = 10): Promise<ProjectDetail[]> {
    try {
      const res = await fetch(`${this.baseUrl}/analytics/top-projects?limit=${limit}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((p: any) => ({
          id: p.id,
          title: p.description || `Project ${p.id}`,
          contractor: p.contractor || 'Contractor on Record',
          budget: typeof p.budget_num === 'number' ? p.budget_num : 0,
          status: 'Ongoing',
          lgu: p.location || 'Cebu Province',
        }));
      }
      return [];
    } catch {
      return [];
    }
  }

  async searchProjects(q: string, limit = 20): Promise<ProjectDetail[]> {
    const cleanQ = sanitizeSearchQuery(q, 100);
    if (!cleanQ || cleanQ.length < 2) return [];

    try {
      const res = await fetch(
        `${this.baseUrl}/projects/search?q=${encodeURIComponent(cleanQ)}&limit=${limit}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((p: any) => ({
          id: p.entity || p.id,
          title: p.description || p.entity || 'DPWH Civil Works Site',
          contractor: p.contractor || 'Contractor on Record',
          budget: typeof p.budget_num === 'number' ? p.budget_num : 0,
          status: p.status === 'Completed' ? 'Completed' : p.status === 'Delayed' ? 'Delayed' : 'Ongoing',
          lgu: p.municipality || 'Cebu Province',
          barangay: p.barangay,
          amount_paid: p.amount_paid,
          source_of_funds: p.source_of_funds,
        }));
      }
      return [];
    } catch {
      return [];
    }
  }

  async fetchProjectsByLocation(location: string, limit = 15): Promise<ProjectDetail[]> {
    let cleanLocation = sanitizeSearchQuery(location, 100);
    if (/^(cebu province|all cebu|cebu)$/i.test(cleanLocation.trim())) {
      cleanLocation = 'Cebu';
    }
    if (!cleanLocation) return [];
    const safeLimit = Math.min(Math.max(1, limit), 100);

    try {
      const res = await fetch(
        `${this.baseUrl}/projects/by-location?location=${encodeURIComponent(cleanLocation)}&limit=${safeLimit}`,
        {
          headers: { Accept: 'application/json' },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rawList = data.projects || data.sample_projects;
      if (Array.isArray(rawList) && rawList.length > 0) {
        const seen = new Set<string>();
        const uniqueProjects: ProjectDetail[] = [];
        for (const p of rawList) {
          const id = p.id || p.entity;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          uniqueProjects.push({
            id,
            title: p.title || p.description || 'Public Works Site',
            contractor: p.contractor || 'Contractor on Record',
            budget:
              typeof p.budget_num === 'number'
                ? p.budget_num
                : typeof p.budget === 'number'
                  ? p.budget
                  : 20000000,
            status: p.status === 'Completed' ? 'Completed' : p.status === 'Delayed' ? 'Delayed' : 'Ongoing',
            lgu: p.location || p.municipality || cleanLocation,
            barangay: p.barangay,
            scope: p.scope || p.description,
            amount_paid: p.amount_paid,
            source_of_funds: p.source_of_funds,
            funding_source: p.funding_source,
            program_name: p.program_name,
            region: p.region,
            procurements: p.procurements || [],
            report_count: typeof p.report_count === 'number' ? p.report_count : 0,
            is_hotspot: (typeof p.report_count === 'number' && p.report_count >= 2) || p.status === 'Flagged',
          });
        }
        return uniqueProjects;
      }
      return [];
    } catch {
      return [];
    }
  }

  async fetchProjectById(id: string): Promise<ProjectDetail | undefined> {
    const cleanId = sanitizeSearchQuery(id, 50);
    if (!cleanId) return undefined;

    try {
      const res = await fetch(`${this.baseUrl}/projects/${encodeURIComponent(cleanId)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const p = await res.json();
      return {
        id: p.id,
        title: p.title || p.description,
        contractor: p.contractor || 'Contractor on Record',
        budget: typeof p.budget_num === 'number' ? p.budget_num : (typeof p.budget === 'number' ? p.budget : 0),
        status: p.status === 'Completed' ? 'Completed' : p.status === 'Delayed' ? 'Delayed' : 'Ongoing',
        lgu: p.location || p.municipality || 'Cebu Province',
        barangay: p.barangay,
        scope: p.scope || p.description,
        amount_paid: p.amount_paid,
        source_of_funds: p.source_of_funds,
        funding_source: p.funding_source,
        program_name: p.program_name,
        region: p.region,
        procurements: p.procurements || [],
        report_count: typeof p.report_count === 'number' ? p.report_count : 0,
        is_hotspot: (typeof p.report_count === 'number' && p.report_count >= 2) || p.status === 'Flagged',
      };
    } catch {
      return undefined;
    }
  }

  async fetchMapPins(municipality?: string): Promise<Pin[]> {
    const cleanMunicipality = municipality ? sanitizeSearchQuery(municipality, 100) : undefined;
    try {
      const url = cleanMunicipality
        ? `${this.baseUrl}/projects/map?municipality=${encodeURIComponent(cleanMunicipality)}&limit=200`
        : `${this.baseUrl}/projects/map?limit=200`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((p: any) => {
          const reportCount = typeof p.report_count === 'number' ? p.report_count : 0;
          const isHotspot = reportCount > 0;
          return {
            id: p.id,
            name: p.title || p.description || `Project ${p.id}`,
            lat: p.latitude,
            lng: p.longitude,
            tone: (isHotspot ? 'hotspot' : p.status === 'Delayed' ? 'warning' : 'default') as Pin['tone'],
            lgu: p.location || p.municipality || cleanMunicipality || 'Cebu Province',
            description: p.description || p.category,
            report_count: reportCount,
            is_hotspot: isHotspot,
            budget: typeof p.budget_num === 'number' ? p.budget_num : undefined,
            status: p.status,
            contractor: p.contractor,
          };
        });
      }
      return [];
    } catch {
      return [];
    }
  }

  async sendChatMessage(
    message: string,
    history: Array<{ role: string; content: string }> = [],
  ): Promise<ChatResponse> {
    const cleanMsg = sanitizeChatMessage(message, 1000);
    if (!cleanMsg) {
      return {
        answer: 'Please provide a valid question.',
        mode: 'offline_civic_agent',
      };
    }

    const cleanHistory = (history || []).slice(-6).map((h) => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: sanitizeChatMessage(h.content, 1000),
    }));

    const sanitizedPayload = sanitizePayload({
      message: cleanMsg,
      history: cleanHistory,
    });

    try {
      const res = await fetch(`${this.baseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(sanitizedPayload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        answer: data.answer || 'No response returned from GraphRAG.',
        sources: data.sources || [],
        mode: data.mode || 'ai',
        spatial: data.spatial,
      };
    } catch {
      // Live-only: no canned civic answers. Signal the assistant is unreachable.
      return {
        answer:
          'The ProjectTRACK assistant is currently unavailable. Please check your connection to the backend and try again.',
        mode: 'unavailable',
      };
    }
  }

  async fetchAppropriations(limit = 50): Promise<AppropriationSummary[]> {
    try {
      const res = await fetch(`${this.baseUrl}/analytics/appropriations?limit=${limit}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return [];
    }
  }

  async fetchProcurementAwards(contractor?: string, limit = 50): Promise<ProcurementAward[]> {
    const cleanContractor = contractor ? sanitizeSearchQuery(contractor, 100) : undefined;
    try {
      const url = cleanContractor
        ? `${this.baseUrl}/analytics/procurement?contractor=${encodeURIComponent(cleanContractor)}&limit=${limit}`
        : `${this.baseUrl}/analytics/procurement?limit=${limit}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return [];
    }
  }

  async signIn(email: string, password: string): Promise<{ user: any; error?: string }> {
    const cleanEmail = sanitizeEmail(email);
    const sanitizedPayload = sanitizePayload({ email: cleanEmail, password });
    try {
      const res = await fetch(`${this.baseUrl}/auth/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(sanitizedPayload),
      });
      const data = await res.json();
      if (!res.ok) {
        return { user: null, error: data?.detail || 'Sign-in failed.' };
      }
      // Native clients persist the returned tokens (web relies on the cookie).
      if (data?.tokens?.access_token) {
        await tokenStore.save(data.tokens);
      }
      return { user: data.user || data };
    } catch {
      return { user: null, error: 'Network error: Unable to reach authentication server.' };
    }
  }

  async signUp(
    email: string,
    password: string,
    fullName?: string,
  ): Promise<{ user: any; message?: string; error?: string }> {
    const cleanEmail = sanitizeEmail(email);
    const cleanName = fullName ? sanitizeSearchQuery(fullName, 100) : undefined;
    const sanitizedPayload = sanitizePayload({
      email: cleanEmail,
      password,
      full_name: cleanName,
    });
    try {
      const res = await fetch(`${this.baseUrl}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(sanitizedPayload),
      });
      const data = await res.json();
      if (!res.ok) {
        return { user: null, error: data?.detail || 'Sign-up failed.' };
      }
      if (data?.tokens?.access_token) {
        await tokenStore.save(data.tokens);
      }
      return { user: data.user || data, message: data.message };
    } catch {
      return { user: null, error: 'Network error: Unable to reach authentication server.' };
    }
  }

  async getOAuthUrl(
    provider: 'google' | 'facebook' | string,
    redirectUri?: string,
  ): Promise<{ url: string | null; error?: string }> {
    try {
      const redirectQuery = redirectUri
        ? `?redirect=${encodeURIComponent(redirectUri)}`
        : '';
      const res = await fetch(`${this.baseUrl}/auth/oauth/${provider.toLowerCase()}${redirectQuery}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        return { url: null, error: data?.detail || `Failed to initiate ${provider} login.` };
      }
      return { url: data.url ?? null };
    } catch {
      return { url: null, error: 'Network error: Unable to connect to auth server.' };
    }
  }

  async exchangeOAuthCallback(
    accessToken: string,
    refreshToken?: string,
  ): Promise<{ user: any; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          access_token: sanitizeSearchQuery(accessToken, 2048),
          refresh_token: refreshToken ? sanitizeSearchQuery(refreshToken, 2048) : '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { user: null, error: data?.detail || 'OAuth callback verification failed.' };
      }
      // Persist tokens on native so the OAuth session survives app restarts.
      if (data?.tokens?.access_token) {
        await tokenStore.save(data.tokens);
      } else {
        await tokenStore.save({ access_token: accessToken, refresh_token: refreshToken ?? null });
      }
      return { user: data.user || data };
    } catch {
      return { user: null, error: 'Network error: Unable to verify OAuth callback.' };
    }
  }

  async signOut(): Promise<void> {
    try {
      const authHeaders = await tokenStore.authHeaders();
      await fetch(`${this.baseUrl}/auth/signout`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders,
      });
    } catch {
      // offline noop
    } finally {
      // Always clear local tokens so the device is signed out even if the
      // network call failed.
      await tokenStore.clear();
    }
  }

  async getSession(): Promise<any | null> {
    try {
      const authHeaders = await tokenStore.authHeaders();
      const res = await fetch(`${this.baseUrl}/auth/session`, {
        headers: { Accept: 'application/json', ...authHeaders },
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = await res.json();
      // If the backend refreshed the session, persist the new tokens (native).
      if (data?.tokens?.access_token) {
        await tokenStore.save(data.tokens);
      }
      return data?.user ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Submit a geofenced field report (Pillars 1–3). Sends multipart form data
   * with the session cookie (credentials: 'include'); the backend re-validates
   * the ≤150m geofence and runs image forensics, returning a verification
   * verdict. Throws an Error with a `.status` on 401 / 429 / other failures.
   */
  async submitReport(input: {
    projectId: string;
    description: string;
    category?: string;
    latitude?: number;
    longitude?: number;
    photo?: { uri: string; name?: string; type?: string } | null;
  }): Promise<ReportVerification> {
    const cleanPayload = sanitizePayload({
      projectId: input.projectId,
      description: input.description,
      category: input.category,
    });

    const cleanId = sanitizeSearchQuery(cleanPayload.projectId, 50);
    const cleanDesc = sanitizeReportDescription(cleanPayload.description, 2000);
    const cleanCat = cleanPayload.category ? sanitizeSearchQuery(cleanPayload.category, 50) : undefined;

    const form = new FormData();
    form.append('project_id', cleanId);
    form.append('description', cleanDesc);
    if (cleanCat) form.append('category', cleanCat);
    if (typeof input.latitude === 'number') form.append('latitude', String(input.latitude));
    if (typeof input.longitude === 'number') form.append('longitude', String(input.longitude));
    if (input.photo) {
      if (Platform.OS === 'web' && typeof input.photo.uri === 'string' && input.photo.uri.startsWith('data:')) {
        try {
          const blobRes = await fetch(input.photo.uri);
          const blob = await blobRes.blob();
          form.append('picture', blob, input.photo.name ?? 'field-photo.jpg');
        } catch {
          form.append('picture', {
            uri: input.photo.uri,
            name: input.photo.name ?? 'field-photo.jpg',
            type: input.photo.type ?? 'image/jpeg',
          } as unknown as Blob);
        }
      } else {
        form.append('picture', {
          uri: input.photo.uri,
          name: input.photo.name ?? 'field-photo.jpg',
          type: input.photo.type ?? 'image/jpeg',
        } as unknown as Blob);
      }
    }

    const authHeaders = await tokenStore.authHeaders();
    const res = await fetch(`${this.baseUrl}/reports`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders,
      body: form,
    });
    if (!res.ok) {
      let detail = `Report submission failed (HTTP ${res.status})`;
      try {
        const body = await res.json();
        if (body?.detail) detail = body.detail;
      } catch {
        // ignore non-JSON error bodies
      }
      const error = new Error(detail) as Error & { status?: number };
      error.status = res.status;
      throw error;
    }
    return (await res.json()) as ReportVerification;
  }

  /** Fetch a project's reports with verification badges (Pillar 5). */
  async fetchProjectReports(projectId: string): Promise<ReportRecord[]> {
    const cleanId = sanitizeSearchQuery(projectId, 50);
    const authHeaders = await tokenStore.authHeaders();
    const res = await fetch(`${this.baseUrl}/reports/${encodeURIComponent(cleanId)}`, {
      headers: { Accept: 'application/json', ...authHeaders },
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return (body?.reports ?? []) as ReportRecord[];
  }

  /**
   * Offline-first sync (Pillar 1 field durability): POST each pending outbox
   * audit to the backend. Marks items synced on success; leaves them pending on
   * failure so a later sync retries. Returns the number successfully synced.
   */
  async syncPendingAudits(): Promise<number> {
    const pending = outbox.getPendingAudits();
    let synced = 0;
    for (const item of pending) {
      try {
        await this.submitReport({
          projectId: item.projectId,
          description: item.notes ?? 'On-site field audit (offline capture).',
          latitude: item.latitude,
          longitude: item.longitude,
        });
        outbox.markSynced(item.id);
        synced += 1;
      } catch {
        // Keep the item pending for the next sync attempt.
      }
    }
    return synced;
  }
}

export const api = new ApiService();
