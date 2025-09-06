import { EventEmitter } from 'events';
import * as os from 'os';
import * as v8 from 'v8';
import { performance } from 'perf_hooks';
import chalk from 'chalk';

export interface PerformanceMetrics {
    cpu: {
        usage: number;
        cores: number;
        loadAvg: number[];
    };
    memory: {
        total: number;
        used: number;
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
    };
    operations: {
        name: string;
        avgDuration: number;
        minDuration: number;
        maxDuration: number;
        count: number;
        p95: number;
        p99: number;
    }[];
    cache: {
        hitRate: number;
        missRate: number;
        evictions: number;
        size: number;
    };
}

export interface OptimizationStrategy {
    name: string;
    description: string;
    condition: (metrics: PerformanceMetrics) => boolean;
    apply: () => Promise<void>;
    priority: number;
}

export class PerformanceOptimizer extends EventEmitter {
    private operationMetrics: Map<string, number[]> = new Map();
    private cacheMetrics = {
        hits: 0,
        misses: 0,
        evictions: 0,
        totalSize: 0
    };
    private optimizationStrategies: OptimizationStrategy[] = [];
    private isMonitoring = false;
    private monitoringInterval?: NodeJS.Timeout;
    private gcEnabled = false;
    private lastCpuInfo: any;
    
    constructor() {
        super();
        this.initializeStrategies();
        this.setupGarbageCollectionTracking();
    }
    
    // Initialize optimization strategies
    private initializeStrategies(): void {
        // Memory pressure optimization
        this.addStrategy({
            name: 'memory-pressure',
            description: 'Optimize when memory usage is high',
            priority: 10,
            condition: (metrics) => {
                const memoryUsagePercent = (metrics.memory.used / metrics.memory.total) * 100;
                return memoryUsagePercent > 80;
            },
            apply: async () => {
                console.log(chalk.yellow('🦺 Running memory optimization...'));
                
                // Force garbage collection if enabled
                if (global.gc && this.gcEnabled) {
                    global.gc();
                    console.log(chalk.green('✓ Forced garbage collection'));
                }
                
                // Clear caches
                this.emit('clearCaches', { reason: 'memory pressure' });
                
                // Reduce concurrent operations
                this.emit('throttleOperations', { maxConcurrency: 2 });
            }
        });
        
        // High CPU optimization
        this.addStrategy({
            name: 'cpu-throttling',
            description: 'Throttle operations when CPU usage is high',
            priority: 8,
            condition: (metrics) => metrics.cpu.usage > 90,
            apply: async () => {
                console.log(chalk.yellow('🔥 High CPU usage detected, throttling operations...'));
                
                // Introduce delays between operations
                this.emit('addOperationDelay', { delay: 100 });
                
                // Reduce parallel processing
                this.emit('reduceParallelism', { factor: 0.5 });
            }
        });
        
        // Cache optimization
        this.addStrategy({
            name: 'cache-tuning',
            description: 'Optimize cache settings based on hit rate',
            priority: 5,
            condition: (metrics) => metrics.cache.hitRate < 0.3 && metrics.cache.size > 100,
            apply: async () => {
                console.log(chalk.yellow('🎯 Optimizing cache strategy...'));
                
                const currentMetrics = await this.collectMetrics();
                
                // Adjust cache TTL based on hit patterns
                this.emit('adjustCacheTTL', { 
                    increase: currentMetrics.cache.hitRate < 0.1,
                    factor: 1.5 
                });
                
                // Implement predictive caching
                this.emit('enablePredictiveCaching');
            }
        });
        
        // Slow operation optimization
        this.addStrategy({
            name: 'slow-operation-detection',
            description: 'Optimize slow operations',
            priority: 7,
            condition: (metrics) => {
                return metrics.operations.some(op => op.avgDuration > 1000 && op.count > 10);
            },
            apply: async () => {
                const slowOps = this.getSlowOperations();
                console.log(chalk.yellow(`🐢 Optimizing ${slowOps.length} slow operations...`));
                
                // Enable operation caching for slow operations
                slowOps.forEach(op => {
                    this.emit('enableOperationCache', { operation: op.name });
                });
                
                // Suggest async processing
                this.emit('suggestAsyncProcessing', { operations: slowOps });
            }
        });
    }
    
    // Add custom optimization strategy
    addStrategy(strategy: OptimizationStrategy): void {
        this.optimizationStrategies.push(strategy);
        this.optimizationStrategies.sort((a, b) => b.priority - a.priority);
    }
    
    // Start performance monitoring
    startMonitoring(interval: number = 30000): void {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.lastCpuInfo = os.cpus();
        
        this.monitoringInterval = setInterval(async () => {
            const metrics = await this.collectMetrics();
            this.emit('metricsCollected', metrics);
            
            // Run optimization strategies
            await this.runOptimizations(metrics);
        }, interval);
        
        console.log(chalk.cyan('📡 Performance monitoring started'));
    }
    
    // Stop monitoring
    stopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }
        this.isMonitoring = false;
        console.log(chalk.gray('🛑 Performance monitoring stopped'));
    }
    
    // Record operation timing
    recordOperation(name: string, duration: number): void {
        if (!this.operationMetrics.has(name)) {
            this.operationMetrics.set(name, []);
        }
        
        const metrics = this.operationMetrics.get(name)!;
        metrics.push(duration);
        
        // Keep last 1000 measurements
        if (metrics.length > 1000) {
            metrics.shift();
        }
    }
    
    // Record cache activity
    recordCacheHit(): void {
        this.cacheMetrics.hits++;
    }
    
    recordCacheMiss(): void {
        this.cacheMetrics.misses++;
    }
    
    recordCacheEviction(): void {
        this.cacheMetrics.evictions++;
    }
    
    updateCacheSize(size: number): void {
        this.cacheMetrics.totalSize = size;
    }
    
    // Collect current metrics
    private async collectMetrics(): Promise<PerformanceMetrics> {
        const cpuUsage = this.getCPUUsage();
        const memInfo = process.memoryUsage();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        
        // Calculate operation statistics
        const operations = Array.from(this.operationMetrics.entries()).map(([name, durations]) => {
            const sorted = [...durations].sort((a, b) => a - b);
            return {
                name,
                avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
                minDuration: Math.min(...durations),
                maxDuration: Math.max(...durations),
                count: durations.length,
                p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
                p99: sorted[Math.floor(sorted.length * 0.99)] || 0
            };
        });
        
        // Calculate cache metrics
        const totalCacheOps = this.cacheMetrics.hits + this.cacheMetrics.misses;
        const cacheHitRate = totalCacheOps > 0 ? this.cacheMetrics.hits / totalCacheOps : 0;
        
        return {
            cpu: {
                usage: cpuUsage,
                cores: os.cpus().length,
                loadAvg: os.loadavg()
            },
            memory: {
                total: totalMem,
                used: totalMem - freeMem,
                heapUsed: memInfo.heapUsed,
                heapTotal: memInfo.heapTotal,
                external: memInfo.external,
                rss: memInfo.rss
            },
            operations,
            cache: {
                hitRate: cacheHitRate,
                missRate: 1 - cacheHitRate,
                evictions: this.cacheMetrics.evictions,
                size: this.cacheMetrics.totalSize
            }
        };
    }
    
    // Calculate CPU usage percentage
    private getCPUUsage(): number {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;
        
        cpus.forEach((cpu, i) => {
            const lastCpu = this.lastCpuInfo[i];
            
            for (const type in cpu.times) {
                totalTick += cpu.times[type as keyof typeof cpu.times] - 
                            (lastCpu ? lastCpu.times[type as keyof typeof lastCpu.times] : 0);
            }
            
            totalIdle += cpu.times.idle - (lastCpu ? lastCpu.times.idle : 0);
        });
        
        this.lastCpuInfo = cpus;
        
        const idle = totalIdle / cpus.length;
        const total = totalTick / cpus.length;
        const usage = 100 - ~~(100 * idle / total);
        
        return Math.max(0, Math.min(100, usage));
    }
    
    // Run optimization strategies
    private async runOptimizations(metrics: PerformanceMetrics): Promise<void> {
        for (const strategy of this.optimizationStrategies) {
            try {
                if (strategy.condition(metrics)) {
                    console.log(chalk.blue(`🔧 Running optimization: ${strategy.name}`));
                    await strategy.apply();
                    this.emit('optimizationApplied', { strategy: strategy.name, metrics });
                }
            } catch (error) {
                console.error(chalk.red(`Failed to apply optimization ${strategy.name}:`), error);
            }
        }
    }
    
    // Get slow operations
    private getSlowOperations(threshold: number = 1000): Array<{ name: string; avgDuration: number }> {
        return Array.from(this.operationMetrics.entries())
            .map(([name, durations]) => ({
                name,
                avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length
            }))
            .filter(op => op.avgDuration > threshold)
            .sort((a, b) => b.avgDuration - a.avgDuration);
    }
    
    // Setup garbage collection tracking
    private setupGarbageCollectionTracking(): void {
        if (global.gc) {
            this.gcEnabled = true;
            
            // Track GC events if possible
            try {
                const observer = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    entries.forEach((entry) => {
                        if (entry.entryType === 'gc') {
                            this.emit('gcEvent', {
                                duration: entry.duration,
                                type: (entry as any).detail?.kind
                            });
                        }
                    });
                });
                
                observer.observe({ entryTypes: ['gc'] });
            } catch {}
        }
    }
    
    // Performance optimization suggestions
    async getOptimizationSuggestions(): Promise<string[]> {
        const metrics = await this.collectMetrics();
        const suggestions: string[] = [];
        
        // Memory suggestions
        const memUsagePercent = (metrics.memory.used / metrics.memory.total) * 100;
        if (memUsagePercent > 70) {
            suggestions.push('Consider increasing Node.js heap size with --max-old-space-size');
            suggestions.push('Review memory leaks using heap snapshots');
        }
        
        // CPU suggestions
        if (metrics.cpu.usage > 80) {
            suggestions.push('Consider using worker threads for CPU-intensive operations');
            suggestions.push('Review synchronous operations that might block the event loop');
        }
        
        // Cache suggestions
        if (metrics.cache.hitRate < 0.5) {
            suggestions.push('Increase cache TTL for frequently accessed data');
            suggestions.push('Implement predictive caching for common patterns');
        }
        
        // Operation suggestions
        const slowOps = this.getSlowOperations(500);
        if (slowOps.length > 0) {
            suggestions.push(`Optimize slow operations: ${slowOps.slice(0, 3).map(op => op.name).join(', ')}`);
            suggestions.push('Consider implementing operation result caching');
        }
        
        // Load average suggestions
        const loadAvg1 = metrics.cpu.loadAvg[0];
        if (loadAvg1 > metrics.cpu.cores) {
            suggestions.push('System is overloaded. Consider scaling horizontally');
        }
        
        return suggestions;
    }
    
    // Export performance report
    exportPerformanceReport(): string {
        const metrics = this.operationMetrics;
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalOperations: Array.from(metrics.values()).reduce((sum, arr) => sum + arr.length, 0),
                uniqueOperations: metrics.size,
                cacheHitRate: this.cacheMetrics.hits / (this.cacheMetrics.hits + this.cacheMetrics.misses),
                cacheEvictions: this.cacheMetrics.evictions
            },
            operations: Array.from(metrics.entries()).map(([name, durations]) => {
                const sorted = [...durations].sort((a, b) => a - b);
                return {
                    name,
                    count: durations.length,
                    avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
                    min: Math.round(Math.min(...durations)),
                    max: Math.round(Math.max(...durations)),
                    p50: Math.round(sorted[Math.floor(sorted.length * 0.5)] || 0),
                    p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0),
                    p99: Math.round(sorted[Math.floor(sorted.length * 0.99)] || 0)
                };
            }).sort((a, b) => b.avg - a.avg),
            system: {
                platform: os.platform(),
                arch: os.arch(),
                nodeVersion: process.version,
                cpus: os.cpus().length,
                totalMemory: Math.round(os.totalmem() / 1024 / 1024) + ' MB'
            }
        };
        
        return JSON.stringify(report, null, 2);
    }
    
    // Memory snapshot
    async captureMemorySnapshot(): Promise<string> {
        return v8.writeHeapSnapshot() as any;
    }
    
    // Performance marks
    mark(name: string): void {
        performance.mark(name);
    }
    
    measure(name: string, startMark: string, endMark?: string): number {
        if (endMark) {
            performance.measure(name, startMark, endMark);
        } else {
            performance.measure(name, startMark);
        }
        
        const measure = performance.getEntriesByName(name, 'measure')[0];
        if (measure) {
            this.recordOperation(name, measure.duration);
            return measure.duration;
        }
        
        return 0;
    }
    
    // Cleanup
    reset(): void {
        this.operationMetrics.clear();
        this.cacheMetrics = {
            hits: 0,
            misses: 0,
            evictions: 0,
            totalSize: 0
        };
        performance.clearMarks();
        performance.clearMeasures();
    }
}

// Singleton instance
export const performanceOptimizer = new PerformanceOptimizer();

// Performance decorator
export function measurePerformance(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
        const start = performance.now();
        
        try {
            const result = await originalMethod.apply(this, args);
            const duration = performance.now() - start;
            
            performanceOptimizer.recordOperation(`${target.constructor.name}.${propertyKey}`, duration);
            
            return result;
        } catch (error) {
            const duration = performance.now() - start;
            performanceOptimizer.recordOperation(`${target.constructor.name}.${propertyKey}:error`, duration);
            throw error;
        }
    };
    
    return descriptor;
}