import { LMStudioProvider } from '../providers/lmstudio.js';
import { LLMClient, LLMRequest, LLMResponse } from './llm-client.js';
import { EventEmitter } from 'events';

interface ModelConfig {
  name: string;
  priority: number;
  capabilities: string[];
  costPerToken: number;
  maxTokens: number;
  endpoint?: string;
}

interface RoutingStrategy {
  type: 'cost' | 'performance' | 'capability' | 'round-robin';
  fallbackEnabled: boolean;
}

export class LLMRouter extends EventEmitter {
  private models: Map<string, ModelConfig> = new Map();
  private clients: Map<string, LLMClient> = new Map();
  private currentModelIndex: number = 0;
  private requestHistory: Map<string, { model: string; success: boolean; latency: number }[]> = new Map();

  constructor(private strategy: RoutingStrategy = { type: 'capability', fallbackEnabled: true }) {
    super();
    this.initializeModels();
  }

  private initializeModels(): void {
    // Default model configurations
    const defaultModels: ModelConfig[] = [
      {
        name: 'primary-large',
        priority: 1,
        capabilities: ['complex-reasoning', 'code-generation', 'analysis'],
        costPerToken: 0.002,
        maxTokens: 8192,
        endpoint: 'http://localhost:1234/v1'
      },
      {
        name: 'secondary-medium',
        priority: 2,
        capabilities: ['general-chat', 'simple-tasks'],
        costPerToken: 0.001,
        maxTokens: 4096,
        endpoint: 'http://localhost:1235/v1'
      },
      {
        name: 'fallback-small',
        priority: 3,
        capabilities: ['basic-responses'],
        costPerToken: 0.0005,
        maxTokens: 2048,
        endpoint: 'http://localhost:1236/v1'
      }
    ];

    defaultModels.forEach(model => {
      this.models.set(model.name, model);
      this.clients.set(model.name, new LLMClient(model.endpoint));
    });
  }

  async route(request: LLMRequest, requiredCapabilities?: string[]): Promise<LLMResponse> {
    const selectedModel = this.selectModel(request, requiredCapabilities);
    
    if (!selectedModel) {
      throw new Error('No suitable model available for request');
    }

    this.emit('routing-decision', { 
      model: selectedModel.name, 
      strategy: this.strategy.type 
    });

    try {
      return await this.executeWithFallback(request, selectedModel);
    } catch (error) {
      this.emit('routing-error', { model: selectedModel.name, error });
      throw error;
    }
  }

  private selectModel(request: LLMRequest, requiredCapabilities?: string[]): ModelConfig | null {
    const availableModels = Array.from(this.models.values())
      .filter(model => this.isModelSuitable(model, requiredCapabilities))
      .sort((a, b) => a.priority - b.priority);

    if (availableModels.length === 0) {
      return null;
    }

    switch (this.strategy.type) {
      case 'cost':
        return this.selectByCost(availableModels, request);
      
      case 'performance':
        return this.selectByPerformance(availableModels);
      
      case 'capability':
        return this.selectByCapability(availableModels, requiredCapabilities);
      
      case 'round-robin':
        return this.selectRoundRobin(availableModels);
      
      default:
        return availableModels[0];
    }
  }

  private isModelSuitable(model: ModelConfig, requiredCapabilities?: string[]): boolean {
    if (!requiredCapabilities || requiredCapabilities.length === 0) {
      return true;
    }

    return requiredCapabilities.every(cap => 
      model.capabilities.includes(cap)
    );
  }

  private selectByCost(models: ModelConfig[], request: LLMRequest): ModelConfig {
    // Estimate token count (rough approximation)
    const estimatedTokens = JSON.stringify(request.messages).length / 4;
    
    // Select cheapest model that can handle the request
    return models
      .filter(m => m.maxTokens >= estimatedTokens)
      .sort((a, b) => a.costPerToken - b.costPerToken)[0] || models[0];
  }

  private selectByPerformance(models: ModelConfig[]): ModelConfig {
    // Select based on historical performance
    let bestModel = models[0];
    let bestLatency = Infinity;

    models.forEach(model => {
      const history = this.requestHistory.get(model.name) || [];
      if (history.length > 0) {
        const avgLatency = history
          .filter(h => h.success)
          .reduce((sum, h) => sum + h.latency, 0) / history.length;
        
        if (avgLatency < bestLatency) {
          bestLatency = avgLatency;
          bestModel = model;
        }
      }
    });

    return bestModel;
  }

  private selectByCapability(models: ModelConfig[], requiredCapabilities?: string[]): ModelConfig {
    if (!requiredCapabilities || requiredCapabilities.length === 0) {
      return models[0];
    }

    // Score models based on capability match
    const scored = models.map(model => {
      const matchCount = requiredCapabilities.filter(cap => 
        model.capabilities.includes(cap)
      ).length;
      
      return { model, score: matchCount };
    });

    // Return model with best capability match
    return scored.sort((a, b) => b.score - a.score)[0].model;
  }

  private selectRoundRobin(models: ModelConfig[]): ModelConfig {
    const model = models[this.currentModelIndex % models.length];
    this.currentModelIndex++;
    return model;
  }

  private async executeWithFallback(
    request: LLMRequest, 
    primaryModel: ModelConfig
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const modelsToTry = this.strategy.fallbackEnabled 
      ? this.getModelChain(primaryModel)
      : [primaryModel];

    let lastError: any;

    for (const model of modelsToTry) {
      const client = this.clients.get(model.name);
      if (!client) continue;

      try {
        this.emit('model-attempt', { model: model.name });
        
        const response = await client.chat({
          ...request,
          model: model.name
        });

        // Record success
        this.recordRequest(model.name, true, Date.now() - startTime);
        
        return response;
      } catch (error) {
        lastError = error;
        
        // Record failure
        this.recordRequest(model.name, false, Date.now() - startTime);
        
        this.emit('model-failure', { 
          model: model.name, 
          error,
          willRetry: modelsToTry.indexOf(model) < modelsToTry.length - 1
        });

        // Don't fallback for client errors (4xx)
        const axiosError = error as any;
        if (axiosError.response?.status >= 400 && axiosError.response?.status < 500) {
          throw error;
        }
      }
    }

    throw lastError || new Error('All models failed');
  }

  private getModelChain(primaryModel: ModelConfig): ModelConfig[] {
    return Array.from(this.models.values())
      .filter(m => m.priority >= primaryModel.priority)
      .sort((a, b) => a.priority - b.priority);
  }

  private recordRequest(modelName: string, success: boolean, latency: number): void {
    const history = this.requestHistory.get(modelName) || [];
    history.push({ model: modelName, success, latency });
    
    // Keep only last 100 requests
    if (history.length > 100) {
      history.shift();
    }
    
    this.requestHistory.set(modelName, history);
  }

  // Public methods for management
  addModel(config: ModelConfig): void {
    this.models.set(config.name, config);
    this.clients.set(config.name, new LLMClient(config.endpoint));
  }

  removeModel(name: string): void {
    this.models.delete(name);
    this.clients.delete(name);
  }

  updateStrategy(strategy: RoutingStrategy): void {
    this.strategy = strategy;
  }

  getModelStats(modelName?: string): any {
    if (modelName) {
      const history = this.requestHistory.get(modelName) || [];
      const successful = history.filter(h => h.success);
      
      return {
        totalRequests: history.length,
        successRate: successful.length / history.length,
        averageLatency: successful.reduce((sum, h) => sum + h.latency, 0) / successful.length || 0
      };
    }

    // Return stats for all models
    const allStats: any = {};
    this.models.forEach((_, name) => {
      allStats[name] = this.getModelStats(name);
    });
    
    return allStats;
  }

  async healthCheck(): Promise<Map<string, boolean>> {
    const health = new Map<string, boolean>();
    
    for (const [name, client] of this.clients.entries()) {
      try {
        await client.chat({
          model: name,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5
        });
        health.set(name, true);
      } catch {
        health.set(name, false);
      }
    }
    
    return health;
  }
}