import axios, { AxiosInstance, AxiosError } from 'axios';
import LRUCache from 'lru-cache';
import crypto from 'crypto';
import { EventEmitter } from 'events';

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableStatusCodes: number[];
  jitterFactor: number;
}

interface CacheConfig {
  enabled: boolean;
  maxSize: number;
  ttl: number; // milliseconds
}

interface CircuitBreakerConfig {
  enabled: boolean;
  errorThreshold: number;
  resetTimeout: number;
  halfOpenRequests: number;
}

export interface LLMRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface LLMResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export class LLMClient extends EventEmitter {
  private client: AxiosInstance;
  private cache: LRUCache<string, LLMResponse>;
  private retryConfig: RetryConfig;
  private circuitBreaker: {
    state: CircuitBreakerState;
    failures: number;
    lastFailureTime: number;
    halfOpenAttempts: number;
  };
  private circuitBreakerConfig: CircuitBreakerConfig;
  private requestMetrics: Map<string, number> = new Map();

  constructor(
    baseURL: string = 'http://localhost:1234/v1',
    private cacheConfig: CacheConfig = {
      enabled: true,
      maxSize: 1000,
      ttl: 3600000 // 1 hour
    }
  ) {
    super();
    
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 120000, // 2 minutes
    });

    // Initialize cache
    this.cache = new LRUCache<string, LLMResponse>({
      max: cacheConfig.maxSize,
      ttl: cacheConfig.ttl,
      updateAgeOnGet: true
    });

    // Retry configuration
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      jitterFactor: 0.2
    };

    // Circuit breaker configuration
    this.circuitBreakerConfig = {
      enabled: true,
      errorThreshold: 5,
      resetTimeout: 60000, // 1 minute
      halfOpenRequests: 3
    };

    this.circuitBreaker = {
      state: CircuitBreakerState.CLOSED,
      failures: 0,
      lastFailureTime: 0,
      halfOpenAttempts: 0
    };

    // Setup request/response interceptors
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        const requestId = crypto.randomUUID();
        config.headers['X-Request-ID'] = requestId;
        this.emit('request', { requestId, config });
        return config;
      },
      (error) => {
        this.emit('request-error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        const requestId = response.config.headers['X-Request-ID'];
        this.emit('response', { requestId, response });
        return response;
      },
      (error) => {
        const requestId = error.config?.headers?.['X-Request-ID'];
        this.emit('response-error', { requestId, error });
        return Promise.reject(error);
      }
    );
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    // Check circuit breaker
    if (!this.canMakeRequest()) {
      throw new Error('Circuit breaker is OPEN. Service temporarily unavailable.');
    }

    // Check cache
    const cacheKey = this.getCacheKey(request);
    if (this.cacheConfig.enabled && !request.stream) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.emit('cache-hit', { cacheKey });
        return cached;
      }
    }

    // Make request with retry logic
    try {
      const response = await this.executeWithRetry(request);
      
      // Cache successful response
      if (this.cacheConfig.enabled && !request.stream) {
        this.cache.set(cacheKey, response);
      }

      // Reset circuit breaker on success
      this.onRequestSuccess();
      
      return response;
    } catch (error) {
      this.onRequestFailure();
      throw error;
    }
  }

  private async executeWithRetry(request: LLMRequest): Promise<LLMResponse> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const response = await this.client.post('/chat/completions', request);
        
        // Track metrics
        const duration = Date.now() - startTime;
        this.trackMetric('request_duration', duration);
        
        return response.data;
      } catch (error) {
        lastError = error;
        
        if (!this.shouldRetry(error, attempt)) {
          break;
        }

        const delay = this.calculateDelay(attempt);
        this.emit('retry', { attempt, delay, error });
        
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private shouldRetry(error: any, attempt: number): boolean {
    if (attempt >= this.retryConfig.maxRetries) {
      return false;
    }

    if (error.response) {
      return this.retryConfig.retryableStatusCodes.includes(error.response.status);
    }

    // Network errors are retryable
    return error.code === 'ECONNREFUSED' || 
           error.code === 'ETIMEDOUT' ||
           error.code === 'ENOTFOUND';
  }

  private calculateDelay(attempt: number): number {
    // Exponential backoff with jitter
    const exponentialDelay = Math.min(
      this.retryConfig.baseDelay * Math.pow(2, attempt),
      this.retryConfig.maxDelay
    );

    // Add jitter to prevent thundering herd
    const jitter = exponentialDelay * this.retryConfig.jitterFactor * Math.random();
    
    return Math.floor(exponentialDelay + jitter);
  }

  private canMakeRequest(): boolean {
    if (!this.circuitBreakerConfig.enabled) {
      return true;
    }

    const now = Date.now();

    switch (this.circuitBreaker.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        // Check if we should transition to half-open
        if (now - this.circuitBreaker.lastFailureTime >= this.circuitBreakerConfig.resetTimeout) {
          this.circuitBreaker.state = CircuitBreakerState.HALF_OPEN;
          this.circuitBreaker.halfOpenAttempts = 0;
          this.emit('circuit-breaker-state', CircuitBreakerState.HALF_OPEN);
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        return this.circuitBreaker.halfOpenAttempts < this.circuitBreakerConfig.halfOpenRequests;
    }
  }

  private onRequestSuccess(): void {
    if (this.circuitBreaker.state === CircuitBreakerState.HALF_OPEN) {
      this.circuitBreaker.state = CircuitBreakerState.CLOSED;
      this.circuitBreaker.failures = 0;
      this.emit('circuit-breaker-state', CircuitBreakerState.CLOSED);
    }
  }

  private onRequestFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.state === CircuitBreakerState.HALF_OPEN) {
      this.circuitBreaker.halfOpenAttempts++;
    }

    if (this.circuitBreaker.failures >= this.circuitBreakerConfig.errorThreshold) {
      this.circuitBreaker.state = CircuitBreakerState.OPEN;
      this.emit('circuit-breaker-state', CircuitBreakerState.OPEN);
    }
  }

  private getCacheKey(request: LLMRequest): string {
    const keyData = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature || 0.7,
      max_tokens: request.max_tokens || 1000
    };
    
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(keyData))
      .digest('hex');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private trackMetric(name: string, value: number): void {
    const current = this.requestMetrics.get(name) || 0;
    this.requestMetrics.set(name, current + value);
  }

  // Public methods for monitoring
  getCacheStats() {
    return {
      size: this.cache.size,
      capacity: this.cache.max
    };
  }

  getCircuitBreakerState() {
    return {
      state: this.circuitBreaker.state,
      failures: this.circuitBreaker.failures
    };
  }

  getMetrics() {
    return Object.fromEntries(this.requestMetrics);
  }

  clearCache(): void {
    this.cache.clear();
  }

  updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  updateCircuitBreakerConfig(config: Partial<CircuitBreakerConfig>): void {
    this.circuitBreakerConfig = { ...this.circuitBreakerConfig, ...config };
  }
}