import { useState, useEffect, useCallback } from 'react';
import {
  Download,
  Trash2,
  Loader2,
  CheckCircle,
  HardDrive,
  Cpu,
  MemoryStick,
  Mic,
  Volume2,
  Brain,
  AlertCircle,
} from 'lucide-react';
import type { HardwareInfo, WhisperModel, TTSModel, OllamaModelInfo } from '../../electron/preload';

interface ModelManagerProps {
  hardwareInfo: HardwareInfo | null;
}

type ModelCategory = 'whisper' | 'tts' | 'ollama';

interface UnifiedModel {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  description: string;
  ramRequired: number;
  downloaded: boolean;
  recommended: boolean;
  category: ModelCategory;
  bestFor?: string;
}

export function ModelManager({ hardwareInfo }: ModelManagerProps) {
  const [whisperModels, setWhisperModels] = useState<WhisperModel[]>([]);
  const [ttsModels, setTtsModels] = useState<TTSModel[]>([]);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ollamaRunning, setOllamaRunning] = useState(false);

  // Calculate storage used
  const calculateStorageUsed = useCallback(() => {
    let total = 0;
    whisperModels.filter(m => m.downloaded).forEach(m => total += m.sizeBytes);
    ttsModels.filter(m => m.downloaded).forEach(m => total += m.sizeBytes);
    ollamaModels.filter(m => m.downloaded).forEach(m => total += m.sizeBytes);
    return total;
  }, [whisperModels, ttsModels, ollamaModels]);

  // Load all models
  const loadModels = useCallback(async () => {
    setIsLoading(true);
    try {
      const [whisper, tts, ollama, ollamaStatus] = await Promise.all([
        window.electronAPI.getAvailableModels(),
        window.electronAPI.tts.getModels(),
        window.electronAPI.ollama.listModels(),
        window.electronAPI.ollama.status(),
      ]);
      setWhisperModels(whisper);
      setTtsModels(tts);
      setOllamaModels(ollama);
      setOllamaRunning(ollamaStatus.running);
    } catch (err) {
      console.error('Failed to load models:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Listen for download progress
  useEffect(() => {
    const cleanup1 = window.electronAPI.onModelDownloadProgress(({ modelName, progress }) => {
      if (downloadingModel === modelName) {
        setDownloadProgress(progress);
      }
    });

    const cleanup2 = window.electronAPI.tts.onDownloadProgress(({ modelId, progress }) => {
      if (downloadingModel === modelId) {
        setDownloadProgress(progress);
      }
    });

    const cleanup3 = window.electronAPI.ollama.onPullProgress(({ modelName, completed, total }) => {
      if (downloadingModel === modelName && total) {
        setDownloadProgress(Math.round((completed || 0) / total * 100));
      }
    });

    return () => {
      cleanup1();
      cleanup2();
      cleanup3();
    };
  }, [downloadingModel]);

  // Download handlers
  const handleDownloadWhisper = async (modelName: string) => {
    setDownloadingModel(modelName);
    setDownloadProgress(0);
    setError(null);
    try {
      await window.electronAPI.downloadModel(modelName);
      await loadModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingModel(null);
    }
  };

  const handleDownloadTTS = async (modelId: string) => {
    setDownloadingModel(modelId);
    setDownloadProgress(0);
    setError(null);
    try {
      await window.electronAPI.tts.downloadModel(modelId);
      await loadModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingModel(null);
    }
  };

  const handleDownloadOllama = async (modelName: string) => {
    setDownloadingModel(modelName);
    setDownloadProgress(0);
    setError(null);
    try {
      await window.electronAPI.ollama.pullModel(modelName);
      await loadModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingModel(null);
    }
  };

  // Delete handlers
  const handleDeleteWhisper = async (modelName: string) => {
    try {
      await window.electronAPI.deleteModel(modelName);
      await loadModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleDeleteTTS = async (modelId: string) => {
    try {
      await window.electronAPI.tts.deleteModel(modelId);
      await loadModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleDeleteOllama = async (modelName: string) => {
    try {
      await window.electronAPI.ollama.deleteModel(modelName);
      await loadModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const storageUsed = calculateStorageUsed();
  const downloadedCount = whisperModels.filter(m => m.downloaded).length +
    ttsModels.filter(m => m.downloaded).length +
    ollamaModels.filter(m => m.downloaded).length;

  return (
    <div className="space-y-6">
      {/* Header with hardware info */}
      <div className="border rounded-lg p-4 bg-muted/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Your Hardware</h3>
          {hardwareInfo?.canRunLargeModels ? (
            <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs rounded">
              Recommended: Medium/Large models
            </span>
          ) : (
            <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 text-xs rounded">
              Recommended: Small models
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">CPU</p>
              <p className="text-sm font-medium">{hardwareInfo?.cpuCores || 0} cores</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MemoryStick className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">RAM</p>
              <p className="text-sm font-medium">{hardwareInfo?.totalMemoryGB || 0} GB</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Models Storage</p>
              <p className="text-sm font-medium">{formatBytes(storageUsed)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Installed</p>
              <p className="text-sm font-medium">{downloadedCount} models</p>
            </div>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      {/* Transcription Models (Whisper) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Mic className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Transcription (Whisper)</h3>
        </div>
        <div className="space-y-2">
          {whisperModels.slice(0, 5).map((model) => (
            <div
              key={model.name}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex items-center gap-3">
                {model.downloaded ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{model.name}</span>
                    <span className="text-xs text-muted-foreground">({model.size})</span>
                    {model.recommended && (
                      <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{model.description}</p>
                </div>
              </div>
              <div>
                {downloadingModel === model.name ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs">{downloadProgress}%</span>
                  </div>
                ) : model.downloaded ? (
                  <button
                    onClick={() => handleDeleteWhisper(model.name)}
                    className="p-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleDownloadWhisper(model.name)}
                    className="px-3 py-1 text-xs border rounded hover:bg-muted flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Voice Models (TTS) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Voice (Qwen3-TTS)</h3>
        </div>
        <div className="space-y-2">
          {ttsModels.map((model) => (
            <div
              key={model.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex items-center gap-3">
                {model.downloaded ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{model.name}</span>
                    <span className="text-xs text-muted-foreground">({model.size})</span>
                    {model.recommended && (
                      <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{model.description}</p>
                </div>
              </div>
              <div>
                {downloadingModel === model.id ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs">{downloadProgress}%</span>
                  </div>
                ) : model.downloaded ? (
                  <button
                    onClick={() => handleDeleteTTS(model.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleDownloadTTS(model.id)}
                    className="px-3 py-1 text-xs border rounded hover:bg-muted flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Analysis Models (Ollama) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <h3 className="font-medium">AI Analysis (Ollama)</h3>
          </div>
          {!ollamaRunning && (
            <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 text-xs rounded">
              Ollama not running
            </span>
          )}
        </div>
        <div className="space-y-2">
          {ollamaModels.map((model) => (
            <div
              key={model.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex items-center gap-3">
                {model.downloaded ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{model.name}</span>
                    <span className="text-xs text-muted-foreground">({model.size})</span>
                    {model.recommended && (
                      <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {model.description} - Best for: {model.bestFor}
                  </p>
                </div>
              </div>
              <div>
                {downloadingModel === model.id ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs">{downloadProgress}%</span>
                  </div>
                ) : model.downloaded ? (
                  <button
                    onClick={() => handleDeleteOllama(model.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleDownloadOllama(model.id)}
                    disabled={!ollamaRunning}
                    className="px-3 py-1 text-xs border rounded hover:bg-muted flex items-center gap-1 disabled:opacity-50"
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
