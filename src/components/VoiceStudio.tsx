import { useState, useRef, useCallback } from 'react';
import {
  Mic,
  Play,
  Square,
  Upload,
  Trash2,
  Download,
  Volume2,
  Settings,
  AlertCircle,
  Loader2,
  CheckCircle,
  Globe,
  Sparkles,
  User,
} from 'lucide-react';
import { useTTS } from '../hooks/useTTS';
import type { HardwareInfo } from '../../electron/preload';

interface VoiceStudioProps {
  hardwareInfo: HardwareInfo | null;
}

export function VoiceStudio({ hardwareInfo }: VoiceStudioProps) {
  const {
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
    startServer,
    stopServer,
    downloadModel,
    loadModel,
    cloneVoice,
    deleteVoice,
    generateSpeech,
    clearError,
  } = useTTS();

  const [activeTab, setActiveTab] = useState<'clone' | 'generate' | 'models'>('clone');
  const [voiceName, setVoiceName] = useState('');
  const [voiceDescription, setVoiceDescription] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [textToSpeak, setTextToSpeak] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('');
  const [instruct, setInstruct] = useState('');
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setRecordedBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);

      // Auto-stop after 5 seconds
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
        }
      }, 5000);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, []);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  // Clone voice from recording
  const handleCloneVoice = useCallback(async () => {
    if (!recordedBlob || !voiceName || !voiceTranscript) return;

    try {
      // Save recorded blob to temp file
      const arrayBuffer = await recordedBlob.arrayBuffer();
      const filename = `voice_sample_${Date.now()}.wav`;
      const audioPath = await window.electronAPI.saveAudioToTemp(arrayBuffer, filename);

      // Clone voice using the saved temp file
      await cloneVoice(audioPath, voiceName, voiceDescription, selectedLanguage, voiceTranscript);
      setVoiceName('');
      setVoiceDescription('');
      setVoiceTranscript('');
      setRecordedBlob(null);
    } catch (err) {
      console.error('Failed to clone voice:', err);
    }
  }, [recordedBlob, voiceName, voiceDescription, selectedLanguage, voiceTranscript, cloneVoice]);

  // Select audio file for cloning
  const handleSelectAudioFile = useCallback(async () => {
    const filePath = await window.electronAPI.selectAudioFile();
    if (filePath && voiceName && voiceTranscript) {
      await cloneVoice(filePath, voiceName, voiceDescription, selectedLanguage, voiceTranscript);
      setVoiceName('');
      setVoiceDescription('');
      setVoiceTranscript('');
    }
  }, [voiceName, voiceDescription, selectedLanguage, voiceTranscript, cloneVoice]);

  // Generate speech
  const handleGenerateSpeech = useCallback(async () => {
    if (!textToSpeak) return;

    const outputPath = await generateSpeech(textToSpeak, {
      voiceId: selectedVoice || undefined,
      speaker: selectedSpeaker || undefined,
      instruct: instruct || undefined,
      language: selectedLanguage,
    });

    if (outputPath) {
      console.log('Audio generated at:', outputPath);
      setGeneratedAudio(outputPath);
      setAudioDataUrl(null); // Reset while loading
      // Load audio as data URL for playback
      try {
        console.log('Loading audio as data URL...');
        const dataUrl = await window.electronAPI.readAudioAsDataUrl(outputPath);
        console.log('Audio data URL loaded, length:', dataUrl?.length);
        setAudioDataUrl(dataUrl);
      } catch (err) {
        console.error('Failed to load audio for playback:', err);
        // Still show the path even if playback fails
      }
    }
  }, [textToSpeak, selectedVoice, selectedSpeaker, instruct, selectedLanguage, generateSpeech]);

  // Python not available warning
  if (!pythonAvailable) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Python Required</h2>
          <p className="text-muted-foreground mb-4">
            Voice Studio requires Python 3.10+ to run the TTS server.
          </p>
          <div className="bg-muted rounded-lg p-4 text-left max-w-md mx-auto">
            <p className="text-sm font-mono mb-2">Install Python via Homebrew:</p>
            <code className="text-xs bg-background p-2 rounded block">
              brew install python
            </code>
            <p className="text-sm font-mono mt-4 mb-2">Or download from:</p>
            <a
              href="https://python.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-sm"
            >
              python.org
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Server not running
  if (!status?.running) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <Mic className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Voice Studio</h2>
          <p className="text-muted-foreground mb-4">
            Clone your voice and generate unlimited voiceovers locally.
          </p>
          <button
            onClick={startServer}
            disabled={isLoading}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium
              hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 mx-auto"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Starting Server...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Start Voice Studio
              </>
            )}
          </button>
          <p className="text-xs text-muted-foreground mt-4">
            First start may take a moment to initialize.
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
          <h2 className="text-lg font-semibold">Voice Studio</h2>
          <p className="text-sm text-muted-foreground">
            Clone voices and generate speech locally
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {status.currentModel || 'No model loaded'}
          </span>
          <span className="w-2 h-2 rounded-full bg-green-500" />
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
          <button onClick={clearError} className="ml-auto text-red-500 hover:text-red-700">
            <Square className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab('clone')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'clone'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Clone Voice
        </button>
        <button
          onClick={() => setActiveTab('generate')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'generate'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Generate Speech
        </button>
        <button
          onClick={() => setActiveTab('models')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'models'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Models
        </button>
      </div>

      {/* Clone Voice Tab */}
      {activeTab === 'clone' && (
        <div className="space-y-6">
          {/* Record or upload */}
          <div className="border rounded-lg p-6">
            <h3 className="text-sm font-medium mb-4">Record or Upload Voice Sample</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Record 3-5 seconds of clear speech to clone your voice.
            </p>

            <div className="flex gap-4">
              {/* Record button */}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`flex-1 py-8 rounded-lg border-2 border-dashed flex flex-col items-center gap-2
                  ${isRecording ? 'border-red-500 bg-red-50 dark:bg-red-950' : 'border-muted-foreground/25 hover:border-primary/50'}`}
              >
                {isRecording ? (
                  <>
                    <Square className="w-8 h-8 text-red-500" />
                    <span className="text-sm font-medium">Stop Recording</span>
                    <span className="text-xs text-muted-foreground">Recording...</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-8 h-8 text-muted-foreground" />
                    <span className="text-sm font-medium">Record Sample</span>
                    <span className="text-xs text-muted-foreground">3-5 seconds</span>
                  </>
                )}
              </button>

              {/* Upload button */}
              <button
                onClick={handleSelectAudioFile}
                disabled={!voiceName}
                className="flex-1 py-8 rounded-lg border-2 border-dashed border-muted-foreground/25
                  hover:border-primary/50 flex flex-col items-center gap-2 disabled:opacity-50"
              >
                <Upload className="w-8 h-8 text-muted-foreground" />
                <span className="text-sm font-medium">Upload File</span>
                <span className="text-xs text-muted-foreground">MP3, WAV, M4A</span>
              </button>
            </div>

            {recordedBlob && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-950 rounded-lg flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-700 dark:text-green-300">
                  Sample recorded! Enter a name and click Clone.
                </span>
              </div>
            )}
          </div>

          {/* Voice details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Voice Name *</label>
              <input
                type="text"
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                placeholder="My Voice"
                className="w-full px-3 py-2 border rounded-lg bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Language</label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg bg-background"
              >
                {Object.entries(languages).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Description</label>
              <input
                type="text"
                value={voiceDescription}
                onChange={(e) => setVoiceDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full px-3 py-2 border rounded-lg bg-background"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Transcript (what you said) *</label>
              <input
                type="text"
                value={voiceTranscript}
                onChange={(e) => setVoiceTranscript(e.target.value)}
                placeholder="Type exactly what you said in the recording..."
                className="w-full px-3 py-2 border rounded-lg bg-background"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter the exact words spoken in your audio sample for accurate voice cloning.
              </p>
            </div>
          </div>

          <button
            onClick={handleCloneVoice}
            disabled={!voiceName || !voiceTranscript || (!recordedBlob && isLoading)}
            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium
              hover:bg-primary/90 disabled:opacity-50"
          >
            Clone Voice
          </button>

          {/* Saved voices */}
          {voices.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3">Your Voices ({voices.length})</h3>
              <div className="space-y-2">
                {voices.map((voice) => (
                  <div
                    key={voice.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Volume2 className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{voice.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {voice.language} - {new Date(voice.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteVoice(voice.id)}
                      className="p-2 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Generate Speech Tab */}
      {activeTab === 'generate' && (
        <div className="space-y-6">
          {/* Model Selection - inline */}
          {(() => {
            const downloadedModels = models.filter(m => m.downloaded);
            if (downloadedModels.length === 0) {
              return (
                <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    No models downloaded. Go to the Models tab to download one first.
                  </p>
                </div>
              );
            }
            return (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Settings className="w-5 h-5 text-muted-foreground" />
                <select
                  value={status?.currentModel || ''}
                  onChange={async (e) => {
                    if (e.target.value && e.target.value !== status?.currentModel) {
                      await loadModel(e.target.value);
                    }
                  }}
                  disabled={isLoading}
                  className="flex-1 px-3 py-2 border rounded-lg bg-background text-sm"
                >
                  <option value="">Select a model...</option>
                  {downloadedModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} {model.type && `(${model.type})`}
                    </option>
                  ))}
                </select>
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {status?.modelLoaded && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Ready
                  </span>
                )}
              </div>
            );
          })()}

          {/* Text input */}
          <div>
            <label className="block text-sm font-medium mb-1">Text to Speak</label>
            <textarea
              value={textToSpeak}
              onChange={(e) => setTextToSpeak(e.target.value)}
              placeholder="Enter the text you want to convert to speech..."
              rows={4}
              className="w-full px-3 py-2 border rounded-lg bg-background resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {textToSpeak.length} characters
            </p>
          </div>

          {/* Voice/Speaker Selection */}
          <div className="grid grid-cols-2 gap-4">
            {/* Preset Speakers (for CustomVoice models) */}
            {speakersAvailable && (
              <div>
                <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                  <User className="w-4 h-4" />
                  Preset Speaker
                </label>
                <select
                  value={selectedSpeaker}
                  onChange={(e) => {
                    setSelectedSpeaker(e.target.value);
                    if (e.target.value) setSelectedVoice(null); // Clear cloned voice when selecting preset
                  }}
                  className="w-full px-3 py-2 border rounded-lg bg-background"
                >
                  <option value="">Select a speaker...</option>
                  {Object.entries(speakers).map(([name, info]) => (
                    <option key={name} value={name}>
                      {name} ({info.language})
                    </option>
                  ))}
                </select>
                {selectedSpeaker && speakers[selectedSpeaker] && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {speakers[selectedSpeaker].description}
                  </p>
                )}
              </div>
            )}

            {/* Cloned Voices */}
            <div>
              <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                <Volume2 className="w-4 h-4" />
                {speakersAvailable ? 'Or Use Cloned Voice' : 'Voice'}
              </label>
              <select
                value={selectedVoice || ''}
                onChange={(e) => {
                  setSelectedVoice(e.target.value || null);
                  if (e.target.value) setSelectedSpeaker(''); // Clear preset when selecting cloned voice
                }}
                className="w-full px-3 py-2 border rounded-lg bg-background"
              >
                <option value="">
                  {speakersAvailable ? 'None (use preset)' : 'Select a voice...'}
                </option>
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Language */}
            <div>
              <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                <Globe className="w-4 h-4" />
                Language
              </label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg bg-background"
              >
                {Object.entries(languages).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Emotion/Style Control */}
            <div>
              <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                <Sparkles className="w-4 h-4" />
                Emotion / Style
              </label>
              <input
                type="text"
                value={instruct}
                onChange={(e) => setInstruct(e.target.value)}
                placeholder="e.g., happy, sad, excited, whispering..."
                className="w-full px-3 py-2 border rounded-lg bg-background"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Optional: Add emotion or style instructions
              </p>
            </div>
          </div>

          {/* Quick emotion presets */}
          {speakersAvailable && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Quick emotions:</p>
              <div className="flex flex-wrap gap-2">
                {['happy', 'sad', 'angry', 'excited', 'calm', 'whispering', 'professional'].map((emotion) => (
                  <button
                    key={emotion}
                    onClick={() => setInstruct(emotion)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      instruct === emotion
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'hover:bg-muted border-muted-foreground/25'
                    }`}
                  >
                    {emotion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleGenerateSpeech}
            disabled={!textToSpeak || isGenerating || !status.modelLoaded}
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
                <Play className="w-5 h-5" />
                Generate Speech
              </>
            )}
          </button>


          {/* Model type info */}
          {status.modelLoaded && status.currentModelType && (
            <div className="text-xs text-center text-muted-foreground">
              Model type: <span className="font-medium">{status.currentModelType}</span>
              {status.currentModelType === 'clone' && ' - Use a cloned voice for generation'}
              {status.currentModelType === 'custom' && ' - Use preset speakers with emotion control'}
              {status.currentModelType === 'design' && ' - Describe the voice you want'}
            </div>
          )}

          {/* Generated audio player */}
          {generatedAudio && (
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Generated Audio
                </h3>
                <button
                  onClick={async () => {
                    const savedPath = await window.electronAPI.saveAudioFile(
                      generatedAudio,
                      `voice_${Date.now()}.wav`
                    );
                    if (savedPath) {
                      alert(`Audio saved to: ${savedPath}`);
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  <Download className="w-4 h-4" />
                  Save
                </button>
              </div>
              {audioDataUrl ? (
                <audio key={generatedAudio} controls src={audioDataUrl} className="w-full" autoPlay />
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading audio...
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2 truncate">{generatedAudio}</p>
            </div>
          )}
        </div>
      )}

      {/* Models Tab */}
      {activeTab === 'models' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Download and manage TTS models. Choose based on your use case:
          </p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <span className="font-medium text-blue-700 dark:text-blue-300">Clone</span>
              <p className="text-muted-foreground">Clone voices from audio</p>
            </div>
            <div className="p-2 bg-purple-50 dark:bg-purple-950 rounded-lg">
              <span className="font-medium text-purple-700 dark:text-purple-300">Presets</span>
              <p className="text-muted-foreground">9 premium voices + emotion</p>
            </div>
            <div className="p-2 bg-amber-50 dark:bg-amber-950 rounded-lg">
              <span className="font-medium text-amber-700 dark:text-amber-300">Design</span>
              <p className="text-muted-foreground">Create voice from description</p>
            </div>
          </div>

          {models.map((model) => (
            <div
              key={model.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                  <Settings className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{model.name}</p>
                    {model.type && (
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        model.type === 'clone' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' :
                        model.type === 'custom' ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300' :
                        'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300'
                      }`}>
                        {model.type === 'clone' ? 'Clone' : model.type === 'custom' ? 'Presets' : 'Design'}
                      </span>
                    )}
                    {model.recommended && (
                      <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs rounded">
                        Recommended
                      </span>
                    )}
                    {status.currentModel === model.id && (
                      <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded">
                        Loaded
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{model.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {model.size} - Requires {model.ramRequired}GB+ RAM
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {model.downloaded ? (
                  <>
                    {status.currentModel !== model.id && (
                      <button
                        onClick={() => loadModel(model.id)}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-md
                          hover:bg-primary/90 disabled:opacity-50"
                      >
                        Load
                      </button>
                    )}
                    <button
                      onClick={() => window.electronAPI.tts.deleteModel(model.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => downloadModel(model.id)}
                    disabled={isLoading}
                    className="px-3 py-1.5 border text-sm rounded-md hover:bg-muted
                      disabled:opacity-50 flex items-center gap-1"
                  >
                    <Download className="w-4 h-4" />
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
