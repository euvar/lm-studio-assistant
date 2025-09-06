import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import { performance, PerformanceObserver } from 'perf_hooks';

const execAsync = promisify(exec);

interface ProfileResult {
  name: string;
  type: ProfileType;
  startTime: number;
  endTime: number;
  duration: number;
  metrics: ProfileMetrics;
  children?: ProfileResult[];
  metadata?: any;
}

interface ProfileMetrics {
  cpu?: CPUMetrics;
  memory?: MemoryMetrics;
  io?: IOMetrics;
  network?: NetworkMetrics;
  custom?: Record<string, number>;
}

interface CPUMetrics {
  usage: number;
  userTime: number;
  systemTime: number;
  idleTime: number;
  samples: number[];
}

interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  samples: MemorySample[];
}

interface MemorySample {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  rss: number;
}

interface IOMetrics {
  reads: number;
  writes: number;
  readBytes: number;
  writeBytes: number;
  readTime: number;
  writeTime: number;
}

interface NetworkMetrics {
  requests: number;
  responses: number;
  bytesIn: number;
  bytesOut: number;
  avgLatency: number;
  errors: number;
}

export enum ProfileType {
  Function = 'function',
  API = 'api',
  Database = 'database',
  FileIO = 'file-io',
  Network = 'network',
  Custom = 'custom'
}

interface ProfileOptions {
  sampleInterval?: number;
  includeChildren?: boolean;
  captureStackTrace?: boolean;
  memoryProfiling?: boolean;
  cpuProfiling?: boolean;
}

interface FlameGraphNode {
  name: string;
  value: number;
  children: FlameGraphNode[];
}

export class PerformanceProfiler extends EventEmitter {
  private activeProfiles: Map<string, ProfileResult> = new Map();
  private completedProfiles: ProfileResult[] = [];
  private performanceObserver: PerformanceObserver | null = null;
  private memoryInterval: NodeJS.Timeout | null = null;
  private cpuInterval: NodeJS.Timeout | null = null;
  private lastCpuUsage: NodeJS.CpuUsage | null = null;
  
  constructor() {
    super();
    this.setupPerformanceObserver();
  }

  private setupPerformanceObserver() {
    this.performanceObserver = new PerformanceObserver((items) => {
      items.getEntries().forEach((entry) => {
        this.emit('performanceMeasure', entry);
      });
    });
    
    this.performanceObserver.observe({ entryTypes: ['measure', 'function', 'mark'] });
  }

  // Start profiling a specific operation
  async startProfile(name: string, type: ProfileType = ProfileType.Custom, options: ProfileOptions = {}): Promise<string> {
    const profileId = `${name}_${Date.now()}`;
    
    const profile: ProfileResult = {
      name,
      type,
      startTime: performance.now(),
      endTime: 0,
      duration: 0,
      metrics: {},
      children: [],
      metadata: {
        options,
        pid: process.pid,
        platform: os.platform(),
        nodeVersion: process.version
      }
    };

    this.activeProfiles.set(profileId, profile);
    
    // Start collecting metrics based on options
    if (options.memoryProfiling) {
      this.startMemoryProfiling(profileId);
    }
    
    if (options.cpuProfiling) {
      this.startCPUProfiling(profileId);
    }
    
    // Mark the start in performance timeline
    performance.mark(`${profileId}_start`);
    
    this.emit('profileStarted', { profileId, name, type });
    
    return profileId;
  }

  // End profiling
  async endProfile(profileId: string): Promise<ProfileResult | null> {
    const profile = this.activeProfiles.get(profileId);
    if (!profile) {
      console.warn(`Profile ${profileId} not found`);
      return null;
    }

    profile.endTime = performance.now();
    profile.duration = profile.endTime - profile.startTime;
    
    // Mark the end in performance timeline
    performance.mark(`${profileId}_end`);
    performance.measure(profileId, `${profileId}_start`, `${profileId}_end`);
    
    // Stop collecting metrics
    this.stopMemoryProfiling(profileId);
    this.stopCPUProfiling(profileId);
    
    // Move to completed profiles
    this.activeProfiles.delete(profileId);
    this.completedProfiles.push(profile);
    
    this.emit('profileEnded', { profileId, profile });
    
    return profile;
  }

  // Profile a function execution
  async profileFunction<T>(fn: () => Promise<T>, name: string, options: ProfileOptions = {}): Promise<{ result: T; profile: ProfileResult }> {
    const profileId = await this.startProfile(name, ProfileType.Function, options);
    
    try {
      const result = await fn();
      const profile = await this.endProfile(profileId);
      
      return { result, profile: profile! };
    } catch (error) {
      await this.endProfile(profileId);
      throw error;
    }
  }

  // Profile with automatic resource tracking
  profileAsync(name: string, type: ProfileType = ProfileType.Custom) {
    return <T extends (...args: any[]) => Promise<any>>(
      target: any,
      propertyKey: string,
      descriptor: PropertyDescriptor
    ) => {
      const originalMethod = descriptor.value;
      
      descriptor.value = async function (...args: any[]) {
        const profiler = new PerformanceProfiler();
        const profileId = await profiler.startProfile(`${name}.${propertyKey}`, type, {
          memoryProfiling: true,
          cpuProfiling: true
        });
        
        try {
          const result = await originalMethod.apply(this, args);
          await profiler.endProfile(profileId);
          return result;
        } catch (error) {
          await profiler.endProfile(profileId);
          throw error;
        }
      };
      
      return descriptor;
    };
  }

  // Start memory profiling
  private startMemoryProfiling(profileId: string) {
    const profile = this.activeProfiles.get(profileId);
    if (!profile) return;
    
    profile.metrics.memory = {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0,
      arrayBuffers: 0,
      samples: []
    };
    
    // Collect memory samples
    const collectMemory = () => {
      const memUsage = process.memoryUsage();
      const sample: MemorySample = {
        timestamp: performance.now(),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss
      };
      
      profile.metrics.memory!.samples.push(sample);
      
      // Update current values
      profile.metrics.memory!.heapUsed = memUsage.heapUsed;
      profile.metrics.memory!.heapTotal = memUsage.heapTotal;
      profile.metrics.memory!.external = memUsage.external;
      profile.metrics.memory!.rss = memUsage.rss;
      profile.metrics.memory!.arrayBuffers = memUsage.arrayBuffers || 0;
    };
    
    collectMemory(); // Initial sample
    this.memoryInterval = setInterval(collectMemory, 100); // Sample every 100ms
  }

  // Stop memory profiling
  private stopMemoryProfiling(profileId: string) {
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
    }
  }

  // Start CPU profiling
  private startCPUProfiling(profileId: string) {
    const profile = this.activeProfiles.get(profileId);
    if (!profile) return;
    
    profile.metrics.cpu = {
      usage: 0,
      userTime: 0,
      systemTime: 0,
      idleTime: 0,
      samples: []
    };
    
    this.lastCpuUsage = process.cpuUsage();
    
    // Collect CPU samples
    const collectCPU = () => {
      const currentUsage = process.cpuUsage(this.lastCpuUsage!);
      const totalTime = currentUsage.user + currentUsage.system;
      const elapsedTime = process.hrtime()[0] * 1000000; // Convert to microseconds
      
      const cpuPercent = (totalTime / elapsedTime) * 100;
      
      profile.metrics.cpu!.samples.push(cpuPercent);
      profile.metrics.cpu!.usage = cpuPercent;
      profile.metrics.cpu!.userTime = currentUsage.user;
      profile.metrics.cpu!.systemTime = currentUsage.system;
      
      this.lastCpuUsage = process.cpuUsage();
    };
    
    collectCPU(); // Initial sample
    this.cpuInterval = setInterval(collectCPU, 100); // Sample every 100ms
  }

  // Stop CPU profiling
  private stopCPUProfiling(profileId: string) {
    if (this.cpuInterval) {
      clearInterval(this.cpuInterval);
      this.cpuInterval = null;
    }
    
    const profile = this.activeProfiles.get(profileId);
    if (profile && profile.metrics.cpu && profile.metrics.cpu.samples.length > 0) {
      // Calculate average CPU usage
      const avgCpu = profile.metrics.cpu.samples.reduce((a, b) => a + b, 0) / profile.metrics.cpu.samples.length;
      profile.metrics.cpu.usage = avgCpu;
    }
  }

  // Analyze code performance
  async analyzeCode(filePath: string): Promise<any> {
    const code = await fs.readFile(filePath, 'utf-8');
    const analysis = {
      file: filePath,
      functions: [] as any[],
      complexity: 0,
      suggestions: [] as string[]
    };

    // Simple analysis - in production, use proper AST parsing
    const functionRegex = /(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
    let match;
    
    while ((match = functionRegex.exec(code)) !== null) {
      const funcName = match[1] || match[2];
      const funcStart = match.index;
      const funcBody = this.extractFunctionBody(code, funcStart);
      
      analysis.functions.push({
        name: funcName,
        line: code.substring(0, funcStart).split('\n').length,
        complexity: this.calculateComplexity(funcBody),
        length: funcBody.split('\n').length
      });
    }
    
    // Calculate overall complexity
    analysis.complexity = analysis.functions.reduce((sum, f) => sum + f.complexity, 0);
    
    // Generate suggestions
    if (analysis.complexity > 20) {
      analysis.suggestions.push('High complexity detected. Consider breaking down complex functions.');
    }
    
    analysis.functions.forEach(func => {
      if (func.complexity > 10) {
        analysis.suggestions.push(`Function '${func.name}' has high complexity (${func.complexity}). Consider refactoring.`);
      }
      if (func.length > 50) {
        analysis.suggestions.push(`Function '${func.name}' is too long (${func.length} lines). Consider splitting it.`);
      }
    });
    
    return analysis;
  }

  // Extract function body (simplified)
  private extractFunctionBody(code: string, start: number): string {
    let braceCount = 0;
    let inFunction = false;
    let end = start;
    
    for (let i = start; i < code.length; i++) {
      if (code[i] === '{') {
        braceCount++;
        inFunction = true;
      } else if (code[i] === '}') {
        braceCount--;
        if (braceCount === 0 && inFunction) {
          end = i;
          break;
        }
      }
    }
    
    return code.substring(start, end + 1);
  }

  // Calculate cyclomatic complexity (simplified)
  private calculateComplexity(code: string): number {
    let complexity = 1;
    
    // Count decision points
    const patterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\?\s*:/g, // ternary operator
      /&&/g,
      /\|\|/g
    ];
    
    patterns.forEach(pattern => {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    });
    
    return complexity;
  }

  // Profile Node.js application
  async profileNodeApp(scriptPath: string, duration: number = 10000): Promise<any> {
    const profileData = {
      script: scriptPath,
      duration,
      samples: [] as any[],
      summary: {} as any
    };
    
    try {
      // Start the Node.js app with profiling flags
      const { stdout } = await execAsync(
        `node --prof --prof-process ${scriptPath}`,
        { timeout: duration }
      );
      
      // Parse profiling output
      profileData.summary = this.parseNodeProfile(stdout);
      
      return profileData;
    } catch (error: any) {
      console.error('Profiling error:', error);
      return profileData;
    }
  }

  // Parse Node.js profiling output
  private parseNodeProfile(output: string): any {
    const summary = {
      totalTime: 0,
      ticks: 0,
      gc: 0,
      functions: [] as any[]
    };
    
    // Parse the profile output (simplified)
    const lines = output.split('\n');
    let inSummary = false;
    
    lines.forEach(line => {
      if (line.includes('Summary')) {
        inSummary = true;
      } else if (inSummary && line.trim()) {
        const match = line.match(/(\d+)\s+(\d+\.\d+%)\s+(.+)/);
        if (match) {
          summary.functions.push({
            ticks: parseInt(match[1]),
            percentage: match[2],
            name: match[3].trim()
          });
        }
      }
    });
    
    return summary;
  }

  // Generate flame graph data
  generateFlameGraph(profiles: ProfileResult[]): FlameGraphNode {
    const root: FlameGraphNode = {
      name: 'root',
      value: 0,
      children: []
    };
    
    // Build tree structure from profiles
    profiles.forEach(profile => {
      const node: FlameGraphNode = {
        name: profile.name,
        value: profile.duration,
        children: []
      };
      
      if (profile.children && profile.children.length > 0) {
        node.children = [this.generateFlameGraph(profile.children)];
      }
      
      root.children.push(node);
      root.value += profile.duration;
    });
    
    return root;
  }

  // Generate performance report
  generateReport(profiles: ProfileResult[]): string {
    const report: string[] = [];
    
    report.push('=== Performance Profile Report ===\n');
    report.push(`Total profiles: ${profiles.length}`);
    report.push(`Total duration: ${profiles.reduce((sum, p) => sum + p.duration, 0).toFixed(2)}ms\n`);
    
    // Sort by duration
    const sorted = [...profiles].sort((a, b) => b.duration - a.duration);
    
    // Top slowest operations
    report.push('Top 10 Slowest Operations:');
    sorted.slice(0, 10).forEach((profile, index) => {
      report.push(`${index + 1}. ${profile.name} (${profile.type}): ${profile.duration.toFixed(2)}ms`);
      
      if (profile.metrics.memory) {
        const mem = profile.metrics.memory;
        report.push(`   Memory: Heap ${(mem.heapUsed / 1024 / 1024).toFixed(2)}MB, RSS ${(mem.rss / 1024 / 1024).toFixed(2)}MB`);
      }
      
      if (profile.metrics.cpu) {
        report.push(`   CPU: ${profile.metrics.cpu.usage.toFixed(2)}%`);
      }
    });
    
    // Memory analysis
    const memoryProfiles = profiles.filter(p => p.metrics.memory);
    if (memoryProfiles.length > 0) {
      report.push('\nMemory Analysis:');
      
      const maxHeap = Math.max(...memoryProfiles.map(p => p.metrics.memory!.heapUsed));
      const avgHeap = memoryProfiles.reduce((sum, p) => sum + p.metrics.memory!.heapUsed, 0) / memoryProfiles.length;
      
      report.push(`  Max heap: ${(maxHeap / 1024 / 1024).toFixed(2)}MB`);
      report.push(`  Avg heap: ${(avgHeap / 1024 / 1024).toFixed(2)}MB`);
    }
    
    // CPU analysis
    const cpuProfiles = profiles.filter(p => p.metrics.cpu);
    if (cpuProfiles.length > 0) {
      report.push('\nCPU Analysis:');
      
      const maxCPU = Math.max(...cpuProfiles.map(p => p.metrics.cpu!.usage));
      const avgCPU = cpuProfiles.reduce((sum, p) => sum + p.metrics.cpu!.usage, 0) / cpuProfiles.length;
      
      report.push(`  Max CPU: ${maxCPU.toFixed(2)}%`);
      report.push(`  Avg CPU: ${avgCPU.toFixed(2)}%`);
    }
    
    // Recommendations
    report.push('\nRecommendations:');
    
    sorted.slice(0, 5).forEach(profile => {
      if (profile.duration > 1000) {
        report.push(`- Optimize '${profile.name}' - taking ${(profile.duration / 1000).toFixed(2)}s`);
      }
      
      if (profile.metrics.memory && profile.metrics.memory.heapUsed > 100 * 1024 * 1024) {
        report.push(`- High memory usage in '${profile.name}' - ${(profile.metrics.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      }
      
      if (profile.metrics.cpu && profile.metrics.cpu.usage > 80) {
        report.push(`- High CPU usage in '${profile.name}' - ${profile.metrics.cpu.usage.toFixed(2)}%`);
      }
    });
    
    return report.join('\n');
  }

  // Export profiles to file
  async exportProfiles(profiles: ProfileResult[], outputPath: string, format: 'json' | 'html' = 'json') {
    if (format === 'json') {
      await fs.writeFile(outputPath, JSON.stringify(profiles, null, 2));
    } else if (format === 'html') {
      const html = this.generateHTMLReport(profiles);
      await fs.writeFile(outputPath, html);
    }
  }

  // Generate HTML report
  private generateHTMLReport(profiles: ProfileResult[]): string {
    const flameGraphData = this.generateFlameGraph(profiles);
    
    return `<!DOCTYPE html>
<html>
<head>
  <title>Performance Profile Report</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .chart { margin: 20px 0; }
    .profile { margin: 10px 0; padding: 10px; border: 1px solid #ddd; }
    .slow { background-color: #ffeeee; }
    .medium { background-color: #ffffee; }
    .fast { background-color: #eeffee; }
  </style>
</head>
<body>
  <h1>Performance Profile Report</h1>
  <div id="summary">
    <h2>Summary</h2>
    <p>Total profiles: ${profiles.length}</p>
    <p>Total duration: ${profiles.reduce((sum, p) => sum + p.duration, 0).toFixed(2)}ms</p>
  </div>
  
  <div id="flamegraph" class="chart">
    <h2>Flame Graph</h2>
    <svg width="1200" height="600"></svg>
  </div>
  
  <div id="profiles">
    <h2>Profile Details</h2>
    ${profiles.map(p => `
      <div class="profile ${p.duration > 1000 ? 'slow' : p.duration > 100 ? 'medium' : 'fast'}">
        <h3>${p.name} (${p.type})</h3>
        <p>Duration: ${p.duration.toFixed(2)}ms</p>
        ${p.metrics.memory ? `<p>Memory: ${(p.metrics.memory.heapUsed / 1024 / 1024).toFixed(2)}MB</p>` : ''}
        ${p.metrics.cpu ? `<p>CPU: ${p.metrics.cpu.usage.toFixed(2)}%</p>` : ''}
      </div>
    `).join('')}
  </div>
  
  <script>
    const data = ${JSON.stringify(flameGraphData)};
    // D3.js flame graph visualization code would go here
  </script>
</body>
</html>`;
  }

  // Get all profiles
  getProfiles(): ProfileResult[] {
    return this.completedProfiles;
  }

  // Clear all profiles
  clearProfiles() {
    this.completedProfiles = [];
    this.activeProfiles.clear();
  }

  // Cleanup
  destroy() {
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
    }
    if (this.cpuInterval) {
      clearInterval(this.cpuInterval);
    }
  }
}