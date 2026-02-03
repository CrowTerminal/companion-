import { useState, useEffect } from 'react';
import {
  Download,
  Trash2,
  Check,
  AlertCircle,
  HardDrive,
  Cpu,
  Zap,
  Package,
  Settings as SettingsIcon,
  Info,
} from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { ModelManager } from './ModelManager';
import type { HardwareInfo, WhisperModel } from '../../electron/preload';

interface SettingsProps {
  hardwareInfo: HardwareInfo | null;
}

type SettingsTab = 'models' | 'general' | 'about';

export function Settings({ hardwareInfo }: SettingsProps) {
  const { settings, updateSetting } = useSettings();
  const [models, setModels] = useState<WhisperModel[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('models');

  useEffect(() => {
    loadModels();

    // Listen for download progress
    const cleanup = window.electronAPI.onModelDownloadProgress(({ modelName, progress }) => {
      setDownloadProgress((prev) => ({ ...prev, [modelName]: progress }));
    });

    return cleanup;
  }, []);

  const loadModels = async () => {
    try {
      const availableModels = await window.electronAPI.getAvailableModels();
      setModels(availableModels);
    } catch (err) {
      console.error('Failed to load models:', err);
      setError('Failed to load available models');
    }
  };

  const handleDownloadModel = async (modelName: string) => {
    setIsDownloading(modelName);
    setError(null);

    try {
      await window.electronAPI.downloadModel(modelName);
      await loadModels();
    } catch (err) {
      setError(`Failed to download ${modelName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsDownloading(null);
      setDownloadProgress((prev) => {
        const { [modelName]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleDeleteModel = async (modelName: string) => {
    if (!confirm(`Are you sure you want to delete the ${modelName} model?`)) {
      return;
    }

    try {
      await window.electronAPI.deleteModel(modelName);
      await loadModels();

      // If this was the selected model, switch to another
      if (settings?.whisperModel === modelName) {
        const downloaded = models.filter((m) => m.downloaded && m.name !== modelName);
        if (downloaded.length > 0) {
          await updateSetting('whisperModel', downloaded[0].name);
        }
      }
    } catch (err) {
      setError(`Failed to delete ${modelName}`);
    }
  };

  const handleSelectModel = async (modelName: string) => {
    const model = models.find((m) => m.name === modelName);
    if (!model?.downloaded) {
      // Download first
      await handleDownloadModel(modelName);
    }
    await updateSetting('whisperModel', modelName);
  };

  const formatRam = (gb: number) => {
    if (gb < 1) return `${Math.round(gb * 1024)}MB`;
    return `${gb}GB`;
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab('models')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'models'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Package className="w-4 h-4" />
          Model Manager
        </button>
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'general'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          General
        </button>
        <button
          onClick={() => setActiveTab('about')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'about'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Info className="w-4 h-4" />
          About
        </button>
      </div>

      {/* Model Manager Tab */}
      {activeTab === 'models' && (
        <ModelManager hardwareInfo={hardwareInfo} />
      )}

      {/* General Settings Tab */}
      {activeTab === 'general' && (
        <div className="max-w-3xl space-y-8">
          {/* Hardware Info */}
          {hardwareInfo && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <HardDrive className="w-5 h-5" />
                System Information
              </h2>

              <div className="grid grid-cols-3 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Cpu className="w-4 h-4" />
                    <span className="text-xs font-medium">CPU</span>
                  </div>
                  <p className="text-sm font-medium">{hardwareInfo.cpuModel}</p>
                  <p className="text-xs text-muted-foreground">{hardwareInfo.cpuCores} cores</p>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <HardDrive className="w-4 h-4" />
                    <span className="text-xs font-medium">Memory</span>
                  </div>
                  <p className="text-sm font-medium">{hardwareInfo.totalMemoryGB}GB RAM</p>
                  <p className="text-xs text-muted-foreground">
                    {hardwareInfo.availableMemoryGB}GB available
                  </p>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Zap className="w-4 h-4" />
                    <span className="text-xs font-medium">Acceleration</span>
                  </div>
                  <p className="text-sm font-medium">
                    {hardwareInfo.hasMetalSupport && 'Metal'}
                    {hardwareInfo.hasCudaSupport && 'CUDA'}
                    {!hardwareInfo.hasMetalSupport && !hardwareInfo.hasCudaSupport && 'CPU only'}
                  </p>
                  {hardwareInfo.gpuInfo && (
                    <p className="text-xs text-muted-foreground truncate" title={hardwareInfo.gpuInfo}>
                      {hardwareInfo.gpuInfo}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Default Whisper Model */}
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Default Transcription Model</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Select the default model for transcription.
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <select
              value={settings?.whisperModel || 'tiny'}
              onChange={(e) => handleSelectModel(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-background"
            >
              {models.filter(m => m.downloaded).map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name} ({model.size})
                </option>
              ))}
            </select>
          </section>

          {/* Cloud Sync Settings */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Cloud Sync</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">Auto-sync to cloud</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically sync transcripts to your CrowTerminal account
                  </p>
                </div>
                <button
                  onClick={() => updateSetting('cloudSyncEnabled', !settings?.cloudSyncEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings?.cloudSyncEnabled ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings?.cloudSyncEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* API Configuration */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">API Configuration</h2>

            <div>
              <label className="block text-sm font-medium mb-1">API Base URL</label>
              <input
                type="text"
                value={settings?.apiBaseUrl || 'https://api.crowterminal.com'}
                onChange={(e) => updateSetting('apiBaseUrl', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg bg-background"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Only change this if you're using a self-hosted CrowTerminal server.
              </p>
            </div>
          </section>
        </div>
      )}

      {/* About Tab */}
      {activeTab === 'about' && (
        <div className="max-w-3xl space-y-6">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">CrowTerminal Creator Studio</h2>
            <p className="text-sm text-muted-foreground">
              Your AI Content Lab - All Local, All Free
            </p>

            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-medium">Features</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5" />
                  <span><strong>Transcription</strong> - Unlimited video/audio transcription with Whisper</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5" />
                  <span><strong>Voice Studio</strong> - Clone your voice and generate voiceovers with Qwen3-TTS</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5" />
                  <span><strong>Content Analyst</strong> - AI-powered hashtags, captions, and script analysis</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5" />
                  <span><strong>TikTok Score</strong> - Analyze your video before posting</span>
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="font-medium">Technologies</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong>Whisper</strong> -{' '}
                <a
                  href="https://github.com/openai/whisper"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  OpenAI Whisper
                </a>{' '}
                via{' '}
                <a
                  href="https://github.com/ggerganov/whisper.cpp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  whisper.cpp
                </a>
              </p>
              <p>
                <strong>Voice Cloning</strong> -{' '}
                <a
                  href="https://github.com/QwenLM/Qwen3-TTS"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Qwen3-TTS
                </a>{' '}
                with MLX optimization for Apple Silicon
              </p>
              <p>
                <strong>AI Analysis</strong> -{' '}
                <a
                  href="https://ollama.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Ollama
                </a>{' '}
                with Llama 3.2 and Qwen 2.5 models
              </p>
              <p>
                <strong>Video Analysis</strong> - OpenCV, Librosa, PySceneDetect
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="font-medium">Privacy</h3>
            <p className="text-sm text-muted-foreground">
              All AI processing runs locally on your machine. Your files, voice samples, and content
              never leave your computer unless you explicitly enable cloud sync.
            </p>
          </section>

          <section className="space-y-4">
            <h3 className="font-medium">Version</h3>
            <p className="text-sm text-muted-foreground">
              CrowTerminal Creator Studio v1.0.0
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
