import { useState, useEffect } from 'react';
import { Cloud, CloudOff, LogIn, LogOut, RefreshCw, Check, AlertCircle, ExternalLink } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { cloudSyncService, type SyncStatus } from '../services/cloud-sync';

export function CloudSync() {
  const { settings, updateSetting } = useSettings();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (settings?.isAuthenticated) {
      checkSyncStatus();
    }
  }, [settings?.isAuthenticated]);

  const checkSyncStatus = async () => {
    try {
      const status = await cloudSyncService.getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('Failed to get sync status:', error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const token = await cloudSyncService.login(loginEmail, loginPassword);
      await window.electronAPI.setAuthToken(token);
      await updateSetting('cloudSyncEnabled', true);
      setLoginEmail('');
      setLoginPassword('');
      checkSyncStatus();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await cloudSyncService.logout();
      await window.electronAPI.setAuthToken(null);
      await updateSetting('cloudSyncEnabled', false);
      setSyncStatus(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await cloudSyncService.syncAll();
      await checkSyncStatus();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!settings?.isAuthenticated) {
    return (
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Cloud className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Connect to CrowTerminal Cloud</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Sign in to sync your transcripts with your CrowTerminal account and access them from anywhere.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {loginError && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {loginError}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-md bg-background focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-md bg-background focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="Your password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-md font-medium
              hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2"
          >
            {isLoggingIn ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign in
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Don't have an account?{' '}
          <a
            href={`${settings?.apiBaseUrl || 'https://app.crowterminal.com'}/signup`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Create one
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Connection status */}
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
            <Cloud className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="font-medium">Connected to CrowTerminal Cloud</p>
            <p className="text-sm text-muted-foreground">
              Your transcripts are being synced
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border rounded-md hover:bg-muted"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>

      {/* Sync status */}
      {syncStatus && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Sync Status</h3>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="border rounded-lg p-4">
              <p className="text-2xl font-semibold">{syncStatus.localCount}</p>
              <p className="text-sm text-muted-foreground">Local transcripts</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-2xl font-semibold">{syncStatus.cloudCount}</p>
              <p className="text-sm text-muted-foreground">In cloud</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-2xl font-semibold">{syncStatus.pendingSync}</p>
              <p className="text-sm text-muted-foreground">Pending sync</p>
            </div>
          </div>

          {syncStatus.lastSyncedAt && (
            <p className="text-sm text-muted-foreground">
              Last synced: {new Date(syncStatus.lastSyncedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Benefits */}
      <div className="border rounded-lg p-6 bg-muted/30">
        <h3 className="font-medium mb-4">Cloud Sync Benefits</h3>
        <ul className="space-y-3 text-sm">
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            <span>Access your transcripts from the CrowTerminal web dashboard</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            <span>Use transcripts for AI-powered content creation</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            <span>Automatic backup of all your transcripts</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            <span>Share transcripts with your team</span>
          </li>
        </ul>
      </div>

      {/* Privacy note */}
      <p className="text-xs text-muted-foreground">
        Only transcripts are synced to the cloud. Your original audio/video files remain on your computer and are never uploaded.
      </p>
    </div>
  );
}
