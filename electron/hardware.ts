import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import log from 'electron-log';

const execAsync = promisify(exec);

export interface HardwareInfo {
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryGB: number;
  availableMemoryGB: number;
  hasGpu: boolean;
  gpuInfo?: string;
  hasMetalSupport: boolean;
  hasCudaSupport: boolean;
  recommendedModel: string;
  canRunLargeModels: boolean;
  warnings: string[];
}

export class HardwareDetector {
  async detect(): Promise<HardwareInfo> {
    const platform = os.platform();
    const arch = os.arch();
    const cpuModel = os.cpus()[0]?.model || 'Unknown';
    const cpuCores = os.cpus().length;
    const totalMemoryGB = Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10;
    const availableMemoryGB = Math.round((os.freemem() / (1024 * 1024 * 1024)) * 10) / 10;

    const gpuInfo = await this.detectGpu(platform);
    const hasMetalSupport = platform === 'darwin' && (arch === 'arm64' || this.isAppleSilicon(cpuModel));
    const hasCudaSupport = gpuInfo.hasNvidia;

    const { recommendedModel, canRunLargeModels } = this.getModelRecommendation(
      totalMemoryGB,
      hasMetalSupport,
      hasCudaSupport
    );

    const warnings = this.generateWarnings(totalMemoryGB, availableMemoryGB, platform, arch);

    const info: HardwareInfo = {
      platform,
      arch,
      cpuModel,
      cpuCores,
      totalMemoryGB,
      availableMemoryGB,
      hasGpu: gpuInfo.hasGpu,
      gpuInfo: gpuInfo.name,
      hasMetalSupport,
      hasCudaSupport,
      recommendedModel,
      canRunLargeModels,
      warnings,
    };

    log.info('Hardware detected:', info);
    return info;
  }

  private isAppleSilicon(cpuModel: string): boolean {
    return cpuModel.toLowerCase().includes('apple') || cpuModel.toLowerCase().includes('m1') || cpuModel.toLowerCase().includes('m2') || cpuModel.toLowerCase().includes('m3') || cpuModel.toLowerCase().includes('m4');
  }

  private async detectGpu(
    platform: string
  ): Promise<{ hasGpu: boolean; hasNvidia: boolean; name?: string }> {
    try {
      if (platform === 'darwin') {
        // macOS - check for Metal GPU
        const { stdout } = await execAsync('system_profiler SPDisplaysDataType -json');
        const data = JSON.parse(stdout);
        const displays = data.SPDisplaysDataType || [];

        for (const display of displays) {
          const gpuName = display.sppci_model || display._name;
          if (gpuName) {
            return {
              hasGpu: true,
              hasNvidia: gpuName.toLowerCase().includes('nvidia'),
              name: gpuName,
            };
          }
        }
      } else if (platform === 'win32') {
        // Windows - check for NVIDIA GPU
        try {
          const { stdout } = await execAsync('nvidia-smi --query-gpu=name --format=csv,noheader');
          const gpuName = stdout.trim();
          if (gpuName) {
            return {
              hasGpu: true,
              hasNvidia: true,
              name: gpuName,
            };
          }
        } catch {
          // nvidia-smi not available, try WMIC
          const { stdout } = await execAsync(
            'wmic path win32_VideoController get name'
          );
          const lines = stdout.split('\n').filter((line) => line.trim() && !line.includes('Name'));
          if (lines.length > 0) {
            const gpuName = lines[0].trim();
            return {
              hasGpu: true,
              hasNvidia: gpuName.toLowerCase().includes('nvidia'),
              name: gpuName,
            };
          }
        }
      } else if (platform === 'linux') {
        // Linux - check for NVIDIA GPU
        try {
          const { stdout } = await execAsync('nvidia-smi --query-gpu=name --format=csv,noheader');
          const gpuName = stdout.trim();
          if (gpuName) {
            return {
              hasGpu: true,
              hasNvidia: true,
              name: gpuName,
            };
          }
        } catch {
          // Try lspci
          try {
            const { stdout } = await execAsync('lspci | grep -i vga');
            const gpuName = stdout.trim();
            return {
              hasGpu: !!gpuName,
              hasNvidia: gpuName.toLowerCase().includes('nvidia'),
              name: gpuName || undefined,
            };
          } catch {
            // No GPU detected
          }
        }
      }
    } catch (error) {
      log.warn('Failed to detect GPU:', error);
    }

    return { hasGpu: false, hasNvidia: false };
  }

  private getModelRecommendation(
    totalMemoryGB: number,
    hasMetalSupport: boolean,
    hasCudaSupport: boolean
  ): { recommendedModel: string; canRunLargeModels: boolean } {
    // Apple Silicon with Metal or NVIDIA with CUDA gets a boost in efficiency
    const hasAcceleration = hasMetalSupport || hasCudaSupport;
    const effectiveMemory = hasAcceleration ? totalMemoryGB * 1.2 : totalMemoryGB;

    if (effectiveMemory < 4) {
      return { recommendedModel: 'tiny', canRunLargeModels: false };
    } else if (effectiveMemory < 8) {
      return { recommendedModel: 'base', canRunLargeModels: false };
    } else if (effectiveMemory < 16) {
      return { recommendedModel: 'small', canRunLargeModels: false };
    } else if (effectiveMemory < 32) {
      return { recommendedModel: 'medium', canRunLargeModels: true };
    } else {
      return { recommendedModel: 'large-v3', canRunLargeModels: true };
    }
  }

  private generateWarnings(
    totalMemoryGB: number,
    availableMemoryGB: number,
    platform: string,
    arch: string
  ): string[] {
    const warnings: string[] = [];

    if (totalMemoryGB < 8) {
      warnings.push(
        'Your system has less than 8GB RAM. You can only use the tiny and base Whisper models. For better accuracy, consider upgrading to 8GB+ RAM.'
      );
    }

    if (availableMemoryGB < 2) {
      warnings.push(
        'Low available memory detected. Close some applications before running transcription to avoid performance issues.'
      );
    }

    if (platform === 'win32' && arch !== 'x64') {
      warnings.push(
        'Non-x64 Windows architecture detected. Some features may not work correctly.'
      );
    }

    return warnings;
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
