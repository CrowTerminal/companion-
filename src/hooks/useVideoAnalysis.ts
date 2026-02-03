import { useState, useCallback, useEffect } from 'react';
import type {
  TikTokScoreResult,
  TechnicalScore,
  VideoInfo,
} from '../../electron/preload';

interface UseVideoAnalysisReturn {
  // State
  result: TikTokScoreResult | null;
  isAnalyzing: boolean;
  progress: number;
  error: string | null;
  serverRunning: boolean;
  dependenciesAvailable: boolean;
  missingDependencies: string[];

  // Server management
  startServer: () => Promise<boolean>;
  stopServer: () => Promise<void>;
  checkDependencies: () => Promise<void>;

  // Analysis
  analyzeVideo: (videoPath: string) => Promise<TikTokScoreResult | null>;
  quickAnalyze: (videoPath: string) => Promise<{ technical: TechnicalScore; videoInfo: VideoInfo } | null>;

  // Utilities
  selectVideoFile: () => Promise<string | null>;
  getInstallInstructions: () => Promise<string>;
  clearResult: () => void;
  clearError: () => void;

  // Score helpers
  getScoreGrade: (score: number) => { grade: string; color: string; description: string };
  formatDuration: (seconds: number) => string;
}

export function useVideoAnalysis(): UseVideoAnalysisReturn {
  const [result, setResult] = useState<TikTokScoreResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [serverRunning, setServerRunning] = useState(false);
  const [dependenciesAvailable, setDependenciesAvailable] = useState(false);
  const [missingDependencies, setMissingDependencies] = useState<string[]>([]);

  // Check dependencies
  const checkDependencies = useCallback(async () => {
    try {
      const deps = await window.electronAPI.video.checkDependencies();
      setDependenciesAvailable(deps.available);
      setMissingDependencies(deps.missing);
      if (!deps.available) {
        setError(`Missing dependencies: ${deps.missing.join(', ')}`);
      }
    } catch (err) {
      setDependenciesAvailable(false);
      setError(err instanceof Error ? err.message : 'Failed to check dependencies');
    }
  }, []);

  // Check server status
  const checkServerStatus = useCallback(async () => {
    try {
      const running = await window.electronAPI.video.isRunning();
      setServerRunning(running);
    } catch {
      setServerRunning(false);
    }
  }, []);

  // Start server
  const startServer = useCallback(async (): Promise<boolean> => {
    setError(null);
    try {
      const result = await window.electronAPI.video.startServer();
      setServerRunning(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start video analyzer');
      return false;
    }
  }, []);

  // Stop server
  const stopServer = useCallback(async () => {
    try {
      await window.electronAPI.video.stopServer();
      setServerRunning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop video analyzer');
    }
  }, []);

  // Analyze video
  const analyzeVideo = useCallback(async (videoPath: string): Promise<TikTokScoreResult | null> => {
    setIsAnalyzing(true);
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const analysisResult = await window.electronAPI.video.analyze(videoPath);
      setResult(analysisResult);
      return analysisResult;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze video');
      return null;
    } finally {
      setIsAnalyzing(false);
      setProgress(100);
    }
  }, []);

  // Quick analyze (technical only)
  const quickAnalyze = useCallback(async (videoPath: string): Promise<{ technical: TechnicalScore; videoInfo: VideoInfo } | null> => {
    setIsAnalyzing(true);
    setError(null);

    try {
      return await window.electronAPI.video.quickAnalyze(videoPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze video');
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Select video file
  const selectVideoFile = useCallback(async (): Promise<string | null> => {
    try {
      return await window.electronAPI.selectVideoFile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select video');
      return null;
    }
  }, []);

  // Get install instructions
  const getInstallInstructions = useCallback(async (): Promise<string> => {
    return await window.electronAPI.video.getInstallInstructions();
  }, []);

  // Clear result
  const clearResult = useCallback(() => {
    setResult(null);
    setProgress(0);
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Score grade helper
  const getScoreGrade = useCallback((score: number): { grade: string; color: string; description: string } => {
    if (score >= 90) {
      return {
        grade: 'A+',
        color: 'text-green-500',
        description: 'Excellent! Ready for viral potential.',
      };
    } else if (score >= 80) {
      return {
        grade: 'A',
        color: 'text-green-500',
        description: 'Great video! Minor optimizations possible.',
      };
    } else if (score >= 70) {
      return {
        grade: 'B',
        color: 'text-yellow-500',
        description: 'Good foundation. Some improvements needed.',
      };
    } else if (score >= 60) {
      return {
        grade: 'C',
        color: 'text-yellow-500',
        description: 'Average. Several areas need work.',
      };
    } else if (score >= 50) {
      return {
        grade: 'D',
        color: 'text-orange-500',
        description: 'Below average. Significant improvements needed.',
      };
    } else {
      return {
        grade: 'F',
        color: 'text-red-500',
        description: 'Poor. Major issues affecting reach potential.',
      };
    }
  }, []);

  // Duration formatter
  const formatDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Initialize
  useEffect(() => {
    checkDependencies();
    checkServerStatus();
  }, [checkDependencies, checkServerStatus]);

  // Listen for analysis progress
  useEffect(() => {
    const cleanup = window.electronAPI.video.onAnalysisProgress(({ progress: p }) => {
      setProgress(p);
    });
    return cleanup;
  }, []);

  return {
    result,
    isAnalyzing,
    progress,
    error,
    serverRunning,
    dependenciesAvailable,
    missingDependencies,
    startServer,
    stopServer,
    checkDependencies,
    analyzeVideo,
    quickAnalyze,
    selectVideoFile,
    getInstallInstructions,
    clearResult,
    clearError,
    getScoreGrade,
    formatDuration,
  };
}
