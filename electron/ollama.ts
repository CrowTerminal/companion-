import http from 'http';
import log from 'electron-log';

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  details?: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaModelInfo {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  description: string;
  ramRequired: number;
  downloaded: boolean;
  recommended: boolean;
  bestFor: string;
}

export interface OllamaStatus {
  running: boolean;
  version?: string;
  models: OllamaModel[];
}

export interface OllamaGenerateOptions {
  model: string;
  prompt: string;
  system?: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  };
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

const OLLAMA_PORT = 11434;
const OLLAMA_BASE_URL = `http://127.0.0.1:${OLLAMA_PORT}`;

// Recommended models for content creators
const RECOMMENDED_MODELS: Omit<OllamaModelInfo, 'downloaded'>[] = [
  {
    id: 'llama3.2:1b',
    name: 'Llama 3.2 1B',
    size: '1.3 GB',
    sizeBytes: 1.3 * 1024 * 1024 * 1024,
    description: 'Fast and lightweight. Great for quick suggestions.',
    ramRequired: 4,
    recommended: true,
    bestFor: 'Hashtags, quick captions',
  },
  {
    id: 'llama3.2:3b',
    name: 'Llama 3.2 3B',
    size: '2.0 GB',
    sizeBytes: 2.0 * 1024 * 1024 * 1024,
    description: 'Balanced speed and quality. Good for most tasks.',
    ramRequired: 6,
    recommended: true,
    bestFor: 'Content analysis, scripting',
  },
  {
    id: 'qwen2.5:7b',
    name: 'Qwen 2.5 7B',
    size: '4.7 GB',
    sizeBytes: 4.7 * 1024 * 1024 * 1024,
    description: 'Excellent multilingual support. Detailed analysis.',
    ramRequired: 10,
    recommended: false,
    bestFor: 'Multilingual content, detailed analysis',
  },
  {
    id: 'llava:7b',
    name: 'LLaVA 7B',
    size: '4.7 GB',
    sizeBytes: 4.7 * 1024 * 1024 * 1024,
    description: 'Vision model. Can analyze images and video frames.',
    ramRequired: 10,
    recommended: false,
    bestFor: 'Video frame analysis, thumbnail ideas',
  },
  {
    id: 'qwen2.5-vl:7b',
    name: 'Qwen 2.5-VL 7B',
    size: '5.0 GB',
    sizeBytes: 5.0 * 1024 * 1024 * 1024,
    description: 'Advanced vision model with multilingual support.',
    ramRequired: 12,
    recommended: false,
    bestFor: 'Video analysis, multilingual vision tasks',
  },
];

export class OllamaService {
  private availableRam: number;

  constructor(availableRam: number = 16) {
    this.availableRam = availableRam;
    log.info('Ollama service initialized', { availableRam });
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    data?: unknown,
    timeout: number = 30000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, OLLAMA_BASE_URL);

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
            resolve(body as unknown as T);
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

  async checkStatus(): Promise<OllamaStatus> {
    try {
      // Check if Ollama is running
      const response = await this.makeRequest<{ version?: string }>('GET', '/api/version', undefined, 5000);
      const models = await this.listModels();

      return {
        running: true,
        version: response.version,
        models,
      };
    } catch (err) {
      log.debug('Ollama not running:', err);
      return {
        running: false,
        models: [],
      };
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await this.makeRequest<{ models: OllamaModel[] }>('GET', '/api/tags');
      return response.models || [];
    } catch (err) {
      log.error('Failed to list Ollama models:', err);
      return [];
    }
  }

  getRecommendedModels(): OllamaModelInfo[] {
    return RECOMMENDED_MODELS.map((model) => ({
      ...model,
      downloaded: false, // Will be updated when checking status
      recommended: model.ramRequired <= this.availableRam * 0.5,
    }));
  }

  async getAvailableModels(): Promise<OllamaModelInfo[]> {
    const installedModels = await this.listModels();
    const installedNames = new Set(installedModels.map((m) => m.name));

    return RECOMMENDED_MODELS.map((model) => ({
      ...model,
      downloaded: installedNames.has(model.id),
      recommended: model.ramRequired <= this.availableRam * 0.5,
    }));
  }

  async pullModel(
    modelName: string,
    onProgress?: (progress: { status: string; completed?: number; total?: number }) => void
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const url = new URL('/api/pull', OLLAMA_BASE_URL);

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      };

      const req = http.request(options, (res) => {
        let buffer = '';

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();

          // Process each line (streaming JSON responses)
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);

                if (onProgress) {
                  onProgress({
                    status: data.status || 'downloading',
                    completed: data.completed,
                    total: data.total,
                  });
                }

                if (data.status === 'success') {
                  resolve(true);
                  return;
                }

                if (data.error) {
                  reject(new Error(data.error));
                  return;
                }
              } catch {
                // Ignore parse errors for incomplete lines
              }
            }
          }
        });

        res.on('end', () => {
          // Process any remaining data
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer);
              if (data.status === 'success') {
                resolve(true);
              } else if (data.error) {
                reject(new Error(data.error));
              } else {
                resolve(true);
              }
            } catch {
              resolve(true); // Assume success if no error
            }
          } else {
            resolve(true);
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(JSON.stringify({ name: modelName }));
      req.end();
    });
  }

  async deleteModel(modelName: string): Promise<boolean> {
    try {
      await this.makeRequest('DELETE', '/api/delete', { name: modelName });
      log.info(`Model ${modelName} deleted`);
      return true;
    } catch (err) {
      log.error(`Failed to delete model ${modelName}:`, err);
      throw err;
    }
  }

  async generate(options: OllamaGenerateOptions): Promise<string> {
    try {
      const response = await this.makeRequest<OllamaGenerateResponse>(
        'POST',
        '/api/generate',
        {
          ...options,
          stream: false,
        },
        120000 // 2 minute timeout for generation
      );

      return response.response;
    } catch (err) {
      log.error('Failed to generate:', err);
      throw err;
    }
  }

  async generateStream(
    options: OllamaGenerateOptions,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL('/api/generate', OLLAMA_BASE_URL);

      const reqOptions: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      };

      let fullResponse = '';

      const req = http.request(reqOptions, (res) => {
        let buffer = '';

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line) as OllamaGenerateResponse;

                if (data.response) {
                  fullResponse += data.response;
                  onChunk(data.response);
                }

                if (data.done) {
                  resolve(fullResponse);
                  return;
                }

                if ('error' in data && typeof (data as unknown as { error: string }).error === 'string') {
                  reject(new Error((data as unknown as { error: string }).error));
                  return;
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        });

        res.on('end', () => {
          resolve(fullResponse);
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(
        JSON.stringify({
          ...options,
          stream: true,
        })
      );
      req.end();
    });
  }

  // Content Analysis Methods

  async suggestHashtags(
    niche: string,
    platform: 'tiktok' | 'instagram' | 'youtube' = 'tiktok',
    model: string = 'llama3.2:1b'
  ): Promise<string[]> {
    const prompt = `Generate 15 trending and relevant hashtags for a ${niche} content creator on ${platform}.

Rules:
- Mix popular and niche-specific hashtags
- Include some trending hashtags
- Format: one hashtag per line, starting with #
- No explanations, just hashtags

Hashtags:`;

    const response = await this.generate({
      model,
      prompt,
      options: {
        temperature: 0.7,
        num_predict: 200,
      },
    });

    // Parse hashtags from response
    const hashtags = response
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('#'))
      .map((tag) => tag.split(' ')[0]) // Take only the hashtag part
      .slice(0, 15);

    return hashtags;
  }

  async analyzeScript(
    script: string,
    model: string = 'llama3.2:3b'
  ): Promise<{ score: number; feedback: string[]; suggestions: string[] }> {
    const prompt = `Analyze this social media video script for engagement potential:

"${script}"

Provide:
1. Engagement Score (0-100)
2. 3 specific feedback points
3. 3 improvement suggestions

Format your response as JSON:
{
  "score": <number>,
  "feedback": ["point 1", "point 2", "point 3"],
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
}`;

    const response = await this.generate({
      model,
      prompt,
      options: {
        temperature: 0.3,
        num_predict: 500,
      },
    });

    try {
      // Try to parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback if JSON parsing fails
    }

    return {
      score: 70,
      feedback: ['Script analysis completed', 'Consider adding more hooks', 'Good content foundation'],
      suggestions: ['Add a stronger opening', 'Include a call to action', 'Vary sentence length'],
    };
  }

  async generateCaptions(
    videoTitle: string,
    style: 'casual' | 'professional' | 'funny' | 'inspirational' = 'casual',
    model: string = 'llama3.2:3b'
  ): Promise<string[]> {
    const styleGuides = {
      casual: 'friendly and relatable, using casual language and emojis',
      professional: 'polished and informative, maintaining a professional tone',
      funny: 'humorous and witty, using jokes and playful language',
      inspirational: 'motivating and uplifting, with powerful calls to action',
    };

    const prompt = `Generate 5 engaging social media captions for a video titled: "${videoTitle}"

Style: ${styleGuides[style]}

Rules:
- Each caption should be unique
- Include relevant emojis
- Keep under 150 characters each
- Include a subtle call to action

Captions:`;

    const response = await this.generate({
      model,
      prompt,
      options: {
        temperature: 0.8,
        num_predict: 500,
      },
    });

    // Parse captions (numbered list or line-separated)
    const captions = response
      .split('\n')
      .map((line) => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter((line) => line.length > 10 && line.length < 200)
      .slice(0, 5);

    return captions.length > 0 ? captions : ['Check out this video!'];
  }

  async generateThumbnailIdeas(
    videoTitle: string,
    model: string = 'llama3.2:3b'
  ): Promise<string[]> {
    const prompt = `Generate 5 creative thumbnail ideas for a video titled: "${videoTitle}"

For each idea, describe:
- Main visual element
- Text overlay (if any)
- Color scheme
- Emotional hook

Keep each description to 2-3 sentences.

Thumbnail Ideas:`;

    const response = await this.generate({
      model,
      prompt,
      options: {
        temperature: 0.8,
        num_predict: 600,
      },
    });

    const ideas = response
      .split(/\d+[\.\)]/g)
      .map((idea) => idea.trim())
      .filter((idea) => idea.length > 20)
      .slice(0, 5);

    return ideas;
  }

  async describeImage(
    imagePath: string,
    prompt: string = 'Describe this image in detail.',
    model: string = 'llava:7b'
  ): Promise<string> {
    // Note: This requires a vision model like llava or qwen2.5-vl
    // The image needs to be base64 encoded
    const fs = require('fs');
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const response = await this.makeRequest<OllamaGenerateResponse>(
      'POST',
      '/api/generate',
      {
        model,
        prompt,
        images: [base64Image],
        stream: false,
      },
      120000
    );

    return response.response;
  }

  getInstallInstructions(): string {
    const platform = process.platform;

    if (platform === 'darwin') {
      return `Ollama is not installed. To install:

1. Visit https://ollama.ai
2. Download Ollama for Mac
3. Install and run the application
4. Restart CrowTerminal Companion

Or install via Homebrew:
brew install ollama`;
    } else if (platform === 'win32') {
      return `Ollama is not installed. To install:

1. Visit https://ollama.ai
2. Download Ollama for Windows
3. Run the installer
4. Restart CrowTerminal Companion`;
    } else {
      return `Ollama is not installed. To install:

curl -fsSL https://ollama.ai/install.sh | sh

Then restart CrowTerminal Companion.`;
    }
  }
}
