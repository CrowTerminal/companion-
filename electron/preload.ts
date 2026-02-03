import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// ============================================
// Type Definitions
// ============================================

export interface TranscriptionResult {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language: string;
  duration: number;
}

export interface HardwareInfo {
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryGB: number;
  availableMemoryGB: number;
  hasGpu: boolean;
  gpuInfo?: string;
  hasMetalSupport?: boolean;
  hasCudaSupport?: boolean;
  recommendedModel: string;
  canRunLargeModels: boolean;
  warnings?: string[];
}

export interface WhisperModel {
  name: string;
  size: string;
  sizeBytes: number;
  description: string;
  recommended: boolean;
  downloaded: boolean;
  ramRequired: number;
}

export interface Settings {
  whisperModel: string;
  cloudSyncEnabled: boolean;
  isAuthenticated: boolean;
  apiBaseUrl: string;
  setupComplete: boolean;
}

// TTS Types
export interface TTSModel {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  description: string;
  ramRequired: number;
  downloaded: boolean;
  recommended: boolean;
  type?: 'clone' | 'custom' | 'design';
}

export interface PresetSpeaker {
  language: string;
  description: string;
}

export interface VoiceProfile {
  id: string;
  name: string;
  description: string;
  sample_path: string;
  created_at: string;
  language: string;
  transcript: string;
  embedding_path?: string;
}

export interface TTSStatus {
  running: boolean;
  device: string;
  modelLoaded: boolean;
  currentModel: string | null;
  currentModelType: 'clone' | 'custom' | 'design' | null;
  voiceCount: number;
  supportedLanguages: Record<string, string>;
  presetSpeakers: Record<string, PresetSpeaker>;
  pythonAvailable: boolean;
}

export interface TTSGenerateOptions {
  voiceId?: string;
  speaker?: string;
  instruct?: string;
  language?: string;
  speed?: number;
  format?: 'wav' | 'mp3';
}

// Ollama Types
export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export interface OllamaModelInfo {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  description: string;
  ramRequired: number;
  downloaded: boolean;
  recommended: boolean;
  bestFor: string;
}

export interface OllamaStatus {
  running: boolean;
  installed: boolean;
  version?: string;
  models: OllamaModel[];
}

export interface OllamaGenerateOptions {
  model: string;
  prompt: string;
  system?: string;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  };
}

export interface ScriptAnalysisResult {
  score: number;
  feedback: string[];
  suggestions: string[];
}

// Video Analyzer Types
export interface TechnicalScore {
  resolution: number;
  aspect_ratio: number;
  lighting: number;
  blur: number;
  fps: number;
  overall: number;
  details?: {
    actualResolution: string;
    actualFps: number;
    actualAspectRatio: number;
    isVertical: boolean;
  };
}

export interface HookScore {
  first_3_seconds: number;
  movement: number;
  face_detected: boolean;
  scene_changes: number;
  overall: number;
  details?: {
    avgMovement: number;
    framesAnalyzed: number;
  };
}

export interface AudioScore {
  levels: number;
  clarity: number;
  has_audio: boolean;
  is_silent: boolean;
  overall: number;
  details?: {
    avgDb?: number;
    avgRms?: number;
    spectralCentroid?: number;
    error?: string;
  };
}

export interface ContentScore {
  has_captions: boolean;
  has_faces: boolean;
  pacing: number;
  no_watermarks: boolean;
  scene_count: number;
  duration_optimal: boolean;
  overall: number;
  details?: {
    faceSamples: number;
    totalSamples: number;
    scenesPerMin: number;
    duration: number;
  };
}

export interface VideoInfo {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  duration: number;
  aspectRatio: number;
  resolution: string;
}

export interface TikTokScoreResult {
  overallScore: number;
  technical: TechnicalScore;
  hook: HookScore;
  audio: AudioScore;
  content: ContentScore;
  recommendations: string[];
  videoInfo: VideoInfo;
}

// ============================================
// API Interface
// ============================================

export interface ElectronAPI {
  // Hardware
  getHardwareInfo: () => Promise<HardwareInfo>;

  // Settings
  getSettings: () => Promise<Settings>;
  setSetting: (key: string, value: unknown) => Promise<boolean>;

  // Authentication
  setAuthToken: (token: string | null) => Promise<boolean>;
  getAuthToken: () => Promise<string | null>;

  // File operations
  selectFiles: () => Promise<string[]>;
  selectVideoFile: () => Promise<string | null>;
  selectAudioFile: () => Promise<string | null>;
  saveAudioToTemp: (buffer: ArrayBuffer, filename: string) => Promise<string>;
  readAudioAsDataUrl: (filePath: string) => Promise<string>;
  saveAudioFile: (sourcePath: string, defaultName?: string) => Promise<string | null>;

  // Whisper models
  getAvailableModels: () => Promise<WhisperModel[]>;
  getDownloadedModels: () => Promise<string[]>;
  downloadModel: (modelName: string) => Promise<boolean>;
  deleteModel: (modelName: string) => Promise<boolean>;

  // Transcription
  transcribe: (filePath: string, options?: { model?: string; language?: string }) => Promise<TranscriptionResult>;
  cancelTranscription: (filePath: string) => Promise<boolean>;

  // App info
  getAppVersion: () => Promise<string>;
  getAppPath: (name: 'home' | 'appData' | 'userData' | 'temp' | 'downloads') => Promise<string>;

  // Updates
  installUpdate: () => Promise<void>;

  // TTS (Voice Studio)
  tts: {
    checkPython: () => Promise<{ available: boolean; version?: string; error?: string }>;
    startServer: () => Promise<boolean>;
    stopServer: () => Promise<void>;
    getStatus: () => Promise<TTSStatus>;
    getModels: () => Promise<TTSModel[]>;
    downloadModel: (modelId: string) => Promise<boolean>;
    loadModel: (modelId: string) => Promise<boolean>;
    deleteModel: (modelId: string) => Promise<boolean>;
    cloneVoice: (audioPath: string, name: string, description?: string, language?: string, transcript?: string) => Promise<VoiceProfile>;
    listVoices: () => Promise<VoiceProfile[]>;
    deleteVoice: (voiceId: string) => Promise<boolean>;
    generate: (text: string, options?: TTSGenerateOptions) => Promise<string>;
    getLanguages: () => Promise<Record<string, string>>;
    getSpeakers: () => Promise<{ speakers: Record<string, PresetSpeaker>; available: boolean }>;
    onDownloadProgress: (callback: (data: { modelId: string; progress: number }) => void) => () => void;
  };

  // Ollama (Content Analyst)
  ollama: {
    status: () => Promise<OllamaStatus>;
    listModels: () => Promise<OllamaModelInfo[]>;
    pullModel: (modelName: string) => Promise<boolean>;
    deleteModel: (modelName: string) => Promise<boolean>;
    generate: (options: OllamaGenerateOptions) => Promise<string>;
    generateStream: (options: OllamaGenerateOptions) => Promise<string>;
    suggestHashtags: (niche: string, platform?: 'tiktok' | 'instagram' | 'youtube', model?: string) => Promise<string[]>;
    analyzeScript: (script: string, model?: string) => Promise<ScriptAnalysisResult>;
    generateCaptions: (videoTitle: string, style?: 'casual' | 'professional' | 'funny' | 'inspirational', model?: string) => Promise<string[]>;
    generateThumbnailIdeas: (videoTitle: string, model?: string) => Promise<string[]>;
    getInstallInstructions: () => Promise<string>;
    onPullProgress: (callback: (data: { modelName: string; status: string; completed?: number; total?: number }) => void) => () => void;
    onStreamChunk: (callback: (chunk: string) => void) => () => void;
  };

  // Video Analyzer (TikTok Score)
  video: {
    startServer: () => Promise<boolean>;
    stopServer: () => Promise<void>;
    analyze: (videoPath: string) => Promise<TikTokScoreResult>;
    quickAnalyze: (videoPath: string) => Promise<{ technical: TechnicalScore; videoInfo: VideoInfo }>;
    checkDependencies: () => Promise<{ available: boolean; missing: string[] }>;
    getInstallInstructions: () => Promise<string>;
    isRunning: () => Promise<boolean>;
    onAnalysisProgress: (callback: (data: { videoPath: string; progress: number }) => void) => () => void;
  };

  // Event listeners
  onModelDownloadProgress: (callback: (data: { modelName: string; progress: number }) => void) => () => void;
  onTranscriptionProgress: (callback: (data: { filePath: string; progress: number }) => void) => () => void;
  onUpdateAvailable: (callback: () => void) => () => void;
  onUpdateDownloaded: (callback: () => void) => () => void;
}

// ============================================
// Context Bridge Exposure
// ============================================

contextBridge.exposeInMainWorld('electronAPI', {
  // Hardware
  getHardwareInfo: () => ipcRenderer.invoke('get-hardware-info'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key: string, value: unknown) => ipcRenderer.invoke('set-setting', key, value),

  // Authentication
  setAuthToken: (token: string | null) => ipcRenderer.invoke('set-auth-token', token),
  getAuthToken: () => ipcRenderer.invoke('get-auth-token'),

  // File operations
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectVideoFile: () => ipcRenderer.invoke('select-video-files'),
  selectAudioFile: () => ipcRenderer.invoke('select-audio-file'),
  saveAudioToTemp: (buffer: ArrayBuffer, filename: string) => ipcRenderer.invoke('save-audio-to-temp', buffer, filename),
  readAudioAsDataUrl: (filePath: string) => ipcRenderer.invoke('read-audio-as-data-url', filePath),
  saveAudioFile: (sourcePath: string, defaultName?: string) => ipcRenderer.invoke('save-audio-file', sourcePath, defaultName),

  // Whisper models
  getAvailableModels: () => ipcRenderer.invoke('get-available-models'),
  getDownloadedModels: () => ipcRenderer.invoke('get-downloaded-models'),
  downloadModel: (modelName: string) => ipcRenderer.invoke('download-model', modelName),
  deleteModel: (modelName: string) => ipcRenderer.invoke('delete-model', modelName),

  // Transcription
  transcribe: (filePath: string, options?: { model?: string; language?: string }) =>
    ipcRenderer.invoke('transcribe', filePath, options),
  cancelTranscription: (filePath: string) => ipcRenderer.invoke('cancel-transcription', filePath),

  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: (name: 'home' | 'appData' | 'userData' | 'temp' | 'downloads') =>
    ipcRenderer.invoke('get-app-path', name),

  // Updates
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // TTS (Voice Studio)
  tts: {
    checkPython: () => ipcRenderer.invoke('tts:check-python'),
    startServer: () => ipcRenderer.invoke('tts:start-server'),
    stopServer: () => ipcRenderer.invoke('tts:stop-server'),
    getStatus: () => ipcRenderer.invoke('tts:get-status'),
    getModels: () => ipcRenderer.invoke('tts:get-models'),
    downloadModel: (modelId: string) => ipcRenderer.invoke('tts:download-model', modelId),
    loadModel: (modelId: string) => ipcRenderer.invoke('tts:load-model', modelId),
    deleteModel: (modelId: string) => ipcRenderer.invoke('tts:delete-model', modelId),
    cloneVoice: (audioPath: string, name: string, description?: string, language?: string, transcript?: string) =>
      ipcRenderer.invoke('tts:clone-voice', audioPath, name, description, language, transcript),
    listVoices: () => ipcRenderer.invoke('tts:list-voices'),
    deleteVoice: (voiceId: string) => ipcRenderer.invoke('tts:delete-voice', voiceId),
    generate: (text: string, options?: TTSGenerateOptions) =>
      ipcRenderer.invoke('tts:generate', text, options),
    getLanguages: () => ipcRenderer.invoke('tts:get-languages'),
    getSpeakers: () => ipcRenderer.invoke('tts:get-speakers'),
    onDownloadProgress: (callback: (data: { modelId: string; progress: number }) => void) => {
      const handler = (_: IpcRendererEvent, data: { modelId: string; progress: number }) => callback(data);
      ipcRenderer.on('tts:download-progress', handler);
      return () => ipcRenderer.removeListener('tts:download-progress', handler);
    },
  },

  // Ollama (Content Analyst)
  ollama: {
    status: () => ipcRenderer.invoke('ollama:status'),
    listModels: () => ipcRenderer.invoke('ollama:list-models'),
    pullModel: (modelName: string) => ipcRenderer.invoke('ollama:pull-model', modelName),
    deleteModel: (modelName: string) => ipcRenderer.invoke('ollama:delete-model', modelName),
    generate: (options: OllamaGenerateOptions) => ipcRenderer.invoke('ollama:generate', options),
    generateStream: (options: OllamaGenerateOptions) => ipcRenderer.invoke('ollama:generate-stream', options),
    suggestHashtags: (niche: string, platform?: 'tiktok' | 'instagram' | 'youtube', model?: string) =>
      ipcRenderer.invoke('ollama:suggest-hashtags', niche, platform, model),
    analyzeScript: (script: string, model?: string) =>
      ipcRenderer.invoke('ollama:analyze-script', script, model),
    generateCaptions: (videoTitle: string, style?: 'casual' | 'professional' | 'funny' | 'inspirational', model?: string) =>
      ipcRenderer.invoke('ollama:generate-captions', videoTitle, style, model),
    generateThumbnailIdeas: (videoTitle: string, model?: string) =>
      ipcRenderer.invoke('ollama:generate-thumbnail-ideas', videoTitle, model),
    getInstallInstructions: () => ipcRenderer.invoke('ollama:get-install-instructions'),
    onPullProgress: (callback: (data: { modelName: string; status: string; completed?: number; total?: number }) => void) => {
      const handler = (_: IpcRendererEvent, data: { modelName: string; status: string; completed?: number; total?: number }) => callback(data);
      ipcRenderer.on('ollama:pull-progress', handler);
      return () => ipcRenderer.removeListener('ollama:pull-progress', handler);
    },
    onStreamChunk: (callback: (chunk: string) => void) => {
      const handler = (_: IpcRendererEvent, chunk: string) => callback(chunk);
      ipcRenderer.on('ollama:stream-chunk', handler);
      return () => ipcRenderer.removeListener('ollama:stream-chunk', handler);
    },
  },

  // Video Analyzer (TikTok Score)
  video: {
    startServer: () => ipcRenderer.invoke('video:start-server'),
    stopServer: () => ipcRenderer.invoke('video:stop-server'),
    analyze: (videoPath: string) => ipcRenderer.invoke('video:analyze', videoPath),
    quickAnalyze: (videoPath: string) => ipcRenderer.invoke('video:quick-analyze', videoPath),
    checkDependencies: () => ipcRenderer.invoke('video:check-dependencies'),
    getInstallInstructions: () => ipcRenderer.invoke('video:get-install-instructions'),
    isRunning: () => ipcRenderer.invoke('video:is-running'),
    onAnalysisProgress: (callback: (data: { videoPath: string; progress: number }) => void) => {
      const handler = (_: IpcRendererEvent, data: { videoPath: string; progress: number }) => callback(data);
      ipcRenderer.on('video:analysis-progress', handler);
      return () => ipcRenderer.removeListener('video:analysis-progress', handler);
    },
  },

  // Event listeners with cleanup functions
  onModelDownloadProgress: (callback: (data: { modelName: string; progress: number }) => void) => {
    const handler = (_: IpcRendererEvent, data: { modelName: string; progress: number }) => callback(data);
    ipcRenderer.on('model-download-progress', handler);
    return () => ipcRenderer.removeListener('model-download-progress', handler);
  },

  onTranscriptionProgress: (callback: (data: { filePath: string; progress: number }) => void) => {
    const handler = (_: IpcRendererEvent, data: { filePath: string; progress: number }) => callback(data);
    ipcRenderer.on('transcription-progress', handler);
    return () => ipcRenderer.removeListener('transcription-progress', handler);
  },

  onUpdateAvailable: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },

  onUpdateDownloaded: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },
} as ElectronAPI);
