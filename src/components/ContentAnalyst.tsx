import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Hash,
  FileText,
  Image,
  MessageSquare,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  Download,
  Trash2,
  RefreshCw,
  Sparkles,
  Film,
  Upload,
  Play,
} from 'lucide-react';
import { useOllama } from '../hooks/useOllama';
import type { HardwareInfo, ScriptAnalysisResult } from '../../electron/preload';

interface ContentAnalystProps {
  hardwareInfo: HardwareInfo | null;
}

type TabType = 'hashtags' | 'script' | 'captions' | 'thumbnails' | 'video' | 'models';

export function ContentAnalyst({ hardwareInfo }: ContentAnalystProps) {
  const {
    status,
    models,
    isLoading,
    isGenerating,
    error,
    isRunning,
    pullModel,
    deleteModel,
    suggestHashtags,
    analyzeScript,
    generateCaptions,
    generateThumbnailIdeas,
    getInstallInstructions,
    clearError,
  } = useOllama();

  const [activeTab, setActiveTab] = useState<TabType>('hashtags');

  // Hashtags state
  const [niche, setNiche] = useState('');
  const [platform, setPlatform] = useState<'tiktok' | 'instagram' | 'youtube'>('tiktok');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [copiedHashtags, setCopiedHashtags] = useState(false);

  // Script analysis state
  const [script, setScript] = useState('');
  const [scriptAnalysis, setScriptAnalysis] = useState<ScriptAnalysisResult | null>(null);

  // Captions state
  const [videoTitle, setVideoTitle] = useState('');
  const [captionStyle, setCaptionStyle] = useState<'casual' | 'professional' | 'funny' | 'inspirational'>('casual');
  const [captions, setCaptions] = useState<string[]>([]);
  const [copiedCaption, setCopiedCaption] = useState<number | null>(null);

  // Thumbnail ideas state
  const [thumbnailTitle, setThumbnailTitle] = useState('');
  const [thumbnailIdeas, setThumbnailIdeas] = useState<string[]>([]);

  // Video analysis state
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [videoAnalysisPrompt, setVideoAnalysisPrompt] = useState('');
  const [videoAnalysisResult, setVideoAnalysisResult] = useState<string | null>(null);
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);

  // Selected model
  const [selectedModel, setSelectedModel] = useState('llama3.2:1b');

  const [installInstructions, setInstallInstructions] = useState<string | null>(null);

  // Get installed model
  const installedModel = models.find((m) => m.downloaded);

  // Generate hashtags
  const handleGenerateHashtags = useCallback(async () => {
    if (!niche) return;
    const result = await suggestHashtags(niche, platform, selectedModel);
    setHashtags(result);
  }, [niche, platform, selectedModel, suggestHashtags]);

  // Copy hashtags
  const handleCopyHashtags = useCallback(async () => {
    await navigator.clipboard.writeText(hashtags.join(' '));
    setCopiedHashtags(true);
    setTimeout(() => setCopiedHashtags(false), 2000);
  }, [hashtags]);

  // Analyze script
  const handleAnalyzeScript = useCallback(async () => {
    if (!script) return;
    const result = await analyzeScript(script, selectedModel);
    setScriptAnalysis(result);
  }, [script, selectedModel, analyzeScript]);

  // Generate captions
  const handleGenerateCaptions = useCallback(async () => {
    if (!videoTitle) return;
    const result = await generateCaptions(videoTitle, captionStyle, selectedModel);
    setCaptions(result);
  }, [videoTitle, captionStyle, selectedModel, generateCaptions]);

  // Copy caption
  const handleCopyCaption = useCallback(async (caption: string, index: number) => {
    await navigator.clipboard.writeText(caption);
    setCopiedCaption(index);
    setTimeout(() => setCopiedCaption(null), 2000);
  }, []);

  // Generate thumbnail ideas
  const handleGenerateThumbnailIdeas = useCallback(async () => {
    if (!thumbnailTitle) return;
    const result = await generateThumbnailIdeas(thumbnailTitle, selectedModel);
    setThumbnailIdeas(result);
  }, [thumbnailTitle, selectedModel, generateThumbnailIdeas]);

  // Show install instructions
  const handleShowInstallInstructions = useCallback(async () => {
    const instructions = await getInstallInstructions();
    setInstallInstructions(instructions);
  }, [getInstallInstructions]);

  // Video dropzone
  const onVideoDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0] as File & { path: string };
      setSelectedVideo(file.path);
      setVideoAnalysisResult(null);
    }
  }, []);

  const { getRootProps: getVideoRootProps, getInputProps: getVideoInputProps, isDragActive: isVideoDragActive } = useDropzone({
    onDrop: onVideoDrop,
    accept: {
      'video/*': ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
    },
    maxFiles: 1,
  });

  // Select video file via dialog
  const handleSelectVideo = useCallback(async () => {
    const filePath = await window.electronAPI.selectVideoFile();
    if (filePath) {
      setSelectedVideo(filePath);
      setVideoAnalysisResult(null);
    }
  }, []);

  // Analyze video with LLM
  const handleAnalyzeVideo = useCallback(async () => {
    if (!selectedVideo || !videoAnalysisPrompt) return;

    setIsAnalyzingVideo(true);
    setVideoAnalysisResult(null);

    try {
      // For now, use the video file path description and the prompt
      // In the future, this can extract frames and use a vision model
      const prompt = `I have a video file at: ${selectedVideo}

The user wants to know: ${videoAnalysisPrompt}

Based on the filename and context, please provide helpful suggestions and analysis for this video content. Consider:
- What the video might be about based on the filename
- Best practices for the type of content
- Suggestions for improving engagement
- Hashtag and caption ideas if relevant

Please be helpful and provide actionable advice.`;

      const result = await window.electronAPI.ollama.generate({
        model: selectedModel,
        prompt,
        options: {
          temperature: 0.7,
          num_predict: 500,
        },
      });

      setVideoAnalysisResult(result);
    } catch (err) {
      console.error('Video analysis failed:', err);
      setVideoAnalysisResult('Analysis failed. Please make sure an AI model is installed and try again.');
    } finally {
      setIsAnalyzingVideo(false);
    }
  }, [selectedVideo, videoAnalysisPrompt, selectedModel]);

  // Ollama not running
  if (!isRunning) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Ollama Required</h2>
          <p className="text-muted-foreground mb-4">
            Content Analyst uses Ollama to run AI models locally.
          </p>

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

          <p className="text-xs text-muted-foreground mt-4">
            After installing Ollama, restart CrowTerminal Companion.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Content Analyst</h2>
          <p className="text-sm text-muted-foreground">
            AI-powered content analysis and generation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="px-3 py-1.5 border rounded-lg bg-background text-sm"
          >
            {models.filter((m) => m.downloaded).map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
          <span className="w-2 h-2 rounded-full bg-green-500" />
        </div>
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

      {/* No models installed warning */}
      {!installedModel && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <span className="font-medium text-yellow-700 dark:text-yellow-300">
              No Models Installed
            </span>
          </div>
          <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-3">
            Download a model to start using Content Analyst.
          </p>
          <button
            onClick={() => setActiveTab('models')}
            className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium
              hover:bg-yellow-600"
          >
            Go to Models
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {[
          { id: 'hashtags', label: 'Hashtags', icon: Hash },
          { id: 'script', label: 'Script Analysis', icon: FileText },
          { id: 'captions', label: 'Captions', icon: MessageSquare },
          { id: 'thumbnails', label: 'Thumbnails', icon: Image },
          { id: 'video', label: 'Video Analysis', icon: Film },
          { id: 'models', label: 'Models', icon: Sparkles },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as TabType)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Hashtags Tab */}
      {activeTab === 'hashtags' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Niche / Topic</label>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g., fitness motivation, cooking, tech reviews"
                className="w-full px-3 py-2 border rounded-lg bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Platform</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as typeof platform)}
                className="w-full px-3 py-2 border rounded-lg bg-background"
              >
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram</option>
                <option value="youtube">YouTube</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleGenerateHashtags}
            disabled={!niche || isGenerating || !installedModel}
            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium
              hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Hash className="w-5 h-5" />
                Generate Hashtags
              </>
            )}
          </button>

          {hashtags.length > 0 && (
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Generated Hashtags</span>
                <button
                  onClick={handleCopyHashtags}
                  className="p-1.5 text-muted-foreground hover:text-foreground"
                >
                  {copiedHashtags ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {hashtags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Script Analysis Tab */}
      {activeTab === 'script' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Your Script</label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Paste your video script here for engagement analysis..."
              rows={6}
              className="w-full px-3 py-2 border rounded-lg bg-background resize-none"
            />
          </div>

          <button
            onClick={handleAnalyzeScript}
            disabled={!script || isGenerating || !installedModel}
            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium
              hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <FileText className="w-5 h-5" />
                Analyze Script
              </>
            )}
          </button>

          {scriptAnalysis && (
            <div className="border rounded-lg p-4 space-y-4">
              {/* Score */}
              <div className="text-center">
                <div className="text-4xl font-bold text-primary">{scriptAnalysis.score}</div>
                <div className="text-sm text-muted-foreground">Engagement Score</div>
              </div>

              {/* Feedback */}
              <div>
                <h4 className="text-sm font-medium mb-2">Feedback</h4>
                <ul className="space-y-1">
                  {scriptAnalysis.feedback.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Suggestions */}
              <div>
                <h4 className="text-sm font-medium mb-2">Suggestions</h4>
                <ul className="space-y-1">
                  {scriptAnalysis.suggestions.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-green-500">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Captions Tab */}
      {activeTab === 'captions' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Video Title / Topic</label>
              <input
                type="text"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                placeholder="e.g., Morning routine that changed my life"
                className="w-full px-3 py-2 border rounded-lg bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Style</label>
              <select
                value={captionStyle}
                onChange={(e) => setCaptionStyle(e.target.value as typeof captionStyle)}
                className="w-full px-3 py-2 border rounded-lg bg-background"
              >
                <option value="casual">Casual & Relatable</option>
                <option value="professional">Professional</option>
                <option value="funny">Funny & Witty</option>
                <option value="inspirational">Inspirational</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleGenerateCaptions}
            disabled={!videoTitle || isGenerating || !installedModel}
            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium
              hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <MessageSquare className="w-5 h-5" />
                Generate Captions
              </>
            )}
          </button>

          {captions.length > 0 && (
            <div className="space-y-2">
              {captions.map((caption, i) => (
                <div key={i} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                  <p className="text-sm flex-1">{caption}</p>
                  <button
                    onClick={() => handleCopyCaption(caption, i)}
                    className="p-1.5 text-muted-foreground hover:text-foreground"
                  >
                    {copiedCaption === i ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Thumbnails Tab */}
      {activeTab === 'thumbnails' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Video Title</label>
            <input
              type="text"
              value={thumbnailTitle}
              onChange={(e) => setThumbnailTitle(e.target.value)}
              placeholder="e.g., How I made $10k in one month"
              className="w-full px-3 py-2 border rounded-lg bg-background"
            />
          </div>

          <button
            onClick={handleGenerateThumbnailIdeas}
            disabled={!thumbnailTitle || isGenerating || !installedModel}
            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium
              hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Image className="w-5 h-5" />
                Generate Thumbnail Ideas
              </>
            )}
          </button>

          {thumbnailIdeas.length > 0 && (
            <div className="space-y-3">
              {thumbnailIdeas.map((idea, i) => (
                <div key={i} className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium">Idea {i + 1}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{idea}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Video Analysis Tab */}
      {activeTab === 'video' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload a video and ask questions about it. Get content suggestions, improvement tips, and more.
          </p>

          {/* Video dropzone */}
          {!selectedVideo ? (
            <div
              {...getVideoRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                transition-colors duration-200
                ${isVideoDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
              `}
            >
              <input {...getVideoInputProps()} />
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {isVideoDragActive ? 'Drop video here' : 'Drag & drop a video file'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    or{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectVideo();
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
          ) : (
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Film className="w-8 h-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{selectedVideo.split('/').pop()}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-md">{selectedVideo}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedVideo(null);
                    setVideoAnalysisResult(null);
                  }}
                  className="p-1.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Analysis prompt */}
              <div>
                <label className="block text-sm font-medium mb-1">What do you want to know?</label>
                <textarea
                  value={videoAnalysisPrompt}
                  onChange={(e) => setVideoAnalysisPrompt(e.target.value)}
                  placeholder="e.g., Suggest hashtags for this video, How can I improve the hook?, What audience would this appeal to?"
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg bg-background resize-none"
                />
              </div>

              <button
                onClick={handleAnalyzeVideo}
                disabled={!videoAnalysisPrompt || isAnalyzingVideo || !installedModel}
                className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium
                  hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isAnalyzingVideo ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Analyze Video
                  </>
                )}
              </button>

              {/* Analysis result */}
              {videoAnalysisResult && (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <h4 className="text-sm font-medium mb-2">Analysis Result</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {videoAnalysisResult}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Models Tab */}
      {activeTab === 'models' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Download AI models for content analysis. Larger models produce better results but require more RAM.
          </p>

          {models.map((model) => (
            <div
              key={model.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{model.name}</p>
                    {model.recommended && (
                      <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs rounded">
                        Recommended
                      </span>
                    )}
                    {model.downloaded && (
                      <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded">
                        Installed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{model.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {model.size} - Best for: {model.bestFor}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {model.downloaded ? (
                  <button
                    onClick={() => deleteModel(model.id)}
                    disabled={isLoading}
                    className="p-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => pullModel(model.id)}
                    disabled={isLoading}
                    className="px-3 py-1.5 border text-sm rounded-md hover:bg-muted
                      disabled:opacity-50 flex items-center gap-1"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Download
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
