import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import path from 'path';
import fs from 'fs';
import { WhisperService } from './whisper';
import { HardwareDetector, HardwareInfo } from './hardware';
import { TTSService } from './tts';
import { OllamaService } from './ollama';
import { VideoAnalyzerService } from './video-analyzer';
import Store from 'electron-store';

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;

// Configure electron store for settings
const store = new Store({
  defaults: {
    whisperModel: 'tiny',
    ttsModel: null,
    ollamaModel: 'llama3.2:1b',
    cloudSyncEnabled: false,
    authToken: null,
    apiBaseUrl: 'https://api.crowterminal.com',
    setupComplete: false,
  },
});

let mainWindow: BrowserWindow | null = null;
let whisperService: WhisperService | null = null;
let ttsService: TTSService | null = null;
let ollamaService: OllamaService | null = null;
let videoAnalyzerService: VideoAnalyzerService | null = null;
let hardwareInfo: HardwareInfo | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  // Detect hardware capabilities
  const detector = new HardwareDetector();
  hardwareInfo = await detector.detect();
  log.info('Hardware detected:', hardwareInfo);

  // Initialize services
  whisperService = new WhisperService(hardwareInfo);
  ttsService = new TTSService(hardwareInfo);
  ollamaService = new OllamaService(hardwareInfo.totalMemoryGB);
  videoAnalyzerService = new VideoAnalyzerService();

  createWindow();

  // Check for updates (in production only)
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// Hardware info
ipcMain.handle('get-hardware-info', async () => {
  return hardwareInfo;
});

// Settings
ipcMain.handle('get-settings', async () => {
  return {
    whisperModel: store.get('whisperModel'),
    cloudSyncEnabled: store.get('cloudSyncEnabled'),
    isAuthenticated: !!store.get('authToken'),
    apiBaseUrl: store.get('apiBaseUrl'),
  };
});

ipcMain.handle('set-setting', async (_, key: string, value: unknown) => {
  store.set(key, value);
  return true;
});

// Authentication
ipcMain.handle('set-auth-token', async (_, token: string | null) => {
  store.set('authToken', token);
  return true;
});

ipcMain.handle('get-auth-token', async () => {
  return store.get('authToken');
});

// File selection
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media Files', extensions: ['mp4', 'mp3', 'wav', 'webm', 'm4a', 'ogg', 'mov', 'avi', 'mkv'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled) {
    return [];
  }

  return result.filePaths;
});

// Whisper model management
ipcMain.handle('get-available-models', async () => {
  if (!whisperService) {
    throw new Error('Whisper service not initialized');
  }
  return whisperService.getAvailableModels();
});

ipcMain.handle('get-downloaded-models', async () => {
  if (!whisperService) {
    throw new Error('Whisper service not initialized');
  }
  return whisperService.getDownloadedModels();
});

ipcMain.handle('download-model', async (event, modelName: string) => {
  if (!whisperService) {
    throw new Error('Whisper service not initialized');
  }

  return whisperService.downloadModel(modelName, (progress) => {
    event.sender.send('model-download-progress', { modelName, progress });
  });
});

ipcMain.handle('delete-model', async (_, modelName: string) => {
  if (!whisperService) {
    throw new Error('Whisper service not initialized');
  }
  return whisperService.deleteModel(modelName);
});

// Transcription
ipcMain.handle('transcribe', async (event, filePath: string, options?: { model?: string; language?: string }) => {
  if (!whisperService) {
    throw new Error('Whisper service not initialized');
  }

  const modelName = options?.model || (store.get('whisperModel') as string) || 'tiny';

  return whisperService.transcribe(filePath, {
    model: modelName,
    language: options?.language,
    onProgress: (progress) => {
      event.sender.send('transcription-progress', { filePath, progress });
    },
  });
});

ipcMain.handle('cancel-transcription', async (_, filePath: string) => {
  if (!whisperService) {
    throw new Error('Whisper service not initialized');
  }
  return whisperService.cancelTranscription(filePath);
});

// App info
ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

ipcMain.handle('get-app-path', async (_, name: 'home' | 'appData' | 'userData' | 'temp' | 'downloads') => {
  return app.getPath(name);
});

// Auto-updater events
autoUpdater.on('update-available', () => {
  mainWindow?.webContents.send('update-available');
});

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update-downloaded');
});

ipcMain.handle('install-update', async () => {
  autoUpdater.quitAndInstall();
});

// ============================================
// TTS (Voice Studio) IPC Handlers
// ============================================

ipcMain.handle('tts:check-python', async () => {
  if (!ttsService) {
    throw new Error('TTS service not initialized');
  }
  return ttsService.checkPythonAvailable();
});

ipcMain.handle('tts:start-server', async () => {
  if (!ttsService) {
    throw new Error('TTS service not initialized');
  }
  return ttsService.startServer();
});

ipcMain.handle('tts:stop-server', async () => {
  if (!ttsService) {
    throw new Error('TTS service not initialized');
  }
  return ttsService.stopServer();
});

ipcMain.handle('tts:get-status', async () => {
  if (!ttsService) {
    throw new Error('TTS service not initialized');
  }
  return ttsService.getStatus();
});

ipcMain.handle('tts:get-models', async () => {
  if (!ttsService) {
    throw new Error('TTS service not initialized');
  }
  return ttsService.getAvailableModels();
});

ipcMain.handle('tts:download-model', async (event, modelId: string) => {
  if (!ttsService) {
    throw new Error('TTS service not initialized');
  }
  return ttsService.downloadModel(modelId, (progress) => {
    event.sender.send('tts:download-progress', { modelId, progress });
  });
});

ipcMain.handle('tts:load-model', async (_, modelId: string) => {
  if (!ttsService) {
    throw new Error('TTS service not initialized');
  }
  return ttsService.loadModel(modelId);
});

ipcMain.handle('tts:delete-model', async (_, modelId: string) => {
  if (!ttsService) {
    throw new Error('TTS service not initialized');
  }
  return ttsService.deleteModel(modelId);
});

ipcMain.handle('tts:clone-voice', async (_, audioPath: string, name: string, description?: string, language?: string, transcript?: string) => {
  if (!ttsService) {
    throw new Error('TTS service not initialized');
  }
  return ttsService.cloneVoice(audioPath, name, description || '', language || 'en', transcript || '');
});

ipcMain.handle('tts:list-voices', async () => {
  if (!ttsService) {
    throw new Error('TTS service not initialized');
  }
  return ttsService.listVoices();
});

ipcMain.handle('tts:delete-voice', async (_, voiceId: string) => {
  if (!ttsService) {
    throw new Error('TTS service not initialized');
  }
  return ttsService.deleteVoice(voiceId);
});

ipcMain.handle('tts:generate', async (_, text: string, options?: {
  voiceId?: string;
  speaker?: string;
  instruct?: string;
  language?: string;
  speed?: number;
  format?: 'wav' | 'mp3';
}) => {
  if (!ttsService) {
    throw new Error('TTS service not initialized');
  }
  return ttsService.generateSpeech(text, options || {});
});

ipcMain.handle('tts:get-languages', async () => {
  if (!ttsService) {
    throw new Error('TTS service not initialized');
  }
  return ttsService.getSupportedLanguages();
});

ipcMain.handle('tts:get-speakers', async () => {
  if (!ttsService) {
    throw new Error('TTS service not initialized');
  }
  return ttsService.getSpeakers();
});

// ============================================
// Ollama (Content Analyst) IPC Handlers
// ============================================

ipcMain.handle('ollama:status', async () => {
  if (!ollamaService) {
    throw new Error('Ollama service not initialized');
  }
  return ollamaService.checkStatus();
});

ipcMain.handle('ollama:list-models', async () => {
  if (!ollamaService) {
    throw new Error('Ollama service not initialized');
  }
  return ollamaService.getAvailableModels();
});

ipcMain.handle('ollama:pull-model', async (event, modelName: string) => {
  if (!ollamaService) {
    throw new Error('Ollama service not initialized');
  }
  return ollamaService.pullModel(modelName, (progress) => {
    event.sender.send('ollama:pull-progress', { modelName, ...progress });
  });
});

ipcMain.handle('ollama:delete-model', async (_, modelName: string) => {
  if (!ollamaService) {
    throw new Error('Ollama service not initialized');
  }
  return ollamaService.deleteModel(modelName);
});

ipcMain.handle('ollama:generate', async (_, options: {
  model: string;
  prompt: string;
  system?: string;
  options?: { temperature?: number; top_p?: number; num_predict?: number };
}) => {
  if (!ollamaService) {
    throw new Error('Ollama service not initialized');
  }
  return ollamaService.generate(options);
});

ipcMain.handle('ollama:generate-stream', async (event, options: {
  model: string;
  prompt: string;
  system?: string;
  options?: { temperature?: number; top_p?: number; num_predict?: number };
}) => {
  if (!ollamaService) {
    throw new Error('Ollama service not initialized');
  }
  return ollamaService.generateStream(options, (chunk) => {
    event.sender.send('ollama:stream-chunk', chunk);
  });
});

ipcMain.handle('ollama:suggest-hashtags', async (_, niche: string, platform?: 'tiktok' | 'instagram' | 'youtube', model?: string) => {
  if (!ollamaService) {
    throw new Error('Ollama service not initialized');
  }
  return ollamaService.suggestHashtags(niche, platform || 'tiktok', model || 'llama3.2:1b');
});

ipcMain.handle('ollama:analyze-script', async (_, script: string, model?: string) => {
  if (!ollamaService) {
    throw new Error('Ollama service not initialized');
  }
  return ollamaService.analyzeScript(script, model || 'llama3.2:3b');
});

ipcMain.handle('ollama:generate-captions', async (_, videoTitle: string, style?: 'casual' | 'professional' | 'funny' | 'inspirational', model?: string) => {
  if (!ollamaService) {
    throw new Error('Ollama service not initialized');
  }
  return ollamaService.generateCaptions(videoTitle, style || 'casual', model || 'llama3.2:3b');
});

ipcMain.handle('ollama:generate-thumbnail-ideas', async (_, videoTitle: string, model?: string) => {
  if (!ollamaService) {
    throw new Error('Ollama service not initialized');
  }
  return ollamaService.generateThumbnailIdeas(videoTitle, model || 'llama3.2:3b');
});

ipcMain.handle('ollama:get-install-instructions', async () => {
  if (!ollamaService) {
    throw new Error('Ollama service not initialized');
  }
  return ollamaService.getInstallInstructions();
});

// ============================================
// Video Analyzer (TikTok Score) IPC Handlers
// ============================================

ipcMain.handle('video:start-server', async () => {
  if (!videoAnalyzerService) {
    throw new Error('Video Analyzer service not initialized');
  }
  return videoAnalyzerService.startServer();
});

ipcMain.handle('video:stop-server', async () => {
  if (!videoAnalyzerService) {
    throw new Error('Video Analyzer service not initialized');
  }
  return videoAnalyzerService.stopServer();
});

ipcMain.handle('video:analyze', async (event, videoPath: string) => {
  if (!videoAnalyzerService) {
    throw new Error('Video Analyzer service not initialized');
  }
  return videoAnalyzerService.analyzeVideo(videoPath, (progress) => {
    event.sender.send('video:analysis-progress', { videoPath, progress });
  });
});

ipcMain.handle('video:quick-analyze', async (_, videoPath: string) => {
  if (!videoAnalyzerService) {
    throw new Error('Video Analyzer service not initialized');
  }
  return videoAnalyzerService.quickAnalyze(videoPath);
});

ipcMain.handle('video:check-dependencies', async () => {
  if (!videoAnalyzerService) {
    throw new Error('Video Analyzer service not initialized');
  }
  return videoAnalyzerService.checkDependencies();
});

ipcMain.handle('video:get-install-instructions', async () => {
  if (!videoAnalyzerService) {
    throw new Error('Video Analyzer service not initialized');
  }
  return videoAnalyzerService.getInstallInstructions();
});

ipcMain.handle('video:is-running', async () => {
  if (!videoAnalyzerService) {
    return false;
  }
  return videoAnalyzerService.isRunning();
});

// Select video files specifically
ipcMain.handle('select-video-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] },
    ],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

// Select audio files for voice cloning
ipcMain.handle('select-audio-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'flac'] },
    ],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

// Save audio buffer to temp file (for voice recording)
ipcMain.handle('save-audio-to-temp', async (_, buffer: ArrayBuffer, filename: string) => {
  const tempDir = app.getPath('temp');
  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return filePath;
});

// Read audio file as base64 data URL for playback
ipcMain.handle('read-audio-as-data-url', async (_, filePath: string) => {
  log.info('Reading audio file as data URL:', filePath);
  if (!fs.existsSync(filePath)) {
    log.error('Audio file not found:', filePath);
    throw new Error(`Audio file not found: ${filePath}`);
  }

  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');

  // Determine MIME type from extension
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
  };
  const mimeType = mimeTypes[ext] || 'audio/wav';

  log.info('Audio loaded, base64 length:', base64.length);
  return `data:${mimeType};base64,${base64}`;
});

// Save audio file to user's chosen location
ipcMain.handle('save-audio-file', async (_, sourcePath: string, defaultName?: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName || 'generated_audio.wav',
    filters: [
      { name: 'Audio Files', extensions: ['wav', 'mp3'] },
    ],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  fs.copyFileSync(sourcePath, result.filePath);
  return result.filePath;
});

// Cleanup on app quit
app.on('before-quit', async () => {
  log.info('App quitting, cleaning up services...');

  if (ttsService?.isRunning()) {
    await ttsService.stopServer();
  }

  if (videoAnalyzerService?.isRunning()) {
    await videoAnalyzerService.stopServer();
  }
});
