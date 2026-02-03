import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { app } from 'electron';
import log from 'electron-log';
import { HardwareInfo } from './hardware';

// Supported audio formats by whisper-cli
const SUPPORTED_FORMATS = ['.flac', '.mp3', '.ogg', '.wav'];

export interface WhisperModel {
  name: string;
  size: string;
  sizeBytes: number;
  description: string;
  recommended: boolean;
  downloaded: boolean;
  ramRequired: number; // in GB
}

export interface TranscriptionResult {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language: string;
  duration: number;
}

export interface TranscriptionOptions {
  model?: string;
  language?: string;
  onProgress?: (progress: number) => void;
}

const WHISPER_MODELS: Omit<WhisperModel, 'downloaded' | 'recommended'>[] = [
  {
    name: 'tiny',
    size: '75 MB',
    sizeBytes: 75 * 1024 * 1024,
    description: 'Fastest, lowest accuracy. Works on 4GB+ RAM.',
    ramRequired: 1,
  },
  {
    name: 'tiny.en',
    size: '75 MB',
    sizeBytes: 75 * 1024 * 1024,
    description: 'English-only tiny model. Slightly better accuracy for English.',
    ramRequired: 1,
  },
  {
    name: 'base',
    size: '142 MB',
    sizeBytes: 142 * 1024 * 1024,
    description: 'Good balance of speed and accuracy. Works on 4GB+ RAM.',
    ramRequired: 1.5,
  },
  {
    name: 'base.en',
    size: '142 MB',
    sizeBytes: 142 * 1024 * 1024,
    description: 'English-only base model.',
    ramRequired: 1.5,
  },
  {
    name: 'small',
    size: '466 MB',
    sizeBytes: 466 * 1024 * 1024,
    description: 'Better accuracy, moderate speed. Requires 8GB+ RAM.',
    ramRequired: 3,
  },
  {
    name: 'small.en',
    size: '466 MB',
    sizeBytes: 466 * 1024 * 1024,
    description: 'English-only small model.',
    ramRequired: 3,
  },
  {
    name: 'medium',
    size: '1.5 GB',
    sizeBytes: 1.5 * 1024 * 1024 * 1024,
    description: 'High accuracy, slower. Requires 16GB+ RAM.',
    ramRequired: 5,
  },
  {
    name: 'medium.en',
    size: '1.5 GB',
    sizeBytes: 1.5 * 1024 * 1024 * 1024,
    description: 'English-only medium model.',
    ramRequired: 5,
  },
  {
    name: 'large-v3',
    size: '3.1 GB',
    sizeBytes: 3.1 * 1024 * 1024 * 1024,
    description: 'Highest accuracy, slowest. Requires 32GB+ RAM.',
    ramRequired: 10,
  },
];

const MODEL_DOWNLOAD_URLS: Record<string, string> = {
  tiny: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  'tiny.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
  base: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  'base.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
  small: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  'small.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
  medium: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
  'medium.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin',
  'large-v3': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
};

export class WhisperService {
  private modelsDir: string;
  private binaryPath: string;
  private activeTranscriptions: Map<string, ChildProcess> = new Map();
  private hardwareInfo: HardwareInfo;

  constructor(hardwareInfo: HardwareInfo) {
    this.hardwareInfo = hardwareInfo;

    // Determine paths based on whether we're in development or production
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

    if (isDev) {
      this.modelsDir = path.join(app.getPath('userData'), 'models');
      this.binaryPath = this.findWhisperBinary();
    } else {
      this.modelsDir = path.join(process.resourcesPath, 'models');
      this.binaryPath = path.join(process.resourcesPath, 'bin', this.getWhisperBinaryName());
    }

    // Ensure models directory exists
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }

    log.info('Whisper service initialized', {
      modelsDir: this.modelsDir,
      binaryPath: this.binaryPath,
    });
  }

  private getWhisperBinaryName(): string {
    switch (process.platform) {
      case 'darwin':
        return 'whisper-cli';
      case 'win32':
        return 'whisper-cli.exe';
      default:
        return 'whisper-cli';
    }
  }

  private findWhisperBinary(): string {
    // In development, try to find whisper in common locations
    const possiblePaths = [
      '/opt/homebrew/bin/whisper-cli',  // Homebrew on Apple Silicon
      '/usr/local/bin/whisper-cli',     // Homebrew on Intel
      '/usr/local/bin/whisper',
      '/opt/homebrew/bin/whisper',
      path.join(process.env.HOME || '', '.local/bin/whisper-cli'),
      'whisper-cli', // Rely on PATH
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        log.info(`Found whisper binary at: ${p}`);
        return p;
      }
    }

    // Fall back to PATH
    log.warn('Whisper binary not found in known locations, will rely on PATH');
    return 'whisper-cli';
  }

  private findFfmpegBinary(): string {
    const possiblePaths = [
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg',
      'ffmpeg',
    ];

    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          return p;
        }
        // Try to execute it to check if it's in PATH
        execSync(`${p} -version`, { stdio: 'pipe' });
        return p;
      } catch {
        continue;
      }
    }

    return 'ffmpeg';
  }

  private needsConversion(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return !SUPPORTED_FORMATS.includes(ext);
  }

  private async convertToWav(inputPath: string): Promise<string> {
    const ffmpegPath = this.findFfmpegBinary();
    const outputPath = path.join(
      app.getPath('temp'),
      `whisper-converted-${Date.now()}.wav`
    );

    log.info(`Converting audio file to WAV: ${inputPath} -> ${outputPath}`);

    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-ar', '16000',      // 16kHz sample rate (optimal for Whisper)
        '-ac', '1',          // Mono
        '-c:a', 'pcm_s16le', // 16-bit PCM
        '-y',                // Overwrite output
        outputPath,
      ];

      const process = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stderr = '';
      process.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          log.info(`Audio conversion successful: ${outputPath}`);
          resolve(outputPath);
        } else {
          log.error(`Audio conversion failed: ${stderr}`);
          reject(new Error(`Failed to convert audio: ${stderr}`));
        }
      });

      process.on('error', (err) => {
        log.error(`FFmpeg error: ${err.message}`);
        reject(new Error(`FFmpeg error: ${err.message}`));
      });
    });
  }

  getAvailableModels(): WhisperModel[] {
    const downloadedModels = this.getDownloadedModels();
    const availableRam = this.hardwareInfo.totalMemoryGB;

    return WHISPER_MODELS.map((model) => ({
      ...model,
      downloaded: downloadedModels.includes(model.name),
      recommended: this.isModelRecommended(model.name, availableRam),
    }));
  }

  private isModelRecommended(modelName: string, availableRam: number): boolean {
    const model = WHISPER_MODELS.find((m) => m.name === modelName);
    if (!model) return false;

    // Recommend models that use at most 40% of available RAM
    const maxRamUsage = availableRam * 0.4;
    return model.ramRequired <= maxRamUsage;
  }

  getDownloadedModels(): string[] {
    if (!fs.existsSync(this.modelsDir)) {
      return [];
    }

    return fs
      .readdirSync(this.modelsDir)
      .filter((file) => file.startsWith('ggml-') && file.endsWith('.bin'))
      .map((file) => file.replace('ggml-', '').replace('.bin', ''));
  }

  private getModelPath(modelName: string): string {
    return path.join(this.modelsDir, `ggml-${modelName}.bin`);
  }

  async downloadModel(
    modelName: string,
    onProgress?: (progress: number) => void
  ): Promise<boolean> {
    const url = MODEL_DOWNLOAD_URLS[modelName];
    if (!url) {
      throw new Error(`Unknown model: ${modelName}`);
    }

    const modelPath = this.getModelPath(modelName);
    const tempPath = `${modelPath}.tmp`;

    log.info(`Downloading model ${modelName} from ${url}`);

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tempPath);

      const request = https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(tempPath);
            log.info(`Redirecting to ${redirectUrl}`);
            // Follow redirect
            this.downloadFromUrl(redirectUrl, tempPath, onProgress)
              .then(() => {
                fs.renameSync(tempPath, modelPath);
                resolve(true);
              })
              .catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(tempPath);
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedSize = 0;

        response.on('data', (chunk: Buffer) => {
          downloadedSize += chunk.length;
          if (totalSize > 0 && onProgress) {
            onProgress(Math.round((downloadedSize / totalSize) * 100));
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          fs.renameSync(tempPath, modelPath);
          log.info(`Model ${modelName} downloaded successfully`);
          resolve(true);
        });
      });

      request.on('error', (err) => {
        file.close();
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        reject(err);
      });
    });
  }

  private downloadFromUrl(
    url: string,
    destPath: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);

      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          file.close();
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedSize = 0;

        response.on('data', (chunk: Buffer) => {
          downloadedSize += chunk.length;
          if (totalSize > 0 && onProgress) {
            onProgress(Math.round((downloadedSize / totalSize) * 100));
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        file.close();
        reject(err);
      });
    });
  }

  async deleteModel(modelName: string): Promise<boolean> {
    const modelPath = this.getModelPath(modelName);

    if (fs.existsSync(modelPath)) {
      fs.unlinkSync(modelPath);
      log.info(`Model ${modelName} deleted`);
      return true;
    }

    return false;
  }

  async transcribe(
    filePath: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const modelName = options.model || 'tiny';
    const modelPath = this.getModelPath(modelName);

    // Check if model is downloaded
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Model ${modelName} is not downloaded. Please download it first.`);
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    log.info(`Starting transcription of ${filePath} with model ${modelName}`);

    // Convert audio if needed
    let audioPath = filePath;
    let convertedFile: string | null = null;

    if (this.needsConversion(filePath)) {
      log.info(`Audio file needs conversion: ${filePath}`);
      try {
        convertedFile = await this.convertToWav(filePath);
        audioPath = convertedFile;
      } catch (err) {
        log.error('Audio conversion failed:', err);
        throw new Error(`Failed to convert audio file: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return new Promise((resolve, reject) => {
      // Create temp output file path for JSON
      const outputBase = path.join(app.getPath('temp'), `whisper-${Date.now()}`);

      const args = [
        '-m', modelPath,
        '-f', audioPath,
        '-oj',                    // Output as JSON
        '-of', outputBase,        // Output file base name
      ];

      // Cleanup function for converted file
      const cleanup = () => {
        if (convertedFile && fs.existsSync(convertedFile)) {
          try {
            fs.unlinkSync(convertedFile);
            log.debug(`Cleaned up converted file: ${convertedFile}`);
          } catch (e) {
            log.warn(`Failed to clean up converted file: ${e}`);
          }
        }
      };

      if (options.language) {
        args.push('-l', options.language);
      }

      // Use number of CPU cores for threading (leave some for system)
      const threads = Math.max(1, Math.floor(this.hardwareInfo.cpuCores * 0.75));
      args.push('-t', threads.toString());

      log.info(`Running: ${this.binaryPath} ${args.join(' ')}`);
      const whisperProcess = spawn(this.binaryPath, args);
      this.activeTranscriptions.set(filePath, whisperProcess);

      let stderr = '';

      whisperProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        log.debug('Whisper stdout:', output);

        // Try to parse progress from output (whisper shows progress like "whisper_print_progress_callback: progress = 50%")
        if (options.onProgress) {
          const progressMatch = output.match(/progress\s*=\s*(\d+)%/);
          if (progressMatch) {
            options.onProgress(parseInt(progressMatch[1], 10));
          }
        }
      });

      whisperProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        log.debug('Whisper stderr:', data.toString());
      });

      whisperProcess.on('close', (code) => {
        this.activeTranscriptions.delete(filePath);
        cleanup(); // Clean up converted file

        if (code !== 0) {
          log.error(`Transcription failed with code ${code}: ${stderr}`);
          reject(new Error(`Transcription failed: ${stderr || 'Unknown error'}`));
          return;
        }

        try {
          // Read the JSON output file
          const jsonPath = `${outputBase}.json`;
          if (fs.existsSync(jsonPath)) {
            const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
            const result = this.parseWhisperOutput(jsonContent);
            // Clean up temp file
            fs.unlinkSync(jsonPath);
            log.info(`Transcription completed for ${filePath}`);
            resolve(result);
          } else {
            // No JSON file, check for text output or try to read stdout
            log.warn('No JSON output file found, looking for alternative outputs');

            // Check for .txt output
            const txtPath = `${outputBase}.txt`;
            if (fs.existsSync(txtPath)) {
              const text = fs.readFileSync(txtPath, 'utf-8');
              fs.unlinkSync(txtPath);
              resolve({
                text: text.trim(),
                segments: [],
                language: options.language || 'auto',
                duration: 0,
              });
              return;
            }

            // Return error message
            resolve({
              text: 'Transcription completed but no output file found. Check if the audio format is supported.',
              segments: [],
              language: options.language || 'unknown',
              duration: 0,
            });
          }
        } catch (parseError) {
          log.warn('Failed to parse JSON output:', parseError);
          resolve({
            text: 'Transcription completed but output parsing failed',
            segments: [],
            language: options.language || 'unknown',
            duration: 0,
          });
        }
      });

      whisperProcess.on('error', (err) => {
        this.activeTranscriptions.delete(filePath);
        cleanup(); // Clean up converted file
        log.error(`Failed to start whisper process: ${err.message}`);
        reject(new Error(`Failed to start transcription: ${err.message}`));
      });
    });
  }

  private parseWhisperOutput(output: string): TranscriptionResult {
    // whisper.cpp JSON output format
    try {
      const json = JSON.parse(output);

      return {
        text: json.text || json.transcription?.map((s: { text: string }) => s.text).join(' ') || '',
        segments: (json.transcription || json.segments || []).map((seg: {
          offsets?: { from: number; to: number };
          timestamps?: { from: string; to: string };
          text: string;
        }) => ({
          start: seg.offsets?.from || this.parseTimestamp(seg.timestamps?.from || '0'),
          end: seg.offsets?.to || this.parseTimestamp(seg.timestamps?.to || '0'),
          text: seg.text.trim(),
        })),
        language: json.result?.language || 'unknown',
        duration: json.result?.duration || 0,
      };
    } catch {
      // If not valid JSON, return the raw text
      return {
        text: output.trim(),
        segments: [],
        language: 'unknown',
        duration: 0,
      };
    }
  }

  private parseTimestamp(timestamp: string): number {
    // Parse timestamps like "00:00:01,500" or "00:00:01.500"
    const parts = timestamp.replace(',', '.').split(':');
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    }
    return parseFloat(timestamp) || 0;
  }

  cancelTranscription(filePath: string): boolean {
    const process = this.activeTranscriptions.get(filePath);
    if (process) {
      process.kill('SIGTERM');
      this.activeTranscriptions.delete(filePath);
      log.info(`Transcription cancelled for ${filePath}`);
      return true;
    }
    return false;
  }
}
