import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { app } from 'electron';
import log from 'electron-log';

export interface TechnicalScore {
  resolution: number;
  aspect_ratio: number;
  lighting: number;
  blur: number;
  fps: number;
  overall: number;
  details?: {
    actualResolution: string;
    actualFps: number;
    actualAspectRatio: number;
    isVertical: boolean;
  };
}

export interface HookScore {
  first_3_seconds: number;
  movement: number;
  face_detected: boolean;
  scene_changes: number;
  overall: number;
  details?: {
    avgMovement: number;
    framesAnalyzed: number;
  };
}

export interface AudioScore {
  levels: number;
  clarity: number;
  has_audio: boolean;
  is_silent: boolean;
  overall: number;
  details?: {
    avgDb?: number;
    avgRms?: number;
    spectralCentroid?: number;
    error?: string;
  };
}

export interface ContentScore {
  has_captions: boolean;
  has_faces: boolean;
  pacing: number;
  no_watermarks: boolean;
  scene_count: number;
  duration_optimal: boolean;
  overall: number;
  details?: {
    faceSamples: number;
    totalSamples: number;
    scenesPerMin: number;
    duration: number;
  };
}

export interface VideoInfo {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  duration: number;
  aspectRatio: number;
  resolution: string;
}

export interface TikTokScoreResult {
  overallScore: number;
  technical: TechnicalScore;
  hook: HookScore;
  audio: AudioScore;
  content: ContentScore;
  recommendations: string[];
  videoInfo: VideoInfo;
}

const ANALYZER_PORT = 8766;
const ANALYZER_BASE_URL = `http://127.0.0.1:${ANALYZER_PORT}`;

export class VideoAnalyzerService {
  private serverProcess: ChildProcess | null = null;
  private pythonScriptPath: string;
  private isServerReady: boolean = false;

  constructor() {
    // Get Python script path
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    if (isDev) {
      // In development, __dirname is dist/electron, so go up to project root and into electron/python
      this.pythonScriptPath = path.join(__dirname, '..', '..', 'electron', 'python', 'tiktok_score.py');
    } else {
      this.pythonScriptPath = path.join(process.resourcesPath, 'python', 'tiktok_score.py');
    }

    log.info('Video Analyzer service initialized', {
      pythonScriptPath: this.pythonScriptPath,
    });
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    data?: unknown,
    timeout: number = 60000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, ANALYZER_BASE_URL);

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout,
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

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  async startServer(): Promise<boolean> {
    if (this.serverProcess && this.isServerReady) {
      log.info('Video Analyzer server already running');
      return true;
    }

    log.info('Starting Video Analyzer server...');

    // Find Python executable - prefer virtual environment
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    // In development, go from dist/electron up to project root
    const appDir = isDev ? path.join(__dirname, '..', '..') : path.dirname(process.resourcesPath);

    const pythonPaths = [
      // Virtual environment in project directory
      path.join(appDir, '.venv', 'bin', 'python3'),
      path.join(appDir, '.venv', 'bin', 'python'),
      // Virtual environment in app resources
      path.join(process.resourcesPath || '', 'python', 'venv', 'bin', 'python3'),
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
        if (fs.existsSync(p)) {
          const result = require('child_process').execSync(`${p} --version`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          if (result.includes('Python 3')) {
            pythonPath = p;
            log.info(`Using Python from: ${p}`);
            break;
          }
        }
      } catch {
        continue;
      }
    }

    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        ANALYZER_PORT: ANALYZER_PORT.toString(),
      };

      this.serverProcess = spawn(pythonPath, [this.pythonScriptPath], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';

      this.serverProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        log.debug('Video Analyzer stdout:', output);

        if (output.includes('Running on')) {
          this.isServerReady = true;
          log.info('Video Analyzer server started successfully');
          resolve(true);
        }
      });

      this.serverProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
        log.debug('Video Analyzer stderr:', data.toString());

        if (data.toString().includes('Running on')) {
          this.isServerReady = true;
          log.info('Video Analyzer server started successfully');
          resolve(true);
        }
      });

      this.serverProcess.on('close', (code) => {
        log.info(`Video Analyzer server process exited with code ${code}`);
        this.isServerReady = false;
        this.serverProcess = null;

        if (!this.isServerReady) {
          reject(new Error(`Video Analyzer server failed to start: ${stderr}`));
        }
      });

      this.serverProcess.on('error', (err) => {
        log.error('Failed to start Video Analyzer server:', err);
        this.isServerReady = false;
        reject(err);
      });

      // Timeout for server startup
      setTimeout(() => {
        if (!this.isServerReady) {
          this.stopServer();
          reject(new Error('Video Analyzer server startup timeout'));
        }
      }, 30000);
    });
  }

  async stopServer(): Promise<void> {
    if (this.serverProcess) {
      log.info('Stopping Video Analyzer server...');
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
      this.isServerReady = false;
    }
  }

  isRunning(): boolean {
    return this.isServerReady;
  }

  async analyzeVideo(
    videoPath: string,
    onProgress?: (progress: number) => void
  ): Promise<TikTokScoreResult> {
    if (!this.isServerReady) {
      throw new Error('Video Analyzer server not running. Start the server first.');
    }

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    log.info(`Analyzing video: ${videoPath}`);

    try {
      const response = await this.makeRequest<{
        success: boolean;
        result?: TikTokScoreResult;
        error?: string;
      }>(
        'POST',
        '/analyze',
        { videoPath },
        120000 // 2 minute timeout for analysis
      );

      if (!response.success || !response.result) {
        throw new Error(response.error || 'Analysis failed');
      }

      // Calculate overall scores if not provided
      const result = response.result;
      result.technical.overall = Math.round(
        (result.technical.resolution +
          result.technical.aspect_ratio +
          result.technical.lighting +
          result.technical.blur +
          result.technical.fps) /
          5
      );

      result.hook.overall = Math.round(
        (result.hook.first_3_seconds + result.hook.movement) / 2 +
          (result.hook.face_detected ? 10 : 0)
      );

      if (!result.audio.has_audio || result.audio.is_silent) {
        result.audio.overall = 30;
      } else {
        result.audio.overall = Math.round((result.audio.levels + result.audio.clarity) / 2);
      }

      let contentOverall = result.content.pacing;
      if (result.content.has_captions) contentOverall += 15;
      if (result.content.has_faces) contentOverall += 10;
      if (!result.content.no_watermarks) contentOverall -= 30;
      if (result.content.duration_optimal) contentOverall += 5;
      result.content.overall = Math.max(0, Math.min(100, contentOverall));

      if (onProgress) {
        onProgress(100);
      }

      return result;
    } catch (err) {
      log.error('Video analysis failed:', err);
      throw err;
    }
  }

  async quickAnalyze(videoPath: string): Promise<{
    technical: TechnicalScore;
    videoInfo: VideoInfo;
  }> {
    if (!this.isServerReady) {
      throw new Error('Video Analyzer server not running. Start the server first.');
    }

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    try {
      const response = await this.makeRequest<{
        success: boolean;
        result?: {
          technical: TechnicalScore;
          videoInfo: VideoInfo;
        };
        error?: string;
      }>(
        'POST',
        '/analyze/quick',
        { videoPath },
        30000
      );

      if (!response.success || !response.result) {
        throw new Error(response.error || 'Quick analysis failed');
      }

      return response.result;
    } catch (err) {
      log.error('Quick video analysis failed:', err);
      throw err;
    }
  }

  checkDependencies(): { available: boolean; missing: string[] } {
    const missing: string[] = [];

    // Find Python executable - prefer virtual environment (same logic as startServer)
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    const appDir = isDev ? path.join(__dirname, '..', '..') : path.dirname(process.resourcesPath);

    const pythonPaths = [
      // Virtual environment in project directory
      path.join(appDir, '.venv', 'bin', 'python3'),
      path.join(appDir, '.venv', 'bin', 'python'),
      // Virtual environment in app resources
      path.join(process.resourcesPath || '', 'python', 'venv', 'bin', 'python3'),
      // System Python paths
      '/opt/homebrew/bin/python3',
      '/usr/local/bin/python3',
      '/usr/bin/python3',
      'python3',
      'python',
    ];

    let pythonPath: string | null = null;
    for (const p of pythonPaths) {
      try {
        if (fs.existsSync(p) || !p.startsWith('/')) {
          const result = require('child_process').execSync(`${p} --version`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          if (result.includes('Python 3')) {
            pythonPath = p;
            log.info(`checkDependencies: Using Python from: ${p}`);
            break;
          }
        }
      } catch {
        continue;
      }
    }

    if (!pythonPath) {
      missing.push('Python 3.10+');
      return { available: false, missing };
    }

    // Check for required Python packages using the found Python
    const packages = ['cv2', 'numpy', 'flask'];
    for (const pkg of packages) {
      try {
        require('child_process').execSync(
          `"${pythonPath}" -c "import ${pkg}"`,
          { stdio: ['pipe', 'pipe', 'pipe'] }
        );
      } catch {
        missing.push(`Python package: ${pkg}`);
      }
    }

    return {
      available: missing.length === 0,
      missing,
    };
  }

  getInstallInstructions(): string {
    return `TikTok Score requires Python 3.10+ and some packages.

1. Install Python:
   - macOS: brew install python
   - Or download from python.org

2. Install required packages:
   pip3 install opencv-python numpy flask flask-cors librosa scenedetect

3. Restart CrowTerminal Companion`;
  }

  // Static analysis methods that don't require the server

  static getScoreGrade(score: number): { grade: string; color: string; description: string } {
    if (score >= 90) {
      return {
        grade: 'A+',
        color: 'text-green-500',
        description: 'Excellent! Ready for viral potential.',
      };
    } else if (score >= 80) {
      return {
        grade: 'A',
        color: 'text-green-500',
        description: 'Great video! Minor optimizations possible.',
      };
    } else if (score >= 70) {
      return {
        grade: 'B',
        color: 'text-yellow-500',
        description: 'Good foundation. Some improvements needed.',
      };
    } else if (score >= 60) {
      return {
        grade: 'C',
        color: 'text-yellow-500',
        description: 'Average. Several areas need work.',
      };
    } else if (score >= 50) {
      return {
        grade: 'D',
        color: 'text-orange-500',
        description: 'Below average. Significant improvements needed.',
      };
    } else {
      return {
        grade: 'F',
        color: 'text-red-500',
        description: 'Poor. Major issues affecting reach potential.',
      };
    }
  }

  static getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      technical: 'settings',
      hook: 'zap',
      audio: 'volume-2',
      content: 'film',
    };
    return icons[category] || 'circle';
  }

  static formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
