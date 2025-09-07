import { EventEmitter } from 'events';
import { LLMRequest, LLMResponse } from './llm-client.js';

interface QueuedRequest {
  id: string;
  request: LLMRequest;
  priority: number;
  timestamp: number;
  retries: number;
  callback: {
    resolve: (response: LLMResponse) => void;
    reject: (error: any) => void;
  };
}

interface QueueConfig {
  maxConcurrent: number;
  maxQueueSize: number;
  requestTimeout: number;
  priorityLevels: {
    HIGH: number;
    NORMAL: number;
    LOW: number;
  };
}

export class RequestQueue extends EventEmitter {
  private queue: QueuedRequest[] = [];
  private processing: Map<string, QueuedRequest> = new Map();
  private config: QueueConfig;
  private requestStats = {
    total: 0,
    completed: 0,
    failed: 0,
    avgProcessingTime: 0
  };

  constructor(config?: Partial<QueueConfig>) {
    super();
    
    this.config = {
      maxConcurrent: 3,
      maxQueueSize: 100,
      requestTimeout: 120000, // 2 minutes
      priorityLevels: {
        HIGH: 0,
        NORMAL: 1,
        LOW: 2
      },
      ...config
    };
  }

  async enqueue(
    request: LLMRequest,
    priority: number = this.config.priorityLevels.NORMAL
  ): Promise<LLMResponse> {
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error('Request queue is full. Please try again later.');
    }

    const requestId = this.generateRequestId();
    
    return new Promise((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: requestId,
        request,
        priority,
        timestamp: Date.now(),
        retries: 0,
        callback: { resolve, reject }
      };

      this.queue.push(queuedRequest);
      this.sortQueue();
      
      this.emit('request-queued', {
        id: requestId,
        queueLength: this.queue.length,
        priority
      });

      this.processNext();
    });
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // First sort by priority
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Then by timestamp (FIFO within same priority)
      return a.timestamp - b.timestamp;
    });
  }

  private async processNext(): Promise<void> {
    // Check if we can process more requests
    if (this.processing.size >= this.config.maxConcurrent) {
      return;
    }

    // Get next request from queue
    const next = this.queue.shift();
    if (!next) {
      return;
    }

    // Add to processing
    this.processing.set(next.id, next);
    
    this.emit('request-processing', {
      id: next.id,
      queueLength: this.queue.length,
      concurrent: this.processing.size
    });

    try {
      // Set timeout for request
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Request timeout'));
        }, this.config.requestTimeout);
      });

      // Process request (this would call the actual LLM)
      const processingPromise = this.processRequest(next);
      
      const response = await Promise.race([
        processingPromise,
        timeoutPromise
      ]);

      // Success
      this.processing.delete(next.id);
      next.callback.resolve(response);
      
      this.recordSuccess(next);
      
      this.emit('request-completed', {
        id: next.id,
        duration: Date.now() - next.timestamp
      });

    } catch (error) {
      // Handle failure
      this.processing.delete(next.id);
      
      if (this.shouldRetry(next, error)) {
        // Re-queue with increased priority
        next.retries++;
        next.priority = Math.max(0, next.priority - 0.5);
        this.queue.push(next);
        this.sortQueue();
        
        this.emit('request-retry', {
          id: next.id,
          retries: next.retries,
          error
        });
      } else {
        // Final failure
        next.callback.reject(error);
        this.recordFailure(next);
        
        this.emit('request-failed', {
          id: next.id,
          error,
          retries: next.retries
        });
      }
    }

    // Process next request
    this.processNext();
  }

  private async processRequest(request: QueuedRequest): Promise<LLMResponse> {
    // This is where you'd actually call the LLM
    // For now, simulating with a delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      id: request.id,
      choices: [{
        message: { role: 'assistant', content: 'Simulated response' },
        finish_reason: 'stop'
      }]
    };
  }

  private shouldRetry(request: QueuedRequest, error: any): boolean {
    // Don't retry validation errors
    if (error.response?.status >= 400 && error.response?.status < 500) {
      return false;
    }

    // Retry up to 3 times
    return request.retries < 3;
  }

  private recordSuccess(request: QueuedRequest): void {
    this.requestStats.total++;
    this.requestStats.completed++;
    
    // Update average processing time
    const processingTime = Date.now() - request.timestamp;
    this.requestStats.avgProcessingTime = 
      (this.requestStats.avgProcessingTime * (this.requestStats.completed - 1) + processingTime) / 
      this.requestStats.completed;
  }

  private recordFailure(request: QueuedRequest): void {
    this.requestStats.total++;
    this.requestStats.failed++;
  }

  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing.size,
      stats: { ...this.requestStats }
    };
  }

  clearQueue(): void {
    // Reject all queued requests
    this.queue.forEach(req => {
      req.callback.reject(new Error('Queue cleared'));
    });
    
    this.queue = [];
    this.emit('queue-cleared');
  }

  updateConfig(config: Partial<QueueConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Get estimated wait time for a new request
  getEstimatedWaitTime(priority: number = this.config.priorityLevels.NORMAL): number {
    const higherPriorityCount = this.queue.filter(r => r.priority <= priority).length;
    const currentlyProcessing = this.processing.size;
    
    const estimatedRequestsAhead = higherPriorityCount + 
      (currentlyProcessing * 0.5); // Assume half of current will finish soon
    
    return estimatedRequestsAhead * this.requestStats.avgProcessingTime;
  }

  // Priority management
  promoteToPriority(requestId: string, newPriority: number): boolean {
    const request = this.queue.find(r => r.id === requestId);
    if (!request) {
      return false;
    }

    request.priority = newPriority;
    this.sortQueue();
    return true;
  }

  // Cancel a specific request
  cancel(requestId: string): boolean {
    const index = this.queue.findIndex(r => r.id === requestId);
    if (index !== -1) {
      const [request] = this.queue.splice(index, 1);
      request.callback.reject(new Error('Request cancelled'));
      return true;
    }

    const processing = this.processing.get(requestId);
    if (processing) {
      processing.callback.reject(new Error('Request cancelled'));
      this.processing.delete(requestId);
      return true;
    }

    return false;
  }
}