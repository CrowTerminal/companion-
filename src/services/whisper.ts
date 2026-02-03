// Re-export types from the electron preload for use in the renderer
export type { TranscriptionResult, WhisperModel } from '../../electron/preload';

// Wrapper functions that use the electron API
export async function getAvailableModels() {
  return window.electronAPI.getAvailableModels();
}

export async function getDownloadedModels() {
  return window.electronAPI.getDownloadedModels();
}

export async function downloadModel(modelName: string) {
  return window.electronAPI.downloadModel(modelName);
}

export async function deleteModel(modelName: string) {
  return window.electronAPI.deleteModel(modelName);
}

export async function transcribe(
  filePath: string,
  options?: { model?: string; language?: string }
) {
  return window.electronAPI.transcribe(filePath, options);
}

export async function cancelTranscription(filePath: string) {
  return window.electronAPI.cancelTranscription(filePath);
}
