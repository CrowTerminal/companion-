import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { app } from 'electron';
import log from 'electron-log';
import { HardwareInfo } from './hardware';

export interface TTSModel {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  description: string;
  ramRequired: number;
  downloaded: boolean;
  recommended: boolean;
  type?: 'clone' | 'custom' | 'design';
}

export interface PresetSpeaker {
  language: string;
  description: string;
}

export interface VoiceProfile {
  id: string;
  name: string;
  description: string;
  sample_path: string;
  created_at: string;
  language: string;
  transcript: string;
  embedding_path?: string;
}

export interface TTSStatus {
  running: boolean;
  device: string;
  modelLoaded: boolean;
  currentModel: string | null;
  currentModelType: 'clone' | 'custom' | 'design' | null;
  voiceCount: number;
  supportedLanguages: Record<string, string>;
  presetSpeakers: Record<string, PresetSpeaker>;
}

export interface TTSGenerateOptions {
  voiceId?: string;
  speaker?: string;
  instruct?: string;
  language?: string;
  speed?: number;
  format?: 'wav' | 'mp3';
}

const TTS_MODELS: Omit<TTSModel, 'downloaded' | 'recommended'>[] = [
  {
    id: 'qwen3-tts-0.6b-base',
    name: 'Qwen3-TTS 0.6B (Clone)',
    size: '1.2 GB',
    sizeBytes: 1.2 * 1024 * 1024 * 1024,
    description: 'Lightweight voice cloning. Good for 8GB+ RAM.',
    ramRequired: 4,
    type: 'clone',
  },
  {
    id: 'qwen3-tts-0.6b-custom',
    name: 'Qwen3-TTS 0.6B (Presets)',
    size: '1.2 GB',
    sizeBytes: 1.2 * 1024 * 1024 * 1024,
    description: 'Lightweight preset voices with emotion control.',
    ramRequired: 4,
    type: 'custom',
  },
  {
    id: 'qwen3-tts-1.7b-base',
    name: 'Qwen3-TTS 1.7B (Clone)',
    size: '3.4 GB',
    sizeBytes: 3.4 * 1024 * 1024 * 1024,
    description: 'High-quality voice cloning. Requires 16GB+ RAM.',
    ramRequired: 8,
    type: 'clone',
  },
  {
    id: 'qwen3-tts-1.7b-custom',
    name: 'Qwen3-TTS 1.7B (Presets)',
    size: '3.4 GB',
    sizeBytes: 3.4 * 1024 * 1024 * 1024,
    description: 'Premium preset voices with emotion. Best quality.',
    ramRequired: 8,
    type: 'custom',
  },
  {
    id: 'qwen3-tts-1.7b-design',
    name: 'Qwen3-TTS 1.7B (Design)',
    size: '3.4 GB',
    sizeBytes: 3.4 * 1024 * 1024 * 1024,
    description: 'Create voices from text descriptions.',
    ramRequired: 8,
    type: 'design',
  },
];

const TTS_PORT = 8765;
const TTS_BASE_URL = `http://127.0.0.1:${TTS_PORT}`;

export class TTSService {
  private serverProcess: ChildProcess | null = null;
  private modelsDir: string;
  private voicesDir: string;
  private pythonScriptPath: string;
  private hardwareInfo: HardwareInfo;
  private isServerReady: boolean = false;

  constructor(hardwareInfo: HardwareInfo) {
    this.hardwareInfo = hardwareInfo;

    const userDataPath = app.getPath('userData');
    this.modelsDir = path.join(userDataPath, 'models', 'tts');
    this.voicesDir = path.join(userDataPath, 'voices');

    // Ensure directories exist
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
    if (!fs.existsSync(this.voicesDir)) {
      fs.mkdirSync(this.voicesDir, { recursive: true });
    }

    // Get Python script path
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    if (isDev) {
      // In development, __dirname is dist/electron, so go up to project root and into electron/python
      this.pythonScriptPath = path.join(__dirname, '..', '..', 'electron', 'python', 'tts_server.py');
    } else {
      this.pythonScriptPath = path.join(process.resourcesPath, 'python', 'tts_server.py');
    }

    log.info('TTS service initialized', {
      modelsDir: this.modelsDir,
      voicesDir: this.voicesDir,
      pythonScriptPath: this.pythonScriptPath,
    });
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    data?: unknown
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, TTS_BASE_URL);

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve(json as T);
          } catch {
            reject(new Error(`Invalid JSON response: ${body}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  async startServer(): Promise<boolean> {
    if (this.serverProcess && this.isServerReady) {
      log.info('TTS server already running');
      return true;
    }

    log.info('Starting TTS server...');

    // Find Python executable - prefer virtual environment
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    // In development, go from dist/electron up to project root
    const appDir = isDev ? path.join(__dirname, '..', '..') : path.dirname(process.resourcesPath);

    log.info(`TTS: isDev=${isDev}, appDir=${appDir}`);
    log.info(`TTS: pythonScriptPath=${this.pythonScriptPath}`);

    const pythonPaths = [
      // TTS-specific virtual environment (Python 3.11 for qwen-tts compatibility)
      path.join(appDir, '.venv-tts', 'bin', 'python3'),
      path.join(appDir, '.venv-tts', 'bin', 'python'),
      // Fallback to main virtual environment
      path.join(appDir, '.venv', 'bin', 'python3'),
      path.join(appDir, '.venv', 'bin', 'python'),
      // Virtual environment in app resources
      path.join(process.resourcesPath || '', 'python', 'venv', 'bin', 'python3'),
      // System Python 3.11 (required for qwen-tts)
      '/opt/homebrew/bin/python3.11',
      '/usr/local/bin/python3.11',
      // System Python paths
      '/opt/homebrew/bin/python3',
      '/usr/local/bin/python3',
      '/usr/bin/python3',
      'python3',
      'python',
    ];

    let pythonPath = 'python3';
    for (const p of pythonPaths) {
      try {
        const exists = fs.existsSync(p);
        log.info(`TTS: Checking Python path: ${p} (exists: ${exists})`);
        if (exists) {
          const result = require('child_process').execSync(`${p} --version`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          if (result.includes('Python 3')) {
            pythonPath = p;
            log.info(`TTS: Using Python from: ${p} (${result.trim()})`);
            break;
          }
        }
      } catch (err) {
        log.info(`TTS: Failed to check ${p}: ${err}`);
        continue;
      }
    }

    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        TTS_PORT: TTS_PORT.toString(),
        TTS_MODELS_DIR: this.modelsDir,
        TTS_VOICES_DIR: this.voicesDir,
      };

      log.info(`TTS: Spawning server with Python: ${pythonPath}`);
      log.info(`TTS: Script path: ${this.pythonScriptPath}`);
      log.info(`TTS: Script exists: ${fs.existsSync(this.pythonScriptPath)}`);

      this.serverProcess = spawn(pythonPath, [this.pythonScriptPath], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      let stdout = '';

      this.serverProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        log.info('TTS server stdout:', output);

        // Check for server ready message
        if (output.includes('Running on')) {
          this.isServerReady = true;
          log.info('TTS server started successfully');
          resolve(true);
        }
      });

      this.serverProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        log.info('TTS server stderr:', output);

        // Flask also logs to stderr
        if (output.includes('Running on')) {
          this.isServerReady = true;
          log.info('TTS server started successfully');
          resolve(true);
        }
      });

      this.serverProcess.on('close', (code) => {
        log.error(`TTS server process exited with code ${code}`);
        log.error(`TTS server stderr: ${stderr}`);
        log.error(`TTS server stdout: ${stdout}`);
        this.isServerReady = false;
        this.serverProcess = null;

        if (!this.isServerReady) {
          reject(new Error(`TTS server failed to start (exit code ${code}): ${stderr || stdout || 'No output'}`));
        }
      });

      this.serverProcess.on('error', (err) => {
        log.error('Failed to spawn TTS server process:', err);
        this.isServerReady = false;
        reject(err);
      });

      // Timeout for server startup
      setTimeout(() => {
        if (!this.isServerReady) {
          this.stopServer();
          reject(new Error('TTS server startup timeout'));
        }
      }, 30000);
    });
  }

  async stopServer(): Promise<void> {
    if (this.serverProcess) {
      log.info('Stopping TTS server...');
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
      this.isServerReady = false;
    }
  }

  async getStatus(): Promise<TTSStatus> {
    if (!this.isServerReady) {
      return {
        running: false,
        device: 'unknown',
        modelLoaded: false,
        currentModel: null,
        currentModelType: null,
        voiceCount: 0,
        supportedLanguages: {},
        presetSpeakers: {},
      };
    }

    try {
      return await this.makeRequest<TTSStatus>('GET', '/status');
    } catch (err) {
      log.error('Failed to get TTS status:', err);
      return {
        running: false,
        device: 'unknown',
        modelLoaded: false,
        currentModel: null,
        currentModelType: null,
        voiceCount: 0,
        supportedLanguages: {},
        presetSpeakers: {},
      };
    }
  }

  getAvailableModels(): TTSModel[] {
    const availableRam = this.hardwareInfo.totalMemoryGB;

    return TTS_MODELS.map((model) => {
      const modelPath = path.join(this.modelsDir, model.id);
      return {
        ...model,
        downloaded: fs.existsSync(modelPath),
        recommended: model.ramRequired <= availableRam * 0.4,
      };
    });
  }

  async downloadModel(
    modelId: string,
    _onProgress?: (progress: number) => void
  ): Promise<boolean> {
    if (!this.isServerReady) {
      throw new Error('TTS server not running. Start the server first.');
    }

    try {
      // Use the server's download endpoint
      const response = await this.makeRequest<{ success: boolean; error?: string }>(
        'POST',
        `/models/${modelId}/download`
      );

      if (!response.success) {
        throw new Error(response.error || 'Download failed');
      }

      return true;
    } catch (err) {
      log.error(`Failed to download model ${modelId}:`, err);
      throw err;
    }
  }

  async loadModel(modelId: string): Promise<boolean> {
    if (!this.isServerReady) {
      throw new Error('TTS server not running. Start the server first.');
    }

    try {
      const response = await this.makeRequest<{ success: boolean; error?: string }>(
        'POST',
        `/models/${modelId}/load`
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to load model');
      }

      return true;
    } catch (err) {
      log.error(`Failed to load model ${modelId}:`, err);
      throw err;
    }
  }

  async deleteModel(modelId: string): Promise<boolean> {
    const modelPath = path.join(this.modelsDir, modelId);

    if (fs.existsSync(modelPath)) {
      // Also call server to unload if loaded
      if (this.isServerReady) {
        try {
          await this.makeRequest('DELETE', `/models/${modelId}/delete`);
        } catch {
          // Ignore server errors, still delete locally
        }
      }

      fs.rmSync(modelPath, { recursive: true, force: true });
      log.info(`Model ${modelId} deleted`);
      return true;
    }

    return false;
  }

  async cloneVoice(
    audioPath: string,
    name: string,
    description: string = '',
    language: string = 'en',
    transcript: string = ''
  ): Promise<VoiceProfile> {
    if (!this.isServerReady) {
      throw new Error('TTS server not running. Start the server first.');
    }

    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    try {
      const response = await this.makeRequest<{ success: boolean; voice?: VoiceProfile; error?: string }>(
        'POST',
        '/voices/clone',
        {
          audioPath,
          name,
          description,
          language,
          transcript,
        }
      );

      if (!response.success || !response.voice) {
        throw new Error(response.error || 'Failed to clone voice');
      }

      return response.voice;
    } catch (err) {
      log.error('Failed to clone voice:', err);
      throw err;
    }
  }

  async listVoices(): Promise<VoiceProfile[]> {
    if (!this.isServerReady) {
      // Return locally stored voices
      const voicesFile = path.join(this.voicesDir, 'voices.json');
      if (fs.existsSync(voicesFile)) {
        try {
          const data = fs.readFileSync(voicesFile, 'utf-8');
          return JSON.parse(data);
        } catch {
          return [];
        }
      }
      return [];
    }

    try {
      return await this.makeRequest<VoiceProfile[]>('GET', '/voices');
    } catch (err) {
      log.error('Failed to list voices:', err);
      return [];
    }
  }

  async deleteVoice(voiceId: string): Promise<boolean> {
    if (!this.isServerReady) {
      throw new Error('TTS server not running. Start the server first.');
    }

    try {
      const response = await this.makeRequest<{ success: boolean }>(
        'DELETE',
        `/voices/${voiceId}`
      );
      return response.success;
    } catch (err) {
      log.error(`Failed to delete voice ${voiceId}:`, err);
      throw err;
    }
  }

  async generateSpeech(
    text: string,
    options: TTSGenerateOptions = {}
  ): Promise<string> {
    if (!this.isServerReady) {
      throw new Error('TTS server not running. Start the server first.');
    }

    try {
      const response = await this.makeRequest<{ success: boolean; outputPath?: string; error?: string }>(
        'POST',
        '/generate',
        {
          text,
          voiceId: options.voiceId,
          speaker: options.speaker || '',
          instruct: options.instruct || '',
          language: options.language || 'English',
          speed: options.speed || 1.0,
          format: options.format || 'wav',
        }
      );

      if (!response.success || !response.outputPath) {
        throw new Error(response.error || 'Failed to generate speech');
      }

      return response.outputPath;
    } catch (err) {
      log.error('Failed to generate speech:', err);
      throw err;
    }
  }

  async getSpeakers(): Promise<{ speakers: Record<string, PresetSpeaker>; available: boolean }> {
    if (!this.isServerReady) {
      return { speakers: {}, available: false };
    }

    try {
      return await this.makeRequest<{ speakers: Record<string, PresetSpeaker>; available: boolean }>(
        'GET',
        '/speakers'
      );
    } catch (err) {
      log.error('Failed to get speakers:', err);
      return { speakers: {}, available: false };
    }
  }

  async getSupportedLanguages(): Promise<Record<string, string>> {
    // Qwen3-TTS uses full language names as keys
    const defaultLanguages: Record<string, string> = {
      'English': 'English',
      'Chinese': 'Chinese',
      'Japanese': 'Japanese',
      'Korean': 'Korean',
      'German': 'German',
      'French': 'French',
      'Russian': 'Russian',
      'Portuguese': 'Portuguese',
      'Spanish': 'Spanish',
      'Italian': 'Italian',
    };

    if (!this.isServerReady) {
      return defaultLanguages;
    }

    try {
      return await this.makeRequest<Record<string, string>>('GET', '/languages');
    } catch {
      return defaultLanguages;
    }
  }

  isRunning(): boolean {
    return this.isServerReady;
  }

  checkPythonAvailable(): { available: boolean; version?: string; error?: string } {
    const pythonPaths = [
      'python3',
      'python',
      '/usr/local/bin/python3',
      '/usr/bin/python3',
      '/opt/homebrew/bin/python3',
    ];

    for (const pythonPath of pythonPaths) {
      try {
        const result = require('child_process').execSync(`${pythonPath} --version`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const match = result.match(/Python (\d+\.\d+\.\d+)/);
        if (match) {
          const version = match[1];
          const [major, minor] = version.split('.').map(Number);
          if (major >= 3 && minor >= 10) {
            return { available: true, version };
          }
        }
      } catch {
        continue;
      }
    }

    return {
      available: false,
      error: 'Python 3.10+ is required. Please install Python from python.org or via Homebrew.',
    };
  }
}
