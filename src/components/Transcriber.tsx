import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Mic, X, Play, Pause, Copy, Check, FileAudio } from 'lucide-react';
import { useTranscription } from '../hooks/useTranscription';
import type { HardwareInfo } from '../../electron/preload';

interface TranscriberProps {
  hardwareInfo: HardwareInfo | null;
}

interface QueuedFile {
  path: string;
  name: string;
  size: number;
  status: 'queued' | 'transcribing' | 'completed' | 'error';
  progress: number;
  result?: string;
  error?: string;
}

export function Transcriber({ hardwareInfo }: TranscriberProps) {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { transcribe, cancelTranscription, isTranscribing, progress } = useTranscription();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // For Electron, we need to get the file paths
    const newFiles: QueuedFile[] = acceptedFiles.map((file) => ({
      path: (file as File & { path: string }).path,
      name: file.name,
      size: file.size,
      status: 'queued' as const,
      progress: 0,
    }));

    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.ogg', '.flac'],
      'video/*': ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
    },
    multiple: true,
  });

  const handleSelectFiles = async () => {
    try {
      const filePaths = await window.electronAPI.selectFiles();
      const newFiles: QueuedFile[] = filePaths.map((filePath) => ({
        path: filePath,
        name: filePath.split('/').pop() || filePath,
        size: 0, // Size would need to be fetched separately
        status: 'queued' as const,
        progress: 0,
      }));

      setFiles((prev) => [...prev, ...newFiles]);
    } catch (error) {
      console.error('Failed to select files:', error);
    }
  };

  const handleTranscribe = async (index: number) => {
    const file = files[index];
    if (!file || file.status === 'transcribing') return;

    setFiles((prev) =>
      prev.map((f, i) =>
        i === index ? { ...f, status: 'transcribing', progress: 0 } : f
      )
    );

    try {
      const result = await transcribe(file.path, {
        onProgress: (progress) => {
          setFiles((prev) =>
            prev.map((f, i) =>
              i === index ? { ...f, progress } : f
            )
          );
        },
      });

      setFiles((prev) =>
        prev.map((f, i) =>
          i === index
            ? { ...f, status: 'completed', progress: 100, result: result.text }
            : f
        )
      );
    } catch (error) {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index
            ? {
                ...f,
                status: 'error',
                error: error instanceof Error ? error.message : 'Transcription failed',
              }
            : f
        )
      );
    }
  };

  const handleTranscribeAll = async () => {
    const queuedFiles = files.filter((f) => f.status === 'queued');
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'queued') {
        await handleTranscribe(i);
      }
    }
  };

  const handleCancel = (index: number) => {
    const file = files[index];
    if (file.status === 'transcribing') {
      cancelTranscription(file.path);
    }
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCopy = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return 'Unknown size';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const queuedCount = files.filter((f) => f.status === 'queued').length;
  const hasFiles = files.length > 0;

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Upload className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {isDragActive ? 'Drop files here' : 'Drag & drop media files'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              or{' '}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectFiles();
                }}
                className="text-primary hover:underline"
              >
                browse files
              </button>
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Supports MP3, WAV, MP4, MOV, and more
          </p>
        </div>
      </div>

      {/* File list */}
      {hasFiles && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              {files.length} file{files.length !== 1 ? 's' : ''} selected
            </h3>
            {queuedCount > 0 && (
              <button
                onClick={handleTranscribeAll}
                disabled={isTranscribing}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium
                  hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Transcribe All ({queuedCount})
              </button>
            )}
          </div>

          <div className="space-y-3">
            {files.map((file, index) => (
              <div
                key={`${file.path}-${index}`}
                className="border rounded-lg p-4 space-y-3"
              >
                {/* File header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <FileAudio className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {file.status === 'queued' && (
                      <button
                        onClick={() => handleTranscribe(index)}
                        disabled={isTranscribing}
                        className="p-2 rounded-md hover:bg-muted text-primary disabled:opacity-50"
                        title="Start transcription"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleCancel(index)}
                      className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                {file.status === 'transcribing' && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Transcribing...</span>
                      <span className="text-muted-foreground">{file.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Status badges */}
                {file.status === 'completed' && (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded">
                    <Check className="w-3 h-3" />
                    Completed
                  </span>
                )}

                {file.status === 'error' && (
                  <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 dark:bg-red-950 px-2 py-0.5 rounded">
                    Error: {file.error}
                  </span>
                )}

                {/* Result */}
                {file.result && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Transcript
                      </span>
                      <button
                        onClick={() => handleCopy(file.result!, index)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                        title="Copy to clipboard"
                      >
                        {copiedIndex === index ? (
                          <Check className="w-3.5 h-3.5 text-green-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <div className="bg-muted rounded-md p-3 max-h-48 overflow-auto">
                      <p className="text-sm whitespace-pre-wrap">{file.result}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasFiles && (
        <div className="text-center py-8">
          <Mic className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Add files to start transcribing
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Your transcriptions run locally on your machine - no data leaves your computer
          </p>
        </div>
      )}
    </div>
  );
}
