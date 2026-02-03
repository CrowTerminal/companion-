import axios, { AxiosInstance } from 'axios';

export interface SyncStatus {
  localCount: number;
  cloudCount: number;
  pendingSync: number;
  lastSyncedAt: string | null;
}

export interface CloudTranscript {
  id: string;
  fileName: string;
  text: string;
  language: string;
  duration: number;
  createdAt: string;
  clientId?: string;
}

interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

interface SavedTranscript {
  id: string;
  fileName: string;
  filePath: string;
  text: string;
  language: string;
  duration: number;
  createdAt: string;
  syncedToCloud: boolean;
}

class CloudSyncService {
  private api: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = 'https://api.crowterminal.com'; // Will be configurable
    this.api = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });

    // Add auth token to requests
    this.api.interceptors.request.use(async (config) => {
      const token = await window.electronAPI.getAuthToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle 401 errors
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          await window.electronAPI.setAuthToken(null);
        }
        throw error;
      }
    );
  }

  async login(email: string, password: string): Promise<string> {
    try {
      const response = await this.api.post<LoginResponse>('/api/auth/login', {
        email,
        password,
      });
      return response.data.token;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || 'Login failed');
      }
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.api.post('/api/auth/logout');
    } catch {
      // Ignore logout errors
    }
  }

  async getSyncStatus(): Promise<SyncStatus> {
    // Get local transcripts from localStorage
    const localTranscripts = this.getLocalTranscripts();
    const pendingSync = localTranscripts.filter((t) => !t.syncedToCloud).length;

    try {
      const response = await this.api.get<{ count: number }>('/api/desktop-sync/count');
      const lastSynced = localStorage.getItem('last-sync-time');

      return {
        localCount: localTranscripts.length,
        cloudCount: response.data.count,
        pendingSync,
        lastSyncedAt: lastSynced,
      };
    } catch {
      return {
        localCount: localTranscripts.length,
        cloudCount: 0,
        pendingSync,
        lastSyncedAt: null,
      };
    }
  }

  async syncAll(): Promise<void> {
    const localTranscripts = this.getLocalTranscripts();
    const pendingTranscripts = localTranscripts.filter((t) => !t.syncedToCloud);

    for (const transcript of pendingTranscripts) {
      try {
        await this.uploadTranscript(transcript);
        this.markAsSynced(transcript.id);
      } catch (error) {
        console.error(`Failed to sync transcript ${transcript.id}:`, error);
        // Continue with other transcripts
      }
    }

    localStorage.setItem('last-sync-time', new Date().toISOString());
  }

  async uploadTranscript(transcript: SavedTranscript): Promise<CloudTranscript> {
    const response = await this.api.post<CloudTranscript>('/api/desktop-sync/transcripts', {
      fileName: transcript.fileName,
      text: transcript.text,
      language: transcript.language,
      duration: transcript.duration,
      localId: transcript.id,
      createdAt: transcript.createdAt,
    });

    return response.data;
  }

  async downloadTranscripts(): Promise<CloudTranscript[]> {
    const response = await this.api.get<{ transcripts: CloudTranscript[] }>(
      '/api/desktop-sync/transcripts'
    );
    return response.data.transcripts;
  }

  private getLocalTranscripts(): SavedTranscript[] {
    try {
      const stored = localStorage.getItem('saved-transcripts');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private markAsSynced(transcriptId: string): void {
    const transcripts = this.getLocalTranscripts();
    const updated = transcripts.map((t) =>
      t.id === transcriptId ? { ...t, syncedToCloud: true } : t
    );
    localStorage.setItem('saved-transcripts', JSON.stringify(updated));
  }
}

export const cloudSyncService = new CloudSyncService();
