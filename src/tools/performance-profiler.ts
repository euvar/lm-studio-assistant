import { Tool, ToolResult } from './base.js';
import { PerformanceProfiler, ProfileType } from '../core/performance-profiler.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class PerformanceProfilerTool implements Tool {
  name = 'performanceProfiler';
  description = 'Profile and analyze code performance';
  
  parameters = {
    action: {
      type: 'string' as const,
      description: 'Action to perform: start, end, analyze, report, export',
      required: true
    },
    profileName: {
      type: 'string' as const,
      description: 'Name for the profile'
    },
    profileId: {
      type: 'string' as const,
      description: 'Profile ID for end action'
    },
    filePath: {
      type: 'string' as const,
      description: 'File path for analyze action'
    },
    duration: {
      type: 'number' as const,
      description: 'Duration in milliseconds for profiling',
      default: 10000
    },
    options: {
      type: 'object' as const,
      description: 'Profile options',
      default: {
        memoryProfiling: true,
        cpuProfiling: true,
        sampleInterval: 100
      }
    },
    format: {
      type: 'string' as const,
      description: 'Export format: json or html',
      default: 'json'
    },
    outputPath: {
      type: 'string' as const,
      description: 'Output path for export'
    }
  };

  private profiler: PerformanceProfiler;
  private static sharedProfiler: PerformanceProfiler;

  constructor() {
    // Use a shared profiler instance across all tool instances
    if (!PerformanceProfilerTool.sharedProfiler) {
      PerformanceProfilerTool.sharedProfiler = new PerformanceProfiler();
    }
    this.profiler = PerformanceProfilerTool.sharedProfiler;
  }

  async execute(params: any): Promise<ToolResult> {
    const { action } = params;

    try {
      switch (action) {
        case 'start':
          return await this.startProfile(params);
          
        case 'end':
          return await this.endProfile(params);
          
        case 'analyze':
          return await this.analyzeCode(params);
          
        case 'report':
          return await this.generateReport(params);
          
        case 'export':
          return await this.exportProfiles(params);
          
        case 'clear':
          return await this.clearProfiles();
          
        case 'benchmark':
          return await this.runBenchmark(params);
          
        default:
          return {
            success: false,
            error: `Unknown action: ${action}. Available actions: start, end, analyze, report, export, clear, benchmark`
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Performance profiling failed: ${error.message}`
      };
    }
  }

  private async startProfile(params: any): Promise<ToolResult> {
    const { profileName, options = {} } = params;

    if (!profileName) {
      return {
        success: false,
        error: 'Profile name is required'
      };
    }

    const profileId = await this.profiler.startProfile(profileName, ProfileType.Custom, options);

    return {
      success: true,
      data: {
        profileId,
        profileName,
        message: `Profile '${profileName}' started with ID: ${profileId}`,
        options
      }
    };
  }

  private async endProfile(params: any): Promise<ToolResult> {
    const { profileId } = params;

    if (!profileId) {
      return {
        success: false,
        error: 'Profile ID is required'
      };
    }

    const profile = await this.profiler.endProfile(profileId);

    if (!profile) {
      return {
        success: false,
        error: `Profile ${profileId} not found`
      };
    }

    const summary = {
      name: profile.name,
      duration: `${profile.duration.toFixed(2)}ms`,
      type: profile.type,
      metrics: this.summarizeMetrics(profile.metrics)
    };

    return {
      success: true,
      data: {
        profile,
        summary,
        message: `Profile '${profile.name}' completed in ${profile.duration.toFixed(2)}ms`
      }
    };
  }

  private summarizeMetrics(metrics: any): any {
    const summary: any = {};

    if (metrics.memory) {
      summary.memory = {
        heapUsed: `${(metrics.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(metrics.memory.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        rss: `${(metrics.memory.rss / 1024 / 1024).toFixed(2)}MB`,
        samples: metrics.memory.samples.length
      };
    }

    if (metrics.cpu) {
      summary.cpu = {
        usage: `${metrics.cpu.usage.toFixed(2)}%`,
        userTime: `${(metrics.cpu.userTime / 1000000).toFixed(2)}s`,
        systemTime: `${(metrics.cpu.systemTime / 1000000).toFixed(2)}s`,
        samples: metrics.cpu.samples.length
      };
    }

    return summary;
  }

  private async analyzeCode(params: any): Promise<ToolResult> {
    const { filePath } = params;

    if (!filePath) {
      return {
        success: false,
        error: 'File path is required'
      };
    }

    const analysis = await this.profiler.analyzeCode(filePath);

    return {
      success: true,
      data: {
        analysis,
        summary: {
          totalFunctions: analysis.functions.length,
          totalComplexity: analysis.complexity,
          avgComplexity: analysis.functions.length > 0 
            ? (analysis.complexity / analysis.functions.length).toFixed(2)
            : 0,
          suggestions: analysis.suggestions
        }
      }
    };
  }

  private async generateReport(params: any): Promise<ToolResult> {
    const profiles = this.profiler.getProfiles();

    if (profiles.length === 0) {
      return {
        success: false,
        error: 'No profiles available to generate report'
      };
    }

    const report = this.profiler.generateReport(profiles);
    const flameGraph = this.profiler.generateFlameGraph(profiles);

    return {
      success: true,
      data: {
        report,
        flameGraph,
        profileCount: profiles.length,
        totalDuration: profiles.reduce((sum, p) => sum + p.duration, 0)
      }
    };
  }

  private async exportProfiles(params: any): Promise<ToolResult> {
    const { outputPath, format = 'json' } = params;

    if (!outputPath) {
      return {
        success: false,
        error: 'Output path is required'
      };
    }

    const profiles = this.profiler.getProfiles();

    if (profiles.length === 0) {
      return {
        success: false,
        error: 'No profiles available to export'
      };
    }

    await this.profiler.exportProfiles(profiles, outputPath, format);

    return {
      success: true,
      data: {
        outputPath,
        format,
        profileCount: profiles.length,
        message: `Exported ${profiles.length} profiles to ${outputPath}`
      }
    };
  }

  private async clearProfiles(): Promise<ToolResult> {
    this.profiler.clearProfiles();

    return {
      success: true,
      data: {
        message: 'All profiles cleared'
      }
    };
  }

  private async runBenchmark(params: any): Promise<ToolResult> {
    const { code, iterations = 1000, warmup = 100 } = params;

    if (!code) {
      return {
        success: false,
        error: 'Code to benchmark is required'
      };
    }

    const results = {
      iterations,
      warmup,
      times: [] as number[],
      stats: {} as any
    };

    // Create async function from code
    const fn = new Function('return (async () => {' + code + '})');
    const asyncFn = fn();

    // Warmup
    for (let i = 0; i < warmup; i++) {
      await asyncFn();
    }

    // Benchmark
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await asyncFn();
      const end = performance.now();
      results.times.push(end - start);
    }

    // Calculate statistics
    results.times.sort((a, b) => a - b);
    results.stats = {
      min: results.times[0],
      max: results.times[results.times.length - 1],
      mean: results.times.reduce((a, b) => a + b, 0) / results.times.length,
      median: results.times[Math.floor(results.times.length / 2)],
      p95: results.times[Math.floor(results.times.length * 0.95)],
      p99: results.times[Math.floor(results.times.length * 0.99)]
    };

    return {
      success: true,
      data: results
    };
  }
}

export class CodeOptimizerTool implements Tool {
  name = 'codeOptimizer';
  description = 'Analyze and suggest optimizations for code performance';
  
  parameters = {
    filePath: {
      type: 'string' as const,
      description: 'Path to file to optimize',
      required: true
    },
    targetMetric: {
      type: 'string' as const,
      description: 'Optimization target: speed, memory, both',
      default: 'both'
    },
    aggressive: {
      type: 'boolean' as const,
      description: 'Apply aggressive optimizations',
      default: false
    }
  };

  async execute(params: any): Promise<ToolResult> {
    const { filePath, targetMetric = 'both', aggressive = false } = params;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const optimizations = await this.analyzeAndOptimize(content, targetMetric, aggressive);

      return {
        success: true,
        data: optimizations
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Code optimization failed: ${error.message}`
      };
    }
  }

  private async analyzeAndOptimize(code: string, targetMetric: string, aggressive: boolean): Promise<any> {
    const optimizations = {
      suggestions: [] as any[],
      optimizedCode: code,
      improvements: {} as any
    };

    // Speed optimizations
    if (targetMetric === 'speed' || targetMetric === 'both') {
      // Loop optimizations
      if (code.includes('for') && code.includes('.length')) {
        optimizations.suggestions.push({
          type: 'loop-optimization',
          description: 'Cache array length in loop conditions',
          before: 'for (let i = 0; i < array.length; i++)',
          after: 'const len = array.length; for (let i = 0; i < len; i++)',
          impact: 'medium'
        });
      }

      // String concatenation
      const stringConcatMatches = code.match(/\+\s*['"`]/g);
      if (stringConcatMatches && stringConcatMatches.length > 3) {
        optimizations.suggestions.push({
          type: 'string-optimization',
          description: 'Use template literals instead of string concatenation',
          before: 'str = "Hello " + name + "!"',
          after: 'str = `Hello ${name}!`',
          impact: 'low'
        });
      }

      // Array operations
      if (code.includes('.map(') && code.includes('.filter(')) {
        optimizations.suggestions.push({
          type: 'array-optimization',
          description: 'Combine map and filter operations',
          before: 'array.filter(x => x > 0).map(x => x * 2)',
          after: 'array.reduce((acc, x) => x > 0 ? [...acc, x * 2] : acc, [])',
          impact: 'medium'
        });
      }
    }

    // Memory optimizations
    if (targetMetric === 'memory' || targetMetric === 'both') {
      // Large array cloning
      if (code.includes('[...') || code.includes('.slice()')) {
        optimizations.suggestions.push({
          type: 'memory-optimization',
          description: 'Avoid unnecessary array cloning',
          before: 'const copy = [...largeArray]',
          after: 'Consider using the original array or slice only needed parts',
          impact: 'high'
        });
      }

      // Object creation in loops
      if (code.match(/for.*{[\s\S]*?new\s+\w+/)) {
        optimizations.suggestions.push({
          type: 'memory-optimization',
          description: 'Avoid creating objects in loops',
          before: 'for (...) { const obj = new Object(); }',
          after: 'Create object outside loop and reuse',
          impact: 'high'
        });
      }
    }

    // Aggressive optimizations
    if (aggressive) {
      // Function inlining
      const smallFunctions = code.match(/function\s+\w+\s*\([^)]*\)\s*{\s*return[^}]+}/g);
      if (smallFunctions) {
        optimizations.suggestions.push({
          type: 'aggressive-optimization',
          description: 'Consider inlining small functions',
          impact: 'low',
          warning: 'May reduce code readability'
        });
      }

      // Bitwise operations
      if (code.includes('% 2 === 0')) {
        optimizations.suggestions.push({
          type: 'aggressive-optimization',
          description: 'Use bitwise operations for performance',
          before: 'if (n % 2 === 0)',
          after: 'if ((n & 1) === 0)',
          impact: 'low'
        });
      }
    }

    // Calculate potential improvements
    optimizations.improvements = {
      estimatedSpeedGain: optimizations.suggestions
        .filter(s => s.type.includes('speed') || s.type === 'loop-optimization')
        .reduce((sum, s) => sum + (s.impact === 'high' ? 20 : s.impact === 'medium' ? 10 : 5), 0),
      estimatedMemoryReduction: optimizations.suggestions
        .filter(s => s.type.includes('memory'))
        .reduce((sum, s) => sum + (s.impact === 'high' ? 30 : s.impact === 'medium' ? 15 : 5), 0)
    };

    return optimizations;
  }
}

export class BenchmarkTool implements Tool {
  name = 'benchmark';
  description = 'Run performance benchmarks on code';
  
  parameters = {
    type: {
      type: 'string' as const,
      description: 'Benchmark type: function, file, comparison',
      required: true
    },
    target: {
      type: 'string' as const,
      description: 'Target to benchmark (function name, file path, or code)',
      required: true
    },
    alternatives: {
      type: 'array' as const,
      description: 'Alternative implementations for comparison'
    },
    iterations: {
      type: 'number' as const,
      description: 'Number of iterations',
      default: 1000
    },
    warmup: {
      type: 'number' as const,
      description: 'Number of warmup iterations',
      default: 100
    }
  };

  private profiler: PerformanceProfiler;

  constructor() {
    this.profiler = new PerformanceProfiler();
  }

  async execute(params: any): Promise<ToolResult> {
    const { type, target, alternatives = [], iterations = 1000, warmup = 100 } = params;

    try {
      switch (type) {
        case 'function':
          return await this.benchmarkFunction(target, iterations, warmup);
          
        case 'file':
          return await this.benchmarkFile(target, iterations);
          
        case 'comparison':
          return await this.benchmarkComparison(target, alternatives, iterations, warmup);
          
        default:
          return {
            success: false,
            error: `Unknown benchmark type: ${type}`
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Benchmark failed: ${error.message}`
      };
    }
  }

  private async benchmarkFunction(code: string, iterations: number, warmup: number): Promise<ToolResult> {
    const results = {
      code,
      iterations,
      warmup,
      times: [] as number[],
      memory: [] as number[],
      stats: {} as any
    };

    // Create function
    const fn = new Function('return (' + code + ')');
    const targetFn = fn();

    // Warmup
    for (let i = 0; i < warmup; i++) {
      await targetFn();
    }

    // Benchmark with profiling
    for (let i = 0; i < iterations; i++) {
      const memBefore = process.memoryUsage().heapUsed;
      const start = performance.now();
      
      await targetFn();
      
      const end = performance.now();
      const memAfter = process.memoryUsage().heapUsed;
      
      results.times.push(end - start);
      results.memory.push(memAfter - memBefore);
    }

    // Calculate statistics
    results.stats = this.calculateStats(results.times, results.memory);

    return {
      success: true,
      data: results
    };
  }

  private async benchmarkFile(filePath: string, iterations: number): Promise<ToolResult> {
    const results = {
      file: filePath,
      iterations,
      executions: [] as any[],
      stats: {} as any
    };

    for (let i = 0; i < iterations; i++) {
      const profileId = await this.profiler.startProfile(`file_${i}`, ProfileType.FileIO, {
        memoryProfiling: true,
        cpuProfiling: true
      });

      const start = performance.now();
      
      // Execute the file
      try {
        require(path.resolve(filePath));
      } catch (error) {
        // For ES modules or other file types
        await import(path.resolve(filePath));
      }
      
      const end = performance.now();
      const profile = await this.profiler.endProfile(profileId);

      results.executions.push({
        iteration: i,
        duration: end - start,
        profile: profile
      });
    }

    // Calculate aggregate statistics
    const times = results.executions.map(e => e.duration);
    const memoryUsage = results.executions
      .filter(e => e.profile?.metrics.memory)
      .map(e => e.profile.metrics.memory.heapUsed);

    results.stats = this.calculateStats(times, memoryUsage);

    return {
      success: true,
      data: results
    };
  }

  private async benchmarkComparison(baseline: string, alternatives: string[], iterations: number, warmup: number): Promise<ToolResult> {
    const results = {
      baseline: await this.benchmarkFunction(baseline, iterations, warmup),
      alternatives: [] as any[],
      comparison: {} as any
    };

    // Benchmark alternatives
    for (const alt of alternatives) {
      const altResult = await this.benchmarkFunction(alt, iterations, warmup);
      results.alternatives.push(altResult);
    }

    // Compare results
    if (results.baseline.success && results.baseline.data) {
      const baselineStats = results.baseline.data.stats;
      
      results.comparison = {
        baseline: {
          mean: baselineStats.time.mean,
          memory: baselineStats.memory.mean
        },
        alternatives: results.alternatives.map((alt, index) => {
          if (alt.success && alt.data) {
            const altStats = alt.data.stats;
            const speedup = baselineStats.time.mean / altStats.time.mean;
            const memoryRatio = altStats.memory.mean / baselineStats.memory.mean;
            
            return {
              index,
              mean: altStats.time.mean,
              memory: altStats.memory.mean,
              speedup: speedup.toFixed(2) + 'x',
              memoryRatio: memoryRatio.toFixed(2) + 'x',
              verdict: speedup > 1 ? 'faster' : 'slower'
            };
          }
          return null;
        }).filter(Boolean)
      };
    }

    return {
      success: true,
      data: results
    };
  }

  private calculateStats(times: number[], memory: number[] = []): any {
    const sortedTimes = [...times].sort((a, b) => a - b);
    const sortedMemory = [...memory].sort((a, b) => a - b);

    return {
      time: {
        min: sortedTimes[0],
        max: sortedTimes[sortedTimes.length - 1],
        mean: times.reduce((a, b) => a + b, 0) / times.length,
        median: sortedTimes[Math.floor(sortedTimes.length / 2)],
        p95: sortedTimes[Math.floor(sortedTimes.length * 0.95)],
        p99: sortedTimes[Math.floor(sortedTimes.length * 0.99)]
      },
      memory: memory.length > 0 ? {
        min: sortedMemory[0],
        max: sortedMemory[sortedMemory.length - 1],
        mean: memory.reduce((a, b) => a + b, 0) / memory.length,
        median: sortedMemory[Math.floor(sortedMemory.length / 2)]
      } : null
    };
  }
}