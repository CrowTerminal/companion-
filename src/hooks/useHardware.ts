import { useState, useEffect } from 'react';
import type { HardwareInfo } from '../../electron/preload';

interface UseHardwareResult {
  hardwareInfo: HardwareInfo | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useHardware(): UseHardwareResult {
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchHardwareInfo = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const info = await window.electronAPI.getHardwareInfo();
      setHardwareInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to get hardware info'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHardwareInfo();
  }, []);

  return {
    hardwareInfo,
    isLoading,
    error,
    refresh: fetchHardwareInfo,
  };
}
