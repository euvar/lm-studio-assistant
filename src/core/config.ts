import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface Config {
  lmStudio: {
    url: string;
    defaultModel?: string;
    temperature: number;
    maxTokens: number;
  };
  ui: {
    theme: 'default' | 'minimal' | 'verbose';
    showTimestamps: boolean;
    autoLoadHistory: boolean;
    historyLimit: number;
    streamingEnabled?: boolean;
    showToolDetails?: boolean;
    compactOutput?: boolean;
  };
  tools: {
    webSearch: {
      enabled: boolean;
      maxResults: number;
    };
    bash: {
      enabled: boolean;
      timeout: number;
      safeMode: boolean;
    };
  };
}

export const DEFAULT_CONFIG: Config = {
  lmStudio: {
    url: 'http://localhost:1234/v1',
    temperature: 0.7,
    maxTokens: 2000,
  },
  ui: {
    theme: 'default',
    showTimestamps: false,
    autoLoadHistory: false,
    historyLimit: 50,
    streamingEnabled: true,
    showToolDetails: false,
    compactOutput: true,
  },
  tools: {
    webSearch: {
      enabled: true,
      maxResults: 5,
    },
    bash: {
      enabled: true,
      timeout: 30000,
      safeMode: true,
    },
  },
};

export class ConfigManager {
  private configPath: string;
  private config: Config;

  constructor() {
    this.configPath = path.join(os.homedir(), '.lm-assistant', 'config.json');
    this.config = { ...DEFAULT_CONFIG };
  }

  async load(): Promise<void> {
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      const data = await fs.readFile(this.configPath, 'utf-8');
      const loadedConfig = JSON.parse(data);
      
      // Merge with defaults to ensure all fields exist
      this.config = this.deepMerge(DEFAULT_CONFIG, loadedConfig);
    } catch (error) {
      // If file doesn't exist or is invalid, use defaults
      await this.save();
    }
  }

  async save(): Promise<void> {
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      await fs.writeFile(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  get(): Config {
    return { ...this.config };
  }

  set(updates: Partial<Config>): void {
    this.config = this.deepMerge(this.config, updates);
  }

  async update(updates: Partial<Config>): Promise<void> {
    this.set(updates);
    await this.save();
  }

  getConfigPath(): string {
    return this.configPath;
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] instanceof Object && key in target) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
}