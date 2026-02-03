import { useState, useEffect, useCallback } from 'react';
import type { Settings } from '../../electron/preload';

interface UseSettingsResult {
  settings: Settings | null;
  isLoading: boolean;
  error: Error | null;
  updateSetting: (key: string, value: unknown) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedSettings = await window.electronAPI.getSettings();
      setSettings(fetchedSettings);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to get settings'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateSetting = useCallback(async (key: string, value: unknown) => {
    try {
      await window.electronAPI.setSetting(key, value);
      // Update local state
      setSettings((prev) => (prev ? { ...prev, [key]: value } : null));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to update setting'));
      throw err;
    }
  }, []);

  return {
    settings,
    isLoading,
    error,
    updateSetting,
    refresh: fetchSettings,
  };
}
