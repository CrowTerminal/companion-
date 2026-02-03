import { useState, useCallback, useEffect } from 'react';
import type {
  OllamaStatus,
  OllamaModelInfo,
  OllamaGenerateOptions,
  ScriptAnalysisResult,
} from '../../electron/preload';

interface UseOllamaReturn {
  // State
  status: OllamaStatus | null;
  models: OllamaModelInfo[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  streamingResponse: string;

  // Status
  checkStatus: () => Promise<void>;
  isRunning: boolean;

  // Model management
  loadModels: () => Promise<void>;
  pullModel: (modelName: string) => Promise<boolean>;
  deleteModel: (modelName: string) => Promise<boolean>;

  // Generation
  generate: (options: OllamaGenerateOptions) => Promise<string | null>;
  generateStream: (options: OllamaGenerateOptions) => Promise<string | null>;

  // Content Analysis helpers
  suggestHashtags: (niche: string, platform?: 'tiktok' | 'instagram' | 'youtube', model?: string) => Promise<string[]>;
  analyzeScript: (script: string, model?: string) => Promise<ScriptAnalysisResult | null>;
  generateCaptions: (videoTitle: string, style?: 'casual' | 'professional' | 'funny' | 'inspirational', model?: string) => Promise<string[]>;
  generateThumbnailIdeas: (videoTitle: string, model?: string) => Promise<string[]>;

  // Utilities
  getInstallInstructions: () => Promise<string>;
  clearError: () => void;
  clearStreamingResponse: () => void;
}

export function useOllama(): UseOllamaReturn {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [models, setModels] = useState<OllamaModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingResponse, setStreamingResponse] = useState('');

  // Check Ollama status
  const checkStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const ollamaStatus = await window.electronAPI.ollama.status();
      setStatus(ollamaStatus);
      if (!ollamaStatus.running) {
        setError('Ollama is not running. Please install and start Ollama.');
      } else {
        setError(null);
      }
    } catch (err) {
      setStatus({ running: false, models: [] });
      setError(err instanceof Error ? err.message : 'Failed to check Ollama status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load available models
  const loadModels = useCallback(async () => {
    setIsLoading(true);
    try {
      const availableModels = await window.electronAPI.ollama.listModels();
      setModels(availableModels);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Pull (download) model
  const pullModel = useCallback(async (modelName: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.ollama.pullModel(modelName);
      if (result) {
        await loadModels();
      }
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pull model');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [loadModels]);

  // Delete model
  const deleteModel = useCallback(async (modelName: string): Promise<boolean> => {
    setError(null);
    try {
      const result = await window.electronAPI.ollama.deleteModel(modelName);
      if (result) {
        await loadModels();
      }
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete model');
      return false;
    }
  }, [loadModels]);

  // Generate (non-streaming)
  const generate = useCallback(async (options: OllamaGenerateOptions): Promise<string | null> => {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await window.electronAPI.ollama.generate(options);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  // Generate (streaming)
  const generateStream = useCallback(async (options: OllamaGenerateOptions): Promise<string | null> => {
    setIsGenerating(true);
    setStreamingResponse('');
    setError(null);
    try {
      const response = await window.electronAPI.ollama.generateStream(options);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  // Suggest hashtags
  const suggestHashtags = useCallback(async (
    niche: string,
    platform: 'tiktok' | 'instagram' | 'youtube' = 'tiktok',
    model?: string
  ): Promise<string[]> => {
    setIsGenerating(true);
    setError(null);
    try {
      return await window.electronAPI.ollama.suggestHashtags(niche, platform, model);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to suggest hashtags');
      return [];
    } finally {
      setIsGenerating(false);
    }
  }, []);

  // Analyze script
  const analyzeScript = useCallback(async (
    script: string,
    model?: string
  ): Promise<ScriptAnalysisResult | null> => {
    setIsGenerating(true);
    setError(null);
    try {
      return await window.electronAPI.ollama.analyzeScript(script, model);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze script');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  // Generate captions
  const generateCaptions = useCallback(async (
    videoTitle: string,
    style: 'casual' | 'professional' | 'funny' | 'inspirational' = 'casual',
    model?: string
  ): Promise<string[]> => {
    setIsGenerating(true);
    setError(null);
    try {
      return await window.electronAPI.ollama.generateCaptions(videoTitle, style, model);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate captions');
      return [];
    } finally {
      setIsGenerating(false);
    }
  }, []);

  // Generate thumbnail ideas
  const generateThumbnailIdeas = useCallback(async (
    videoTitle: string,
    model?: string
  ): Promise<string[]> => {
    setIsGenerating(true);
    setError(null);
    try {
      return await window.electronAPI.ollama.generateThumbnailIdeas(videoTitle, model);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate thumbnail ideas');
      return [];
    } finally {
      setIsGenerating(false);
    }
  }, []);

  // Get install instructions
  const getInstallInstructions = useCallback(async (): Promise<string> => {
    return await window.electronAPI.ollama.getInstallInstructions();
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Clear streaming response
  const clearStreamingResponse = useCallback(() => {
    setStreamingResponse('');
  }, []);

  // Initialize
  useEffect(() => {
    checkStatus();
    loadModels();
  }, [checkStatus, loadModels]);

  // Listen for pull progress
  useEffect(() => {
    const cleanup = window.electronAPI.ollama.onPullProgress(({ modelName, status, completed, total }) => {
      console.log(`Model ${modelName}: ${status} - ${completed}/${total}`);
    });
    return cleanup;
  }, []);

  // Listen for streaming chunks
  useEffect(() => {
    const cleanup = window.electronAPI.ollama.onStreamChunk((chunk) => {
      setStreamingResponse((prev) => prev + chunk);
    });
    return cleanup;
  }, []);

  return {
    status,
    models,
    isLoading,
    isGenerating,
    error,
    streamingResponse,
    checkStatus,
    isRunning: status?.running || false,
    loadModels,
    pullModel,
    deleteModel,
    generate,
    generateStream,
    suggestHashtags,
    analyzeScript,
    generateCaptions,
    generateThumbnailIdeas,
    getInstallInstructions,
    clearError,
    clearStreamingResponse,
  };
}
