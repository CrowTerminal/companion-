import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { TranscriptionResult } from '../../electron/preload';
import { useLocalStorage } from './useLocalStorage';

interface TranscriptionJob {
  id: string;
  filePath: string;
  fileName: string;
  status: 'queued' | 'transcribing' | 'completed' | 'error' | 'cancelled';
  progress: number;
  result?: TranscriptionResult;
  error?: string;
  startedAt?: string;
  completedAt?: string;
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

interface TranscriptionContextValue {
  jobs: TranscriptionJob[];
  isTranscribing: boolean;
  progress: number;
  transcribe: (
    filePath: string,
    options?: {
      model?: string;
      language?: string;
      onProgress?: (progress: number) => void;
    }
  ) => Promise<TranscriptionResult>;
  cancelTranscription: (filePath: string) => Promise<void>;
  clearCompleted: () => void;
}

const TranscriptionContext = createContext<TranscriptionContextValue | null>(null);

export function TranscriptionProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);
  const [savedTranscripts, setSavedTranscripts] = useLocalStorage<SavedTranscript[]>(
    'saved-transcripts',
    []
  );
  const [currentProgress, setCurrentProgress] = useState(0);

  // Listen for progress updates from the main process
  useEffect(() => {
    const cleanup = window.electronAPI.onTranscriptionProgress(({ filePath, progress }) => {
      setJobs((prev) =>
        prev.map((job) =>
          job.filePath === filePath ? { ...job, progress } : job
        )
      );
      setCurrentProgress(progress);
    });

    return cleanup;
  }, []);

  const transcribe = useCallback(
    async (
      filePath: string,
      options?: {
        model?: string;
        language?: string;
        onProgress?: (progress: number) => void;
      }
    ): Promise<TranscriptionResult> => {
      const fileName = filePath.split('/').pop() || filePath;
      const jobId = uuidv4();

      // Add job to queue
      const job: TranscriptionJob = {
        id: jobId,
        filePath,
        fileName,
        status: 'transcribing',
        progress: 0,
        startedAt: new Date().toISOString(),
      };

      setJobs((prev) => [...prev, job]);

      try {
        const result = await window.electronAPI.transcribe(filePath, {
          model: options?.model,
          language: options?.language,
        });

        // Update job status
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  status: 'completed',
                  progress: 100,
                  result,
                  completedAt: new Date().toISOString(),
                }
              : j
          )
        );

        // Save transcript locally
        const savedTranscript: SavedTranscript = {
          id: uuidv4(),
          fileName,
          filePath,
          text: result.text,
          language: result.language,
          duration: result.duration,
          createdAt: new Date().toISOString(),
          syncedToCloud: false,
        };

        setSavedTranscripts((prev) => [savedTranscript, ...prev]);

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Transcription failed';

        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  status: 'error',
                  error: errorMessage,
                }
              : j
          )
        );

        throw error;
      }
    },
    [setSavedTranscripts]
  );

  const cancelTranscription = useCallback(async (filePath: string) => {
    await window.electronAPI.cancelTranscription(filePath);

    setJobs((prev) =>
      prev.map((job) =>
        job.filePath === filePath ? { ...job, status: 'cancelled' } : job
      )
    );
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs((prev) =>
      prev.filter((job) => job.status !== 'completed' && job.status !== 'error')
    );
  }, []);

  const isTranscribing = jobs.some((job) => job.status === 'transcribing');

  return (
    <TranscriptionContext.Provider
      value={{
        jobs,
        isTranscribing,
        progress: currentProgress,
        transcribe,
        cancelTranscription,
        clearCompleted,
      }}
    >
      {children}
    </TranscriptionContext.Provider>
  );
}

export function useTranscription(): TranscriptionContextValue {
  const context = useContext(TranscriptionContext);
  if (!context) {
    throw new Error('useTranscription must be used within a TranscriptionProvider');
  }
  return context;
}
