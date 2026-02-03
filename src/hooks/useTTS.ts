import { useState, useCallback, useEffect } from 'react';
import type {
  TTSModel,
  VoiceProfile,
  TTSStatus,
  TTSGenerateOptions,
  PresetSpeaker,
} from '../../electron/preload';

interface UseTTSReturn {
  // State
  status: TTSStatus | null;
  models: TTSModel[];
  voices: VoiceProfile[];
  languages: Record<string, string>;
  speakers: Record<string, PresetSpeaker>;
  speakersAvailable: boolean;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  pythonAvailable: boolean;
  pythonVersion: string | null;

  // Server management
  startServer: () => Promise<boolean>;
  stopServer: () => Promise<void>;
  checkPython: () => Promise<void>;

  // Model management
  loadModels: () => Promise<void>;
  downloadModel: (modelId: string) => Promise<boolean>;
  loadModel: (modelId: string) => Promise<boolean>;
  deleteModel: (modelId: string) => Promise<boolean>;

  // Voice management
  loadVoices: () => Promise<void>;
  cloneVoice: (audioPath: string, name: string, description?: string, language?: string, transcript?: string) => Promise<VoiceProfile | null>;
  deleteVoice: (voiceId: string) => Promise<boolean>;

  // Speaker management
  loadSpeakers: () => Promise<void>;

  // Generation
  generateSpeech: (text: string, options?: TTSGenerateOptions) => Promise<string | null>;

  // Utilities
  clearError: () => void;
}

export function useTTS(): UseTTSReturn {
  const [status, setStatus] = useState<TTSStatus | null>(null);
  const [models, setModels] = useState<TTSModel[]>([]);
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [languages, setLanguages] = useState<Record<string, string>>({});
  const [speakers, setSpeakers] = useState<Record<string, PresetSpeaker>>({});
  const [speakersAvailable, setSpeakersAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pythonAvailable, setPythonAvailable] = useState(false);
  const [pythonVersion, setPythonVersion] = useState<string | null>(null);

  // Check Python availability
  const checkPython = useCallback(async () => {
    try {
      const result = await window.electronAPI.tts.checkPython();
      setPythonAvailable(result.available);
      setPythonVersion(result.version || null);
      if (!result.available) {
        setError(result.error || 'Python 3.10+ is required');
      }
    } catch (err) {
      setPythonAvailable(false);
      setError(err instanceof Error ? err.message : 'Failed to check Python');
    }
  }, []);

  // Start TTS server
  const startServer = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.tts.startServer();
      if (result) {
        const newStatus = await window.electronAPI.tts.getStatus();
        setStatus(newStatus);
        const langs = await window.electronAPI.tts.getLanguages();
        setLanguages(langs);
        // Load speakers (available for custom voice models)
        const speakerResult = await window.electronAPI.tts.getSpeakers();
        setSpeakers(speakerResult.speakers);
        setSpeakersAvailable(speakerResult.available);
      }
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start TTS server');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Stop TTS server
  const stopServer = useCallback(async () => {
    try {
      await window.electronAPI.tts.stopServer();
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop TTS server');
    }
  }, []);

  // Load available models
  const loadModels = useCallback(async () => {
    setIsLoading(true);
    try {
      const availableModels = await window.electronAPI.tts.getModels();
      setModels(availableModels);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Download model
  const downloadModel = useCallback(async (modelId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.tts.downloadModel(modelId);
      if (result) {
        await loadModels();
      }
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download model');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [loadModels]);

  // Load model into memory
  const loadModel = useCallback(async (modelId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.tts.loadModel(modelId);
      if (result) {
        const newStatus = await window.electronAPI.tts.getStatus();
        setStatus(newStatus);
        // Refresh speakers after model load (availability depends on model type)
        const speakerResult = await window.electronAPI.tts.getSpeakers();
        setSpeakers(speakerResult.speakers);
        setSpeakersAvailable(speakerResult.available);
      }
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete model
  const deleteModel = useCallback(async (modelId: string): Promise<boolean> => {
    setError(null);
    try {
      const result = await window.electronAPI.tts.deleteModel(modelId);
      if (result) {
        await loadModels();
      }
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete model');
      return false;
    }
  }, [loadModels]);

  // Load voices
  const loadVoices = useCallback(async () => {
    try {
      const voiceList = await window.electronAPI.tts.listVoices();
      setVoices(voiceList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load voices');
    }
  }, []);

  // Load preset speakers
  const loadSpeakers = useCallback(async () => {
    try {
      const result = await window.electronAPI.tts.getSpeakers();
      setSpeakers(result.speakers);
      setSpeakersAvailable(result.available);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load speakers');
    }
  }, []);

  // Clone voice
  const cloneVoice = useCallback(async (
    audioPath: string,
    name: string,
    description?: string,
    language?: string,
    transcript?: string
  ): Promise<VoiceProfile | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const voice = await window.electronAPI.tts.cloneVoice(audioPath, name, description, language, transcript);
      await loadVoices();
      return voice;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone voice');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [loadVoices]);

  // Delete voice
  const deleteVoice = useCallback(async (voiceId: string): Promise<boolean> => {
    setError(null);
    try {
      const result = await window.electronAPI.tts.deleteVoice(voiceId);
      if (result) {
        await loadVoices();
      }
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete voice');
      return false;
    }
  }, [loadVoices]);

  // Generate speech
  const generateSpeech = useCallback(async (
    text: string,
    options?: TTSGenerateOptions
  ): Promise<string | null> => {
    setIsGenerating(true);
    setError(null);
    try {
      const outputPath = await window.electronAPI.tts.generate(text, options);
      return outputPath;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate speech');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Initialize
  useEffect(() => {
    checkPython();
    loadModels();
    loadVoices();
  }, [checkPython, loadModels, loadVoices]);

  // Listen for download progress
  useEffect(() => {
    const cleanup = window.electronAPI.tts.onDownloadProgress(({ modelId, progress }) => {
      // Update model download progress in state if needed
      console.log(`Model ${modelId} download progress: ${progress}%`);
    });
    return cleanup;
  }, []);

  return {
    status,
    models,
    voices,
    languages,
    speakers,
    speakersAvailable,
    isLoading,
    isGenerating,
    error,
    pythonAvailable,
    pythonVersion,
    startServer,
    stopServer,
    checkPython,
    loadModels,
    downloadModel,
    loadModel,
    deleteModel,
    loadVoices,
    cloneVoice,
    deleteVoice,
    loadSpeakers,
    generateSpeech,
    clearError,
  };
}
