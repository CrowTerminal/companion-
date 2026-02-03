import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@radix-ui/react-tabs';
import {
  Mic,
  Settings as SettingsIcon,
  FolderOpen,
  Cloud,
  Volume2,
  Search,
  BarChart3,
  Zap,
} from 'lucide-react';
import { Transcriber } from './components/Transcriber';
import { FileList } from './components/FileList';
import { Settings } from './components/Settings';
import { CloudSync } from './components/CloudSync';
import { VoiceStudio } from './components/VoiceStudio';
import { ContentAnalyst } from './components/ContentAnalyst';
import { TikTokScore } from './components/TikTokScore';
import { SetupWizard } from './components/SetupWizard';
import { useHardware } from './hooks/useHardware';
import { useSettings } from './hooks/useSettings';
import { TranscriptionProvider } from './hooks/useTranscription';
import type { ElectronAPI } from '../electron/preload';

// Type declaration for the electronAPI exposed from preload
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

function App() {
  const { hardwareInfo, isLoading: hardwareLoading } = useHardware();
  const { settings, isLoading: settingsLoading, updateSetting } = useSettings();
  const [activeTab, setActiveTab] = useState('transcribe');
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  const isLoading = hardwareLoading || settingsLoading;

  // Check if first run
  useEffect(() => {
    if (!isLoading && settings && !settings.setupComplete) {
      setShowSetupWizard(true);
    }
  }, [isLoading, settings]);

  const handleSetupComplete = async () => {
    await updateSetting('setupComplete', true);
    setShowSetupWizard(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading CrowTerminal Creator Studio...</p>
        </div>
      </div>
    );
  }

  return (
    <TranscriptionProvider>
      {/* Setup Wizard for first run */}
      {showSetupWizard && (
        <SetupWizard hardwareInfo={hardwareInfo} onComplete={handleSetupComplete} />
      )}

      <div className="flex flex-col h-screen bg-background">
        {/* macOS title bar spacing */}
        {window.navigator.platform.includes('Mac') && (
          <div className="h-8 titlebar-drag-region bg-background" />
        )}

        {/* Header */}
        <header className="border-b px-6 py-4 flex items-center justify-between no-drag">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">CrowTerminal Creator Studio</h1>
              <p className="text-xs text-muted-foreground">
                Your AI Content Lab - All Local, All Free
              </p>
            </div>
          </div>

          {/* Hardware info badge */}
          {hardwareInfo && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`w-2 h-2 rounded-full ${
                hardwareInfo.canRunLargeModels ? 'bg-green-500' : 'bg-yellow-500'
              }`} />
              <span>{hardwareInfo.totalMemoryGB}GB RAM</span>
              {hardwareInfo.hasMetalSupport && (
                <span className="px-2 py-0.5 bg-muted rounded">Metal</span>
              )}
              {hardwareInfo.hasCudaSupport && (
                <span className="px-2 py-0.5 bg-muted rounded">CUDA</span>
              )}
            </div>
          )}
        </header>

        {/* Hardware warnings */}
        {hardwareInfo?.warnings && hardwareInfo.warnings.length > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-950 border-b border-yellow-200 dark:border-yellow-800 px-6 py-2">
            {hardwareInfo.warnings.map((warning, i) => (
              <p key={i} className="text-xs text-yellow-800 dark:text-yellow-200">
                {warning}
              </p>
            ))}
          </div>
        )}

        {/* Main content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="border-b px-6 flex gap-1 bg-background overflow-x-auto">
            <TabsTrigger
              value="transcribe"
              className="px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary flex items-center gap-2 whitespace-nowrap"
            >
              <Mic className="w-4 h-4" />
              Transcribe
            </TabsTrigger>
            <TabsTrigger
              value="voice"
              className="px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary flex items-center gap-2 whitespace-nowrap"
            >
              <Volume2 className="w-4 h-4" />
              Voice Studio
            </TabsTrigger>
            <TabsTrigger
              value="analyst"
              className="px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary flex items-center gap-2 whitespace-nowrap"
            >
              <Search className="w-4 h-4" />
              Content Analyst
            </TabsTrigger>
            <TabsTrigger
              value="score"
              className="px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary flex items-center gap-2 whitespace-nowrap"
            >
              <BarChart3 className="w-4 h-4" />
              TikTok Score
            </TabsTrigger>
            <TabsTrigger
              value="files"
              className="px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary flex items-center gap-2 whitespace-nowrap"
            >
              <FolderOpen className="w-4 h-4" />
              Files
            </TabsTrigger>
            <TabsTrigger
              value="cloud"
              className="px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary flex items-center gap-2 whitespace-nowrap"
            >
              <Cloud className="w-4 h-4" />
              Cloud Sync
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary flex items-center gap-2 whitespace-nowrap"
            >
              <SettingsIcon className="w-4 h-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto">
            <TabsContent value="transcribe" className="h-full p-6">
              <Transcriber hardwareInfo={hardwareInfo} />
            </TabsContent>
            <TabsContent value="voice" className="h-full p-6">
              <VoiceStudio hardwareInfo={hardwareInfo} />
            </TabsContent>
            <TabsContent value="analyst" className="h-full p-6">
              <ContentAnalyst hardwareInfo={hardwareInfo} />
            </TabsContent>
            <TabsContent value="score" className="h-full p-6">
              <TikTokScore hardwareInfo={hardwareInfo} />
            </TabsContent>
            <TabsContent value="files" className="h-full p-6">
              <FileList />
            </TabsContent>
            <TabsContent value="cloud" className="h-full p-6">
              <CloudSync />
            </TabsContent>
            <TabsContent value="settings" className="h-full p-6">
              <Settings hardwareInfo={hardwareInfo} />
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <footer className="border-t px-6 py-2 text-xs text-muted-foreground flex items-center justify-between">
          <span>CrowTerminal Creator Studio v1.0.0</span>
          <div className="flex items-center gap-4">
            {settings?.isAuthenticated && (
              <span className="flex items-center gap-1">
                <Cloud className="w-3 h-3" />
                Connected to CrowTerminal Cloud
              </span>
            )}
            <span>All processing runs locally</span>
          </div>
        </footer>
      </div>
    </TranscriptionProvider>
  );
}

export default App;
