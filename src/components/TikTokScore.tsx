import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  Play,
  AlertCircle,
  Loader2,
  Settings,
  Zap,
  Volume2,
  Film,
  CheckCircle,
  XCircle,
  TrendingUp,
  Eye,
  Clock,
  Monitor,
} from 'lucide-react';
import { useVideoAnalysis } from '../hooks/useVideoAnalysis';
import type { HardwareInfo } from '../../electron/preload';

interface TikTokScoreProps {
  hardwareInfo: HardwareInfo | null;
}

export function TikTokScore({ hardwareInfo }: TikTokScoreProps) {
  const {
    result,
    isAnalyzing,
    progress,
    error,
    serverRunning,
    dependenciesAvailable,
    missingDependencies,
    startServer,
    analyzeVideo,
    selectVideoFile,
    getInstallInstructions,
    clearResult,
    clearError,
    getScoreGrade,
    formatDuration,
  } = useVideoAnalysis();

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [installInstructions, setInstallInstructions] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0] as File & { path: string };
      setSelectedFile(file.path);
      clearResult();
    }
  }, [clearResult]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
    },
    maxFiles: 1,
  });

  const handleSelectFile = useCallback(async () => {
    const filePath = await selectVideoFile();
    if (filePath) {
      setSelectedFile(filePath);
      clearResult();
    }
  }, [selectVideoFile, clearResult]);

  const handleAnalyze = useCallback(async () => {
    if (!selectedFile) return;

    // Start server if not running
    if (!serverRunning) {
      const started = await startServer();
      if (!started) return;
    }

    await analyzeVideo(selectedFile);
  }, [selectedFile, serverRunning, startServer, analyzeVideo]);

  const handleShowInstallInstructions = useCallback(async () => {
    const instructions = await getInstallInstructions();
    setInstallInstructions(instructions);
  }, [getInstallInstructions]);

  // Dependencies not available
  if (!dependenciesAvailable) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Dependencies Required</h2>
          <p className="text-muted-foreground mb-4">
            TikTok Score requires Python and some packages to analyze videos.
          </p>

          {missingDependencies.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-950 rounded-lg p-4 max-w-md mx-auto mb-4">
              <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300 mb-2">
                Missing:
              </p>
              <ul className="text-sm text-yellow-600 dark:text-yellow-400">
                {missingDependencies.map((dep, i) => (
                  <li key={i}>• {dep}</li>
                ))}
              </ul>
            </div>
          )}

          {installInstructions ? (
            <div className="bg-muted rounded-lg p-4 text-left max-w-md mx-auto">
              <pre className="text-sm whitespace-pre-wrap">{installInstructions}</pre>
            </div>
          ) : (
            <button
              onClick={handleShowInstallInstructions}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium
                hover:bg-primary/90"
            >
              Show Install Instructions
            </button>
          )}
        </div>
      </div>
    );
  }

  // Score grade helper component
  const ScoreBar = ({ score, label }: { score: number; label: string }) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{score}/100</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : score >= 40 ? 'bg-orange-500' : 'bg-red-500'
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">TikTok Score</h2>
          <p className="text-sm text-muted-foreground">
            Analyze your video before posting
          </p>
        </div>
        {serverRunning && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Analyzer Ready
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
          <button onClick={clearError} className="ml-auto text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      {/* File selection */}
      {!result && (
        <>
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
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Upload className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {isDragActive ? 'Drop video here' : 'Drag & drop a video file'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  or{' '}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectFile();
                    }}
                    className="text-primary hover:underline"
                  >
                    browse files
                  </button>
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Supports MP4, MOV, WebM, AVI, MKV
              </p>
            </div>
          </div>

          {selectedFile && (
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Film className="w-8 h-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{selectedFile.split('/').pop()}</p>
                  <p className="text-xs text-muted-foreground">{selectedFile}</p>
                </div>
              </div>
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium
                  hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing... {progress}%
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Analyze Video
                  </>
                )}
              </button>
            </div>
          )}

          {/* Progress bar */}
          {isAnalyzing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Analyzing video...</span>
                <span className="text-muted-foreground">{progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Overall Score */}
          <div className="text-center p-8 border rounded-lg bg-gradient-to-b from-background to-muted/50">
            <div className="relative inline-block">
              <div
                className={`text-6xl font-bold ${getScoreGrade(result.overallScore).color}`}
              >
                {result.overallScore}
              </div>
              <div className="text-2xl font-bold text-muted-foreground">
                {getScoreGrade(result.overallScore).grade}
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {getScoreGrade(result.overallScore).description}
            </p>

            <button
              onClick={() => {
                clearResult();
                setSelectedFile(null);
              }}
              className="mt-4 px-4 py-2 border rounded-lg text-sm hover:bg-muted"
            >
              Analyze Another Video
            </button>
          </div>

          {/* Video Info */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { icon: Monitor, label: 'Resolution', value: result.videoInfo.resolution },
              { icon: Clock, label: 'Duration', value: formatDuration(result.videoInfo.duration) },
              { icon: TrendingUp, label: 'FPS', value: `${Math.round(result.videoInfo.fps)} fps` },
              { icon: Eye, label: 'Aspect', value: result.videoInfo.aspectRatio < 1 ? '9:16 (Vertical)' : '16:9 (Horizontal)' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="border rounded-lg p-3 text-center">
                <Icon className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium">{value}</p>
              </div>
            ))}
          </div>

          {/* Category Scores */}
          <div className="grid grid-cols-2 gap-6">
            {/* Technical */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">Technical Quality</span>
                <span className={`ml-auto font-bold ${getScoreGrade(result.technical.overall).color}`}>
                  {result.technical.overall}
                </span>
              </div>
              <ScoreBar score={result.technical.resolution} label="Resolution" />
              <ScoreBar score={result.technical.aspect_ratio} label="Aspect Ratio" />
              <ScoreBar score={result.technical.lighting} label="Lighting" />
              <ScoreBar score={result.technical.blur} label="Sharpness" />
              <ScoreBar score={result.technical.fps} label="Frame Rate" />
            </div>

            {/* Hook */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">Hook (First 3 Sec)</span>
                <span className={`ml-auto font-bold ${getScoreGrade(result.hook.overall).color}`}>
                  {result.hook.overall}
                </span>
              </div>
              <ScoreBar score={result.hook.first_3_seconds} label="Engagement" />
              <ScoreBar score={result.hook.movement} label="Movement" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Face Detected</span>
                {result.hook.face_detected ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Scene Changes</span>
                <span className="font-medium">{result.hook.scene_changes}</span>
              </div>
            </div>

            {/* Audio */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">Audio Quality</span>
                <span className={`ml-auto font-bold ${getScoreGrade(result.audio.overall).color}`}>
                  {result.audio.overall}
                </span>
              </div>
              <ScoreBar score={result.audio.levels} label="Audio Levels" />
              <ScoreBar score={result.audio.clarity} label="Clarity" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Has Audio</span>
                {result.audio.has_audio ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
              </div>
              {result.audio.is_silent && (
                <p className="text-xs text-yellow-600">
                  Video appears mostly silent. Consider adding audio.
                </p>
              )}
            </div>

            {/* Content */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Film className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">Content Analysis</span>
                <span className={`ml-auto font-bold ${getScoreGrade(result.content.overall).color}`}>
                  {result.content.overall}
                </span>
              </div>
              <ScoreBar score={result.content.pacing} label="Pacing" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Captions Detected</span>
                {result.content.has_captions ? (
                  <span className="flex items-center gap-1 text-green-500">
                    <CheckCircle className="w-4 h-4" />
                    +15 pts
                  </span>
                ) : (
                  <XCircle className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Faces in Video</span>
                {result.content.has_faces ? (
                  <span className="flex items-center gap-1 text-green-500">
                    <CheckCircle className="w-4 h-4" />
                    +10 pts
                  </span>
                ) : (
                  <XCircle className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Optimal Duration</span>
                {result.content.duration_optimal ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-3">Recommendations</h3>
            <ul className="space-y-2">
              {result.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
