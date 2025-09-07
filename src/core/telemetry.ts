import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface TelemetryEvent {
  id: string;
  timestamp: number;
  type: string;
  data: any;
  sessionId: string;
  userId?: string;
  environment: string;
}

interface MetricsSnapshot {
  timestamp: number;
  cpu: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  requests: {
    total: number;
    success: number;
    failed: number;
    avgLatency: number;
  };
  models: Record<string, {
    requests: number;
    avgLatency: number;
    errorRate: number;
  }>;
}

export class TelemetryService extends EventEmitter {
  private events: TelemetryEvent[] = [];
  private metrics: MetricsSnapshot[] = [];
  private sessionId: string;
  private userId?: string;
  private environment: string;
  private metricsInterval?: NodeJS.Timeout;
  private flushInterval?: NodeJS.Timeout;
  private logPath: string;

  constructor(config?: {
    userId?: string;
    environment?: string;
    logPath?: string;
    enableAutoFlush?: boolean;
    flushIntervalMs?: number;
    enableMetricsCollection?: boolean;
    metricsIntervalMs?: number;
  }) {
    super();
    
    this.sessionId = uuidv4();
    this.userId = config?.userId;
    this.environment = config?.environment || process.env.NODE_ENV || 'development';
    this.logPath = config?.logPath || './.lm-assistant/telemetry';

    // Start auto-flush if enabled
    if (config?.enableAutoFlush !== false) {
      this.startAutoFlush(config?.flushIntervalMs || 30000); // 30 seconds
    }

    // Start metrics collection if enabled
    if (config?.enableMetricsCollection !== false) {
      this.startMetricsCollection(config?.metricsIntervalMs || 60000); // 1 minute
    }
  }

  // Core telemetry methods
  track(type: string, data: any): void {
    const event: TelemetryEvent = {
      id: uuidv4(),
      timestamp: Date.now(),
      type,
      data,
      sessionId: this.sessionId,
      userId: this.userId,
      environment: this.environment
    };

    this.events.push(event);
    this.emit('event', event);

    // Keep only last 10000 events in memory
    if (this.events.length > 10000) {
      this.events = this.events.slice(-5000);
    }
  }

  // Specific tracking methods
  trackRequest(data: {
    requestId: string;
    model: string;
    intent: string;
    complexity: number;
    cached: boolean;
  }): void {
    this.track('request', data);
  }

  trackResponse(data: {
    requestId: string;
    model: string;
    latency: number;
    tokenCount: number;
    success: boolean;
    error?: string;
  }): void {
    this.track('response', data);
  }

  trackError(data: {
    errorId: string;
    errorType: string;
    message: string;
    stack?: string;
    context: any;
  }): void {
    this.track('error', data);
  }

  trackIntent(data: {
    input: string;
    intent: string;
    confidence: number;
    entities: any;
    clarificationNeeded: boolean;
  }): void {
    this.track('intent', data);
  }

  trackToolExecution(data: {
    tool: string;
    parameters: any;
    executionTime: number;
    success: boolean;
    error?: string;
  }): void {
    this.track('tool_execution', data);
  }

  trackCacheHit(data: {
    cacheKey: string;
    cacheType: 'request' | 'complexity' | 'tool_result';
    hitRate: number;
  }): void {
    this.track('cache_hit', data);
  }

  trackModelRouting(data: {
    requestId: string;
    selectedModel: string;
    routingStrategy: string;
    reason: string;
    fallbackUsed: boolean;
  }): void {
    this.track('model_routing', data);
  }

  // Metrics collection
  private async collectMetrics(): Promise<MetricsSnapshot> {
    const memUsage = process.memoryUsage();
    const totalMem = require('os').totalmem();
    
    // Calculate request metrics from recent events
    const recentRequests = this.events
      .filter(e => e.type === 'response' && e.timestamp > Date.now() - 60000);
    
    const successfulRequests = recentRequests.filter(e => e.data.success);
    const totalRequests = recentRequests.length;
    const avgLatency = successfulRequests.length > 0
      ? successfulRequests.reduce((sum, e) => sum + e.data.latency, 0) / successfulRequests.length
      : 0;

    // Calculate per-model metrics
    const modelMetrics: Record<string, any> = {};
    const modelGroups = this.groupBy(recentRequests, e => e.data.model);
    
    for (const [model, events] of Object.entries(modelGroups)) {
      const modelSuccess = events.filter((e: any) => e.data.success);
      modelMetrics[model] = {
        requests: events.length,
        avgLatency: modelSuccess.length > 0
          ? modelSuccess.reduce((sum: number, e: any) => sum + e.data.latency, 0) / modelSuccess.length
          : 0,
        errorRate: (events.length - modelSuccess.length) / events.length
      };
    }

    return {
      timestamp: Date.now(),
      cpu: process.cpuUsage().user + process.cpuUsage().system,
      memory: {
        used: memUsage.heapUsed,
        total: totalMem,
        percentage: (memUsage.heapUsed / totalMem) * 100
      },
      requests: {
        total: totalRequests,
        success: successfulRequests.length,
        failed: totalRequests - successfulRequests.length,
        avgLatency
      },
      models: modelMetrics
    };
  }

  private startMetricsCollection(intervalMs: number): void {
    this.metricsInterval = setInterval(async () => {
      try {
        const snapshot = await this.collectMetrics();
        this.metrics.push(snapshot);
        
        // Keep only last 1440 snapshots (24 hours at 1 minute intervals)
        if (this.metrics.length > 1440) {
          this.metrics = this.metrics.slice(-720);
        }
        
        this.emit('metrics', snapshot);
      } catch (error) {
        console.error('Failed to collect metrics:', error);
      }
    }, intervalMs);
  }

  private startAutoFlush(intervalMs: number): void {
    this.flushInterval = setInterval(async () => {
      await this.flush();
    }, intervalMs);
  }

  // Data persistence
  async flush(): Promise<void> {
    if (this.events.length === 0 && this.metrics.length === 0) {
      return;
    }

    try {
      // Ensure directory exists
      await fs.mkdir(this.logPath, { recursive: true });

      // Write events
      if (this.events.length > 0) {
        const eventsFile = path.join(
          this.logPath,
          `events-${this.sessionId}-${Date.now()}.jsonl`
        );
        
        const eventsData = this.events
          .map(e => JSON.stringify(e))
          .join('\n');
        
        await fs.writeFile(eventsFile, eventsData);
        this.events = []; // Clear after writing
      }

      // Write metrics
      if (this.metrics.length > 0) {
        const metricsFile = path.join(
          this.logPath,
          `metrics-${this.sessionId}-${Date.now()}.json`
        );
        
        await fs.writeFile(
          metricsFile, 
          JSON.stringify(this.metrics, null, 2)
        );
        
        this.metrics = []; // Clear after writing
      }

      this.emit('flushed');
    } catch (error) {
      console.error('Failed to flush telemetry:', error);
      this.emit('flush-error', error);
    }
  }

  // Analytics methods
  async generateReport(timeRangeMs: number = 3600000): Promise<{
    summary: any;
    topErrors: any[];
    intentDistribution: Record<string, number>;
    toolUsage: Record<string, number>;
    performanceTrends: any;
  }> {
    const cutoff = Date.now() - timeRangeMs;
    const recentEvents = this.events.filter(e => e.timestamp > cutoff);

    // Summary statistics
    const requests = recentEvents.filter(e => e.type === 'request');
    const responses = recentEvents.filter(e => e.type === 'response');
    const errors = recentEvents.filter(e => e.type === 'error');
    
    const successfulResponses = responses.filter(e => e.data.success);
    const avgLatency = successfulResponses.length > 0
      ? successfulResponses.reduce((sum, e) => sum + e.data.latency, 0) / successfulResponses.length
      : 0;

    // Top errors
    const errorGroups = this.groupBy(errors, e => e.data.errorType);
    const topErrors = Object.entries(errorGroups)
      .map(([type, events]) => ({
        type,
        count: events.length,
        lastOccurrence: Math.max(...events.map((e: any) => e.timestamp))
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Intent distribution
    const intents = recentEvents.filter(e => e.type === 'intent');
    const intentGroups = this.groupBy(intents, e => e.data.intent);
    const intentDistribution = Object.fromEntries(
      Object.entries(intentGroups).map(([intent, events]) => [intent, events.length])
    );

    // Tool usage
    const toolExecutions = recentEvents.filter(e => e.type === 'tool_execution');
    const toolGroups = this.groupBy(toolExecutions, e => e.data.tool);
    const toolUsage = Object.fromEntries(
      Object.entries(toolGroups).map(([tool, events]) => [tool, events.length])
    );

    // Performance trends
    const performanceTrends = {
      avgLatencyOverTime: this.calculateTrend(responses, 'latency'),
      errorRateOverTime: this.calculateErrorRateTrend(responses),
      requestVolumeOverTime: this.calculateVolumeTrend(requests)
    };

    return {
      summary: {
        totalRequests: requests.length,
        successRate: responses.length > 0 ? successfulResponses.length / responses.length : 0,
        avgLatency,
        totalErrors: errors.length,
        uniqueUsers: new Set(recentEvents.map(e => e.userId).filter(Boolean)).size
      },
      topErrors,
      intentDistribution,
      toolUsage,
      performanceTrends
    };
  }

  private groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const key = keyFn(item);
      groups[key] = groups[key] || [];
      groups[key].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  private calculateTrend(events: TelemetryEvent[], dataKey: string): Array<{
    timestamp: number;
    value: number;
  }> {
    // Group by 5-minute intervals
    const interval = 300000; // 5 minutes
    const groups = this.groupBy(events, e => 
      String(Math.floor(e.timestamp / interval) * interval)
    );

    return Object.entries(groups).map(([timestamp, groupEvents]) => {
      const values = groupEvents
        .filter((e: any) => e.data[dataKey] !== undefined)
        .map((e: any) => e.data[dataKey]);
      
      return {
        timestamp: parseInt(timestamp),
        value: values.length > 0 
          ? values.reduce((sum: number, v: number) => sum + v, 0) / values.length
          : 0
      };
    }).sort((a, b) => a.timestamp - b.timestamp);
  }

  private calculateErrorRateTrend(responses: TelemetryEvent[]): Array<{
    timestamp: number;
    value: number;
  }> {
    const interval = 300000; // 5 minutes
    const groups = this.groupBy(responses, e => 
      String(Math.floor(e.timestamp / interval) * interval)
    );

    return Object.entries(groups).map(([timestamp, groupEvents]) => {
      const failed = groupEvents.filter((e: any) => !e.data.success).length;
      return {
        timestamp: parseInt(timestamp),
        value: groupEvents.length > 0 ? failed / groupEvents.length : 0
      };
    }).sort((a, b) => a.timestamp - b.timestamp);
  }

  private calculateVolumeTrend(events: TelemetryEvent[]): Array<{
    timestamp: number;
    value: number;
  }> {
    const interval = 300000; // 5 minutes
    const groups = this.groupBy(events, e => 
      String(Math.floor(e.timestamp / interval) * interval)
    );

    return Object.entries(groups).map(([timestamp, groupEvents]) => ({
      timestamp: parseInt(timestamp),
      value: groupEvents.length
    })).sort((a, b) => a.timestamp - b.timestamp);
  }

  // Cleanup
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    
    // Final flush
    this.flush().catch(console.error);
  }
}

// Global telemetry instance
export const telemetry = new TelemetryService();