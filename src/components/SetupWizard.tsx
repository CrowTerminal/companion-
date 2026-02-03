import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronLeft,
  Cpu,
  HardDrive,
  Zap,
  Download,
  Mic,
  Volume2,
  Brain,
  BarChart3,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import type { HardwareInfo, WhisperModel, TTSModel, OllamaModelInfo } from '../../electron/preload';

interface SetupWizardProps {
  hardwareInfo: HardwareInfo | null;
  onComplete: () => void;
}

type SetupStep = 'welcome' | 'hardware' | 'models' | 'dependencies' | 'complete';

interface ModelSelection {
  whisper: string | null;
  tts: string | null;
  ollama: string | null;
}

export function SetupWizard({ hardwareInfo, onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome');
  const [modelSelection, setModelSelection] = useState<ModelSelection>({
    whisper: null,
    tts: null,
    ollama: null,
  });
  const [whisperModels, setWhisperModels] = useState<WhisperModel[]>([]);
  const [ttsModels, setTtsModels] = useState<TTSModel[]>([]);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [downloadComplete, setDownloadComplete] = useState<Record<string, boolean>>({});
  const [ollamaStatus, setOllamaStatus] = useState<{ running: boolean; installed: boolean }>({
    running: false,
    installed: false,
  });
  const [pythonInstalled, setPythonInstalled] = useState<boolean | null>(null);
  const [checkingDeps, setCheckingDeps] = useState(false);

  // Load models on mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        const [whisper, tts, ollama, ollamaStatusResult] = await Promise.all([
          window.electronAPI.getAvailableModels(),
          window.electronAPI.tts.getModels(),
          window.electronAPI.ollama.listModels(),
          window.electronAPI.ollama.status(),
        ]);
        setWhisperModels(whisper);
        setTtsModels(tts);
        setOllamaModels(ollama);
        setOllamaStatus(ollamaStatusResult);

        // Auto-select recommended models
        const recommendedWhisper = whisper.find((m) => m.recommended);
        const recommendedTts = tts.find((m) => m.recommended);
        const recommendedOllama = ollama.find((m) => m.recommended);

        setModelSelection({
          whisper: recommendedWhisper?.name || whisper[0]?.name || null,
          tts: recommendedTts?.id || tts[0]?.id || null,
          ollama: recommendedOllama?.id || ollama[0]?.id || null,
        });
      } catch (err) {
        console.error('Failed to load models:', err);
      }
    };

    loadModels();
  }, []);

  // Listen for download progress
  useEffect(() => {
    const cleanup1 = window.electronAPI.onModelDownloadProgress(({ modelName, progress }) => {
      setDownloadProgress((prev) => ({ ...prev, [modelName]: progress }));
      if (progress >= 100) {
        setDownloadComplete((prev) => ({ ...prev, [modelName]: true }));
      }
    });

    const cleanup2 = window.electronAPI.tts.onDownloadProgress(({ modelId, progress }) => {
      setDownloadProgress((prev) => ({ ...prev, [modelId]: progress }));
      if (progress >= 100) {
        setDownloadComplete((prev) => ({ ...prev, [modelId]: true }));
      }
    });

    const cleanup3 = window.electronAPI.ollama.onPullProgress(({ modelName, completed, total }) => {
      if (total) {
        const progress = Math.round(((completed || 0) / total) * 100);
        setDownloadProgress((prev) => ({ ...prev, [modelName]: progress }));
        if (progress >= 100) {
          setDownloadComplete((prev) => ({ ...prev, [modelName]: true }));
        }
      }
    });

    return () => {
      cleanup1();
      cleanup2();
      cleanup3();
    };
  }, []);

  // Check dependencies
  const checkDependencies = useCallback(async () => {
    setCheckingDeps(true);
    try {
      // Check Python
      const pythonCheck = await window.electronAPI.tts.checkPython();
      setPythonInstalled(pythonCheck.available);

      // Check Ollama
      const ollamaStatusResult = await window.electronAPI.ollama.status();
      setOllamaStatus({
        running: ollamaStatusResult.running,
        installed: ollamaStatusResult.running || ollamaStatusResult.models.length > 0,
      });
    } catch (err) {
      console.error('Failed to check dependencies:', err);
    } finally {
      setCheckingDeps(false);
    }
  }, []);

  useEffect(() => {
    if (currentStep === 'dependencies') {
      checkDependencies();
    }
  }, [currentStep, checkDependencies]);

  // Download selected models
  const downloadModels = async () => {
    setIsDownloading(true);

    try {
      // Download Whisper model
      if (modelSelection.whisper) {
        const whisperModel = whisperModels.find((m) => m.name === modelSelection.whisper);
        if (whisperModel && !whisperModel.downloaded) {
          await window.electronAPI.downloadModel(modelSelection.whisper);
        } else {
          setDownloadComplete((prev) => ({ ...prev, [modelSelection.whisper!]: true }));
        }
      }

      // Download TTS model
      if (modelSelection.tts && pythonInstalled) {
        const ttsModel = ttsModels.find((m) => m.id === modelSelection.tts);
        if (ttsModel && !ttsModel.downloaded) {
          await window.electronAPI.tts.downloadModel(modelSelection.tts);
        } else {
          setDownloadComplete((prev) => ({ ...prev, [modelSelection.tts!]: true }));
        }
      }

      // Download Ollama model
      if (modelSelection.ollama && ollamaStatus.running) {
        const ollamaModel = ollamaModels.find((m) => m.id === modelSelection.ollama);
        if (ollamaModel && !ollamaModel.downloaded) {
          await window.electronAPI.ollama.pullModel(modelSelection.ollama);
        } else {
          setDownloadComplete((prev) => ({ ...prev, [modelSelection.ollama!]: true }));
        }
      }
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const steps: SetupStep[] = ['welcome', 'hardware', 'models', 'dependencies', 'complete'];
  const currentStepIndex = steps.indexOf(currentStep);

  const goToNextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex]);
    }
  };

  const goToPrevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex]);
    }
  };

  const getRecommendedTier = () => {
    if (!hardwareInfo) return 'small';
    if (hardwareInfo.totalMemoryGB >= 32) return 'large';
    if (hardwareInfo.totalMemoryGB >= 16) return 'medium';
    return 'small';
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-auto">
        {/* Welcome Step */}
        {currentStep === 'welcome' && (
          <div className="max-w-xl text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <Zap className="w-10 h-10 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold">Welcome to CrowTerminal Creator Studio</h1>
            <p className="text-lg text-muted-foreground">
              Your AI Content Lab - All Local, All Free
            </p>
            <div className="space-y-4 text-left bg-muted/50 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <Mic className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Transcription</p>
                  <p className="text-sm text-muted-foreground">
                    Unlimited video/audio transcription with Whisper
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Volume2 className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Voice Studio</p>
                  <p className="text-sm text-muted-foreground">
                    Clone your voice in 3 seconds with Qwen3-TTS
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Brain className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Content Analyst</p>
                  <p className="text-sm text-muted-foreground">
                    AI-powered hashtags, captions, and script analysis
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <BarChart3 className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">TikTok Score</p>
                  <p className="text-sm text-muted-foreground">
                    Analyze your video before posting
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={goToNextStep}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 flex items-center gap-2 mx-auto"
            >
              Get Started
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Hardware Step */}
        {currentStep === 'hardware' && (
          <div className="max-w-xl space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold">System Check</h2>
              <p className="text-muted-foreground mt-2">
                We've detected your hardware to recommend the best models
              </p>
            </div>

            {hardwareInfo ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="border rounded-lg p-4 text-center">
                    <Cpu className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">CPU</p>
                    <p className="font-medium text-sm">{hardwareInfo.cpuCores} cores</p>
                  </div>
                  <div className="border rounded-lg p-4 text-center">
                    <HardDrive className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">RAM</p>
                    <p className="font-medium text-sm">{hardwareInfo.totalMemoryGB}GB</p>
                  </div>
                  <div className="border rounded-lg p-4 text-center">
                    <Zap className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">Acceleration</p>
                    <p className="font-medium text-sm">
                      {hardwareInfo.hasMetalSupport
                        ? 'Metal'
                        : hardwareInfo.hasCudaSupport
                          ? 'CUDA'
                          : 'CPU'}
                    </p>
                  </div>
                </div>

                <div
                  className={`rounded-lg p-4 ${
                    hardwareInfo.canRunLargeModels
                      ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                      : 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800'
                  } border`}
                >
                  <div className="flex items-center gap-2">
                    {hardwareInfo.canRunLargeModels ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <Zap className="w-5 h-5 text-yellow-500" />
                    )}
                    <p className="font-medium">
                      {hardwareInfo.canRunLargeModels
                        ? 'Great! Your system can run medium/large models'
                        : 'Your system is best suited for smaller models'}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 ml-7">
                    Recommended tier:{' '}
                    <span className="font-medium capitalize">{getRecommendedTier()}</span>
                  </p>
                </div>

                {hardwareInfo.warnings && hardwareInfo.warnings.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    {hardwareInfo.warnings.map((warning, i) => (
                      <p key={i} className="flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-yellow-500" />
                        {warning}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        )}

        {/* Models Step */}
        {currentStep === 'models' && (
          <div className="max-w-2xl space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold">Choose Your Models</h2>
              <p className="text-muted-foreground mt-2">
                Select the AI models you want to download
              </p>
            </div>

            <div className="space-y-4">
              {/* Whisper Model */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Mic className="w-5 h-5 text-primary" />
                  <span className="font-medium">Transcription (Whisper)</span>
                </div>
                <select
                  value={modelSelection.whisper || ''}
                  onChange={(e) =>
                    setModelSelection((prev) => ({ ...prev, whisper: e.target.value }))
                  }
                  className="w-full px-3 py-2 border rounded-lg bg-background"
                >
                  {whisperModels.slice(0, 5).map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name} ({model.size}){model.recommended ? ' - Recommended' : ''}
                      {model.downloaded ? ' (Installed)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* TTS Model */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-primary" />
                  <span className="font-medium">Voice Studio (Qwen3-TTS)</span>
                </div>
                <select
                  value={modelSelection.tts || ''}
                  onChange={(e) => setModelSelection((prev) => ({ ...prev, tts: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg bg-background"
                >
                  {ttsModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.size}){model.recommended ? ' - Recommended' : ''}
                      {model.downloaded ? ' (Installed)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Requires Python 3.10+</p>
              </div>

              {/* Ollama Model */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-primary" />
                  <span className="font-medium">AI Analysis (Ollama)</span>
                </div>
                <select
                  value={modelSelection.ollama || ''}
                  onChange={(e) =>
                    setModelSelection((prev) => ({ ...prev, ollama: e.target.value }))
                  }
                  className="w-full px-3 py-2 border rounded-lg bg-background"
                >
                  {ollamaModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.size}){model.recommended ? ' - Recommended' : ''}
                      {model.downloaded ? ' (Installed)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Requires Ollama installed</p>
              </div>
            </div>
          </div>
        )}

        {/* Dependencies Step */}
        {currentStep === 'dependencies' && (
          <div className="max-w-xl space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold">Check Dependencies</h2>
              <p className="text-muted-foreground mt-2">
                Some features require external software
              </p>
            </div>

            <div className="space-y-4">
              {/* Python */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {checkingDeps ? (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    ) : pythonInstalled ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <div>
                      <p className="font-medium">Python 3.10+</p>
                      <p className="text-xs text-muted-foreground">Required for Voice Studio</p>
                    </div>
                  </div>
                  {!pythonInstalled && !checkingDeps && (
                    <a
                      href="https://www.python.org/downloads/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      Install <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Ollama */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {checkingDeps ? (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    ) : ollamaStatus.running ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : ollamaStatus.installed ? (
                      <Zap className="w-5 h-5 text-yellow-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <div>
                      <p className="font-medium">Ollama</p>
                      <p className="text-xs text-muted-foreground">
                        {ollamaStatus.running
                          ? 'Running'
                          : ollamaStatus.installed
                            ? 'Installed but not running'
                            : 'Required for Content Analyst'}
                      </p>
                    </div>
                  </div>
                  {!ollamaStatus.installed && !checkingDeps && (
                    <a
                      href="https://ollama.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      Install <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Whisper CLI */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <div>
                      <p className="font-medium">Whisper.cpp</p>
                      <p className="text-xs text-muted-foreground">Required for Transcription</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">Auto-managed</span>
                </div>
              </div>

              <button
                onClick={checkDependencies}
                disabled={checkingDeps}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${checkingDeps ? 'animate-spin' : ''}`} />
                Recheck Dependencies
              </button>
            </div>
          </div>
        )}

        {/* Complete Step */}
        {currentStep === 'complete' && (
          <div className="max-w-xl space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold">Download Models</h2>
              <p className="text-muted-foreground mt-2">Ready to download your selected models</p>
            </div>

            <div className="space-y-3">
              {/* Whisper download status */}
              {modelSelection.whisper && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Mic className="w-5 h-5 text-primary" />
                      <span className="font-medium">{modelSelection.whisper}</span>
                    </div>
                    {downloadComplete[modelSelection.whisper] ||
                    whisperModels.find((m) => m.name === modelSelection.whisper)?.downloaded ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : downloadProgress[modelSelection.whisper] !== undefined ? (
                      <span className="text-sm">{downloadProgress[modelSelection.whisper]}%</span>
                    ) : (
                      <Download className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  {downloadProgress[modelSelection.whisper] !== undefined &&
                    !downloadComplete[modelSelection.whisper] && (
                      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${downloadProgress[modelSelection.whisper]}%` }}
                        />
                      </div>
                    )}
                </div>
              )}

              {/* TTS download status */}
              {modelSelection.tts && pythonInstalled && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Volume2 className="w-5 h-5 text-primary" />
                      <span className="font-medium">
                        {ttsModels.find((m) => m.id === modelSelection.tts)?.name}
                      </span>
                    </div>
                    {downloadComplete[modelSelection.tts] ||
                    ttsModels.find((m) => m.id === modelSelection.tts)?.downloaded ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : downloadProgress[modelSelection.tts] !== undefined ? (
                      <span className="text-sm">{downloadProgress[modelSelection.tts]}%</span>
                    ) : (
                      <Download className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  {downloadProgress[modelSelection.tts] !== undefined &&
                    !downloadComplete[modelSelection.tts] && (
                      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${downloadProgress[modelSelection.tts]}%` }}
                        />
                      </div>
                    )}
                </div>
              )}

              {/* Ollama download status */}
              {modelSelection.ollama && ollamaStatus.running && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Brain className="w-5 h-5 text-primary" />
                      <span className="font-medium">
                        {ollamaModels.find((m) => m.id === modelSelection.ollama)?.name}
                      </span>
                    </div>
                    {downloadComplete[modelSelection.ollama] ||
                    ollamaModels.find((m) => m.id === modelSelection.ollama)?.downloaded ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : downloadProgress[modelSelection.ollama] !== undefined ? (
                      <span className="text-sm">{downloadProgress[modelSelection.ollama]}%</span>
                    ) : (
                      <Download className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  {downloadProgress[modelSelection.ollama] !== undefined &&
                    !downloadComplete[modelSelection.ollama] && (
                      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${downloadProgress[modelSelection.ollama]}%` }}
                        />
                      </div>
                    )}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              {!isDownloading &&
              !Object.keys(downloadComplete).length &&
              !whisperModels.find((m) => m.name === modelSelection.whisper)?.downloaded ? (
                <button
                  onClick={downloadModels}
                  disabled={isDownloading}
                  className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      Download Selected Models
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={onComplete}
                  className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  Start Using CrowTerminal
                </button>
              )}
            </div>

            {!isDownloading && (
              <button
                onClick={onComplete}
                className="w-full text-sm text-muted-foreground hover:text-foreground"
              >
                Skip for now
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      {currentStep !== 'welcome' && currentStep !== 'complete' && (
        <div className="border-t px-8 py-4 flex justify-between">
          <button
            onClick={goToPrevStep}
            className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-5 h-5" />
            Back
          </button>
          <button
            onClick={goToNextStep}
            className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90"
          >
            Continue
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
