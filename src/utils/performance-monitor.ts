import chalk from 'chalk';

export interface PerformanceMetrics {
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private completedMetrics: PerformanceMetrics[] = [];
  private enabled: boolean = process.env.PERF_MONITOR === 'true';

  startOperation(operationId: string, operationName: string, metadata?: Record<string, any>): void {
    if (!this.enabled) return;

    this.metrics.set(operationId, {
      operationName,
      startTime: Date.now(),
      metadata
    });
  }

  endOperation(operationId: string): void {
    if (!this.enabled) return;

    const metric = this.metrics.get(operationId);
    if (!metric) return;

    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;
    
    this.completedMetrics.push(metric);
    this.metrics.delete(operationId);

    // Log slow operations
    if (metric.duration > 1000) {
      console.log(
        chalk.yellow(`⚠️ Slow operation: ${metric.operationName} took ${metric.duration}ms`)
      );
    }
  }

  getActiveOperations(): PerformanceMetrics[] {
    return Array.from(this.metrics.values());
  }

  getCompletedMetrics(): PerformanceMetrics[] {
    return this.completedMetrics;
  }

  getAverageTime(operationName: string): number {
    const relevantMetrics = this.completedMetrics.filter(
      m => m.operationName === operationName && m.duration
    );
    
    if (relevantMetrics.length === 0) return 0;
    
    const totalTime = relevantMetrics.reduce((sum, m) => sum + (m.duration || 0), 0);
    return Math.round(totalTime / relevantMetrics.length);
  }

  getSummary(): string {
    const summary: string[] = ['Performance Summary:'];
    
    // Group by operation name
    const grouped = new Map<string, number[]>();
    
    this.completedMetrics.forEach(metric => {
      if (!metric.duration) return;
      
      const durations = grouped.get(metric.operationName) || [];
      durations.push(metric.duration);
      grouped.set(metric.operationName, durations);
    });
    
    // Calculate stats for each operation
    grouped.forEach((durations, operationName) => {
      const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
      const min = Math.min(...durations);
      const max = Math.max(...durations);
      const count = durations.length;
      
      summary.push(
        `  ${operationName}: ${count} calls, avg: ${avg}ms, min: ${min}ms, max: ${max}ms`
      );
    });
    
    return summary.join('\n');
  }

  reset(): void {
    this.metrics.clear();
    this.completedMetrics = [];
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }
}

// Global instance
export const performanceMonitor = new PerformanceMonitor();